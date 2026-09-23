import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../errors.ts';
import { breadcrumbs, clearBreadcrumbs } from '../../log/breadcrumbs.ts';
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  destinationAfterLogin,
  failureFromError,
  isCodeShaped,
  LOGIN_START,
  type LoginEvent,
  type LoginFailure,
  type LoginState,
  normalizeCodeInput,
  transition,
} from './machine.ts';

const PHONE = '09121234567';

const S = {
  enterPhone: { name: 'enterPhone', phone: PHONE, problem: null },
  sending: { name: 'sending', phone: PHONE },
  enterCode: { name: 'enterCode', phone: PHONE, problem: null },
  verifying: { name: 'verifying', phone: PHONE, code: '12345' },
  done: { name: 'done', phone: PHONE, userId: 'u1' },
  rateLimited: { name: 'rateLimited', phone: PHONE, retryAfter: 120 },
  wrongCode: { name: 'wrongCode', phone: PHONE, reason: 'wrong', attemptsLeft: 3 },
  wrongCodeExpired: { name: 'wrongCode', phone: PHONE, reason: 'expired', attemptsLeft: 0 },
  wrongCodeLocked: { name: 'wrongCode', phone: PHONE, reason: 'locked', attemptsLeft: 0 },
  networkSend: { name: 'networkError', phone: PHONE, code: null },
  networkVerify: { name: 'networkError', phone: PHONE, code: '12345' },
} as const satisfies Record<string, LoginState>;

const fail = (failure: LoginFailure): LoginEvent => ({ type: 'FAILED', failure });

const ALL_EVENTS: readonly LoginEvent[] = [
  { type: 'SUBMIT_PHONE', phone: PHONE },
  { type: 'SENT' },
  { type: 'SUBMIT_CODE', code: '12345' },
  { type: 'VERIFIED', userId: 'u1' },
  fail({ kind: 'network' }),
  fail({ kind: 'rateLimited', retryAfter: 30 }),
  fail({ kind: 'phoneInvalid' }),
  fail({ kind: 'wrong', attemptsLeft: 2 }),
  fail({ kind: 'expired' }),
  fail({ kind: 'locked' }),
  fail({ kind: 'failed' }),
  { type: 'RETRY' },
  { type: 'RESEND' },
  { type: 'CHANGE_PHONE' },
];

beforeEach(() => {
  clearBreadcrumbs();
});

describe('the happy path', () => {
  it('enterPhone → sending → enterCode → verifying → done', () => {
    let state: LoginState = LOGIN_START;
    state = transition(state, { type: 'SUBMIT_PHONE', phone: ` ${PHONE} ` });
    expect(state).toEqual(S.sending);
    state = transition(state, { type: 'SENT' });
    expect(state).toEqual(S.enterCode);
    state = transition(state, { type: 'SUBMIT_CODE', code: '12345' });
    expect(state).toEqual(S.verifying);
    state = transition(state, { type: 'VERIFIED', userId: 'u1' });
    expect(state).toEqual(S.done);
  });

  it('breadcrumbs every change, with state names and never the phone', () => {
    transition(LOGIN_START, { type: 'SUBMIT_PHONE', phone: PHONE });
    const crumbs = breadcrumbs();
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]?.data).toEqual({ from: 'enterPhone', event: 'SUBMIT_PHONE', to: 'sending' });
    expect(JSON.stringify(crumbs)).not.toContain('0912');
  });

  it('an empty phone does not send', () => {
    expect(transition(LOGIN_START, { type: 'SUBMIT_PHONE', phone: '   ' })).toBe(LOGIN_START);
  });

  it('a code that is not 5-6 digits does not verify', () => {
    for (const code of ['', '1234', '1234567', 'abcde']) {
      expect(transition(S.enterCode, { type: 'SUBMIT_CODE', code })).toBe(S.enterCode);
    }
    expect(transition(S.enterCode, { type: 'SUBMIT_CODE', code: '123456' }).name).toBe('verifying');
  });
});

describe('a failed send', () => {
  it.each([
    [{ kind: 'network' }, S.networkSend],
    [
      { kind: 'rateLimited', retryAfter: 30 },
      { name: 'rateLimited', phone: PHONE, retryAfter: 30 },
    ],
    [{ kind: 'phoneInvalid' }, { name: 'enterPhone', phone: PHONE, problem: 'phoneInvalid' }],
    [{ kind: 'failed' }, { name: 'enterPhone', phone: PHONE, problem: 'failed' }],
    [
      { kind: 'wrong', attemptsLeft: 1 },
      { name: 'enterPhone', phone: PHONE, problem: 'failed' },
    ],
    [{ kind: 'expired' }, { name: 'enterPhone', phone: PHONE, problem: 'failed' }],
    [{ kind: 'locked' }, { name: 'enterPhone', phone: PHONE, problem: 'failed' }],
  ] as const)('%o → %o', (failure, expected) => {
    expect(transition(S.sending, fail(failure))).toEqual(expected);
  });
});

describe('a failed verify', () => {
  it.each([
    [{ kind: 'network' }, S.networkVerify],
    [
      { kind: 'rateLimited', retryAfter: 30 },
      { name: 'rateLimited', phone: PHONE, retryAfter: 30 },
    ],
    [{ kind: 'phoneInvalid' }, { name: 'enterPhone', phone: PHONE, problem: 'phoneInvalid' }],
    [
      { kind: 'wrong', attemptsLeft: 2 },
      { ...S.wrongCode, attemptsLeft: 2 },
    ],
    [{ kind: 'expired' }, S.wrongCodeExpired],
    [{ kind: 'locked' }, S.wrongCodeLocked],
    [{ kind: 'failed' }, { name: 'enterCode', phone: PHONE, problem: 'failed' }],
  ] as const)('%o → %o', (failure, expected) => {
    expect(transition(S.verifying, fail(failure))).toEqual(expected);
  });
});

describe('the error states', () => {
  it('wrongCode takes another guess while attempts are left', () => {
    expect(transition(S.wrongCode, { type: 'SUBMIT_CODE', code: '54321' })).toEqual({
      name: 'verifying',
      phone: PHONE,
      code: '54321',
    });
    const none = { ...S.wrongCode, attemptsLeft: 0 };
    expect(transition(none, { type: 'SUBMIT_CODE', code: '54321' })).toBe(none);
  });

  it('an expired or locked code only takes a resend or a new number', () => {
    for (const state of [S.wrongCodeExpired, S.wrongCodeLocked]) {
      expect(transition(state, { type: 'SUBMIT_CODE', code: '54321' })).toBe(state);
      expect(transition(state, { type: 'RESEND' })).toEqual(S.sending);
      expect(transition(state, { type: 'CHANGE_PHONE' })).toEqual(S.enterPhone);
    }
  });

  it('rateLimited retries the send or changes the number', () => {
    expect(transition(S.rateLimited, { type: 'RETRY' })).toEqual(S.sending);
    expect(transition(S.rateLimited, { type: 'CHANGE_PHONE' })).toEqual(S.enterPhone);
  });

  it('networkError retries whichever request failed', () => {
    expect(transition(S.networkSend, { type: 'RETRY' })).toEqual(S.sending);
    expect(transition(S.networkVerify, { type: 'RETRY' })).toEqual(S.verifying);
    expect(transition(S.networkVerify, { type: 'CHANGE_PHONE' })).toEqual(S.enterPhone);
  });

  it('enterCode resends or changes the number', () => {
    expect(transition(S.enterCode, { type: 'RESEND' })).toEqual(S.sending);
    expect(transition(S.enterCode, { type: 'CHANGE_PHONE' })).toEqual(S.enterPhone);
  });
});

describe('totality', () => {
  it('every state answers every event with a valid state', () => {
    const names = new Set([
      'enterPhone',
      'sending',
      'enterCode',
      'verifying',
      'done',
      'rateLimited',
      'wrongCode',
      'networkError',
    ]);
    for (const state of Object.values(S)) {
      for (const event of ALL_EVENTS) {
        const next = transition(state, event);
        expect(names.has(next.name)).toBe(true);
        expect(next.phone).toBe(PHONE);
      }
    }
  });

  it('done is terminal', () => {
    for (const event of ALL_EVENTS) expect(transition(S.done, event)).toBe(S.done);
  });

  it('in-flight states ignore user input', () => {
    for (const event of [
      { type: 'SUBMIT_PHONE', phone: PHONE },
      { type: 'SUBMIT_CODE', code: '12345' },
      { type: 'RETRY' },
      { type: 'RESEND' },
      { type: 'CHANGE_PHONE' },
    ] as const) {
      expect(transition(S.sending, event)).toBe(S.sending);
      expect(transition(S.verifying, event)).toBe(S.verifying);
    }
  });
});

describe('failureFromError', () => {
  it('maps every code the OTP routes answer with', () => {
    expect(failureFromError(new AppError('NETWORK', 'x'))).toEqual({ kind: 'network' });
    expect(failureFromError(new AppError('RATE_LIMITED', 'x', { retryAfter: 420 }))).toEqual({
      kind: 'rateLimited',
      retryAfter: 420,
    });
    expect(failureFromError(new AppError('RATE_LIMITED', 'x', { retryAfter: null }))).toEqual({
      kind: 'rateLimited',
      retryAfter: DEFAULT_RETRY_AFTER_SECONDS,
    });
    expect(failureFromError(new AppError('SERVER_PHONE_INVALID', 'x'))).toEqual({
      kind: 'phoneInvalid',
    });
    expect(failureFromError(new AppError('SERVER_OTP_WRONG', 'x', { attemptsLeft: 2 }))).toEqual({
      kind: 'wrong',
      attemptsLeft: 2,
    });
    expect(failureFromError(new AppError('SERVER_OTP_EXPIRED', 'x'))).toEqual({ kind: 'expired' });
    expect(failureFromError(new AppError('SERVER_OTP_LOCKED', 'x'))).toEqual({ kind: 'locked' });
    expect(failureFromError(new AppError('SERVER_SMS_FAILED', 'x'))).toEqual({ kind: 'failed' });
    expect(failureFromError(new AppError('HTTP_502', 'x'))).toEqual({ kind: 'failed' });
    expect(failureFromError(new Error('boom'))).toEqual({ kind: 'failed' });
  });
});

describe('input helpers', () => {
  it('normalizeCodeInput turns Persian and Arabic digits into ASCII and drops the rest', () => {
    expect(normalizeCodeInput('۱۲۳۴۵')).toBe('12345');
    expect(normalizeCodeInput('١٢٣٤٥٦')).toBe('123456');
    expect(normalizeCodeInput(' 12-345 ')).toBe('12345');
  });

  it('isCodeShaped accepts 5 or 6 digits', () => {
    expect(isCodeShaped('12345')).toBe(true);
    expect(isCodeShaped('123456')).toBe(true);
    expect(isCodeShaped('1234')).toBe(false);
    expect(isCodeShaped('1234567')).toBe(false);
  });

  it('destinationAfterLogin: home with a profile, onboarding without', () => {
    expect(destinationAfterLogin(true)).toBe('/');
    expect(destinationAfterLogin(false)).toBe('/onboarding');
  });
});

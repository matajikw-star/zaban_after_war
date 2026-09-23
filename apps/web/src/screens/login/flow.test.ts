import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../errors.ts';
import type { OtpVerifyResponse } from '../../net/api.ts';
import type { AuthRecord } from '../../stores/auth.ts';
import { checkCode, type LoginDeps, sendCode } from './flow.ts';
import { LOGIN_START, type LoginState, transition } from './machine.ts';

const VERIFIED: OtpVerifyResponse = {
  token: 'tok',
  record: { id: 'user-1', phone: '+989121234567' },
};

function fakeDeps(overrides: Partial<LoginDeps> = {}) {
  const signedIn: AuthRecord[] = [];
  const merged: string[] = [];
  const reported: string[] = [];
  const deps: LoginDeps = {
    requestCode: vi.fn(async () => ({ ok: true, retryAfter: 0 })),
    verifyCode: vi.fn(async () => VERIFIED),
    signIn: async (auth) => {
      signedIn.push(auth);
    },
    afterLogin: async (userId) => {
      merged.push(userId);
    },
    reportError: (_err, phase) => {
      reported.push(phase);
    },
    ...overrides,
  };
  return { deps, signedIn, merged, reported };
}

describe('sendCode', () => {
  it('SENT on success', async () => {
    const { deps } = fakeDeps();
    expect(await sendCode(deps, '09121234567')).toEqual({ type: 'SENT' });
    expect(deps.requestCode).toHaveBeenCalledWith('09121234567');
  });

  it('a 429 becomes rateLimited with the server retryAfter, and is not reported', async () => {
    const { deps, reported } = fakeDeps({
      requestCode: async () => {
        throw new AppError('RATE_LIMITED', 'too many', { retryAfter: 300 });
      },
    });
    expect(await sendCode(deps, '0912')).toEqual({
      type: 'FAILED',
      failure: { kind: 'rateLimited', retryAfter: 300 },
    });
    expect(reported).toEqual([]);
  });

  it('offline becomes network', async () => {
    const { deps } = fakeDeps({
      requestCode: async () => {
        throw new AppError('NETWORK', 'offline');
      },
    });
    expect(await sendCode(deps, '0912')).toEqual({
      type: 'FAILED',
      failure: { kind: 'network' },
    });
  });

  it('an unnamed failure is reported', async () => {
    const { deps, reported } = fakeDeps({
      requestCode: async () => {
        throw new AppError('SERVER_SMS_FAILED', 'gateway');
      },
    });
    expect(await sendCode(deps, '0912')).toEqual({
      type: 'FAILED',
      failure: { kind: 'failed' },
    });
    expect(reported).toEqual(['login.send']);
  });
});

describe('checkCode', () => {
  it('signs in with userId + token, runs the merge once, then VERIFIED', async () => {
    const { deps, signedIn, merged } = fakeDeps();
    expect(await checkCode(deps, '09121234567', '12345')).toEqual({
      type: 'VERIFIED',
      userId: 'user-1',
    });
    expect(deps.verifyCode).toHaveBeenCalledWith('09121234567', '12345');
    expect(signedIn).toEqual([{ userId: 'user-1', phone: '+989121234567', token: 'tok' }]);
    expect(merged).toEqual(['user-1']);
  });

  it('a wrong code carries attemptsLeft and signs nobody in', async () => {
    const { deps, signedIn, merged } = fakeDeps({
      verifyCode: async () => {
        throw new AppError('SERVER_OTP_WRONG', 'wrong', { attemptsLeft: 1 });
      },
    });
    expect(await checkCode(deps, '0912', '11111')).toEqual({
      type: 'FAILED',
      failure: { kind: 'wrong', attemptsLeft: 1 },
    });
    expect(signedIn).toEqual([]);
    expect(merged).toEqual([]);
  });

  it('a device that cannot store the token is not logged in', async () => {
    const { deps, merged, reported } = fakeDeps({
      signIn: async () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(await checkCode(deps, '0912', '12345')).toEqual({
      type: 'FAILED',
      failure: { kind: 'failed' },
    });
    expect(merged).toEqual([]);
    expect(reported).toEqual(['login.signIn']);
  });

  it('a failing merge is reported but the login stands', async () => {
    const { deps, signedIn, reported } = fakeDeps({
      afterLogin: async () => {
        throw new Error('merge broke');
      },
    });
    expect(await checkCode(deps, '0912', '12345')).toEqual({
      type: 'VERIFIED',
      userId: 'user-1',
    });
    expect(signedIn).toHaveLength(1);
    expect(reported).toEqual(['login.merge']);
  });
});

describe('the machine driven by the flow', () => {
  it('two wrong codes then the right one', async () => {
    let attemptsLeft = 5;
    const { deps, signedIn } = fakeDeps({
      verifyCode: async (_phone, code) => {
        if (code === '12345') return VERIFIED;
        attemptsLeft -= 1;
        throw new AppError('SERVER_OTP_WRONG', 'wrong', { attemptsLeft });
      },
    });

    let state: LoginState = transition(LOGIN_START, { type: 'SUBMIT_PHONE', phone: '0912' });
    state = transition(state, await sendCode(deps, state.phone));
    expect(state.name).toBe('enterCode');

    for (const code of ['00000', '11111', '12345']) {
      state = transition(state, { type: 'SUBMIT_CODE', code });
      expect(state.name).toBe('verifying');
      if (state.name !== 'verifying') throw new Error('unreachable');
      state = transition(state, await checkCode(deps, state.phone, state.code));
    }

    expect(state).toEqual({ name: 'done', phone: '0912', userId: 'user-1' });
    expect(signedIn).toHaveLength(1);
  });

  it('offline, then back online: retry sends again', async () => {
    let online = false;
    const { deps } = fakeDeps({
      requestCode: async () => {
        if (!online) throw new AppError('NETWORK', 'offline');
        return { ok: true, retryAfter: 0 };
      },
    });

    let state: LoginState = transition(LOGIN_START, { type: 'SUBMIT_PHONE', phone: '0912' });
    state = transition(state, await sendCode(deps, state.phone));
    expect(state).toEqual({ name: 'networkError', phone: '0912', code: null });

    online = true;
    state = transition(state, { type: 'RETRY' });
    state = transition(state, await sendCode(deps, state.phone));
    expect(state.name).toBe('enterCode');
  });
});

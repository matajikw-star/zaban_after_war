/**
 * The login state machine (`what.md` §7.8 `/login` row): `enterPhone → sending → enterCode →
 * verifying → done`, plus the three error states the spec names — `rateLimited` (shows
 * retry-after), `wrongCode` (attempts left) and `networkError` (retry). One pure, total
 * `transition(state, event)` with a breadcrumb on every change (§17.2).
 *
 * Nothing here touches the network, the database or the clock: `flow.ts` performs the two
 * requests and turns their outcome into an event, and `Login.tsx` wires the two together.
 *
 * Breadcrumbs carry state names only — never the phone number (§10.1).
 */

import { AppError } from '../../errors.ts';
import { breadcrumb } from '../../log/breadcrumbs.ts';

export type WrongCodeReason = 'wrong' | 'expired' | 'locked';

export type LoginState =
  /** `problem` is what the previous send said: a number the server refused, or anything else. */
  | { readonly name: 'enterPhone'; readonly phone: string; readonly problem: PhoneProblem }
  | { readonly name: 'sending'; readonly phone: string }
  | { readonly name: 'enterCode'; readonly phone: string; readonly problem: CodeProblem }
  | { readonly name: 'verifying'; readonly phone: string; readonly code: string }
  | { readonly name: 'done'; readonly phone: string; readonly userId: string }
  | { readonly name: 'rateLimited'; readonly phone: string; readonly retryAfter: number }
  | {
      readonly name: 'wrongCode';
      readonly phone: string;
      readonly reason: WrongCodeReason;
      readonly attemptsLeft: number;
    }
  /** `code` is null when the send failed, the code being checked when the verify did. */
  | { readonly name: 'networkError'; readonly phone: string; readonly code: string | null };

export type LoginStateName = LoginState['name'];

export type PhoneProblem = 'phoneInvalid' | 'failed' | null;
export type CodeProblem = 'failed' | null;

/** What a failed request means to this screen. `failed` is everything unnamed (5xx, SMS down). */
export type LoginFailure =
  | { readonly kind: 'network' }
  | { readonly kind: 'rateLimited'; readonly retryAfter: number }
  | { readonly kind: 'phoneInvalid' }
  | { readonly kind: 'wrong'; readonly attemptsLeft: number }
  | { readonly kind: 'expired' }
  | { readonly kind: 'locked' }
  | { readonly kind: 'failed' };

export type LoginEvent =
  | { readonly type: 'SUBMIT_PHONE'; readonly phone: string }
  | { readonly type: 'SENT' }
  | { readonly type: 'SUBMIT_CODE'; readonly code: string }
  | { readonly type: 'VERIFIED'; readonly userId: string }
  | { readonly type: 'FAILED'; readonly failure: LoginFailure }
  | { readonly type: 'RETRY' }
  | { readonly type: 'RESEND' }
  | { readonly type: 'CHANGE_PHONE' };

export const LOGIN_START: LoginState = { name: 'enterPhone', phone: '', problem: null };

/** When a 429 arrives without a number (a proxy's own page, say), wait a minute. */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

export function transition(state: LoginState, event: LoginEvent): LoginState {
  const next = compute(state, event);
  if (next !== state) {
    breadcrumb('log', 'login.transition', { from: state.name, event: event.type, to: next.name });
  }
  return next;
}

function sendFailed(phone: string, failure: LoginFailure): LoginState {
  switch (failure.kind) {
    case 'network':
      return { name: 'networkError', phone, code: null };
    case 'rateLimited':
      return { name: 'rateLimited', phone, retryAfter: failure.retryAfter };
    case 'phoneInvalid':
      return { name: 'enterPhone', phone, problem: 'phoneInvalid' };
    case 'wrong':
    case 'expired':
    case 'locked':
    case 'failed':
      return { name: 'enterPhone', phone, problem: 'failed' };
  }
}

function verifyFailed(phone: string, code: string, failure: LoginFailure): LoginState {
  switch (failure.kind) {
    case 'network':
      return { name: 'networkError', phone, code };
    case 'rateLimited':
      return { name: 'rateLimited', phone, retryAfter: failure.retryAfter };
    case 'phoneInvalid':
      return { name: 'enterPhone', phone, problem: 'phoneInvalid' };
    case 'wrong':
      return { name: 'wrongCode', phone, reason: 'wrong', attemptsLeft: failure.attemptsLeft };
    case 'expired':
      return { name: 'wrongCode', phone, reason: 'expired', attemptsLeft: 0 };
    case 'locked':
      return { name: 'wrongCode', phone, reason: 'locked', attemptsLeft: 0 };
    case 'failed':
      return { name: 'enterCode', phone, problem: 'failed' };
  }
}

function compute(state: LoginState, event: LoginEvent): LoginState {
  switch (state.name) {
    case 'enterPhone':
      if (event.type === 'SUBMIT_PHONE' && event.phone.trim() !== '') {
        return { name: 'sending', phone: event.phone.trim() };
      }
      return state;

    case 'sending':
      if (event.type === 'SENT') return { name: 'enterCode', phone: state.phone, problem: null };
      if (event.type === 'FAILED') return sendFailed(state.phone, event.failure);
      return state;

    case 'enterCode':
      if (event.type === 'SUBMIT_CODE' && isCodeShaped(event.code)) {
        return { name: 'verifying', phone: state.phone, code: event.code };
      }
      if (event.type === 'RESEND') return { name: 'sending', phone: state.phone };
      if (event.type === 'CHANGE_PHONE') {
        return { name: 'enterPhone', phone: state.phone, problem: null };
      }
      return state;

    case 'verifying':
      if (event.type === 'VERIFIED') {
        return { name: 'done', phone: state.phone, userId: event.userId };
      }
      if (event.type === 'FAILED') return verifyFailed(state.phone, state.code, event.failure);
      return state;

    case 'wrongCode':
      // Another guess only while the current code still takes one; otherwise a new code.
      if (
        event.type === 'SUBMIT_CODE' &&
        state.reason === 'wrong' &&
        state.attemptsLeft > 0 &&
        isCodeShaped(event.code)
      ) {
        return { name: 'verifying', phone: state.phone, code: event.code };
      }
      if (event.type === 'RESEND') return { name: 'sending', phone: state.phone };
      if (event.type === 'CHANGE_PHONE') {
        return { name: 'enterPhone', phone: state.phone, problem: null };
      }
      return state;

    case 'rateLimited':
      if (event.type === 'RETRY') return { name: 'sending', phone: state.phone };
      if (event.type === 'CHANGE_PHONE') {
        return { name: 'enterPhone', phone: state.phone, problem: null };
      }
      return state;

    case 'networkError':
      if (event.type === 'RETRY') {
        return state.code === null
          ? { name: 'sending', phone: state.phone }
          : { name: 'verifying', phone: state.phone, code: state.code };
      }
      if (event.type === 'CHANGE_PHONE') {
        return { name: 'enterPhone', phone: state.phone, problem: null };
      }
      return state;

    case 'done':
      return state;
  }
}

// ---------------------------------------------------------------------------- input

/** Persian (U+06F0…) and Arabic-Indic (U+0660…) digits → ASCII; everything else dropped. */
export function normalizeCodeInput(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const c = ch.charCodeAt(0);
    if (c >= 0x06f0 && c <= 0x06f9) out += String.fromCharCode(48 + c - 0x06f0);
    else if (c >= 0x0660 && c <= 0x0669) out += String.fromCharCode(48 + c - 0x0660);
    else if (c >= 48 && c <= 57) out += ch;
  }
  return out;
}

/** Real codes are 5 digits; the staging `mock` provider's is 123456 (§8.2). */
export function isCodeShaped(code: string): boolean {
  return /^\d{5,6}$/.test(code);
}

// ---------------------------------------------------------------------------- errors

/** The `AppError` codes `net/api.ts` produces, mapped to what this screen does about them. */
export function failureFromError(err: unknown): LoginFailure {
  if (!(err instanceof AppError)) return { kind: 'failed' };
  const data = (err.data ?? {}) as { retryAfter?: unknown; attemptsLeft?: unknown };

  switch (err.code) {
    case 'NETWORK':
      return { kind: 'network' };
    case 'RATE_LIMITED':
      return {
        kind: 'rateLimited',
        retryAfter:
          typeof data.retryAfter === 'number' && data.retryAfter > 0
            ? data.retryAfter
            : DEFAULT_RETRY_AFTER_SECONDS,
      };
    case 'SERVER_PHONE_INVALID':
      return { kind: 'phoneInvalid' };
    case 'SERVER_OTP_WRONG':
      return {
        kind: 'wrong',
        attemptsLeft: typeof data.attemptsLeft === 'number' ? data.attemptsLeft : 0,
      };
    case 'SERVER_OTP_EXPIRED':
      return { kind: 'expired' };
    case 'SERVER_OTP_LOCKED':
      return { kind: 'locked' };
    default:
      return { kind: 'failed' };
  }
}

// ---------------------------------------------------------------------------- after login

/**
 * Where `done` goes. The simplest rule consistent with §7.8's onboarding guard: a device that
 * already has a profile goes home; one that does not (a returning user on a fresh install, who
 * came here from «قبلاً حساب داشتم») finishes onboarding first, because Home would send it there
 * anyway. The login merge (`sync/login-merge.ts`) runs before this is asked and adopts the
 * server's profile when there is one, so a restored account lands home.
 */
export function destinationAfterLogin(hasProfile: boolean, next: string | null = null): string {
  const back = safeNext(next);
  if (back !== null) return back;
  return hasProfile ? '/' : '/onboarding';
}

/**
 * The screens that send a user to `/login` and want them back (§7.8: login is required before
 * checkout, and a payment result needs the account that paid). Anything else — another path, an
 * absolute URL, `//evil.example` — is ignored, so `?next=` can never become an open redirect.
 */
const RETURNABLE_PATHS: ReadonlySet<string> = new Set(['/checkout', '/purchase/result']);

export function safeNext(next: string | null): string | null {
  if (next === null || !next.startsWith('/') || next.startsWith('//')) return null;
  const path = next.split(/[?#]/, 1)[0] ?? '';
  return RETURNABLE_PATHS.has(path) ? next : null;
}

/** `/login?next=…` for a screen that wants the user back after login. */
export function loginPathFor(next: string): string {
  return `/login?${new URLSearchParams({ next }).toString()}`;
}

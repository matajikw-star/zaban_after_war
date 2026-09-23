/**
 * The two side effects of `/login` (`what.md` §7.8): send the code, check the code. Each turns
 * its outcome into a `LoginEvent` for `machine.ts` and never throws, so the screen has exactly
 * one thing to do with the result — dispatch it.
 *
 * Every dependency is injected, which is what lets `flow.test.ts` drive it with a fake API and no
 * React, IndexedDB or network.
 */

import type { OtpRequestResponse, OtpVerifyResponse } from '../../net/api.ts';
import type { AuthRecord } from '../../stores/auth.ts';
import { failureFromError, type LoginEvent } from './machine.ts';

export interface LoginDeps {
  readonly requestCode: (phone: string) => Promise<OtpRequestResponse>;
  readonly verifyCode: (phone: string, code: string) => Promise<OtpVerifyResponse>;
  /** `stores/auth.ts`'s `signIn`: `userId` + token into `kv` (§7.2). */
  readonly signIn: (auth: AuthRecord) => Promise<void>;
  /** `sync/login-merge.ts`'s `runLoginMerge` (what.md §7.4): re-queue, profile, fire a backup. */
  readonly afterLogin: (userId: string) => Promise<void>;
  readonly reportError: (err: unknown, phase: string) => void;
}

export async function sendCode(deps: LoginDeps, phone: string): Promise<LoginEvent> {
  try {
    await deps.requestCode(phone);
    return { type: 'SENT' };
  } catch (err) {
    const failure = failureFromError(err);
    // Named outcomes are the user's to fix; only the unnamed ones are a bug worth a record.
    if (failure.kind === 'failed') deps.reportError(err, 'login.send');
    return { type: 'FAILED', failure };
  }
}

export async function checkCode(deps: LoginDeps, phone: string, code: string): Promise<LoginEvent> {
  let response: OtpVerifyResponse;
  try {
    response = await deps.verifyCode(phone, code);
  } catch (err) {
    const failure = failureFromError(err);
    if (failure.kind === 'failed') deps.reportError(err, 'login.verify');
    return { type: 'FAILED', failure };
  }

  const userId = response.record.id;
  try {
    await deps.signIn({ userId, phone: response.record.phone, token: response.token });
  } catch (err) {
    // The server said yes but the device could not keep the token: not logged in.
    deps.reportError(err, 'login.signIn');
    return { type: 'FAILED', failure: { kind: 'failed' } };
  }

  try {
    await deps.afterLogin(userId);
  } catch (err) {
    // The login stands: the event log is untouched, and the merge is idempotent by design (ADR-0002).
    deps.reportError(err, 'login.merge');
  }

  return { type: 'VERIFIED', userId };
}

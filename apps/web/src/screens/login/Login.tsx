/**
 * `/login` — phone + OTP (`what.md` §7.8). The one screen that needs the network; offline it
 * lands in `networkError` with a Persian explanation and a retry, never a crash.
 *
 * `machine.ts` decides every state, `flow.ts` performs the two requests. This file renders the
 * state and runs the effect that belongs to it: `sending` sends, `verifying` checks, `done`
 * navigates. Each effect runs once per state object, so React's StrictMode double-invoke cannot
 * send two SMS.
 */

import { CircleAlert } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { reportError } from '../../log/errors.ts';
import { otpRequest, otpVerify } from '../../net/api.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { useSettingsStore } from '../../stores/settings.ts';
import { strings } from '../../strings.ts';
import { refreshEntitlementNow } from '../../sync/entitlement-live.ts';
import { runLoginMerge } from '../../sync/login-merge.ts';
import { Button } from '../../ui/Button.tsx';
import { Card } from '../../ui/Card.tsx';
import { faNumber } from '../../ui/format.ts';
import { Input } from '../../ui/Input.tsx';
import { checkCode, type LoginDeps, sendCode } from './flow.ts';
import {
  destinationAfterLogin,
  isCodeShaped,
  LOGIN_START,
  type LoginEvent,
  type LoginState,
  normalizeCodeInput,
  transition,
} from './machine.ts';

const deps: LoginDeps = {
  requestCode: otpRequest,
  verifyCode: otpVerify,
  signIn: (auth) => useAuthStore.getState().signIn(auth),
  afterLogin: async (userId) => {
    await runLoginMerge(userId);
    // A returning buyer on a fresh install: the entitlement, and so the paid download, comes back
    // with the login (§7.6, §9.3). Not awaited; never throws.
    void refreshEntitlementNow();
  },
  reportError: (err, phase) => void reportError('error', err, { phase }),
};

/**
 * A problem is said in words, not in red: §7.9 keeps colour for the grading buttons, so an error
 * is the foreground colour, a weight step up, and an icon that reads as "attention" without hue.
 */
const PROBLEM_CLASS = 'flex items-start gap-2 text-body-sm font-medium text-[var(--fg)]';

export function Login() {
  const navigate = useNavigate();
  const hasProfile = useSettingsStore((s) => s.hasProfile);
  // `?next=/checkout` from the paywall, `?next=/purchase/result…` from a result that needs the
  // account (§7.8); `safeNext` ignores anything else.
  const [params] = useSearchParams();
  const next = params.get('next');
  const [state, setState] = useState<LoginState>(LOGIN_START);
  const [phoneInput, setPhoneInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const effectFor = useRef<LoginState | null>(null);

  const dispatch = useCallback((event: LoginEvent): void => {
    setState((current) => transition(current, event));
  }, []);

  useEffect(() => {
    if (effectFor.current === state) return;
    effectFor.current = state;

    if (state.name === 'sending') {
      void sendCode(deps, state.phone).then(dispatch);
    } else if (state.name === 'verifying') {
      void checkCode(deps, state.phone, state.code).then(dispatch);
    } else if (state.name === 'done') {
      void navigate(destinationAfterLogin(hasProfile, next), { replace: true });
    } else if (state.name === 'enterCode') {
      setCodeInput('');
    }
  }, [state, hasProfile, next, navigate, dispatch]);

  function submitPhone(e: FormEvent): void {
    e.preventDefault();
    dispatch({ type: 'SUBMIT_PHONE', phone: phoneInput });
  }

  function submitCode(e: FormEvent): void {
    e.preventDefault();
    dispatch({ type: 'SUBMIT_CODE', code: normalizeCodeInput(codeInput) });
  }

  const onPhoneStep = state.name === 'enterPhone' || state.name === 'sending';
  const onCodeStep =
    state.name === 'enterCode' || state.name === 'verifying' || state.name === 'wrongCode';
  const codeClosed = state.name === 'wrongCode' && state.reason !== 'wrong';

  return (
    <main className="flex flex-1 flex-col gap-4 pt-2">
      <div className="flex flex-col gap-2">
        <h1 className="flex min-h-11 items-center text-h5 font-medium">{strings.screens.login}</h1>
        <p className="text-body-sm text-[var(--fg-muted)]">{strings.login.why}</p>
      </div>

      <Card className="flex flex-col gap-3">
        {onPhoneStep ? (
          <form className="flex flex-col gap-3" onSubmit={submitPhone}>
            <label
              htmlFor="login-phone"
              className="flex flex-col gap-2 text-subtitle-sm font-medium"
            >
              {strings.login.phoneLabel}
              <Input
                id="login-phone"
                data-testid="login-phone"
                dir="ltr"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={strings.login.phonePlaceholder}
                value={phoneInput}
                aria-invalid={state.name === 'enterPhone' && state.problem === 'phoneInvalid'}
                onChange={(e) => setPhoneInput(e.target.value)}
                disabled={state.name === 'sending'}
              />
            </label>
            {state.name === 'enterPhone' && state.problem !== null ? (
              <p role="alert" data-testid="login-error" className={PROBLEM_CLASS}>
                <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
                {state.problem === 'phoneInvalid'
                  ? strings.login.phoneInvalid
                  : strings.login.failed}
              </p>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              block
              data-testid="login-send"
              disabled={state.name === 'sending' || phoneInput.trim() === ''}
            >
              {state.name === 'sending' ? strings.login.sending : strings.login.send}
            </Button>
          </form>
        ) : null}

        {onCodeStep ? (
          <form className="flex flex-col gap-3" onSubmit={submitCode}>
            <p className="text-body-sm">
              {strings.login.codeSentTo} <bdi dir="ltr">{state.phone}</bdi>
            </p>
            <label
              htmlFor="login-code"
              className="flex flex-col gap-2 text-subtitle-sm font-medium"
            >
              {strings.login.codeLabel}
              <Input
                id="login-code"
                data-testid="login-code"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={codeInput}
                aria-invalid={state.name === 'wrongCode'}
                onChange={(e) => setCodeInput(e.target.value)}
                disabled={state.name === 'verifying' || codeClosed}
              />
            </label>
            {state.name === 'wrongCode' ? (
              <p role="alert" data-testid="login-error" className={PROBLEM_CLASS}>
                <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
                {state.reason === 'wrong'
                  ? strings.login.wrongCode(faNumber(state.attemptsLeft))
                  : state.reason === 'expired'
                    ? strings.login.codeExpired
                    : strings.login.codeLocked}
              </p>
            ) : null}
            {state.name === 'enterCode' && state.problem === 'failed' ? (
              <p role="alert" data-testid="login-error" className={PROBLEM_CLASS}>
                <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
                {strings.login.failed}
              </p>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              block
              data-testid="login-verify"
              disabled={
                state.name === 'verifying' ||
                codeClosed ||
                !isCodeShaped(normalizeCodeInput(codeInput))
              }
            >
              {state.name === 'verifying' ? strings.login.verifying : strings.login.verify}
            </Button>
            <div className="flex justify-between gap-2">
              <Button
                variant="ghost"
                data-testid="login-resend"
                disabled={state.name === 'verifying'}
                onClick={() => dispatch({ type: 'RESEND' })}
              >
                {strings.login.resend}
              </Button>
              <Button
                variant="ghost"
                data-testid="login-change-phone"
                disabled={state.name === 'verifying'}
                onClick={() => dispatch({ type: 'CHANGE_PHONE' })}
              >
                {strings.login.changePhone}
              </Button>
            </div>
          </form>
        ) : null}

        {state.name === 'rateLimited' || state.name === 'networkError' ? (
          <div className="flex flex-col gap-3">
            <p role="alert" data-testid="login-error" className={PROBLEM_CLASS}>
              <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              {state.name === 'rateLimited'
                ? strings.login.rateLimited(faNumber(Math.ceil(state.retryAfter / 60)))
                : strings.login.network}
            </p>
            <Button
              variant="primary"
              block
              data-testid="login-retry"
              onClick={() => dispatch({ type: 'RETRY' })}
            >
              {strings.login.retry}
            </Button>
            <Button
              variant="ghost"
              data-testid="login-change-phone"
              onClick={() => dispatch({ type: 'CHANGE_PHONE' })}
            >
              {strings.login.changePhone}
            </Button>
          </div>
        ) : null}

        {state.name === 'done' ? <p className="text-body">{strings.login.done}</p> : null}
      </Card>
    </main>
  );
}

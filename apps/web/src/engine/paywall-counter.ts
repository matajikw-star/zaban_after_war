/**
 * When the free user has studied enough to be asked to pay (`what.md` §7.8, §5.1).
 *
 * The rule is one line of arithmetic and three ways to get it wrong — counting a presentation
 * for an entitled user, showing the sheet twice in one session, or losing the count across a
 * reload — so it is a pure function here rather than an `if` inside the screen. The count it
 * returns is what the caller writes to `kv.presentationsBeforePaywall`; the durable count is
 * why a reload cannot buy the user another hundred words.
 */

export interface PaywallCounterInput {
  /** `kv.presentationsBeforePaywall` as it stands **before** this presentation. */
  readonly count: number;
  /** `auth.entitlement.status === 'full'`. */
  readonly entitled: boolean;
  /** `params.freePresentationLimit` — server config can move it (§5.1). */
  readonly limit: number;
  /** True once `/paywall` has already been shown in this session. */
  readonly shownThisSession: boolean;
}

export interface PaywallCounterResult {
  /** The count to persist. Unchanged for an entitled user: the number is a free-tier meter. */
  readonly count: number;
  /** Navigate to `/paywall` and queue the `paywall_shown` beacon. */
  readonly show: boolean;
}

/**
 * Counts one presentation and says whether the paywall is due.
 *
 * A limit of zero or less disables the paywall entirely, which is how a server config turns it
 * off without shipping a build. Once past the limit the user keeps studying — §7.8's «بعداً»
 * returns them to the queue — and the sheet is not shown again until the next session.
 */
export function countPresentation(input: PaywallCounterInput): PaywallCounterResult {
  if (input.entitled) return { count: input.count, show: false };
  const count = input.count + 1;
  const show = !input.shownThisSession && input.limit > 0 && count >= input.limit;
  return { count, show };
}

/**
 * `/review` — the loop the whole product exists for (`what.md` §7.8).
 *
 * One presentation: `nextCard` → front → tap → back → grade → `recordReview` → feedback → next.
 * No network anywhere in it. This file owns the flow and nothing else: which sentence to show is
 * `engine/card-content.ts`, whether the paywall is due is `engine/paywall-counter.ts`, whether
 * the goal sheet is due is `engine/goal-sheet.ts`, and each of those is tested on its own.
 *
 * The phase is derived rather than stored, so it cannot disagree with the data it is drawn
 * from: feedback on screen wins, then an empty queue, then whether the back has been revealed.
 */

import type { Box, Grade, ReviewEventKind } from '@kl/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { kvGet, kvSet, outboxEnqueue } from '../../db/repo.ts';
import { nextDueText } from '../../engine/card-content.ts';
import { now } from '../../engine/clock.ts';
import { currentParams } from '../../engine/fold-cache.ts';
import { itemBox, totalPresentations } from '../../engine/fold-reads.ts';
import { shouldShowGoalSheet, todayKey } from '../../engine/goal-sheet.ts';
import { nextCard, presentationsToday, recordReview } from '../../engine/index.ts';
import { countPresentation } from '../../engine/paywall-counter.ts';
import { beaconsCrossed } from '../../engine/review-beacons.ts';
import { shouldPromptSaveProgress } from '../../engine/save-progress-prompt.ts';
import { breadcrumb } from '../../log/breadcrumbs.ts';
import { reportError } from '../../log/errors.ts';
import type { BeaconEvent, BeaconName, FlagBody } from '../../net/api.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { useContentStore } from '../../stores/content.ts';
import { useSessionStore } from '../../stores/session.ts';
import { useSettingsStore } from '../../stores/settings.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { Card } from '../../ui/Card.tsx';
import { APP_VERSION } from '../../version.ts';
import { CardBack } from './CardBack.tsx';
import { CardFront } from './CardFront.tsx';
import { FEEDBACK_MS, Feedback } from './Feedback.tsx';
import { type FlagReason, FlagSheet } from './FlagSheet.tsx';
import { GoalReachedSheet } from './GoalReachedSheet.tsx';
import { GradeBar } from './GradeBar.tsx';
import { OverflowMenu } from './OverflowMenu.tsx';
import { SaveProgressSheet } from './SaveProgressSheet.tsx';
import { Toast } from './Toast.tsx';

/** How long «ثبت شد» stays up. Same order as the feedback pause, and for the same reason. */
const TOAST_MS = 1600;

interface FeedbackState {
  readonly lemma: string;
  readonly boxBefore: Box | null;
  readonly boxAfter: Box;
  readonly nextDue: string;
}

async function queueBeacons(installId: string, names: readonly BeaconName[]): Promise<void> {
  if (names.length === 0) return;
  const events: BeaconEvent[] = names.map((name) => ({
    name,
    at: now(),
    appVersion: APP_VERSION,
  }));
  await outboxEnqueue('beacon', { installId, events });
}

export function Review() {
  const navigate = useNavigate();

  const card = useSessionStore((state) => state.card);
  const revealed = useSessionStore((state) => state.revealed);
  const cardOf = useContentStore((state) => state.card);

  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** True from the tap that answers until the feedback is on screen; blocks a double answer. */
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const draw = useCallback(() => {
    const session = useSessionStore.getState();
    session.setCard(nextCard(session.recent));
  }, []);

  useEffect(() => {
    // StrictMode mounts effects twice in dev; the guard keeps one session and one first card.
    if (started.current) return;
    started.current = true;
    useSessionStore.getState().start();
    draw();
  }, [draw]);

  useEffect(() => {
    if (feedback === null) return;
    const timer = setTimeout(() => {
      setFeedback(null);
      draw();
    }, FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback, draw]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const answer = useCallback(
    async (kind: ReviewEventKind, grade: Grade) => {
      const current = useSessionStore.getState().card;
      if (current === null || busy) return;
      setBusy(true);

      const itemId = current.itemId;
      const word = cardOf(itemId);
      const boxBefore = itemBox(itemId);
      const totalBefore = totalPresentations();

      await recordReview(itemId, kind, grade);

      // The fold has been rebuilt by `recordReview`, so both reads below are the new truth.
      const boxAfter = itemBox(itemId) ?? 1;
      const totalAfter = totalPresentations();
      const correct = kind === 'know' || grade === 1;
      useSessionStore.getState().countAnswer(correct, boxAfter === 5 && boxBefore !== 5);

      const { installId, entitlement } = useAuthStore.getState();
      const paywall = countPresentation({
        count: (await kvGet<number>('presentationsBeforePaywall')) ?? 0,
        entitled: entitlement.status === 'full',
        limit: currentParams().freePresentationLimit,
        shownThisSession: useSessionStore.getState().paywallShown,
      });
      await kvSet('presentationsBeforePaywall', paywall.count);
      await queueBeacons(installId, beaconsCrossed(totalBefore, totalAfter));

      setBusy(false);

      if (paywall.show) {
        useSessionStore.getState().markPaywallShown();
        await queueBeacons(installId, ['paywall_shown']);
        breadcrumb('nav', 'review.paywall', { presentations: paywall.count });
        void navigate('/paywall');
        return;
      }

      setFeedback({
        lemma: word?.lemma ?? itemId,
        boxBefore,
        boxAfter,
        nextDue: nextDueText(boxAfter, currentParams()),
      });

      const goal = useSettingsStore.getState().profile.dailyGoal;
      const today = todayKey();
      const goalDue = shouldShowGoalSheet({
        presentationsToday: presentationsToday(),
        dailyGoal: goal,
        lastShownDay: await kvGet<number>('goalSheetShownDay'),
        today,
      });
      if (goalDue) {
        await kvSet('goalSheetShownDay', today);
        setGoalOpen(true);
      }

      if (
        shouldPromptSaveProgress({
          loggedIn: useAuthStore.getState().userId !== null,
          presentations: totalAfter,
          alreadyShown: (await kvGet<boolean>('saveProgressPromptShown')) === true,
          otherSheetOpen: goalDue,
        })
      ) {
        await kvSet('saveProgressPromptShown', true);
        breadcrumb('nav', 'review.saveProgressPrompt', { presentations: totalAfter });
        setSaveOpen(true);
      }
    },
    [busy, cardOf, navigate],
  );

  const onGrade = useCallback(
    (grade: Grade) => {
      void answer('review', grade).catch((err: unknown) => {
        setBusy(false);
        void reportError('error', err, { phase: 'review.grade' });
      });
    },
    [answer],
  );

  const onKnow = useCallback(() => {
    void answer('know', 1).catch((err: unknown) => {
      setBusy(false);
      void reportError('error', err, { phase: 'review.know' });
    });
  }, [answer]);

  const onFlag = useCallback((reason: FlagReason) => {
    const current = useSessionStore.getState().card;
    if (current === null) return;
    setFlagOpen(false);
    const body: FlagBody = {
      installId: useAuthStore.getState().installId,
      itemId: current.itemId,
      reason,
      appVersion: APP_VERSION,
      at: now(),
    };
    // Into the outbox, never over the wire from here: flagging a word offline has to work.
    void outboxEnqueue('flag', body).then(
      () => setToast(strings.review.flagRecorded),
      (err: unknown) => reportError('error', err, { phase: 'review.flag' }),
    );
  }, []);

  const word = card === null ? null : cardOf(card.itemId);

  return (
    <main className="flex flex-1 flex-col pb-24">
      <header className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-label={strings.review.back}
          onClick={() => void navigate('/')}
        >
          <span aria-hidden="true">›</span>
        </Button>
        <span className="text-body-sm text-[var(--fg-muted)]">{strings.screens.review}</span>
        <div className="flex items-center gap-1">
          <OverflowMenu onKnow={onKnow} onFlag={() => setFlagOpen(true)} disabled={card === null} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate('/session/summary')}
            data-testid="review-end"
          >
            {strings.review.end}
          </Button>
        </div>
      </header>

      {feedback !== null ? (
        <Feedback
          lemma={feedback.lemma}
          boxBefore={feedback.boxBefore}
          boxAfter={feedback.boxAfter}
          nextDue={feedback.nextDue}
          onDismiss={() => {
            setFeedback(null);
            draw();
          }}
        />
      ) : word === null ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-body-sm text-[var(--fg-muted)]" data-testid="review-empty">
            {strings.review.empty}
          </p>
        </div>
      ) : (
        <>
          <Card
            className="relative mt-3 flex flex-1 flex-col overflow-y-auto"
            data-testid="review-card"
          >
            {revealed ? (
              <CardBack card={word} />
            ) : (
              <>
                <CardFront card={word} />
                {/* The whole front is the tap target, as a real button rather than a div with
                    an onClick: it has to be reachable from a keyboard and read by TalkBack. */}
                <button
                  type="button"
                  aria-label={strings.review.tapToReveal}
                  className="absolute inset-0 rounded-[var(--radius-card)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fg)]"
                  onClick={() => useSessionStore.getState().reveal()}
                  data-testid="review-reveal"
                />
              </>
            )}
          </Card>
          {revealed ? <GradeBar onGrade={onGrade} disabled={busy} /> : null}
        </>
      )}

      <FlagSheet open={flagOpen} onOpenChange={setFlagOpen} onFlag={onFlag} />
      <GoalReachedSheet
        open={goalOpen}
        onOpenChange={setGoalOpen}
        onFinish={() => {
          setGoalOpen(false);
          void navigate('/session/summary');
        }}
      />
      <SaveProgressSheet
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onAccept={() => {
          setSaveOpen(false);
          void navigate('/login');
        }}
      />
      {toast === null ? null : <Toast message={toast} />}
    </main>
  );
}

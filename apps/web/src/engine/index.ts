/**
 * The app's only door to `@kl/core` (`what.md` §17.6).
 *
 * The engine is pure: every function there takes the fold, the content, the clock and the
 * generator as parameters. This module binds those four to the live cache, the content store,
 * `clock.ts` and `rng.ts`, so a screen calls `progress()` with no arguments and cannot
 * accidentally fold a stale log or read the clock itself.
 *
 * This is the one file in `src/` named `index.ts`, and it is not a barrel: it holds the bound
 * functions themselves rather than re-exporting other modules.
 */

import {
  type Box,
  type BoxCounts,
  boxCounts as coreBoxCounts,
  dueCounts as coreDueCounts,
  introductionBudget as coreIntroductionBudget,
  nextCard as coreNextCard,
  paceEstimate as corePaceEstimate,
  progress as coreProgress,
  streak as coreStreak,
  dayKey,
  type Grade,
  type IntroductionBudget,
  type ItemId,
  type NextCard,
  type PaceEstimate,
  type Progress,
  type ReviewEvent,
  type ReviewEventKind,
  type Streak,
} from '@kl/core';
import { v7 as uuidv7 } from 'uuid';
import { appendEvent } from '../db/repo.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import { useAuthStore } from '../stores/auth.ts';
import { currentContentItems } from '../stores/content.ts';
import { currentProfile } from '../stores/settings.ts';
import { now } from './clock.ts';
import { appendToFold, currentFold, currentParams } from './fold-cache.ts';
import { rng } from './rng.ts';

/** `recent` is most-recent-first: `recent[0]` is the card the user just saw (§5.4). */
export function nextCard(recent: readonly ItemId[]): NextCard | null {
  const card = coreNextCard(
    currentFold(),
    currentContentItems(),
    recent,
    now(),
    currentProfile().dailyGoal,
    rng,
    currentParams(),
  );
  breadcrumb(
    'engine',
    'nextCard',
    card === null ? { empty: true } : { itemId: card.itemId, source: card.source },
  );
  return card;
}

export function progress(): Progress {
  return coreProgress(currentFold(), currentContentItems());
}

export function streak(): Streak {
  return coreStreak(currentFold(), currentProfile().dailyGoal, now(), currentParams());
}

/**
 * `null` when the user skipped the exam date: there is nothing to be ahead of or behind, and
 * inventing a date would make the progress screen lie.
 */
export function pace(): PaceEstimate | null {
  const profile = currentProfile();
  if (profile.examDate === null) return null;
  return corePaceEstimate(
    currentFold(),
    currentContentItems(),
    profile.dailyGoal,
    profile.examDate,
    now(),
    currentParams(),
  );
}

export function boxCounts(): BoxCounts {
  return coreBoxCounts(currentFold(), currentContentItems());
}

export function dueCounts(): Record<Box, number> {
  return coreDueCounts(currentFold(), now());
}

export function introductionBudget(): IntroductionBudget {
  return coreIntroductionBudget(currentFold(), currentProfile().dailyGoal, now(), currentParams());
}

/**
 * Presentations recorded today, Tehran-local — the numerator of the goal ring. `dayKey` is the
 * engine's, so the Tehran offset stays defined in exactly one place.
 */
export function presentationsToday(): number {
  return currentFold().byDay.get(dayKey(now()))?.presentations ?? 0;
}

/**
 * Mints one review event, appends it to the log and re-folds. The single write path for user
 * progress: nothing else in the app creates a `ReviewEvent`.
 */
export async function recordReview(
  itemId: ItemId,
  kind: ReviewEventKind,
  grade: Grade,
): Promise<ReviewEvent> {
  const event: ReviewEvent = {
    id: uuidv7(),
    itemId,
    at: now(),
    kind,
    // «این را بلدم» is always a success, whatever the caller passed (§5.2).
    grade: kind === 'know' ? 1 : grade,
    device: useAuthStore.getState().installId,
  };
  await appendEvent(event);
  appendToFold(event);
  breadcrumb('engine', 'recordReview', { itemId, kind, grade: event.grade });
  return event;
}

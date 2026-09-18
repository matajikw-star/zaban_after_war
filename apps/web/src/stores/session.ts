/**
 * One study session: the card on screen, what was shown recently, and the counters the summary
 * screen prints (`what.md` §7.1, §7.8).
 *
 * Nothing here is persisted. A session is a window into the review log, and the log is the truth
 * (ADR-0002) — reloading mid-session loses the counters and nothing else. `recent` is
 * most-recent-first because that is the order `nextCard` wants for its suppression window (§5.4).
 */

import type { ItemId, NextCard } from '@kl/core';
import { create } from 'zustand';
import { now } from '../engine/clock.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';

/** §5.4's suppression window is 8; the tail is kept a little longer so a change is free. */
const RECENT_LIMIT = 32;

export interface SessionState {
  readonly card: NextCard | null;
  /** Most-recent-first. Passed straight to `engine.nextCard`. */
  readonly recent: readonly ItemId[];
  /** True once the back of the current card has been revealed. */
  readonly revealed: boolean;
  readonly startedAt: number | null;
  readonly presentations: number;
  readonly correct: number;
  readonly conquered: number;
  start: () => void;
  setCard: (card: NextCard | null) => void;
  reveal: () => void;
  /** Called after `engine.recordReview` resolves, with what the fold now says. */
  countAnswer: (correct: boolean, conquered: boolean) => void;
  end: () => void;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  card: null,
  recent: [],
  revealed: false,
  startedAt: null,
  presentations: 0,
  correct: 0,
  conquered: 0,

  start: () => {
    set({ startedAt: now(), presentations: 0, correct: 0, conquered: 0, revealed: false });
    breadcrumb('log', 'session.start');
  },

  setCard: (card) => {
    const recent =
      card === null ? get().recent : [card.itemId, ...get().recent].slice(0, RECENT_LIMIT);
    set({ card, recent, revealed: false });
    breadcrumb(
      'log',
      'session.setCard',
      card === null ? { empty: true } : { itemId: card.itemId, source: card.source },
    );
  },

  reveal: () => {
    set({ revealed: true });
    breadcrumb('tap', 'session.reveal', { itemId: get().card?.itemId ?? null });
  },

  countAnswer: (correct, conquered) => {
    const state = get();
    set({
      presentations: state.presentations + 1,
      correct: state.correct + (correct ? 1 : 0),
      conquered: state.conquered + (conquered ? 1 : 0),
    });
    breadcrumb('log', 'session.countAnswer', { correct, conquered });
  },

  end: () => {
    const state = get();
    breadcrumb('log', 'session.end', {
      presentations: state.presentations,
      correct: state.correct,
      conquered: state.conquered,
    });
    set({ card: null, revealed: false, startedAt: null });
  },
}));

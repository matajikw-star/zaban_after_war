import { describe, expect, it } from 'vitest';
import { SAVE_PROGRESS_PROMPT_AT, shouldPromptSaveProgress } from './save-progress-prompt.ts';

const BASE = { loggedIn: false, presentations: 50, alreadyShown: false, otherSheetOpen: false };

describe('shouldPromptSaveProgress', () => {
  it('is 50 presentations (§7.4)', () => {
    expect(SAVE_PROGRESS_PROMPT_AT).toBe(50);
  });

  it('shows at 50 for an anonymous install that has not seen it', () => {
    expect(shouldPromptSaveProgress(BASE)).toBe(true);
    expect(shouldPromptSaveProgress({ ...BASE, presentations: 120 })).toBe(true);
  });

  it('waits below 50', () => {
    expect(shouldPromptSaveProgress({ ...BASE, presentations: 49 })).toBe(false);
  });

  it('never shows twice, never to a logged-in user, never over another sheet', () => {
    expect(shouldPromptSaveProgress({ ...BASE, alreadyShown: true })).toBe(false);
    expect(shouldPromptSaveProgress({ ...BASE, loggedIn: true })).toBe(false);
    expect(shouldPromptSaveProgress({ ...BASE, otherSheetOpen: true })).toBe(false);
  });
});

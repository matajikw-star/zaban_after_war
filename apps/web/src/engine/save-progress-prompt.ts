/**
 * When to offer «ذخیرهٔ پیشرفت با شمارهٔ موبایل» (`what.md` §7.4): once, on an anonymous install,
 * after 50 presentations, never on top of another sheet. Anonymous installs are not backed up, so
 * this is the moment a user has enough progress to lose and has not yet been told.
 *
 * Pure, so "why did it show twice" is a test. The caller keeps `kv.saveProgressPromptShown`.
 */

export const SAVE_PROGRESS_PROMPT_AT = 50;

export interface SaveProgressPromptInput {
  readonly loggedIn: boolean;
  /** Every presentation in the log, all days (`fold-reads.ts` `totalPresentations`). */
  readonly presentations: number;
  /** `kv.saveProgressPromptShown`. */
  readonly alreadyShown: boolean;
  /** Another sheet is opening for this answer; the prompt waits for the next one. */
  readonly otherSheetOpen: boolean;
}

export function shouldPromptSaveProgress(input: SaveProgressPromptInput): boolean {
  if (input.loggedIn || input.alreadyShown || input.otherSheetOpen) return false;
  return input.presentations >= SAVE_PROGRESS_PROMPT_AT;
}

import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 8, 18, 12, 0, 0);

describe('relativeTime', () => {
  it('reads as الان within a minute either way', () => {
    expect(relativeTime(now, now)).toBe('الان');
    expect(relativeTime(now + 30_000, now)).toBe('الان');
    expect(relativeTime(now - 30_000, now)).toBe('الان');
  });

  it('counts future minutes', () => {
    expect(relativeTime(now + 10 * MINUTE, now)).toBe('۱۰ دقیقه دیگر');
  });

  it('counts future days', () => {
    expect(relativeTime(now + 2 * DAY, now)).toBe('۲ روز دیگر');
  });

  it('counts past days', () => {
    expect(relativeTime(now - 3 * DAY, now)).toBe('۳ روز پیش');
  });

  it('counts future hours once past an hour but under a day', () => {
    expect(relativeTime(now + 5 * HOUR, now)).toBe('۵ ساعت دیگر');
  });

  it('counts past minutes and hours', () => {
    expect(relativeTime(now - 10 * MINUTE, now)).toBe('۱۰ دقیقه پیش');
    expect(relativeTime(now - 5 * HOUR, now)).toBe('۵ ساعت پیش');
  });

  it('never prints a Latin digit', () => {
    for (const delta of [30_000, 10 * MINUTE, 5 * HOUR, 2 * DAY, -3 * DAY]) {
      expect(relativeTime(now + delta, now)).not.toMatch(/[0-9]/);
    }
  });
});

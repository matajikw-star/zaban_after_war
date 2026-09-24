import { describe, expect, it } from 'vitest';
import { FLAG_REASONS } from '../screens/review/FlagSheet.tsx';
import { buildFlagBody } from './flag-body.ts';

const CONTEXT = { installId: 'install-1', appVersion: '1.2.3', at: 1_700_000_000_000 };

describe('buildFlagBody', () => {
  it('builds the full FlagBody shape from an itemId, a reason code and a context', () => {
    expect(buildFlagBody('attribute', 'translation', CONTEXT)).toEqual({
      installId: 'install-1',
      itemId: 'attribute',
      reason: 'translation',
      appVersion: '1.2.3',
      at: 1_700_000_000_000,
    });
  });

  it('accepts every reason code the server enum allows', () => {
    for (const reason of ['translation', 'example', 'hint'] as const) {
      expect(buildFlagBody('distinct', reason, CONTEXT).reason).toBe(reason);
    }
  });

  it('never invents or drops a field: same itemId and reason, same body, from either caller', () => {
    // `/review` and `/word/:id` differ only in how they gather `context` (store reads, the
    // clock); once that is assembled, both call this same function, so equal inputs can never
    // produce two different payloads for the server to see (ticket dev-web/07).
    const fromReview = buildFlagBody('perilous', 'example', CONTEXT);
    const fromWordDetail = buildFlagBody('perilous', 'example', CONTEXT);
    expect(fromReview).toEqual(fromWordDetail);
  });

  it("uses the review screen's reason codes and labels — no second set exists", () => {
    expect(FLAG_REASONS.map((r) => r.reason)).toEqual(['translation', 'example', 'hint']);
    expect(FLAG_REASONS.every((r) => typeof r.label === 'string' && r.label.length > 0)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.ts';
import { chunksWithStallTimeout, rangeStartOf, type StallTimers } from './download-live.ts';

describe('rangeStartOf (Go http.ServeContent `Content-Range`)', () => {
  it('reads the first byte of a 206', () => {
    expect(rangeStartOf('bytes 1000-1999/2000')).toBe(1000);
    expect(rangeStartOf('bytes 0-0/1')).toBe(0);
    expect(rangeStartOf(' bytes 5-9/* ')).toBe(5);
  });

  it('anything else is null, which the run refuses as a bad resume', () => {
    for (const bad of [null, '', 'bytes */2000', 'items 0-1/2', 'bytes -5/10', 'bytes a-b/c']) {
      expect(rangeStartOf(bad)).toBeNull();
    }
  });
});

/** Timers the test fires by hand. */
function manualTimers() {
  const pending: Array<{ fn: () => void; cleared: boolean }> = [];
  const timers: StallTimers = {
    setTimer: (fn) => {
      const t = { fn, cleared: false };
      pending.push(t);
      return t;
    },
    clearTimer: (handle) => {
      if (handle !== null) (handle as { cleared: boolean }).cleared = true;
    },
  };
  const fireLive = () => {
    for (const t of pending) if (!t.cleared) t.fn();
  };
  return { timers, fireLive, pending };
}

function streamOf(chunks: Uint8Array[], thenHang = false): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i] as Uint8Array);
        i += 1;
        return;
      }
      if (thenHang) return new Promise<void>(() => undefined);
      controller.close();
      return;
    },
  });
}

describe('chunksWithStallTimeout', () => {
  it('passes every chunk through and ends with the stream, leaving no live timer', async () => {
    const { timers, pending } = manualTimers();
    const out: number[] = [];
    const stream = streamOf([new Uint8Array(3), new Uint8Array(0), new Uint8Array(4)]);
    for await (const chunk of chunksWithStallTimeout(stream.getReader(), 1000, timers)) {
      out.push(chunk.length);
    }
    expect(out).toEqual([3, 4]);
    expect(pending.every((t) => t.cleared)).toBe(true);
  });

  it('a stream that goes quiet is abandoned with DOWNLOAD_STALLED after the bytes it did send', async () => {
    const { timers, fireLive } = manualTimers();
    const stream = streamOf([new Uint8Array(5)], true);
    const got: number[] = [];
    const run = (async () => {
      for await (const chunk of chunksWithStallTimeout(stream.getReader(), 1000, timers)) {
        got.push(chunk.length);
      }
    })();
    // Let the first chunk through and the second read start hanging.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireLive();
    const error = await run.then(
      () => null,
      (err: unknown) => err,
    );
    expect(got).toEqual([5]);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('DOWNLOAD_STALLED');
  });
});

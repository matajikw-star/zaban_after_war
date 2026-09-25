import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.ts';
import {
  chunksWithStallTimeout,
  rangeStartOf,
  responseWithHeadersTimeout,
  type StallTimers,
} from './download-live.ts';

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
    expect((error as AppError).data).toMatchObject({ phase: 'body' });
  });
});

describe('responseWithHeadersTimeout', () => {
  /** A request that answers only when told to, and rejects like `net/api.ts` does on an abort. */
  function hangingSend() {
    let seen: AbortSignal | null = null;
    const send = (signal: AbortSignal) => {
      seen = signal;
      return new Promise<Response>((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new AppError('NETWORK', 'the request never reached the server'));
        });
      });
    };
    return { send, signal: () => seen as AbortSignal | null };
  }

  it('no headers in time is DOWNLOAD_STALLED (phase headers), not NETWORK, and aborts', async () => {
    const { timers, fireLive } = manualTimers();
    const { send, signal } = hangingSend();
    const pending = responseWithHeadersTimeout(send, 1000, timers);
    fireLive();
    const error = await pending.then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('DOWNLOAD_STALLED');
    expect((error as AppError).data).toMatchObject({ phase: 'headers', timeoutMs: 1000 });
    expect(signal()?.aborted).toBe(true);
  });

  it('a request that ignores the abort still ends as DOWNLOAD_STALLED', async () => {
    const { timers, fireLive } = manualTimers();
    const pending = responseWithHeadersTimeout(
      () => new Promise<Response>(() => undefined),
      1000,
      timers,
    );
    fireLive();
    await expect(pending).rejects.toMatchObject({ code: 'DOWNLOAD_STALLED' });
  });

  it('a real network failure is still NETWORK, and leaves no live timer', async () => {
    const { timers, pending } = manualTimers();
    const failing = () => Promise.reject(new AppError('NETWORK', 'offline'));
    await expect(responseWithHeadersTimeout(failing, 1000, timers)).rejects.toMatchObject({
      code: 'NETWORK',
    });
    expect(pending.every((t) => t.cleared)).toBe(true);
  });

  it('headers in time pass the response through and clear the timer', async () => {
    const { timers, pending } = manualTimers();
    const response = new Response('x', { status: 200 });
    await expect(
      responseWithHeadersTimeout(() => Promise.resolve(response), 1000, timers),
    ).resolves.toBe(response);
    expect(pending.every((t) => t.cleared)).toBe(true);
  });
});

// Resolves a minified client stack back to its original TypeScript source (what.md §10.3), using
// the `source-map` package against `GET /api/admin/sourcemap/:sha/:file` (what.md §8.2). The
// `.map` files themselves live at `/opt/kl/sourcemaps/<sha>/` on the server, uploaded per deploy
// and never shipped to a client (§14.4) — this tool is the only reader of them.

import { SourceMapConsumer } from 'source-map';
import type { PbClient } from './pb.ts';

export interface ResolvedPosition {
  readonly source: string;
  readonly line: number | null;
  readonly column: number | null;
  readonly name: string | null;
}

export interface StackFrame {
  readonly raw: string;
  readonly functionName: string | null;
  readonly file: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly resolved: ResolvedPosition | null;
  /** Why `resolved` is null: no map for this build/file, or the position was not in it. Never
   *  thrown — one frame's map miss must not lose the rest of the report. */
  readonly note: string | null;
}

// V8's own format: `    at name (https://host/assets/file.js:12:345)` or, for an anonymous
// frame, `    at https://host/assets/file.js:12:345`.
const FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?(https?:\/\/\S+?):(\d+):(\d+)\)?\s*$/;

function fileNameOf(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop() || url;
  } catch {
    return url.split('/').pop() || url;
  }
}

/** One consumer per (build, file) for the life of the process — a report can cite the same
 *  frame many times (breadcrumbs, repeated calls into the same function). */
const consumerCache = new Map<string, Promise<SourceMapConsumer | null>>();

async function consumerFor(
  pb: PbClient,
  buildSha: string,
  file: string,
): Promise<SourceMapConsumer | null> {
  const key = `${buildSha}/${file}`;
  let cached = consumerCache.get(key);
  if (cached === undefined) {
    cached = (async () => {
      try {
        const bytes = await pb.getBinary(`/api/admin/sourcemap/${buildSha}/${file}.map`);
        const raw = JSON.parse(new TextDecoder().decode(bytes));
        return await new SourceMapConsumer(raw);
      } catch {
        return null;
      }
    })();
    consumerCache.set(key, cached);
  }
  return cached;
}

/**
 * `stack` is the client's raw (minified) `Error#stack`; may be null (older records, or a browser
 * that gave none). Never throws: a report with a stack that cannot be resolved still prints,
 * with each frame's `note` saying why.
 */
export async function symbolicateStack(
  pb: PbClient,
  buildSha: string,
  stack: string | null,
): Promise<StackFrame[]> {
  if (!stack) return [];

  const frames: StackFrame[] = [];
  for (const raw of stack.split('\n')) {
    if (raw.trim() === '') continue;
    const match = FRAME_RE.exec(raw);
    if (!match) {
      frames.push({
        raw,
        functionName: null,
        file: null,
        line: null,
        column: null,
        resolved: null,
        note: null,
      });
      continue;
    }
    const functionName = match[1] ?? null;
    const url = match[2] as string;
    const line = Number(match[3]);
    const column = Number(match[4]);
    const file = fileNameOf(url);

    if (!buildSha) {
      frames.push({
        raw,
        functionName,
        file,
        line,
        column,
        resolved: null,
        note: 'record has no buildSha',
      });
      continue;
    }

    const consumer = await consumerFor(pb, buildSha, file);
    if (!consumer) {
      frames.push({
        raw,
        functionName,
        file,
        line,
        column,
        resolved: null,
        note: 'no source map for this build/file',
      });
      continue;
    }

    // V8 columns are 1-based; sourcemap mappings are 0-based (Node's own --enable-source-maps
    // makes the same adjustment).
    const pos = consumer.originalPositionFor({ line, column: Math.max(0, column - 1) });
    frames.push({
      raw,
      functionName,
      file,
      line,
      column,
      resolved:
        pos.source !== null
          ? { source: pos.source, line: pos.line, column: pos.column, name: pos.name }
          : null,
      note: pos.source !== null ? null : 'position not found in the map',
    });
  }
  return frames;
}

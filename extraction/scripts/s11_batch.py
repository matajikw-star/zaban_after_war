"""S11 - cut the next word-data batch, and report how far the pass has got.

The pass is resumable with no state file of its own: a word is done when its
entry has a non-empty `senses`, so `content/lexicon/` is the state. Order comes
from `extraction/state/generation-queue.json` (tested words by priority, then
context words by importance x difficulty), so if the budget runs out it runs out
at the least valuable end.

    python extraction/scripts/s11_batch.py --status
    python extraction/scripts/s11_batch.py --next 40 --out <dir> [--batches 6]

`--out` is the PARENT directory; each batch lands in `<dir>/batch-NN`, numbered
on from the highest `batch-NN` already there so repeated calls accumulate rather
than overwrite one an agent is still working on. Each batch dir holds a
`context.txt` - every word expanded into the verbatim stem, options and inferred
key of each question it appears in - and a `words.json`. The `context.txt` is
the only thing the generating agent has to read.

`--batches K` cuts K *disjoint* batches in one call, and it is the only safe way
to fan out. Calling `--next` six times in a row does not work: pending is
derived from `content/lexicon/`, so until a batch is applied every call hands
back the same 40 words. That is the price of holding no state file, and it is
the right price - but it means the fan-out has to happen inside one call.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
LEXICON = ROOT / "content" / "lexicon"
QUEUE = ROOT / "extraction" / "state" / "generation-queue.json"


def done(word_id: str) -> bool:
    p = LEXICON / f"{word_id}.json"
    if not p.exists():
        return False
    try:
        return bool(json.loads(p.read_text(encoding="utf-8")).get("senses"))
    except json.JSONDecodeError:
        return False


def queue() -> list[dict]:
    return json.loads(QUEUE.read_text(encoding="utf-8"))["words"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--next", type=int, metavar="N")
    ap.add_argument("--out", type=Path, metavar="PARENT_DIR")
    ap.add_argument("--batches", type=int, default=1, metavar="K",
                    help="cut K disjoint batches in one call, for concurrent agents")
    args = ap.parse_args()

    words = queue()
    pending = [w for w in words if not done(w["id"])]
    finished = len(words) - len(pending)

    if args.status or not args.next:
        by_kind: dict[str, list[int]] = {}
        for w in words:
            slot = by_kind.setdefault(w["kind"], [0, 0])
            slot[1] += 1
            if done(w["id"]):
                slot[0] += 1
        print(f"word data: {finished} of {len(words)} done, {len(pending)} remaining")
        for kind, (d, t) in sorted(by_kind.items()):
            print(f"  {kind:<8} {d:>5} / {t}")
        if pending:
            head = ", ".join(w["id"] for w in pending[:8])
            print(f"  next up: {head}{' ...' if len(pending) > 8 else ''}")
        return 0

    if not args.out:
        print("--next needs --out <parent-dir>")
        return 1
    if args.batches < 1:
        print("--batches must be at least 1")
        return 1
    if not pending:
        print("nothing pending - the pass is complete")
        return 0

    args.out.mkdir(parents=True, exist_ok=True)
    existing = []
    for d in args.out.iterdir():
        m = re.fullmatch(r"batch-(\d+)", d.name)
        if d.is_dir() and m:
            existing.append(int(m.group(1)))
    start = max(existing, default=0) + 1

    cut = 0
    for i in range(args.batches):
        batch = pending[i * args.next:(i + 1) * args.next]
        if not batch:
            print(f"queue exhausted after {i} batch(es)")
            break

        out_dir = args.out / f"batch-{start + i:02d}"
        out_dir.mkdir(parents=True, exist_ok=True)
        ids = [w["id"] for w in batch]

        ctx = subprocess.run(
            [sys.executable, str(ROOT / "extraction" / "scripts" / "word_context.py"), *ids],
            capture_output=True, cwd=str(ROOT),
        )
        if ctx.returncode != 0:
            print(ctx.stderr.decode("utf-8", errors="replace"))
            return 1

        io.open(out_dir / "context.txt", "w", encoding="utf-8", newline="\n").write(
            ctx.stdout.decode("utf-8", errors="replace"))
        (out_dir / "words.json").write_text(
            json.dumps(ids, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

        kinds: dict[str, int] = {}
        for w in batch:
            kinds[w["kind"]] = kinds.get(w["kind"], 0) + 1
        shape = ", ".join(f"{n} {k}" for k, n in sorted(kinds.items()))
        print(f"{out_dir.name}: {len(batch):>3} words ({shape})  "
              f"ranks {batch[0]['rank']}-{batch[-1]['rank']}")
        cut += len(batch)

    print(f"cut {cut} words into {args.out}")
    print(f"{finished} done before these batches, {len(pending)} pending")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

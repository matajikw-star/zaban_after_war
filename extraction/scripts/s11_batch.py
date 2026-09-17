"""S11 - cut the next word-data batch, and report how far the pass has got.

The pass is resumable with no state file of its own: a word is done when its
entry has a non-empty `senses`, so `content/lexicon/` is the state. Order comes
from `extraction/state/generation-queue.json` (tested words by priority, then
context words by importance x difficulty), so if the budget runs out it runs out
at the least valuable end.

    python extraction/scripts/s11_batch.py --status
    python extraction/scripts/s11_batch.py --next 40 --out <dir>

`--next` writes <dir>/context.txt - every word in the batch expanded into the
verbatim stem, options and inferred key of each question it appears in - and
prints the path. That file is the only thing the generating agent has to read.
"""
from __future__ import annotations

import argparse
import io
import json
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
    ap.add_argument("--out", type=Path)
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
        print("--next needs --out <dir>")
        return 1

    batch = pending[:args.next]
    if not batch:
        print("nothing pending - the pass is complete")
        return 0

    args.out.mkdir(parents=True, exist_ok=True)
    ids = [w["id"] for w in batch]

    ctx = subprocess.run(
        [sys.executable, str(ROOT / "extraction" / "scripts" / "word_context.py"), *ids],
        capture_output=True, cwd=str(ROOT),
    )
    text = ctx.stdout.decode("utf-8", errors="replace")
    if ctx.returncode != 0:
        print(ctx.stderr.decode("utf-8", errors="replace"))
        return 1

    out = args.out / "context.txt"
    io.open(out, "w", encoding="utf-8", newline="\n").write(text)
    (args.out / "words.json").write_text(
        json.dumps(ids, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    kinds = {}
    for w in batch:
        kinds[w["kind"]] = kinds.get(w["kind"], 0) + 1
    print(f"batch of {len(batch)}: " + ", ".join(f"{n} {k}" for k, n in sorted(kinds.items())))
    print(f"ranks {batch[0]['rank']}-{batch[-1]['rank']} · {finished} done before this batch")
    print(f"context: {out}")
    print(f"ids:     {args.out / 'words.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

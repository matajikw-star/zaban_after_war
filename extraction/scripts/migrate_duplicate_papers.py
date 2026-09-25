"""One-off - point senses[].testedIn at the kept paper after ADR-0021.

Retiring a duplicate paper (`duplicateOf`) moves every tested occurrence it held
onto the paper it duplicates: S6 books the retired copy's questions on the kept
paper's id and question number. The occurrences are extraction's and S6 re-derives
them; `senses[].testedIn` belongs to the generation pass (ADR-0012) and still
names the retired ids, which `s10_apply_word_data.py` would now reject ("is not
an occurrence of this word").

This rewrites exactly that field and nothing else, the same way S6 moved the
occurrences: (retired paper, n) -> (kept paper, n), then drops the repeat when a
sense already claimed that question. It is the lossless twin of the S6 change -
the meaning of a sense and the question it was written from are unchanged; only
the id the question is filed under moves.

Refuses to write if the result would break lint rule 13: a testedIn entry that
is not an occurrence of the word, a tested occurrence no sense claims, or one
claimed by two senses. Run S6 and S8 fold first.

    python extraction/scripts/migrate_duplicate_papers.py --dry-run
    python extraction/scripts/migrate_duplicate_papers.py
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import CONTENT, save_json  # noqa: E402

LEX = CONTENT / "lexicon"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    kept_of = {}
    for f in sorted((CONTENT / "exams").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        if d.get("duplicateOf"):
            kept_of[d["paperId"]] = d["duplicateOf"]

    changed, problems = [], []
    for f in sorted(LEX.glob("*.json")):
        entry = json.loads(f.read_text(encoding="utf-8"))
        if not entry.get("senses"):
            continue
        occ_all = {(o["paperId"], o["questionNo"]) for o in entry["occurrences"]}
        occ_tested = {(o["paperId"], o["questionNo"]) for o in entry["occurrences"]
                      if o["occurrenceType"] == "tested"}

        touched = False
        claimed: dict[tuple, int] = {}
        for sense in entry["senses"]:
            out, seen = [], set()
            for t in sense.get("testedIn") or []:
                key = (kept_of.get(t["paperId"], t["paperId"]), t["questionNo"])
                if key != (t["paperId"], t["questionNo"]):
                    touched = True
                if key in seen:
                    continue
                seen.add(key)
                out.append({"paperId": key[0], "questionNo": key[1]})
            sense["testedIn"] = out
            for key in seen:
                claimed[key] = claimed.get(key, 0) + 1

        for key in sorted(seen_key for seen_key in claimed if seen_key not in occ_all):
            problems.append(f"{entry['id']}: testedIn {key} is not an occurrence")
        for key in sorted(occ_tested - set(claimed)):
            problems.append(f"{entry['id']}: tested occurrence {key} is claimed by no sense")
        for key, n in sorted(claimed.items()):
            if n > 1:
                problems.append(f"{entry['id']}: occurrence {key} is claimed by {n} senses")

        if touched:
            changed.append((f, entry))

    print(f"{'DRY RUN - ' if a.dry_run else ''}entries whose testedIn moves: {len(changed)}")
    if problems:
        print(f"{len(problems)} problem(s), nothing written:")
        for p in problems:
            print("  -", p)
        return 1
    if not a.dry_run:
        for f, entry in changed:
            save_json(f, entry)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

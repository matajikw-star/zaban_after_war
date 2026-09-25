"""S8 step 3 - fold the accepted context vocabulary into content/lexicon/.

Reads extraction/state/stem-vocab-selection.json and writes one lexicon file per
accepted word, or adds context occurrences to the file of a word that is already
in the lexicon. This is the step that mints word ids, and a word id is frozen the
moment it lands (CLAUDE.md, constitution rule 6) - so run s8_finalize.py first
and read its id repairs before running this.

What a context occurrence is and is not:

  occurrenceType: "context"   the word appeared in a question's stem
  occurrenceType: "tested"    the word appeared as one of the four options

Only a tested occurrence has an optionIndex and an isAnswer, so a context
occurrence carries neither - its absence is the distinction, not a false value.
`stats.timesAsContext` counts them and `stats.priority` ignores them, because
how often a word turns up in prose is not how much study time it is worth.

    python extraction/scripts/s8_fold.py --dry-run
    python extraction/scripts/s8_fold.py
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import CONTENT, load_json, save_json  # noqa: E402
from s6_lexicon import build_stats  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "extraction" / "state"
LEX = CONTENT / "lexicon"


def question_index() -> tuple[dict, set]:
    """(paperId, questionNo) -> the part it sits in, and the paper's reach; and
    the ids of the papers retired with `duplicateOf` (ADR-0021).

    A retired paper's stems are the kept paper's stems, so a context occurrence
    there would count one sentence twice: main() drops it. The booklets that sat
    a retired paper sat the kept one, so they count toward its reach, as in S6."""
    exams = [json.loads(f.read_text(encoding="utf-8"))
             for f in sorted((CONTENT / "exams").glob("*.json"))]
    retired = {d["paperId"] for d in exams if d.get("duplicateOf")}
    reach = {d["paperId"]: d.get("bookletCount", 1) for d in exams if not d.get("duplicateOf")}
    for d in exams:
        if d.get("duplicateOf"):
            reach[d["duplicateOf"]] += d.get("bookletCount", 1)
    idx = {}
    for d in exams:
        if d["paperId"] in retired:
            continue
        for q in d.get("questions", []):
            idx[(d["paperId"], q.get("no"))] = {"part": q.get("part"), "reach": reach[d["paperId"]]}
    return idx, retired


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    sel = json.loads((STATE / "stem-vocab-selection.json").read_text(encoding="utf-8"))
    qidx, retired = question_index()
    LEX.mkdir(parents=True, exist_ok=True)

    created, merged, unchanged, conflicts = 0, 0, 0, []

    for w in sel["words"]:
        wid = w["id"]
        path = LEX / ("%s.json" % wid)
        prev = load_json(path, default=None)

        if prev and prev.get("id") != wid:
            conflicts.append((wid, prev.get("id")))
            continue

        context = []
        for o in w["occurrences"]:
            if o["paperId"] in retired:
                continue   # the selection predates ADR-0021 and still names retired papers
            meta = qidx.get((o["paperId"], o["questionNo"]), {})
            context.append({
                "occurrenceType": "context",
                "paperId": o["paperId"],
                "year": o["year"],
                "questionNo": o["questionNo"],
                "part": meta.get("part"),
                "surface": o["surface"],
                "reach": meta.get("reach", 1),
            })

        tested = [o for o in (prev or {}).get("occurrences", [])
                  if o.get("occurrenceType") != "context"]

        entry = {
            "id": wid,                                   # frozen forever
            "lemma": (prev or {}).get("lemma") or w["lemma"],
            # Written by the generation pass, not derivable here (ADR-0012).
            "level": (prev or {}).get("level"),
            "senses": (prev or {}).get("senses", []),
            "confusables": (prev or {}).get("confusables", []),
            "homograph": (prev or {}).get("homograph", {"suspected": False, "note": None}),
            "surfaceForms": sorted({o["surface"] for o in tested + context if o.get("surface")}),
            "occurrences": tested + context,
            "stats": build_stats(tested, context),
            "status": (prev or {}).get("status", "draft"),
            "provenance": (prev or {}).get("provenance"),
        }
        if w["verdict"] == "domain-term":
            # Kept so the app can show a domain term only to the fields whose
            # papers it appeared in (product-brief R11). The codes say whom it
            # matters to; the model already decided that it is a domain term.
            entry["domain"] = {"fieldCodes": w.get("fieldCodes") or []}
        elif prev and "domain" in prev:
            entry["domain"] = prev["domain"]

        if prev == entry:
            unchanged += 1
            continue
        if not a.dry_run:
            save_json(path, entry)
        if prev:
            merged += 1
        else:
            created += 1

    prefix = "DRY RUN - " if a.dry_run else ""
    print("%saccepted words: %d" % (prefix, len(sel["words"])))
    print("  new lexicon files:                 %d" % created)
    print("  merged into an existing word:      %d" % merged)
    print("  already correct:                   %d" % unchanged)
    if conflicts:
        print("\nFROZEN-ID CONFLICTS (resolve by hand): %s" % conflicts)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

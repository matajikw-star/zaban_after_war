"""Join a lexicon word to the full exam questions it occurs in.

The word-data generation pass has to read the question before it writes the
senses: the exam's meaning leads, and for a context word the stem is the only
evidence of which meaning was meant. This prints, for each word, its stats and
every occurrence expanded into the verbatim stem, the four options and the
inferred key - so an agent never has to open a scan or hunt through
content/exams/ by hand.

    python extraction/scripts/word_context.py perilous derive affluent
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
LEXICON = ROOT / "content" / "lexicon"
EXAMS = ROOT / "content" / "exams"

_exams: dict[str, dict | None] = {}


def exam(paper_id: str) -> dict | None:
    if paper_id not in _exams:
        p = EXAMS / f"{paper_id}.json"
        _exams[paper_id] = json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
    return _exams[paper_id]


def question(paper_id: str, no: int):
    e = exam(paper_id)
    if not e:
        return None, None
    for q in e["questions"]:
        if q.get("no") == no:
            return e, q
    return e, None


def dump(word_id: str) -> None:
    f = LEXICON / f"{word_id}.json"
    if not f.exists():
        print(f"### {word_id}  -- NOT IN LEXICON\n")
        return
    w = json.loads(f.read_text(encoding="utf-8"))
    st = w["stats"]
    print(f"### {w['id']}  (lemma={w['lemma']}, surfaceForms={w['surfaceForms']})")
    print(f"    level={w['level']} status={w['status']} domain={w.get('domain')}")
    print(f"    priority={st['priority']} tested={st['timesTested']} answer={st['timesAsAnswer']} "
          f"context={st['timesAsContext']} byYear={st['byYear']}")

    seen = set()
    for oc in w["occurrences"]:
        e, q = question(oc["paperId"], oc["questionNo"])
        extra = ""
        if oc["occurrenceType"] == "tested":
            extra = f" optionIndex={oc.get('optionIndex')} isAnswer={oc.get('isAnswer')}"
        print(f"  - [{oc['occurrenceType']}] {oc['paperId']} q{oc['questionNo']} "
              f"({oc['part']}, {oc['year']}) surface={oc['surface']!r}{extra}")
        if q is None:
            print("      !! question not found in the exam file")
            continue
        # The same stem repeats across the booklets of one paper cluster; print
        # it once and let the occurrence lines carry the rest.
        key = (oc["paperId"], oc["questionNo"])
        if key in seen:
            continue
        seen.add(key)
        print(f"      stem: {q.get('stem')}")
        k = q.get("key")
        for i, o in enumerate(q.get("options") or []):
            print(f"        [{i}] {o}" + (" <== KEY" if k == i else ""))
        print(f"      testedWord={q.get('testedWord')} keySource={q.get('keySource')} "
              f"keyConfidence={q.get('keyConfidence')}")
        if q.get("uncertain"):
            print(f"      uncertain: {q['uncertain']}")
        if e.get("uncertain"):
            print(f"      paper-uncertain: {e['uncertain']}")
    print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for wid in sys.argv[1:]:
        dump(wid)

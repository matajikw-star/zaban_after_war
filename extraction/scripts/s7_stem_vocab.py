"""S7 - classify the vocabulary of question stems.

Reads content/exams/*.json as TEXT. Never opens a scan or a page image: that is
the whole point of ADR-0010, and this stage is what the ADR defers the judgment
to.

What it does NOT do: write to content/. It produces a classification only, which
the owner approves before anything folds into the lexicon.

Selection, in one line: a stem word earns a lexicon entry when it is ABOVE the
baseline an MA candidate is assumed to have, not when it is frequent. Frequency
in the exam corpus turned out to rank `people`, `because` and `water` at the top
- see docs/adr/0011. So general-English frequency is used the other way round:
as evidence a word is too EASY to be worth teaching.

Every stem lemma is classified and kept, including the easy ones. Nothing is
discarded, so a later level-graded edition can draw on the bands below the cut.
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXAMS = ROOT / "content" / "exams"
LEXICON = ROOT / "content" / "lexicon"
FREQ_FILE = ROOT / "extraction" / "data" / "en-frequency-top10k.txt"
OUT = ROOT / "extraction" / "state" / "stem-vocab.json"

# Rank in the general-English frequency list at or below which a word counts as
# baseline vocabulary an MA/PhD candidate already has. Tuned against the corpus:
# see the band samples this script prints and docs/adr/0011.
EASY_RANK = 3000

# A lemma must appear in at least this many distinct exam years to be offered at
# all. A floor against one-off noise and OCR debris - NOT a ranking signal.
MIN_YEARS = 2

# Function words carry no teaching value at any level; they are not "vocabulary"
# in the sense this product means, so they never reach the bands.
STOPWORDS = set(
    """
a an the and or but if then than that this these those there here
is are was were be been being am do does did doing done
have has had having will would shall should can could may might must
i you he she it we they me him her us them my your his its our their
of in on at to for from by with without within into onto up down over under
about above after before between during through against across along around
as not no nor only own same so too very just also even still yet more most
less least much many few some any each every other another such both either
neither what which who whom whose when where why how whether
one two three four five six seven eight nine ten
cannot let's don't etc via per thus hence therefore however moreover
""".split()
)

# Endings that usually mean the token is an inflected form. When one of these is
# present and no reduction landed on a known word, the lemma is flagged rather
# than silently trusted - the frequency list is US-web-derived and misses some
# bases (criticize, dominate), so a miss here is the list's gap, not evidence
# that the surface form IS the lemma.
INFLECTION_ENDINGS = ("ing", "ed", "ies", "es", "s")


def load_freq_ranks() -> dict[str, int]:
    if not FREQ_FILE.exists():
        sys.exit(f"missing frequency reference: {FREQ_FILE}")
    words = [w.strip().lower() for w in FREQ_FILE.read_text(encoding="utf-8").splitlines()]
    return {w: i + 1 for i, w in enumerate(words) if w}


def build_lemmatizer(known: set[str]):
    """Crude suffix stripping, validated against a known-word set.

    There is no spaCy or NLTK here on purpose - extraction/requirements.txt is
    deliberately tiny (ADR-0005 neighbours). A reduction is accepted only when
    the reduced form is itself a known word, which is what keeps `bus` from
    becoming `bu` and `sanctioned` from becoming `sanction` only when
    `sanction` is real.
    """

    def candidates(w: str):
        if w.endswith("ies") and len(w) > 4:
            yield w[:-3] + "y"
        if w.endswith("ied") and len(w) > 4:
            yield w[:-3] + "y"
        if w.endswith("es") and len(w) > 3:
            yield w[:-2]
        if w.endswith("s") and not w.endswith("ss") and len(w) > 3:
            yield w[:-1]
        if w.endswith("ed") and len(w) > 3:
            yield w[:-2]          # walked -> walk
            yield w[:-1]          # used   -> use
            if len(w) > 4 and w[-3] == w[-4]:
                yield w[:-3]      # stopped -> stop
        if w.endswith("ing") and len(w) > 4:
            yield w[:-3]          # giving -> giv (rejected), reading -> read
            yield w[:-3] + "e"    # giving -> give
            if len(w) > 5 and w[-4] == w[-5]:
                yield w[:-4]      # running -> run
        if w.endswith("ly") and len(w) > 4:
            yield w[:-2]          # commonly -> common
        if w.endswith("est") and len(w) > 5:
            yield w[:-3]
        if w.endswith("er") and len(w) > 4:
            yield w[:-2]

    def lemma(w: str) -> str:
        if w in known:
            return w
        for c in candidates(w):
            if c in known:
                return c
        return w

    return lemma


def main() -> int:
    ranks = load_freq_ranks()

    lexicon_ids = {p.stem for p in LEXICON.glob("*.json")}
    lexicon_lemmas = set()
    for p in LEXICON.glob("*.json"):
        try:
            lexicon_lemmas.add(json.loads(p.read_text(encoding="utf-8"))["lemma"].lower())
        except Exception:
            pass

    known = set(ranks) | lexicon_ids | lexicon_lemmas
    lemma_of = build_lemmatizer(known)

    agg: dict[str, dict] = defaultdict(
        lambda: {"years": set(), "papers": set(), "n": 0, "surfaces": set(), "example": None}
    )

    exam_files = sorted(EXAMS.glob("*.json"))
    if not exam_files:
        sys.exit(f"no exam files under {EXAMS}")

    for f in exam_files:
        d = json.loads(f.read_text(encoding="utf-8"))
        year, paper = d["year"], d["paperId"]
        for q in d.get("questions", []):
            stem = q.get("stem") or ""
            for raw in re.findall(r"[A-Za-z][A-Za-z'\-]*", stem.lower()):
                raw = raw.strip("'-")
                if len(raw) < 3 or raw in STOPWORDS or "'" in raw:
                    continue
                lem = lemma_of(raw)
                if lem in STOPWORDS:
                    continue
                e = agg[lem]
                e["years"].add(year)
                e["papers"].add(paper)
                e["n"] += 1
                e["surfaces"].add(raw)
                if e["example"] is None:
                    e["example"] = {"paperId": paper, "questionNo": q.get("no"), "stem": stem}

    rows = []
    for lem, e in agg.items():
        rank = ranks.get(lem)
        if lem in lexicon_ids or lem in lexicon_lemmas:
            band = "tested"          # already a lexicon word; nothing to decide
        elif "-" in lem:
            band = "compound"        # `year-old`, `cutting-edge`: a phrase, not a
                                     # word id. Kept, never offered as a lemma.
        elif rank is not None and rank <= EASY_RANK:
            band = "baseline"        # too easy - held for a graded edition
        elif rank is not None:
            band = "mid"             # known but uncommon - the judgment band
        else:
            band = "rare"            # outside the top 10k - likely academic

        inflected = lem.endswith(INFLECTION_ENDINGS) and rank is None
        rows.append(
            {
                "lemma": lem,
                "band": band,
                "generalRank": rank,
                "distinctYears": len(e["years"]),
                "distinctPapers": len(e["papers"]),
                "occurrences": e["n"],
                "surfaces": sorted(e["surfaces"]),
                "meetsYearFloor": len(e["years"]) >= MIN_YEARS,
                "lemmaUncertain": inflected,
                # Only the shortlist carries its example stem. Storing one for
                # all ~4.5k lemmas made this file 2.5 MB of mostly `because`.
                "example": e["example"]
                if band in ("mid", "rare") and len(e["years"]) >= MIN_YEARS
                else None,
            }
        )

    rows.sort(key=lambda r: (-r["distinctYears"], -r["occurrences"], r["lemma"]))

    shortlist = [
        r for r in rows if r["band"] in ("mid", "rare") and r["meetsYearFloor"]
    ]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "generatedFrom": f"{len(exam_files)} exam files",
                "easyRankCutoff": EASY_RANK,
                "minYears": MIN_YEARS,
                "counts": {
                    "lemmas": len(rows),
                    "shortlist": len(shortlist),
                    **{
                        b: sum(1 for r in rows if r["band"] == b)
                        for b in ("tested", "baseline", "mid", "rare", "compound")
                    },
                },
                "words": rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"exam files      {len(exam_files)}")
    print(f"stem lemmas     {len(rows):,}")
    for b in ("tested", "baseline", "mid", "rare", "compound"):
        c = sum(1 for r in rows if r["band"] == b)
        f = sum(1 for r in rows if r["band"] == b and r["meetsYearFloor"])
        print(f"  {b:<9} {c:>5,}   (>= {MIN_YEARS} years: {f:,})")
    print(f"\nSHORTLIST (mid+rare, >= {MIN_YEARS} years): {len(shortlist):,}")
    print(f"written to {OUT.relative_to(ROOT)}")

    for band in ("rare", "mid", "baseline"):
        sample = [r["lemma"] for r in rows if r["band"] == band and r["meetsYearFloor"]][:30]
        print(f"\n--- {band}, top 30 by year-spread ---\n   " + ", ".join(sample))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""S7 - classify the vocabulary of question stems.

Reads content/exams/*.json as TEXT. Never opens a scan or a page image: that is
the whole point of ADR-0010, and this stage is what the ADR defers the judgment
to.

What it does NOT do: write to content/. It produces a classification only, which
the owner approves before anything folds into the lexicon.

The criterion is IMPORTANCE TO UNDERSTANDING THE QUESTION, crossed with
difficulty - not frequency, and not difficulty alone. A stem word earns an entry
when a candidate plausibly does not know it AND the sentence leans on it. See
docs/adr/0011.

That judgment is not mechanical, so this script does not make it. This is a
sieve: it drops only what provably needs no judgment - function words, and words
common enough in general English that a candidate already knows them, where the
"plausibly does not know it" factor is near zero - and hands the rest to the
judging pass.

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
# baseline vocabulary an MA/PhD candidate already has.
#
# Raised from 3000 to 5000 by the calibration batch
# (extraction/state/stem-vocab-calibration.json). Of the 30 words judged, every
# rejected word carrying a rank sat at 6533 or below, while the only accepted
# words with a rank were `exclude` (6306) and `undertaken` (7211) - so the real
# boundary is somewhere near 6000. 5000 is deliberately short of it: the sample
# is 30 words and it is the same sample the number was read off, so a cutoff
# placed exactly on the observed edge would be fitting to noise. A second,
# independent batch would justify moving to 6000 and would drop ~150 more.
EASY_RANK = 5000

# Recorded, never used to gate. An earlier draft required 2+ distinct years as
# "noise protection", but S5 already corroborates every stem word against
# independent OCR, so the floor protected against nothing - it was the last
# remnant of the frequency thinking ADR-0011 rejects. Under the real criterion
# (importance in the sentence x difficulty) a word that blocks comprehension of
# one question still blocks it, however many years it appeared in.
MIN_YEARS = 2

# A word whose papers were sat by at most this many field codes is treated as
# attributable to a discipline. Above it the paper was a general one and the
# attribution says nothing.
FIELD_SPECIFIC_MAX = 5

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

# Lemmas that merely look plural. `-ics` is handled by rule (physics, politics,
# linguistics, statistics); these are the ones no rule catches, where stripping
# the -s lands on a real but unrelated word.
NEVER_REDUCE = {
    "news", "means", "series", "species", "lens", "bias", "campus", "status",
    "focus", "virus", "census", "consensus", "crisis", "basis", "analysis",
    "thesis", "hypothesis", "emphasis", "apparatus", "corpus", "index",
}


def load_freq_ranks() -> dict[str, int]:
    if not FREQ_FILE.exists():
        sys.exit(f"missing frequency reference: {FREQ_FILE}")
    words = [w.strip().lower() for w in FREQ_FILE.read_text(encoding="utf-8").splitlines()]
    # Entries shorter than 3 characters are scraping debris, not words - the list
    # carries `ne`, `br`, `th`, `ti`, `cl` among others. Left in, they become
    # reduction targets and produce need -> ne, bring -> br, thing -> th. Every
    # real 2-letter English word is a stopword here anyway, so nothing is lost.
    return {w: i + 1 for i, w in enumerate(words) if len(w) >= 3}


def build_lemmatizer(known: set[str], reduce_targets: set[str] | None = None):
    """Crude suffix stripping, validated against a known-word set.

    There is no spaCy or NLTK here on purpose - extraction/requirements.txt is
    deliberately tiny (ADR-0005 neighbours). A reduction is accepted only when
    the reduced form is itself a known word, which is what keeps `bus` from
    becoming `bu` and `sanctioned` from becoming `sanction` only when
    `sanction` is real.

    `reduce_targets` widens what counts as "real" for reductions only. It carries
    the corpus's own surface forms, so `psychologists` -> `psychologist` works
    even though neither form is in the frequency list: the singular turning up in
    another stem is evidence enough.
    """
    targets = known if reduce_targets is None else reduce_targets

    def inflectional(w: str):
        """Plural and tense: same word, different grammatical form."""
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
            yield w[:-3]          # reading -> read
            yield w[:-3] + "e"    # giving  -> give
            if len(w) > 5 and w[-4] == w[-5]:
                yield w[:-4]      # running -> run

    def derivational(w: str):
        """A different word built from another: only as a fallback."""
        if w.endswith("ly") and len(w) > 4:
            yield w[:-2]          # commonly -> common
        if w.endswith("est") and len(w) > 5:
            yield w[:-3]
        if w.endswith("er") and len(w) > 4:
            yield w[:-2]

    def lemma(w: str) -> str:
        # Reduce INFLECTION first, even when the surface form is itself a known
        # word. The frequency list is web-derived and lists plenty of inflected
        # forms (finds, ties, scientists, humans, years all appear in it), so an
        # "already known, leave it alone" shortcut silently refuses to reduce
        # exactly the words that most need it, and splits one word's counts
        # across two rows.
        if w not in NEVER_REDUCE and not (w.endswith("ics") and len(w) > 4):
            # Longest candidate first: `ties` offers both `ti` and `tie`, and the
            # longer one is the real lemma every time.
            hits = [c for c in inflectional(w) if len(c) >= 3 and c in targets]
            if hits:
                return max(hits, key=len)
        if w in known:
            return w
        # Derivation (-ly, -er, -est) only as a fallback: `commonly` -> `common`
        # is wanted, but `early` -> `ear` is not, and the exam may be testing the
        # derived form itself.
        for c in derivational(w):
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

    # First pass: every surface form the corpus actually uses. It widens what a
    # reduction may land on, which is how the pairs that are in neither the
    # frequency list nor the lexicon (psychologist / psychologists) get merged.
    # It also records which words are ever seen in lower case. A word that is
    # capitalised every time it appears, and never sits at the start of a
    # sentence, is a name - Christopher, Nicolaus, Lascaux. Those are not
    # vocabulary and must not reach the judging pass.
    surfaces_seen: set[str] = set()
    ever_lower: set[str] = set()
    for f in sorted(EXAMS.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        for q in d.get("questions", []):
            stem = q.get("stem") or ""
            for m in re.finditer(r"[A-Za-z][A-Za-z'\-]*", stem):
                raw = m.group(0).strip("'-")
                if not raw:
                    continue
                surfaces_seen.add(raw.lower())
                before = stem[: m.start()].rstrip()
                sentence_initial = not before or before[-1] in ".!?\"'"
                if raw[0].islower() or sentence_initial:
                    ever_lower.add(raw.lower())

    lemma_of = build_lemmatizer(known, reduce_targets=known | surfaces_seen)

    agg: dict[str, dict] = defaultdict(
        lambda: {"years": set(), "papers": set(), "n": 0, "surfaces": set(), "example": None}
    )

    exam_files = sorted(EXAMS.glob("*.json"))
    if not exam_files:
        sys.exit(f"no exam files under {EXAMS}")

    # Which field codes (کد رشته) sat each paper. A word's field attribution is
    # the union of the codes of the papers it appeared in: 28 of the 58 papers
    # were sat by exactly one code, so a term seen only there is pinned to one
    # discipline, while a term from `p01` (up to 60 codes) is simply general.
    paper_codes: dict[str, list[str]] = {}
    exams = [json.loads(f.read_text(encoding="utf-8")) for f in exam_files]
    for d in exams:
        paper_codes.setdefault(d.get("duplicateOf") or d["paperId"], []).extend(
            d.get("groupCodes") or [])

    for d in exams:
        # A paper retired with `duplicateOf` (ADR-0021) is the kept paper's test
        # again: counting its stems would double every word in them. Its field
        # codes were folded into the kept paper's just above.
        if d.get("duplicateOf"):
            continue
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
        elif not (e["surfaces"] & ever_lower):
            band = "proper"          # capitalised every time: a name, not a word
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

        # Field attribution, carried only for words that can reach the lexicon.
        # `specific` means every paper this word appeared in was sat by a narrow
        # set of field codes, so a per-field view can show it to just those
        # candidates (product-brief R11). `broad` means it came off a general
        # paper and belongs to everyone.
        if band in ("mid", "rare"):
            codes = sorted({c for p in e["papers"] for c in paper_codes.get(p, [])})
            field = {
                "codes": codes,
                "scope": "specific" if 0 < len(codes) <= FIELD_SPECIFIC_MAX else "broad",
            }
        else:
            field = None
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
                "field": field,
                # Only the shortlist carries its example stem. Storing one for
                # all ~4.5k lemmas made this file 2.5 MB of mostly `because`.
                "example": e["example"] if band in ("mid", "rare") else None,
            }
        )

    rows.sort(key=lambda r: (-r["distinctYears"], -r["occurrences"], r["lemma"]))

    # Everything the mechanical sieve cannot decide goes to the judging pass.
    # No year floor: see MIN_YEARS above.
    shortlist = [r for r in rows if r["band"] in ("mid", "rare")]

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
                        for b in ("tested", "baseline", "mid", "rare", "compound", "proper")
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
    for b in ("tested", "baseline", "mid", "rare", "compound", "proper"):
        c = sum(1 for r in rows if r["band"] == b)
        f = sum(1 for r in rows if r["band"] == b and r["meetsYearFloor"])
        print(f"  {b:<9} {c:>5,}   (>= {MIN_YEARS} years: {f:,})")
    print(f"\nSHORTLIST for judging (mid+rare, no year floor): {len(shortlist):,}")
    print(f"written to {OUT.relative_to(ROOT)}")

    for band in ("rare", "mid", "baseline"):
        sample = [r["lemma"] for r in rows if r["band"] == band][:30]
        print(f"\n--- {band}, top 30 by year-spread ---\n   " + ", ".join(sample))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

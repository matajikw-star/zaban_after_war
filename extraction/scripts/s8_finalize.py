"""S8 step 2 - merge the judging results into the final context-vocabulary selection.

Reads extraction/state/judge/batch-NN.json and result-NN.json, validates that
every shortlist word was judged exactly once, applies the judges' lemma
corrections, locates every stem occurrence of each accepted word across
content/exams/, ranks them, and writes:

  extraction/state/stem-vocab-selection.json   the machine-readable selection
  extraction/state/stem-vocab-selection.md     the same list for a human

Writes nothing to content/. Folding into the lexicon is a separate step.

Ranking. ADR-0011's criterion is importance x difficulty, so that product is the
rank, straight. Corroboration from the corpus breaks ties only: a word that
blocks comprehension in four papers is worth reaching before one that blocks it
in one, but recurrence never promotes a word past a more important one - that
was the whole error ADR-0011 corrects.
"""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "extraction" / "state"
JUDGE = STATE / "judge"
EXAMS = ROOT / "content" / "exams"
LEX = ROOT / "content" / "lexicon"

VERDICTS = {"yes", "no", "domain-term"}
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\-]*")

# Repairs applied after the judges, before an id is minted. Word ids are frozen
# forever (CLAUDE.md, constitution rule 6), so the last chance to get one right
# is here. Each of these is a failure of tokenisation rather than of judgment:
# S7 splits on whitespace, so a multiword term arrives as its bare tail.
ID_REPAIRS = {
    # "a priori" / "a posteriori" reached the judges as `priori` / `posteriori`.
    # The headword is the whole Latin phrase; the lexicon already carries
    # multiword ids such as `a-case-in-point`.
    "priori": {"id": "a-priori", "lemma": "a priori"},
    "posteriori": {"id": "a-posteriori", "lemma": "a posteriori"},
    # `histrionics` is the noun of `histrionic`, which is already a tested
    # lexicon word. One inflection family, one id - so this becomes a context
    # occurrence on the existing entry rather than a second file.
    "histrionics": {"id": "histrionic", "lemma": "histrionic"},
}

# Dropped after the judges. Not a reversal of the verdict on merit: `fortis` is
# the tail of "agua fortis", which the sentence itself glosses as "[nitric
# acid]", and `nitric` is already carried as the domain term for that sentence.
# A bare `fortis` entry would teach a fragment of a Latin phrase.
ID_DROPS = {"fortis"}


def slugify(lemma: str) -> str:
    s = unicodedata.normalize("NFKD", lemma).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s


def load_pairs():
    """Return (judged rows joined to their batch row, list of problems)."""
    problems = []
    joined = []
    for bpath in sorted(JUDGE.glob("batch-*.json")):
        n = bpath.stem.split("-")[1]
        rpath = JUDGE / ("result-%s.json" % n)
        if not rpath.exists():
            problems.append("result-%s.json missing" % n)
            continue
        binp = json.loads(bpath.read_text(encoding="utf-8"))
        try:
            res = json.loads(rpath.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            problems.append("result-%s.json is not valid JSON: %s" % (n, e))
            continue
        by_input = {}
        for r in res:
            key = r.get("input")
            if key in by_input:
                problems.append("result-%s: duplicate verdict for %r" % (n, key))
            by_input[key] = r
        for row in binp:
            r = by_input.pop(row["lemma"], None)
            if r is None:
                problems.append("result-%s: no verdict for %r" % (n, row["lemma"]))
                continue
            if r.get("verdict") not in VERDICTS:
                problems.append("result-%s: bad verdict %r for %r"
                                % (n, r.get("verdict"), row["lemma"]))
                continue
            joined.append({"batch": n, "row": row, "verdict": r})
        for extra in by_input:
            problems.append("result-%s: verdict for %r, which is not in the batch" % (n, extra))
    return joined, problems


def build_surface_index():
    """Every lowercase surface in every stem -> the questions it appears in."""
    index = defaultdict(list)
    for f in sorted(EXAMS.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        paper_id = d.get("paperId") or f.stem
        m = re.search(r"-(\d{4})-", paper_id)
        year = int(m.group(1)) if m else 0
        for q in d.get("questions", []):
            stem = q.get("stem") or ""
            if not stem:
                continue
            hit = {"paperId": paper_id, "year": year, "questionNo": q.get("no"), "stem": stem}
            for t in set(WORD_RE.findall(stem)):
                w = t.strip("'-").lower()
                if w:
                    index[w].append(hit)
    return index


def stem_occurrences(index, surfaces):
    seen = set()
    out = []
    for s in surfaces:
        for hit in index.get(s.lower(), []):
            k = (hit["paperId"], hit["questionNo"])
            if k in seen:
                continue
            seen.add(k)
            rec = dict(hit)
            rec["surface"] = s
            out.append(rec)
    out.sort(key=lambda o: (-o["year"], o["paperId"], o["questionNo"] or 0))
    return out


def main() -> int:
    joined, problems = load_pairs()
    if problems:
        print("PROBLEMS:")
        for p in problems[:40]:
            print("  -", p)
        if len(problems) > 40:
            print("  ... and %d more" % (len(problems) - 40))
        print()

    vocab_raw = json.loads((STATE / "stem-vocab.json").read_text(encoding="utf-8"))["words"]
    vocab = {w["lemma"]: w for w in vocab_raw}
    existing_ids = set(p.stem for p in LEX.glob("*.json"))
    index = build_surface_index()

    counts = defaultdict(int)
    accepted = {}
    rejected = []
    dropped = []
    repaired = []

    for item in joined:
        row, v = item["row"], item["verdict"]
        counts[v["verdict"]] += 1
        if v["verdict"] == "no":
            rejected.append({
                "input": row["lemma"],
                "lemma": v.get("lemma") or row["lemma"],
                "importance": v.get("importance"),
                "difficulty": v.get("difficulty"),
                "reason": v.get("reason"),
            })
            continue

        lemma = (v.get("lemma") or row["lemma"]).strip()
        wid = slugify(lemma)
        if wid in ID_DROPS:
            dropped.append({"id": wid, "lemma": lemma, "verdict": v["verdict"],
                            "reason": v.get("reason")})
            continue
        repair = ID_REPAIRS.get(wid)
        if repair:
            repaired.append((wid, repair["id"]))
            wid, lemma = repair["id"], repair["lemma"]
        src = vocab.get(row["lemma"], {})
        surfaces = src.get("surfaces") or row.get("surfaces") or [row["lemma"]]
        imp = int(v.get("importance") or 0)
        dif = int(v.get("difficulty") or 0)

        rec = accepted.get(wid)
        if rec is None:
            field_codes = v.get("fieldCodes")
            if field_codes is None and v["verdict"] == "domain-term":
                field_codes = row.get("fieldCodes")
            rec = accepted[wid] = {
                "id": wid,
                "lemma": lemma,
                "verdict": v["verdict"],
                "importance": imp,
                "difficulty": dif,
                "confidence": v.get("confidence"),
                "gloss": v.get("gloss"),
                "reason": v.get("reason"),
                "sourceLemmas": [],
                "surfaces": [],
                "fieldCodes": field_codes,
                "alreadyInLexicon": wid in existing_ids,
            }
        else:
            # Two S7 buckets corrected to the same dictionary form. Keep the
            # stronger judgment: a word is as important as its best occurrence.
            if imp * dif > rec["importance"] * rec["difficulty"]:
                rec["importance"] = imp
                rec["difficulty"] = dif
                rec["reason"] = v.get("reason")
                rec["confidence"] = v.get("confidence")
                rec["gloss"] = v.get("gloss") or rec["gloss"]
            if rec["verdict"] == "domain-term" and v["verdict"] == "yes":
                rec["verdict"] = "yes"
        rec["sourceLemmas"].append(row["lemma"])
        for s in surfaces:
            if s not in rec["surfaces"]:
                rec["surfaces"].append(s)

    for rec in accepted.values():
        occ = stem_occurrences(index, rec["surfaces"])
        rec["occurrences"] = occ
        rec["timesAsContext"] = len(occ)
        rec["distinctYears"] = len(set(o["year"] for o in occ))
        rec["distinctPapers"] = len(set(o["paperId"] for o in occ))
        rec["score"] = rec["importance"] * rec["difficulty"]

    ranked = sorted(accepted.values(),
                    key=lambda r: (-r["score"], -r["timesAsContext"], -r["distinctYears"], r["id"]))
    for i, r in enumerate(ranked, 1):
        r["rank"] = i
        r["tier"] = 1 if r["score"] >= 20 else 2 if r["score"] >= 15 else 3

    merges = [r for r in ranked if r["alreadyInLexicon"]]
    relemmatised = [r for r in ranked if any(s != r["lemma"] for s in r["sourceLemmas"])]

    out = {
        "generatedFrom": "extraction/state/judge/result-*.json",
        "criterion": "importance x difficulty (ADR-0011)",
        "judgedBy": "claude-opus-5",
        "counts": {
            "judged": len(joined),
            "yes": counts["yes"],
            "domainTerm": counts["domain-term"],
            "no": counts["no"],
            "acceptedAfterLemmaMerge": len(ranked),
            "tier1": sum(1 for r in ranked if r["tier"] == 1),
            "tier2": sum(1 for r in ranked if r["tier"] == 2),
            "tier3": sum(1 for r in ranked if r["tier"] == 3),
            "mergeIntoExistingLexiconWord": len(merges),
            "lemmaCorrected": len(relemmatised),
            "idRepaired": len(repaired),
            "droppedAsFragment": len(dropped),
        },
        "idRepairs": [{"from": a, "to": b} for a, b in repaired],
        "droppedAsFragment": dropped,
        "words": ranked,
        "rejected": sorted(rejected, key=lambda r: r["input"]),
    }
    (STATE / "stem-vocab-selection.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    lines = [
        "# Context vocabulary - the selection",
        "",
        "%d `yes` + %d `domain-term` out of %d judged, %d distinct words after "
        "lemma correction." % (counts["yes"], counts["domain-term"], len(joined), len(ranked)),
        "Ranked by importance x difficulty (ADR-0011). Generated by "
        "`extraction/scripts/s8_finalize.py` - do not edit by hand.",
        "",
        "| # | word | tier | imp | dif | occ | yrs | verdict | gloss |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in ranked:
        flag = " (merge)" if r["alreadyInLexicon"] else ""
        lines.append("| %d | `%s`%s | %d | %d | %d | %d | %d | %s | %s |" % (
            r["rank"], r["id"], flag, r["tier"], r["importance"], r["difficulty"],
            r["timesAsContext"], r["distinctYears"], r["verdict"],
            (r["gloss"] or "").replace("|", "/")))
    (STATE / "stem-vocab-selection.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("judged            %d" % len(joined))
    print("  yes             %d" % counts["yes"])
    print("  domain-term     %d" % counts["domain-term"])
    print("  no              %d" % counts["no"])
    print("accepted (merged) %d   tier1 %d  tier2 %d  tier3 %d" % (
        len(ranked), out["counts"]["tier1"], out["counts"]["tier2"], out["counts"]["tier3"]))
    print("lemma corrected   %d" % len(relemmatised))
    print("id repaired       %d   %s" % (len(repaired), ", ".join("%s->%s" % r for r in repaired)))
    print("dropped fragment  %d   %s" % (len(dropped), ", ".join(d["id"] for d in dropped)))
    print("already a lexicon word (merge, no new file): %d" % len(merges))
    if merges:
        print("   " + ", ".join(r["id"] for r in merges[:30]))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())

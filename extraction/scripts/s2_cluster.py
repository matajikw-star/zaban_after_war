"""S2 - Cluster. Collapses booklets that carry the same English paper.

The big cost lever. A given year's English test is reused across many field
codes: in 1403, codes 1101/1102/1301 share one paper and 1103/1501 share
another. Extracting per booklet would pay ~120x per year for the same questions.

Fingerprints are order-free bags of distinctive words taken from the cached S1
OCR, because OCR scrambles reading order across columns but keeps the words.
Two booklets from the same year whose fingerprints overlap above THRESHOLD are
the same paper. Matching is deliberately conservative: a false split just costs
one extra extraction, while a false merge would silently lose a real paper.

Output: state/papers.jsonl - one row per distinct English paper, naming the
representative booklet whose pages get rendered and read by the model.

A paperId, once given out, belongs to that cluster forever - see assign_ids and
ADR-0009. Clustering is re-run every time a new year is routed, so an id that
moved would silently re-label work already extracted.

    python extraction/scripts/s2_cluster.py --years 1401-1405
"""
from __future__ import annotations
import argparse
import re
from collections import Counter, defaultdict

from common import (CONTENT, OCR_CACHE, STATE, fingerprint_tokens, general_pages,
                    jaccard, load_json, read_jsonl, write_jsonl)

THRESHOLD = 0.55   # same-paper similarity floor; scans of one paper land ~0.8+
MIN_TOKENS = 25    # below this a fingerprint is too thin to trust


def fold_ocr_confusions(token: str) -> str:
    """Collapse the letter pair the OCR confuses, so one word reads as one token.

    Tesseract reads `e` as `c` on some print runs and not on others (`becausc`,
    `applianccs`, `ccntral`). A fingerprint is a set of exact tokens, so every
    word with an `e` in it became a different token, and two scans of one paper
    fell to Jaccard 0.33-0.5 - under THRESHOLD. That split 1399 into 11 clusters
    for 7 papers and 1400 into 13 for 6 (ticket dev-content/03, ADR-0021).
    Folded, S2 recovers exactly one cluster per paper in every year 1398-1405,
    and two different papers still score at most 0.16."""
    return token.replace("e", "c")


def booklet_fingerprint(route: dict) -> set[str]:
    """Bag of distinctive words from the booklet's general-English pages."""
    toks: set[str] = set()
    for pno in general_pages(route):
        cf = OCR_CACHE / route["bookletId"] / f"p{pno:03d}.txt"
        if cf.exists():
            toks |= {fold_ocr_confusions(t)
                     for t in fingerprint_tokens(cf.read_text(encoding="utf-8"))}
    return toks


def cluster_year(routes: list[dict], fps: dict[str, set[str]]) -> list[dict]:
    """Greedy agglomeration, scoring against every member rather than a
    centroid: a centroid drifts as it absorbs members, and a year holds only
    ~120 booklets, so the extra comparisons cost nothing."""
    clusters: list[dict] = []
    for r in sorted(routes, key=lambda x: x["code"]):
        fp = fps[r["bookletId"]]
        if len(fp) < MIN_TOKENS:
            clusters.append({"members": [r], "thin": True})
            continue
        best, best_score = None, 0.0
        for c in clusters:
            if c.get("thin"):
                continue
            s = max(jaccard(fp, fps[m["bookletId"]]) for m in c["members"])
            if s > best_score:
                best, best_score = c, s
        if best is not None and best_score >= THRESHOLD:
            best["members"].append(r)
        else:
            clusters.append({"members": [r], "thin": False})
    return clusters


def pick_representative(members: list[dict]) -> dict:
    """Prefer the booklet with the most general-English pages, then the lowest
    code - the fullest scan of the part we actually render, chosen
    deterministically.

    Deliberately general_pages and not englishPages: since S1 gained the section
    scan, englishPages length varies with how long a field's reading passage is,
    which has nothing to do with which scan of the shared paper is best."""
    return sorted(members, key=lambda r: (-len(general_pages(r)), r["code"]))[0]


def exam_anchors(year: int) -> dict[str, str]:
    """paperId -> the bookletId its transcript was actually read from.

    The hard constraint on id assignment. content/exams/<id>.json records the
    source file the extractor saw, and that booklet is by definition a member of
    the cluster the id names. Anything that would move the id to a cluster not
    containing that booklet is a bug, not a re-cluster.

    A paper retired with `duplicateOf` (ADR-0021) anchors nothing: its booklet
    sits in the kept paper's cluster, which the kept paper claims."""
    out: dict[str, str] = {}
    for f in sorted((CONTENT / "exams").glob(f"arshad-{year}-p*.json")):
        exam = load_json(f) or {}
        if exam.get("duplicateOf"):
            continue
        src = (exam.get("source") or {}).get("file")
        if src:
            out[f.stem] = re.sub(r"\.pdf$", "", src, flags=re.I)
    return out


def transcribed_duplicates(year: int) -> set[str]:
    """Paper ids retired with `duplicateOf` (ADR-0021): expected to own no cluster."""
    return {f.stem for f in (CONTENT / "exams").glob(f"arshad-{year}-p*.json")
            if (load_json(f) or {}).get("duplicateOf")}


def assign_ids(year: int, clusters: list[dict], prev: dict[str, dict]) -> list[str]:
    """One paperId per cluster, in cluster order, stable across re-clusters.

    Ids used to be the cluster's rank by size: `arshad-1405-p02` meant "the
    second-biggest cluster of 1405". Two 1405 clusters sit 27 members to 26, so
    routing a later year was enough to swap them, and with them the identity of
    two already-extracted papers. Rank is not identity.

    Three passes, most binding first: an extracted paper follows the booklet its
    transcript came from; a pending paper follows the members it had; only a
    cluster that matches nothing at all gets a new id, and a retired id is never
    handed to a different paper."""
    anchors = exam_anchors(year)
    where: dict[str, int] = {}
    for i, c in enumerate(clusters):
        for m in c["members"]:
            where[m["bookletId"]] = i

    out: dict[int, str] = {}
    taken: set[str] = set()

    for pid, booklet in sorted(anchors.items()):
        ci = where.get(booklet)
        if ci is None:
            print(f"  !! {pid}: its source booklet {booklet} is in no cluster "
                  f"(unrouted, or route status not ok) - id left to the fallback")
            continue
        if ci in out:
            print(f"  !! {pid} and {out[ci]} both anchor to the same cluster - "
                  f"one of them was extracted from the wrong booklet")
            continue
        out[ci], _ = pid, taken.add(pid)

    pairs = []
    for pid, row in prev.items():
        if pid in taken:
            continue
        had = set(row.get("members") or [])
        for ci, c in enumerate(clusters):
            if ci in out:
                continue
            overlap = len(had & {m["bookletId"] for m in c["members"]})
            if overlap:
                pairs.append((-overlap, pid, ci))
    for _, pid, ci in sorted(pairs):
        if pid in taken or ci in out:
            continue
        out[ci], _ = pid, taken.add(pid)

    def index_of(pid: str) -> int:
        m = re.search(r"-p(\d+)$", pid)
        return int(m.group(1)) if m else 0

    # Every id with a transcript is burned too: a retired paper (ADR-0021) has no
    # row in papers.jsonl once its cluster has merged, and its id must still
    # never be handed to a different paper.
    transcribed = {f.stem for f in (CONTENT / "exams").glob(f"arshad-{year}-p*.json")}
    burned = {index_of(pid) for pid in set(prev) | taken | transcribed}
    nxt = 1
    for ci in range(len(clusters)):
        if ci in out:
            continue
        while nxt in burned:
            nxt += 1
        out[ci] = f"arshad-{year}-p{nxt:02d}"
        burned.add(nxt)

    lost = sorted(set(prev) - set(out.values()) - transcribed_duplicates(year))
    if lost:
        print(f"  !! {year}: no cluster claims {lost} - these papers vanished from "
              f"the routing; their ids are retired, never reused")
    return [out[i] for i in range(len(clusters))]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", help="e.g. 1401-1405; default = every routed year")
    a = ap.parse_args()

    routes = [r for r in read_jsonl(STATE / "routes.jsonl") if r["status"] == "ok"]
    if not routes:
        print("No usable rows in state/routes.jsonl - run s1_route.py first.")
        return 1

    if a.years:
        want: set[int] = set()
        for part in a.years.split(","):
            if "-" in part:
                lo, hi = part.split("-")
                want |= set(range(int(lo), int(hi) + 1))
            else:
                want.add(int(part))
        routes = [r for r in routes if r["year"] in want]

    by_year: dict[int, list[dict]] = defaultdict(list)
    for r in routes:
        by_year[r["year"]].append(r)

    existing = {p["paperId"]: p for p in read_jsonl(STATE / "papers.jsonl")}
    fps = {r["bookletId"]: booklet_fingerprint(r) for r in routes}

    papers: list[dict] = []
    for year in sorted(by_year, reverse=True):
        clusters = cluster_year(by_year[year], fps)
        clusters.sort(key=lambda c: -len(c["members"]))
        prev_year = {pid: row for pid, row in existing.items() if row["year"] == year}
        anchors = exam_anchors(year)
        for paper_id, c in zip(assign_ids(year, clusters, prev_year), clusters):
            # An extracted paper's representative is the booklet it was read from,
            # so S5 corroborates the transcript against the pages the model saw
            # (ADR-0009) even after a merge brings in a "better" booklet.
            read_from = [m for m in c["members"] if m["bookletId"] == anchors.get(paper_id)]
            rep = read_from[0] if read_from else pick_representative(c["members"])
            prev = existing.get(paper_id, {})
            papers.append({
                "paperId": paper_id,
                "degree": "arshad",
                "year": year,
                "representative": {
                    "bookletId": rep["bookletId"], "file": rep["file"],
                    "englishPages": rep["englishPages"],
                    "partA": rep["partA"], "partB": rep["partB"],
                    "partC": rep.get("partC", []),
                },
                "groupCodes": sorted({m["code"] for m in c["members"]}),
                "bookletCount": len(c["members"]),
                "members": sorted(m["bookletId"] for m in c["members"]),
                "thinFingerprint": bool(c.get("thin")),
                # Extraction status is owned by S4 and preserved across re-clusters.
                "extraction": prev.get("extraction", "pending"),
            })
            # So is the note that says why a review flag was cleared (status.py --note).
            if "reviewNote" in prev:
                papers[-1]["reviewNote"] = prev["reviewNote"]
        print(f"{year}: {len(by_year[year]):>4} booklets -> {len(clusters):>2} distinct papers"
              f"   sizes={sorted((len(c['members']) for c in clusters), reverse=True)}")

    # A --years run must not delete the years it was not asked about.
    papers += [row for row in existing.values() if row["year"] not in by_year]
    papers.sort(key=lambda p: (-p["year"], p["paperId"]))
    write_jsonl(STATE / "papers.jsonl", papers)
    total_b = sum(p["bookletCount"] for p in papers)
    print(f"\nTOTAL {total_b} booklets -> {len(papers)} papers "
          f"({total_b / max(len(papers), 1):.0f}x dedup)")
    print("extraction:", dict(Counter(p["extraction"] for p in papers)))
    thin = [p["paperId"] for p in papers if p["thinFingerprint"]]
    if thin:
        print(f"thin fingerprints (review these): {thin[:10]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

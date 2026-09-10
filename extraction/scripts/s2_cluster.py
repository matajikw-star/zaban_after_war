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

    python extraction/scripts/s2_cluster.py --years 1401-1405
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict

from common import OCR_CACHE, STATE, fingerprint_tokens, jaccard, read_jsonl, write_jsonl

THRESHOLD = 0.55   # same-paper similarity floor; scans of one paper land ~0.8+
MIN_TOKENS = 25    # below this a fingerprint is too thin to trust


def booklet_fingerprint(route: dict) -> set[str]:
    """Bag of distinctive words across the booklet's English pages."""
    toks: set[str] = set()
    for pno in route["englishPages"]:
        cf = OCR_CACHE / route["bookletId"] / f"p{pno:03d}.txt"
        if cf.exists():
            toks |= fingerprint_tokens(cf.read_text(encoding="utf-8"))
    return toks


def cluster_year(routes: list[dict], fps: dict[str, set[str]]) -> list[list[dict]]:
    """Greedy agglomeration against cluster centroids. O(n * clusters), and a
    year holds ~120 booklets over a handful of papers, so this stays trivial."""
    clusters: list[dict] = []
    for r in sorted(routes, key=lambda x: x["code"]):
        fp = fps[r["bookletId"]]
        if len(fp) < MIN_TOKENS:
            clusters.append({"members": [r], "core": fp, "thin": True})
            continue
        best, best_score = None, 0.0
        for c in clusters:
            if c.get("thin"):
                continue
            s = jaccard(fp, c["core"])
            if s > best_score:
                best, best_score = c, s
        if best is not None and best_score >= THRESHOLD:
            best["members"].append(r)
            best["core"] &= fp          # intersection: the paper's stable core
        else:
            clusters.append({"members": [r], "core": set(fp), "thin": False})
    return clusters


def pick_representative(members: list[dict]) -> dict:
    """Prefer the booklet with the most English pages, then the lowest code -
    the fullest scan of the paper, chosen deterministically."""
    return sorted(members, key=lambda r: (-len(r["englishPages"]), r["code"]))[0]


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
        for i, c in enumerate(clusters, start=1):
            rep = pick_representative(c["members"])
            paper_id = f"arshad-{year}-p{i:02d}"
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
        print(f"{year}: {len(by_year[year]):>4} booklets -> {len(clusters):>2} distinct papers"
              f"   sizes={sorted((len(c['members']) for c in clusters), reverse=True)}")

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

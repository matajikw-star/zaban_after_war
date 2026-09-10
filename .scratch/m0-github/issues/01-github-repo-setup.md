# 01 — Finish M0: GitHub repo, protection, CI

Status: ready-for-agent
Type: task
Milestone: M0

## Goal

Take the local repo to a protected GitHub repo with green CI, so constitutional rule 1 in
`CLAUDE.md` is enforced by the platform rather than by good intentions.

Full procedure with exact commands: `docs/plan/repo-setup.md`. This ticket records only what is
already done, what is left, and what is specific to this machine.

## Already done (commits `9eca606`..`486d0ac`)

- `git init` on `main`; four commits; nothing uncommitted except the parallel session's work.
- Workspace scaffold, TypeScript strict, Biome, Vitest, `.github/workflows/ci.yml` (job named
  `ci`, which is the context branch protection must require).
- All five CI steps verified locally: `lint`, `typecheck`, `test`, `build`, `content:lint`.
- `gh` 2.100.0 installed via winget. **Not yet authenticated.**
- Git LFS installed; `.gitattributes` tracks `sources/raw/*.{pdf,jpg,jpeg,png,docx,zip}`.
- `raw_konkour_files/` (~7.9 GB) gitignored.

## Left to do

1. `gh auth login` — interactive, so a human runs it. GitHub.com → HTTPS → yes to git
   credentials → browser.
2. `git config user.name "<github username>"` — currently unset, so the four existing commits
   are authored by `unknown <mahshidhamrahyar@gmail.com>`. The owner asked for the GitHub
   username. Rewriting the four commits to fix authorship is fine **only while nothing is
   pushed**; once `origin` exists, leave history alone.
3. `gh repo create konkour-leitner --private --source=. --remote=origin --push`. Private —
   the lexicon is the business asset.
4. Branch protection (command in `docs/plan/repo-setup.md` §4). `enforce_admins=true` is the
   part that matters; zero required approvals since the owner is solo.
5. Tracking rule for the parallel session's output, per their ADR-0006/0007:
   they gitignore `extraction/cache/` as regenerable and commit `extraction/state/`. Commit
   `.claude/`. Coordinate before touching files another session is actively writing.
6. Test SSH from a GitHub Actions runner to an Iranian VPS — the M0 risk row in
   `docs/plan/roadmap.md`. If it fails, the pull-based deploy in `docs/plan/infrastructure.md`
   becomes the plan. Blocked until a VPS exists, so this may move to M3.
7. Verify: open a trivial PR, watch CI go green, merge it, then confirm a direct
   `git push origin main` is refused. That refusal is the deliverable.

## Watch out

- **Another Claude session is working in this same directory** on OCR extraction, writing to
  `extraction/` and `raw_konkour_files/`. Never run `git add -A` without reading
  `git status` first — it will sweep up their half-finished work. Prefer explicit paths.
- Do not commit `raw_konkour_files/`. It is gitignored; keep it that way.

## Suggested skills

- `mattpocock-skills:writing-for-agents` — before editing `CLAUDE.md` or any `docs/agents/*`.

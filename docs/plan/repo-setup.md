# Repo setup (M0)

Concrete steps to get from this local folder to a protected GitHub repo with CI. Run in order.
Everything here is one-time; record anything that differed in `wiki/log.md`.

## 0. Prerequisites

`node` (v24) and `git` are installed. Missing locally:

```bash
corepack enable && corepack prepare pnpm@latest --activate   # pnpm
winget install --id GitHub.cli                               # gh
git lfs install                                              # Git LFS, for sources/raw/
```

## 1. Identity

```bash
git config user.name  "<your name>"
git config user.email "<your github email>"
```

Use the email GitHub knows, or commits will not attribute to the account.

## 2. First commit

Already initialised on `main`. From the repo root:

```bash
git add -A
git commit -m "docs: project schema, decisions, and plan"
```

## 3. Create the GitHub repo

```bash
gh auth login                       # HTTPS, authenticate in browser
gh repo create konkour-leitner --private --source=. --remote=origin --push
```

**Private, not public.** The lexicon is the business asset. Revisit only if some part is ever
deliberately open-sourced.

Naming: `konkour-leitner` matches the domain. The local folder is still `zaban_second` — harmless,
but renaming it to match costs nothing and removes a papercut.

## 4. Protect `main`

Constitutional rule 1 depends on this actually being enforced, not merely intended:

```bash
gh api -X PUT repos/:owner/konkour-leitner/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f "required_pull_request_reviews[required_approving_review_count]=0" \
  -F "enforce_admins=true" \
  -F "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=ci" \
  -F "restrictions=null" \
  -F "allow_force_pushes=false" \
  -F "allow_deletions=false"
```

Zero required approvals, because solo — the point is that every change goes through a PR whose
diff gets read, and that CI must be green. `enforce_admins` matters most: it stops the owner from
bypassing the rule at 2am.

## 5. Git LFS for sources

```bash
git lfs track "sources/raw/**"
git add .gitattributes && git commit -m "chore: track raw sources with LFS"
```

GitHub's free LFS allowance is 1 GB of storage and 1 GB/month of bandwidth. Twenty exam PDFs fit
comfortably. If a source is larger, mark it `EXTERNAL` in `sources/manifest.md` and keep it out
of the repo.

## 6. Workspace scaffold

```
apps/web          the PWA
packages/core     the SRS engine — pure, no deps, exhaustively tested
packages/content  schemas, validator, chunk builder
server/           PocketBase: pb_hooks/, pb_migrations/, Caddyfile, systemd unit
tools/            extraction helpers, the schedule simulator
```

`pnpm-workspace.yaml` lists `apps/*`, `packages/*`, `tools`. Root `package.json` holds the shared
scripts (`test`, `lint`, `typecheck`, `build`, `content:lint`) so CI has one entry point per job.

## 7. CI

`.github/workflows/ci.yml`, named `ci` so the branch protection above matches it. On every PR and
every push to `main`: install with a frozen lockfile, then lint, typecheck, test, build, and check
the bundle budget from ADR-0005.

Deployment is a separate workflow, added in M3 when there is something to deploy — see
`docs/plan/infrastructure.md`.

## 8. Secrets

Create the GitHub secrets before the deploy workflow needs them: `DEPLOY_SSH_KEY`,
`DEPLOY_HOST`, `DEPLOY_USER`. Server-side secrets (SMS key, Zarinpal merchant id, S3 credentials)
never enter GitHub — they live in the systemd unit's environment on the VPS. `.env.example`
documents every name in both places.

## 9. Verify the constitution holds

The setup is done when this sequence works:

```bash
git switch -c chore/verify-ci
# make a trivial change
git commit -am "chore: verify CI" && git push -u origin chore/verify-ci
gh pr create --fill && gh pr checks --watch
```

CI green, merge through the PR, and a direct `git push origin main` is refused. That refusal is
the deliverable.

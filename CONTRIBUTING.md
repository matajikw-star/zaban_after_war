# Contributing

One owner and Claude Code. The process exists so an agent writing most of the code stays
reviewable — see `CLAUDE.md` for the constitution these rules serve.

## The loop

1. Ticket first, under `.scratch/<feature>/issues/NN-<slug>.md`.
2. Branch: `feat/`, `fix/`, `content/`, `chore/` + slug.
3. Commit in [Conventional Commits](https://www.conventionalcommits.org) form. The body says
   *why*; the diff already says what.
4. Pull request, even solo. The PR is where the diff gets read.
5. CI green, then merge. `main` stays deployable and is never force-pushed.

## Commands

```bash
pnpm install
pnpm test          # vitest
pnpm lint          # biome
pnpm typecheck     # tsc project references
pnpm build
pnpm content:lint  # the lint operation over content/
```

## Where a change goes

| Changing | Also update |
|---|---|
| A rule about how work is done | `CLAUDE.md`, in the same commit |
| A decision and its reasoning | a new `docs/adr/NNNN-*.md` |
| Domain vocabulary | `CONTEXT.md` |
| Anything worth remembering later | one line in `wiki/log.md` |

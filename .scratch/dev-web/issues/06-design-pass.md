# 06 — Design pass

Status: ready-for-agent
Type: task
Phase: 3
Blocked by: 02, 03, 04, 05

## Goal

Apply ADR-0020 consistently to every screen: glass cards, 24 px radius, hairline borders,
Sonnat type scale, monochrome, light and dark themes, 44 px targets, one primary action per
screen, motion 150–250 ms with reduced-motion respected. Fix every place where a Persian
string sits outside `strings.ts`. Review each screen at 360 px and 430 px widths in both themes
(Playwright screenshots committed under `apps/web/e2e/__screenshots__/` are acceptable as the
record). The review card gets the most attention: it is the product.

## Done when

Screenshots of every screen in both themes exist; no colour outside the neutral scale except
the two grading buttons and destructive confirmations; `what.md` §7.9 says `live`.

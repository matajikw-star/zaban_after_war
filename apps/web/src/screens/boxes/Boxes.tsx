/**
 * `/boxes` (`what.md` §7.8): five columns, tap one to see the words waiting in it.
 *
 * The list is inline rather than a second route — `boxItems` is cheap and the back gesture a
 * second route would need is exactly what tapping the same box again already does.
 */

import type { Box } from '@kl/core';
import { BOXES } from '@kl/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { currentBoxItems } from '../../engine/box-items.ts';
import { now } from '../../engine/clock.ts';
import { boxCounts } from '../../engine/index.ts';
import { useFold } from '../../engine/use-fold.ts';
import { useContentStore } from '../../stores/content.ts';
import { strings } from '../../strings.ts';
import { Card } from '../../ui/Card.tsx';
import { cn } from '../../ui/cn.ts';
import { faNumber } from '../../ui/format.ts';
import { relativeTime } from '../../ui/relative-time.ts';
import { BOTTOM_NAV_SPACER_CLASS, BottomNav } from '../layout/BottomNav.tsx';

function BoxColumn({
  box,
  count,
  selected,
  onSelect,
}: {
  readonly box: Box;
  readonly count: number;
  readonly selected: boolean;
  readonly onSelect: (box: Box) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(box)}
      aria-pressed={selected}
      className={cn(
        'flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1 rounded-[var(--radius-control)] border px-1 py-3',
        'transition-colors duration-[var(--motion-fast)] outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        selected ? 'border-transparent bg-[var(--fg)] text-[var(--bg)]' : 'glass text-[var(--fg)]',
      )}
    >
      <span className="text-h5 font-medium" data-testid={`box-count-${box}`}>
        {faNumber(count)}
      </span>
      <span className="text-caption whitespace-nowrap">
        {strings.boxes.boxPrefix(faNumber(box))}
      </span>
    </button>
  );
}

export function Boxes() {
  const navigate = useNavigate();
  const byId = useContentStore((state) => state.byId);
  const [selected, setSelected] = useState<Box | null>(null);
  // Re-renders this screen whenever the content package (re)loads or a review is recorded
  // elsewhere (e.g. «این را بلدم» on `/word/:id`); `boxCounts`/`currentBoxItems` below then read
  // the fresh fold and content directly.
  useContentStore((state) => state.items);
  useFold();

  const counts = boxCounts();
  const rows = selected === null ? [] : currentBoxItems(selected);
  const at = now();

  return (
    <main className={`flex flex-1 flex-col gap-4 pt-2 ${BOTTOM_NAV_SPACER_CLASS}`}>
      <h1 className="flex min-h-11 items-center text-h5 font-medium">{strings.screens.boxes}</h1>

      <div className="flex gap-2">
        {BOXES.map((box) => (
          <BoxColumn
            key={box}
            box={box}
            count={counts.byBox[box]}
            selected={selected === box}
            onSelect={(next) => setSelected((current) => (current === next ? null : next))}
          />
        ))}
      </div>

      <p className="text-body-sm text-[var(--fg-muted)]">
        {strings.boxes.unseenCount(faNumber(counts.unseen))}
      </p>

      {selected === null ? null : (
        <Card className="flex flex-col px-4 py-2">
          {rows.length === 0 ? (
            <p className="text-body-sm text-[var(--fg-muted)]">{strings.boxes.empty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {rows.map((row) => {
                const card = byId.get(row.itemId);
                const dueLabel =
                  row.dueAt <= at ? strings.boxes.dueNow : relativeTime(row.dueAt, at);
                return (
                  <li key={row.itemId}>
                    <button
                      type="button"
                      onClick={() => void navigate(`/word/${row.itemId}`)}
                      className="flex min-h-12 w-full items-center justify-between gap-2 py-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-[var(--fg)]"
                    >
                      <span className="text-body font-medium" dir="ltr" lang="en">
                        {card?.lemma ?? row.itemId}
                      </span>
                      <span className="text-caption text-[var(--fg-muted)]">{dueLabel}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <BottomNav />
    </main>
  );
}

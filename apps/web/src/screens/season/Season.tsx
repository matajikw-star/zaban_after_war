/** `/season` (`what.md` §7.8): shown once when the exam date passes. */

import { useNavigate } from 'react-router';
import { currentFold } from '../../engine/fold-cache.ts';
import { seasonStats } from '../../engine/season.ts';
import { useFold } from '../../engine/use-fold.ts';
import { useContentStore } from '../../stores/content.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { Card } from '../../ui/Card.tsx';
import { faNumber } from '../../ui/format.ts';

export function Season() {
  const navigate = useNavigate();
  const items = useContentStore((state) => state.items);
  useFold();
  const stats = seasonStats(currentFold(), items);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-h4 font-medium">{strings.season.title}</h1>
      <p className="text-body-sm text-[var(--fg-muted)]">{strings.season.intro}</p>

      <Card className="grid w-full grid-cols-3 gap-4">
        <div className="flex flex-col items-center gap-1">
          <span className="text-h4 font-medium">{faNumber(stats.conquered)}</span>
          <span className="text-caption text-[var(--fg-muted)]">{strings.season.conquered}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-h4 font-medium">{faNumber(stats.daysStudied)}</span>
          <span className="text-caption text-[var(--fg-muted)]">{strings.season.daysStudied}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-h4 font-medium">{faNumber(stats.presentations)}</span>
          <span className="text-caption text-[var(--fg-muted)]">
            {strings.season.presentations}
          </span>
        </div>
      </Card>

      <Button variant="primary" onClick={() => void navigate('/settings')}>
        {strings.season.newDate}
      </Button>
    </main>
  );
}

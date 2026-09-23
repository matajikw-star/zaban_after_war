/** `/session/summary` (`what.md` §7.8): the counters from `stores/session`, plus the streak. */

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { streak } from '../../engine/index.ts';
import { useSessionStore } from '../../stores/session.ts';
import { strings } from '../../strings.ts';
import { requestBackup } from '../../sync/backup-live.ts';
import { Button } from '../../ui/Button.tsx';
import { Card } from '../../ui/Card.tsx';
import { faNumber, faPercent } from '../../ui/format.ts';

export function SessionSummary() {
  const navigate = useNavigate();
  const presentations = useSessionStore((state) => state.presentations);
  const correct = useSessionStore((state) => state.correct);
  const conquered = useSessionStore((state) => state.conquered);
  const streakInfo = streak();

  // The end of a study session is a backup trigger (§7.4). Fire and forget: never blocks.
  useEffect(() => {
    void requestBackup('session-end');
  }, []);

  const accuracy = presentations > 0 ? (correct / presentations) * 100 : 0;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-h4 font-medium">{strings.screens.sessionSummary}</h1>

      <Card className="grid w-full grid-cols-2 gap-4">
        <div className="flex flex-col items-center gap-1">
          <span className="text-h4 font-medium">{faNumber(presentations)}</span>
          <span className="text-caption text-[var(--fg-muted)]">
            {strings.summary.presentations}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-h4 font-medium">{faPercent(accuracy)}</span>
          <span className="text-caption text-[var(--fg-muted)]">{strings.summary.accuracy}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-h4 font-medium">{faNumber(conquered)}</span>
          <span className="text-caption text-[var(--fg-muted)]">
            {strings.summary.conqueredToday}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-h4 font-medium">{faNumber(streakInfo.days)}</span>
          <span className="text-caption text-[var(--fg-muted)]">{strings.summary.streak}</span>
        </div>
      </Card>

      <div className="flex w-full gap-2">
        <Button variant="primary" block onClick={() => void navigate('/review')}>
          {strings.summary.continue}
        </Button>
        <Button variant="secondary" block onClick={() => void navigate('/')}>
          {strings.summary.home}
        </Button>
      </div>
    </main>
  );
}

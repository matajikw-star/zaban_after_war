/**
 * `/paywall` — **placeholder until Phase 5** (`what.md` §7.8).
 *
 * The review loop needs somewhere to send a free user who has spent their hundred presentations,
 * and it needs that somewhere to let them straight back to studying: §7.8 is explicit that
 * «بعداً» returns to the queue, because the early pool keeps the app usable forever. So the
 * argument and the way out are real from this ticket; the price, the strike-through and the
 * «خرید» path arrive with payment in Phase 5.
 */

import { useNavigate } from 'react-router';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { Card, CardBody, CardTitle } from '../../ui/Card.tsx';

export function Paywall() {
  const navigate = useNavigate();

  return (
    <main className="flex flex-1 flex-col justify-center gap-4">
      <Card className="flex flex-col gap-3">
        <CardTitle>{strings.screens.paywall}</CardTitle>
        <CardBody>{strings.paywall.pace}</CardBody>
        <CardBody>{strings.paywall.soon}</CardBody>
      </Card>
      <Button
        variant="primary"
        size="lg"
        block
        onClick={() => void navigate('/review')}
        data-testid="paywall-later"
      >
        {strings.paywall.later}
      </Button>
    </main>
  );
}

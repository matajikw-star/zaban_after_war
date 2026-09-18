/** `/word/:id` (`what.md` §7.8): looks the card up and hands off to `WordDetail`. */

import { useParams } from 'react-router';
import { useContentStore } from '../../stores/content.ts';
import { strings } from '../../strings.ts';
import { WordDetail } from './WordDetail.tsx';

export function Word() {
  const { id } = useParams<{ id: string }>();
  const card = useContentStore((state) => (id === undefined ? null : state.card(id)));

  if (card === null || card === undefined) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-body-sm text-[var(--fg-muted)]">{strings.word.notFound}</p>
      </main>
    );
  }

  return <WordDetail card={card} />;
}

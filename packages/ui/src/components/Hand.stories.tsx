import type { Story } from '@ladle/react';
import { useState } from 'react';
import { SAMPLE_HAND } from '../stories-helpers.js';
import type { CardData } from '../types.js';
import { Hand } from './Hand.tsx';

export const YourTurn: Story = () => {
  const [played, setPlayed] = useState<string[]>([]);
  return (
    <div className="flex flex-col items-center gap-4">
      <Hand
        cards={SAMPLE_HAND.filter((c) => !played.includes(`${c.suit}-${c.value}`)).map((card) => ({
          card,
        }))}
        onPlay={(card: CardData) => setPlayed((p) => [...p, `${card.suit}-${card.value}`])}
      />
      <p className="text-sm opacity-60">Arrow keys + Enter, or click, to play a card.</p>
    </div>
  );
};

export const MustFollowGreen: Story = () => (
  <Hand
    cards={SAMPLE_HAND.map((card) => ({
      card,
      disabled: card.suit !== 'green',
      disabledReason: 'You must follow green',
    }))}
  />
);

export const NotYourTurn: Story = () => (
  <Hand cards={SAMPLE_HAND.map((card) => ({ card }))} active={false} />
);

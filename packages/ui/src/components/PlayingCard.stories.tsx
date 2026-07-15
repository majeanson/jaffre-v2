import type { Story } from '@ladle/react';
import { SUITS_FOR_STORIES } from '../stories-helpers.js';
import { PlayingCard } from './PlayingCard.tsx';

export const AllSuits: Story = () => (
  <div className="flex flex-col gap-6">
    {SUITS_FOR_STORIES.map((suit) => (
      <div key={suit} className="flex gap-2">
        {([0, 1, 2, 3, 4, 5, 6, 7] as const).map((value) => (
          <PlayingCard key={value} card={{ suit, value }} size="md" />
        ))}
      </div>
    ))}
  </div>
);

export const SpecialCards: Story = () => (
  <div className="flex gap-4 items-end">
    <PlayingCard card={{ suit: 'red', value: 0 }} size="lg" />
    <PlayingCard card={{ suit: 'brown', value: 0 }} size="lg" />
    <PlayingCard card={{ suit: 'green', value: 7 }} size="lg" raised />
    <PlayingCard card={{ suit: 'blue', value: 3 }} size="lg" dimmed />
    <PlayingCard card={{ suit: 'red', value: 5 }} size="lg" faceDown />
  </div>
);

export const Sizes: Story = () => (
  <div className="flex gap-4 items-end">
    <PlayingCard card={{ suit: 'green', value: 4 }} size="sm" />
    <PlayingCard card={{ suit: 'green', value: 4 }} size="md" />
    <PlayingCard card={{ suit: 'green', value: 4 }} size="lg" />
  </div>
);

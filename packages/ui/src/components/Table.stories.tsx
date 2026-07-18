import type { Story } from '@ladle/react';
import { useEffect, useState } from 'react';
import { SAMPLE_HAND } from '../stories-helpers.js';
import { BidPanel } from './BidPanel';
import { Hand } from './Hand';
import { ScoreStrip } from './ScoreStrip';
import { Seat } from './Seat';
import type { TrickPlayView } from './TrickArea';
import { TrickArea } from './TrickArea';

const DEMO_TRICK: readonly TrickPlayView[] = [
  { position: 0, card: { suit: 'green', value: 5 } },
  { position: 1, card: { suit: 'green', value: 2 } },
  { position: 2, card: { suit: 'blue', value: 7 } },
  { position: 3, card: { suit: 'green', value: 6 } },
];

/** The animation playground: a trick fills, sweeps to the winner, repeats. */
export const TrickLoop: Story = () => {
  const [count, setCount] = useState(0);
  const [sweep, setSweep] = useState<0 | 1 | 2 | 3 | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      setCount((c) => {
        if (c < 4) return c + 1;
        setSweep((s) => (s === null ? 3 : null));
        return c === 4 && sweep === null ? 4 : 0;
      });
    }, 800);
    return () => clearInterval(t);
  }, [sweep]);
  return (
    <div className="grid place-items-center h-80">
      <div className="relative size-80">
        <TrickArea plays={DEMO_TRICK.slice(0, count)} sweepTo={count === 4 ? sweep : null} />
      </div>
    </div>
  );
};

export const FullTable: Story = () => (
  <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
    <ScoreStrip
      teamNames={['North + South', 'East + West']}
      scores={[18, 16]}
      target={41}
      contract={{ playerName: 'East', value: 8, sansAtout: true, team: 1 }}
      trump={null}
      trumpDecided
      roundPoints={[3, 4]}
      currentRound={4}
      rounds={[
        {
          round: 1,
          bidderName: 'Claudette',
          bidderTeam: 0,
          bid: 7,
          sansAtout: false,
          trump: 'green',
          made: true,
          deltas: [9, 5],
        },
        {
          round: 2,
          bidderName: 'Marcel',
          bidderTeam: 1,
          bid: 9,
          sansAtout: false,
          trump: 'blue',
          made: false,
          deltas: [5, -9],
        },
        {
          round: 3,
          bidderName: 'East',
          bidderTeam: 1,
          bid: 10,
          sansAtout: true,
          trump: null,
          made: true,
          deltas: [4, 20],
        },
      ]}
    />
    <div className="grid w-full grid-cols-3 items-center justify-items-center gap-2">
      <span />
      <Seat name="Claudette" team={0} isDealer />
      <span />
      <Seat name="Marcel" team={1} isBot />
      <div className="relative size-72">
        <TrickArea plays={DEMO_TRICK.slice(0, 3)} />
      </div>
      <Seat name="Ginette" team={1} connected={false} />
      <span />
      <Seat name="You" team={0} isTurn />
      <span />
    </div>
    <Hand cards={SAMPLE_HAND.map((card) => ({ card, disabled: card.suit !== 'green' }))} />
  </div>
);

export const Auction: Story = () => (
  <BidPanel
    options={[
      { value: 9, sansAtout: false },
      { value: 9, sansAtout: true },
      { value: 10, sansAtout: false },
      { value: 10, sansAtout: true },
      { value: 11, sansAtout: false },
      { value: 11, sansAtout: true },
      { value: 12, sansAtout: false },
      { value: 12, sansAtout: true },
    ]}
    onPass={() => undefined}
    onBid={() => undefined}
  />
);

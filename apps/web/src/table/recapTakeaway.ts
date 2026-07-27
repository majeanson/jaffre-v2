import type { SeatView } from '@jaffre/engine';
import type { Lang } from '@jaffre/ui';

type Round = NonNullable<SeatView['lastRoundSummary']>;

/**
 * One honest thing to work on, read off the round record.
 *
 * Deliberately NOT a re-run of the Coach over your individual card plays: a
 * RoundSummary carries no per-trick plays, so that verdict can't be derived
 * here, and a made-up "you misplayed the Red 0" is worse than saying nothing.
 * Every line below is a fact about contracts taken, made, and tricks captured
 * — with the advice that follows from it. Returns null when the game says
 * nothing clear, rather than padding with filler.
 */
export interface Takeaway {
  readonly text: string;
}

const T: Record<
  Lang,
  {
    missed: (missed: number, taken: number) => string;
    perfect: (taken: number) => string;
    defended: string;
    partner: string;
  }
> = {
  en: {
    missed: (missed, taken) =>
      `You missed ${String(missed)} of your ${String(taken)} contracts — try bidding a point lower for the points you can actually take.`,
    perfect: (taken) =>
      `You made every contract you took (${String(taken)}) — you can afford to bid a point higher.`,
    defended:
      'You never held the contract this game. Defending pays: you keep every point you capture, so hunt the Red 0.',
    partner:
      'Your partner took most of your team’s tricks — lead your longest suit early to take more of them yourself.',
  },
  fr: {
    missed: (missed, taken) =>
      `Tu as raté ${String(missed)} de tes ${String(taken)} contrats — mise un point plus bas, sur les points que tu peux vraiment prendre.`,
    perfect: (taken) =>
      `Tu as réussi tous tes contrats (${String(taken)}) — tu peux te permettre de miser un point plus haut.`,
    defended:
      'Tu n’as jamais eu le contrat cette partie. Défendre paie : tu gardes chaque point que tu prends, alors chasse le 0 rouge.',
    partner:
      'Ton partenaire a pris la plupart des levées de ton équipe — entame ta plus longue couleur pour en prendre plus toi-même.',
  },
};

/** The takeaway for `mySeat` after a finished game, or null when unclear. */
export function recapTakeaway(
  rounds: readonly (Round | null)[],
  mySeat: number | null,
  lang: Lang,
): Takeaway | null {
  if (mySeat === null) return null;
  const played = rounds.filter((r): r is Round => r !== null);
  if (played.length < 2) return null;
  const t = T[lang];
  const myTeam = mySeat % 2;

  // Advice about bidding must be about YOUR OWN bids: "try bidding a point
  // lower" is nonsense aimed at contracts your partner took. Only the
  // never-defended line is a team fact (if the team never held it, neither
  // did you).
  const mine = played.filter((r) => r.contract.seat === mySeat);
  const missed = mine.filter((r) => !r.contractMade).length;
  const teamHeld = played.filter((r) => r.contract.seat % 2 === myTeam);

  if (mine.length >= 2 && missed > mine.length / 2) {
    return { text: t.missed(missed, mine.length) };
  }
  if (teamHeld.length === 0) return { text: t.defended };
  if (mine.length >= 2 && missed === 0) return { text: t.perfect(mine.length) };

  // Tricks are seat-indexed and optional (absent on legacy summaries).
  const partnerSeat = (mySeat + 2) % 4;
  let myTricks = 0;
  let partnerTricks = 0;
  let counted = 0;
  for (const r of played) {
    const counts = r.trickCounts;
    if (counts === undefined) continue;
    myTricks += counts[mySeat as 0 | 1 | 2 | 3];
    partnerTricks += counts[partnerSeat as 0 | 1 | 2 | 3];
    counted += 1;
  }
  if (counted >= 2 && myTricks + partnerTricks >= 6 && partnerTricks >= myTricks * 2) {
    return { text: t.partner };
  }
  return null;
}

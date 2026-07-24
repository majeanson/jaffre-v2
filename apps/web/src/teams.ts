import type { Lang } from '@jaffre/ui';

/**
 * Team identity — the single source for team names and colors. Colors are
 * theme tokens so every skin restyles them; names are app-level copy.
 */
export interface TeamIdentity {
  readonly label: string;
  /** CSS color value (a token var) for chips, dots, badges. */
  readonly color: string;
}

export const TEAMS: readonly [TeamIdentity, TeamIdentity] = [
  { label: 'Team Sun', color: 'var(--color-team-a)' },
  { label: 'Team Moon', color: 'var(--color-team-b)' },
];

export function teamOfSeat(seat: number): TeamIdentity {
  return TEAMS[(seat % 2) as 0 | 1];
}

/** Bilingual team names — the single source for "Team Sun/Moon" /
 * "Équipe Soleil/Lune" copy (no leading article; callers that want "l'Équipe
 * Soleil" prepend it themselves via `teamLabelWithArticle`). Every site that
 * used to hand-roll this pair (SeatPicker, Visitor, GameRecap,
 * RoundSummaryOverlay, PlayerPeek, announcer) imports this instead. */
export const TEAM_LABELS: Record<Lang, readonly [string, string]> = {
  en: ['Team Sun', 'Team Moon'],
  fr: ['Équipe Soleil', 'Équipe Lune'],
};

export function teamLabel(team: 0 | 1, lang: Lang): string {
  return TEAM_LABELS[lang][team];
}

/** FR "l'Équipe Soleil/Lune" (elided article) for mid-sentence use; EN
 * unchanged. Callers needing a sentence-initial "L'Équipe" capitalize the
 * leading character themselves. */
export function teamLabelWithArticle(team: 0 | 1, lang: Lang): string {
  return lang === 'fr' ? `l'${TEAM_LABELS.fr[team]}` : TEAM_LABELS.en[team];
}

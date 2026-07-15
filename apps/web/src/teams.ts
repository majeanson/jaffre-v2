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

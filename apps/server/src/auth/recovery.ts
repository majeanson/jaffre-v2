/**
 * 3-word recovery codes ("lampe-tricot-hibou"): a memorable, copy-pasteable
 * stand-in for a password/account. Only a SHA-256 hash of the code is ever
 * persisted (`users.recovery_hash`) — the plaintext is handed to the caller
 * exactly once, at first mint, and never stored server-side.
 */

// 64 short, accent-free FR-flavored words — power-of-two length so picking
// with `Uint32Array % WORDS.length` has zero modulo bias.
const WORDS = [
  'lampe',
  'tricot',
  'hibou',
  'pomme',
  'nuage',
  'plume',
  'ancre',
  'banjo',
  'cidre',
  'datte',
  'ecole',
  'fable',
  'givre',
  'houle',
  'ile',
  'jonc',
  'kepi',
  'lilas',
  'meute',
  'noyau',
  'olive',
  'poire',
  'quai',
  'ronce',
  'sable',
  'tulle',
  'usine',
  'velo',
  'wagon',
  'xylo',
  'yack',
  'zebre',
  'abri',
  'biche',
  'cible',
  'digue',
  'etoile',
  'forge',
  'grive',
  'harpe',
  'igloo',
  'jade',
  'laine',
  'miel',
  'noeud',
  'osier',
  'perle',
  'ruche',
  'sirop',
  'trefle',
  'urne',
  'valse',
  'yole',
  'arome',
  'bulle',
  'crepe',
  'doux',
  'erable',
  'flute',
  'gite',
  'houx',
  'joue',
  'loupe',
  'manoir',
] as const;

function pickWord(): string {
  const roll = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return WORDS[roll % WORDS.length] ?? WORDS[0];
}

/** A fresh 3-word code, e.g. `lampe-tricot-hibou`. Words may repeat — three
 * independent picks out of 64 is plenty of entropy (18 bits) for a lookup
 * key that also has to be easy to say over voice chat. */
export function generateRecoveryCode(): string {
  return [pickWord(), pickWord(), pickWord()].join('-');
}

/** SHA-256 hex digest of a recovery code — the only form ever stored. */
export async function hashRecoveryCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

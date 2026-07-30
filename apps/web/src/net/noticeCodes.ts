import type { Lang } from '@jaffre/ui';
import { currentLang } from '../lang.js';

/**
 * Localized copy for the server's `error` message `code`s that a player can
 * actually run into during normal play (seat races, rate limits, bad music
 * links, a full queue). The server's `message` is English-only and not meant
 * for translation — this is a small, curated allowlist; any code NOT listed
 * here falls back to that raw English message rather than being (mis)guessed.
 */
const NOTICE_CODES: Record<string, Record<Lang, string>> = {
  SEAT_TAKEN: {
    en: 'That seat was just taken — pick another.',
    fr: 'Ce siège vient d’être pris — choisis-en un autre.',
  },
  CHAT_RATE: {
    en: 'Sending too fast — wait a moment.',
    fr: 'Tu envoies trop vite — attends un instant.',
  },
  MUSIC_RATE: {
    en: 'Too many songs too fast — wait a moment.',
    fr: 'Trop de chansons trop vite — attends un instant.',
  },
  MUSIC_QUEUE_FULL: {
    en: 'The queue is full — wait for a song to finish.',
    fr: 'La file est pleine — attends la fin d’une chanson.',
  },
  MUSIC_BAD_URL: {
    en: "That doesn't look like a YouTube link.",
    fr: 'Ça ne ressemble pas à un lien YouTube.',
  },
  MUSIC_UNAVAILABLE: {
    en: "That video can't be played.",
    fr: 'Cette vidéo ne peut pas être lue.',
  },
  KICKED: {
    en: 'The host removed you from this table.',
    fr: "L'hôte t'a retiré de cette table.",
  },
  NOT_HOST: {
    en: 'Only the host can do that.',
    fr: "Seul l'hôte peut faire ça.",
  },
  ALREADY_STARTED: {
    en: 'The game already started.',
    fr: 'La partie a déjà commencé.',
  },
  // The engine's own reject codes (packages/engine/src/types.ts) — surfaced
  // when a queued/stale/out-of-band action reaches the server after the game
  // state has moved on. Static copy, no params: the led suit, whose turn it
  // is, and the offending card are all already visible on the table, so
  // naming them again here would just repeat what the felt already shows.
  WRONG_PHASE: {
    en: "That can't be done right now.",
    fr: "C'est pas le moment de faire ça.",
  },
  NOT_YOUR_TURN: {
    en: 'Not your turn yet.',
    fr: "C'est pas ton tour.",
  },
  ILLEGAL_BID: {
    en: "That bid isn't allowed.",
    fr: 'Cette mise est pas permise.',
  },
  CARD_NOT_IN_HAND: {
    en: "That card isn't in your hand.",
    fr: "T'as pas cette carte en main.",
  },
  MUST_FOLLOW_SUIT: {
    en: 'You have to follow the led suit.',
    fr: 'Tu dois fournir la couleur demandée.',
  },
};

/** Map a server error `code` to localized copy for the current language;
 * unknown codes fall back to the server's raw English `message`. */
export function localizeNotice(code: string, message: string): string {
  return NOTICE_CODES[code]?.[currentLang()] ?? message;
}

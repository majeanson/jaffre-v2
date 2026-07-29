import { useState, type CSSProperties, type ReactNode } from 'react';
import { Cta, useLang, type Lang } from '@jaffre/ui';
import { markMakePublic, quickPlay, type TableEntry } from '../net/rooms.js';
import { reportFunnel } from '../net/telemetry.js';
import { GHOST_BTN_SM } from '../components/buttonStyles.js';
import { TableCard, useTableStatuses } from './TableCards.js';
import { generateRoomCode } from './roomCode.js';
import { TEACHING_DEALS } from './teachingDeals.js';
import {
  botsFromSetting,
  loadPracticeBots,
  savePracticeBots,
  settingFromBots,
  SETTING_ORDER,
  type PracticeSetting,
} from './practiceBots.js';

const DIFFICULTY_LABEL: Record<Lang, Record<PracticeSetting, string>> = {
  en: { easy: 'Easy', normal: 'Normal', hard: 'Hard', mixed: 'Mixed' },
  fr: { easy: 'Facile', normal: 'Normal', hard: 'Difficile', mixed: 'Variés' },
};

const T: Record<
  Lang,
  {
    play: string;
    close: string;
    resume: string;
    resumeHint: string;
    bots: string;
    botsHint: string;
    public: string;
    publicHint: string;
    private: string;
    privateHint: string;
    playVsBots: string;
    botDifficulty: string;
    learn: string;
    daily: string;
    dailyHint: string;
    quickPlay: string;
    quickPlayHint: string;
    browsePublic: string;
    hostPublic: string;
    newPrivate: string;
    orCode: string;
    roomCode: string;
    joinRoom: string;
    yourTurn: string;
  }
> = {
  en: {
    play: 'Play',
    close: 'Close',
    resume: 'Resume',
    resumeHint: 'Tables you already have going.',
    bots: 'Bots',
    botsHint: 'Solo practice — starts instantly, no waiting.',
    public: 'Public',
    publicHint: 'Play online with anyone.',
    private: 'Private',
    privateHint: 'Invite-only — share the room code.',
    playVsBots: 'Play vs bots',
    botDifficulty: 'Bot difficulty',
    learn: 'Learn a hand',
    daily: '★ Hand of the Day',
    dailyHint: 'Learn: three seeded lessons. Hand of the Day: the same deal as everyone else.',
    quickPlay: 'Quick play online',
    quickPlayHint: 'Joins an open table, or starts one.',
    browsePublic: 'Join a public game',
    hostPublic: 'Host a public table',
    newPrivate: 'New private table',
    orCode: 'Or join with a code',
    roomCode: 'Room code',
    joinRoom: 'Join room',
    yourTurn: 'Your turn',
  },
  fr: {
    play: 'Jouer',
    close: 'Fermer',
    resume: 'Reprendre',
    resumeHint: 'Les tables que t’as déjà en cours.',
    bots: 'Bots',
    botsHint: 'Pratique solo — ça part tout de suite, sans attendre.',
    public: 'Public',
    publicHint: 'Joue en ligne avec n’importe qui.',
    private: 'Privé',
    privateHint: 'Sur invitation — partage le code du salon.',
    playVsBots: 'Jouer contre les bots',
    botDifficulty: 'Difficulté des bots',
    learn: 'Apprendre une main',
    daily: '★ La main du jour',
    dailyHint:
      'Apprendre : trois leçons préparées. La main du jour : la même donne que tout le monde.',
    quickPlay: 'Partie rapide en ligne',
    quickPlayHint: 'Joins une table ouverte, ou pars-en une.',
    browsePublic: 'Joindre une partie publique',
    hostPublic: 'Ouvrir une table publique',
    newPrivate: 'Nouvelle table privée',
    orCode: 'Ou joins avec un code',
    roomCode: 'Code du salon',
    joinRoom: 'Joindre le salon',
    yourTurn: 'À ton tour',
  },
};

export interface PlayMenuProps {
  readonly onPractice: () => void;
  readonly onJoinRoom: (code: string) => void;
  /** Tables this browser has sat at, newest first — feeds the door's count. */
  readonly tables: readonly TableEntry[];
  /** Permanently quit a standing table (frees the seat, drops the card). */
  readonly onQuitTable?: (code: string) => void;
  /** Mount with the door already open (scene viewer). */
  readonly defaultOpen?: boolean;
}

/** One labelled way in. The door is violet; each section is a `ground` card on
 * it with a gold display heading and one plain-language line under it, so the
 * four ways to start a game are told apart at a glance instead of reading as
 * one stack of buttons. */
function DoorSection({
  title,
  hint,
  delay,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly delay: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rise-in flex flex-col gap-3 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-4 shadow-(--shadow-ap-sm) max-sm:p-3"
      style={{ '--rise-delay': delay } as CSSProperties}
    >
      <header className="flex flex-col gap-0.5">
        {/* h2 (not h3): the page's only h1 is the wordmark, and axe flags a
            skipped level. */}
        <h2 className="font-arcade-display text-[clamp(0.95rem,2vmin,1.15rem)] uppercase tracking-[0.14em] text-(--color-ap-gold)">
          {title}
        </h2>
        <p className="font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
          {hint}
        </p>
      </header>
      {children}
    </section>
  );
}

/**
 * The title-screen PLAY door in the arcade shell. Knock once and the door
 * opens onto four labelled sections — RESUME (your standing tables), BOTS,
 * PUBLIC, PRIVATE — every way into a game visible at once. There is no
 * sub-step to drill into: the old "with friends" fork hid the room-code box
 * and the public list one tap deep, which read as a maze.
 */
export function PlayMenu({
  onPractice,
  onJoinRoom,
  tables,
  onQuitTable,
  defaultOpen,
}: PlayMenuProps) {
  const lang = useLang();
  const t = T[lang];
  const difficultyLabel = DIFFICULTY_LABEL[lang];
  const [code, setCode] = useState('');
  const [setting, setSetting] = useState<PracticeSetting>(() =>
    settingFromBots(loadPracticeBots()),
  );
  // One PLAY door: everything else only appears after you knock.
  const [open, setOpen] = useState(defaultOpen ?? false);
  // The three curated lessons, folded behind LEARN so BOTS stays a short
  // stack of buttons until you ask for them.
  const [learnOpen, setLearnOpen] = useState(false);
  // Quick Play in flight — one tap only.
  const [matching, setMatching] = useState(false);
  const statuses = useTableStatuses(tables);
  // A live table is waiting on YOU — the closed door announces it.
  const yourTurn = tables.some((tbl) => {
    const s = statuses[tbl.code];
    return (
      s != null &&
      s.started &&
      (s.phase === 'playing' || s.phase === 'bidding') &&
      typeof tbl.yourSeat === 'number' &&
      s.turn === tbl.yourSeat
    );
  });

  const pickSetting = (next: PracticeSetting) => {
    setSetting(next);
    savePracticeBots(botsFromSetting(next));
  };

  const joinTyped = () => {
    const clean = code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
    if (clean !== '') onJoinRoom(clean);
  };

  return (
    <section
      aria-label={t.play}
      className="grid w-full grid-cols-1 gap-3 font-arcade-ui sm:grid-cols-2"
    >
      {/* ONE door in: a single PLAY panel. Everything else only appears after
          you press it — no split on the title screen itself. */}
      <div
        className="rise-in group relative flex flex-col gap-4 overflow-hidden rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-violet) p-5 text-(--color-ap-ink) shadow-(--shadow-ap-lg) max-sm:p-4 sm:col-span-2"
        style={{ '--rise-delay': '60ms' } as CSSProperties}
      >
        {!open ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              reportFunnel('play');
            }}
            className="relative z-10 flex w-full cursor-pointer flex-wrap items-center justify-center gap-3 py-[clamp(0.8rem,2.4vmin,1.5rem)] font-arcade-display text-[clamp(1.5rem,3.4vmin,2.1rem)] uppercase tracking-wide transition-transform duration-(--duration-flick) active:translate-y-[2px]"
          >
            {t.play}
            {yourTurn ? (
              // A proper little badge, not a loose dot + word: panel-filled so
              // it reads on the violet in every skin, ink-bordered like every
              // other chip in the shell, with a green heartbeat and a slow
              // wobble (both motion-preference guarded) to make it wave.
              <span className="ap-wobble inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.7em] py-[0.32em] font-arcade-ui text-(length:--text-fluid-xs) font-semibold normal-case tracking-normal text-(--color-ap-text) shadow-(--shadow-ap-sm)">
                <span
                  aria-hidden
                  className="size-2 animate-pulse rounded-full bg-(--color-ap-ok)"
                />
                {t.yourTurn}
              </span>
            ) : null}
            <span
              aria-hidden
              className="transition-transform duration-(--duration-flick) group-hover:translate-x-1"
            >
              →
            </span>
          </button>
        ) : (
          <div className="relative z-10 flex flex-col gap-3">
            {/* The open door keeps its own title bar so the tall stack still
                reads as "this is PLAY", and can be shut again. */}
            <div className="flex items-center justify-between gap-3">
              <span className="font-arcade-display text-[clamp(1.1rem,2.6vmin,1.5rem)] uppercase tracking-wide">
                {t.play}
              </span>
              <button type="button" onClick={() => setOpen(false)} className={GHOST_BTN_SM}>
                {t.close}
              </button>
            </div>

            {/* 1 · RESUME — anything already in progress outranks starting
                something new, so it sits at the top when it exists. */}
            {tables.length > 0 && (
              <DoorSection title={t.resume} hint={t.resumeHint} delay="0ms">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* MAX standing tables (net/rooms.ts) is 6 — the same cap, so
                      nothing here is ever silently hidden. */}
                  {tables.slice(0, 6).map((tbl) => (
                    <TableCard
                      key={tbl.code}
                      table={tbl}
                      status={statuses[tbl.code] ?? null}
                      onResume={() => {
                        location.hash = '#room/' + tbl.code;
                      }}
                      {...(onQuitTable !== undefined
                        ? { onLeave: () => onQuitTable(tbl.code) }
                        : {})}
                    />
                  ))}
                </div>
              </DoorSection>
            )}

            {/* 2 · BOTS — the one path with zero prerequisites. Its difficulty
                row lives right under it: four visible options, not a blind
                cycling chip. */}
            <DoorSection title={t.bots} hint={t.botsHint} delay="40ms">
              <Cta type="button" className="w-full" onClick={onPractice}>
                {t.playVsBots}
              </Cta>
              <div
                role="group"
                aria-label={t.botDifficulty}
                className="flex w-full items-stretch gap-1.5"
              >
                {SETTING_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={setting === s}
                    onClick={() => pickSetting(s)}
                    className={`min-w-0 flex-1 cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-1 py-[0.45em] font-arcade-ui text-(length:--text-fluid-xs) shadow-(--shadow-ap-sm) transition-colors duration-(--duration-flick) ${
                      setting === s
                        ? 'bg-(--color-ap-gold) font-semibold text-(--color-ap-ink)'
                        : 'bg-(--color-ap-panel) text-(--color-ap-muted) hover:bg-(--color-ap-panel-hover) hover:text-(--color-ap-text)'
                    }`}
                  >
                    {difficultyLabel[s]}
                  </button>
                ))}
              </div>
              {/* The section's two other doors, given the same button weight
                  as PUBLIC's pair instead of the loose chip row and the one
                  text line they used to be: LEARN (curated deals) and the
                  Deal Board. Both are seeded practice tables — the Deal Board
                  is just the deal EVERYONE gets today, so it stands beside
                  the lessons rather than inside them. */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Cta
                  type="button"
                  variant="secondary"
                  className="w-full min-w-0"
                  aria-expanded={learnOpen}
                  onClick={() => setLearnOpen((v) => !v)}
                >
                  {t.learn}
                </Cta>
                <Cta
                  type="button"
                  variant="secondary"
                  className="w-full min-w-0"
                  onClick={() => {
                    location.hash = '#daily';
                  }}
                >
                  {t.daily}
                </Cta>
              </div>
              <span className="font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                {t.dailyHint}
              </span>
              {/* Curated deals: the same practice table, seeded so the lesson
                  is actually in your hand on round one. Open, each one names
                  the lesson AND what to try — the goal line used to hide in a
                  hover title, which a phone never shows. */}
              {learnOpen && (
                <div className="flex flex-col gap-1.5">
                  {TEACHING_DEALS.map((deal) => (
                    <button
                      key={deal.id}
                      type="button"
                      onClick={() => {
                        location.hash = `#practice/${String(deal.seed)}`;
                      }}
                      className="flex cursor-pointer flex-col gap-0.5 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2 text-left shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
                    >
                      <span className="font-arcade-display text-(length:--text-fluid-xs) uppercase tracking-wide text-(--color-ap-text)">
                        {deal.label[lang]}
                      </span>
                      <span className="font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                        {deal.goal[lang]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </DoorSection>

            {/* 3 · PUBLIC — one tap to be seated (quick play), plus the two
                slower public choices: browse the live list, or open a table
                and let strangers fill it. */}
            <DoorSection title={t.public} hint={t.publicHint} delay="80ms">
              <div className="flex flex-col gap-1">
                <Cta
                  type="button"
                  className="w-full"
                  disabled={matching}
                  onClick={() => {
                    if (matching) return;
                    setMatching(true);
                    void quickPlay()
                      .then(onJoinRoom)
                      .finally(() => setMatching(false));
                  }}
                >
                  {t.quickPlay}
                </Cta>
                <span className="text-center font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                  {t.quickPlayHint}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {/* The live lobby list — you see who's open and pick, instead
                    of being teleported blind. */}
                <Cta
                  type="button"
                  variant="secondary"
                  className="w-full min-w-0"
                  onClick={() => {
                    location.hash = '#lobby';
                  }}
                >
                  {t.browsePublic}
                </Cta>
                <Cta
                  type="button"
                  variant="secondary"
                  className="w-full min-w-0"
                  onClick={() => {
                    // New public tables are listed on sight — the pre-game
                    // toggle is how a host opts back DOWN to invite-only.
                    const roomCode = generateRoomCode();
                    markMakePublic(roomCode);
                    onJoinRoom(roomCode);
                  }}
                >
                  {t.hostPublic}
                </Cta>
              </div>
            </DoorSection>

            {/* 4 · PRIVATE — the friends path: open an invite-only table, or
                punch in the code someone sent you. Both live in the open now
                instead of behind a "with friends" fork. */}
            <DoorSection title={t.private} hint={t.privateHint} delay="120ms">
              <Cta
                type="button"
                className="w-full"
                onClick={() => {
                  // No markMakePublic — the in-lobby public toggle still lets
                  // a host opt up once seated.
                  const roomCode = generateRoomCode();
                  onJoinRoom(roomCode);
                }}
              >
                {t.newPrivate}
              </Cta>
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  joinTyped();
                }}
              >
                <span className="font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                  {t.orCode}
                </span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="early-newt-os"
                  aria-label={t.roomCode}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full min-w-0 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2.5 text-(--color-ap-text) placeholder:text-(--color-ap-muted) focus:bg-(--color-ap-panel-hover)"
                />
                <button
                  type="submit"
                  className="w-full cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-2.5 font-arcade-display text-[0.95em] uppercase text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
                >
                  {t.joinRoom}
                </button>
              </form>
            </DoorSection>
          </div>
        )}
      </div>
    </section>
  );
}

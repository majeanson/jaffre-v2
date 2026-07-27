import { useEffect, useRef, useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { send } from '../net/socket.js';
import { useGameStore } from '../state/gameStore.js';
import { useMusicStore } from '../state/musicStore.js';

const T: Record<
  Lang,
  {
    heading: string;
    empty: string;
    placeholder: string;
    inputLabel: string;
    add: string;
    nowPlaying: string;
    upNext: string;
    addedByLabel: string;
    adding: string;
    skip: (votes: number, needed: number) => string;
    skipVoted: string;
    remove: string;
  }
> = {
  en: {
    heading: 'Music',
    empty: 'Nothing queued — paste a YouTube link to start the music.',
    placeholder: 'Paste a YouTube link…',
    inputLabel: 'YouTube link',
    add: 'Add',
    nowPlaying: 'Now playing',
    upNext: 'Up next',
    addedByLabel: 'Added by',
    adding: 'Adding…',
    skip: (votes, needed) => `Skip (${String(votes)}/${String(needed)})`,
    skipVoted: 'Skip vote cast',
    remove: 'Remove from queue',
  },
  fr: {
    heading: 'Musique',
    empty: 'Rien en file — colle un lien YouTube pour lancer le son.',
    placeholder: 'Colle un lien YouTube…',
    inputLabel: 'Lien YouTube',
    add: 'Ajouter',
    nowPlaying: 'En lecture',
    upNext: 'À suivre',
    // "Ajoutée" agrees with "cette chanson" (feminine, implicit subject).
    addedByLabel: 'Ajoutée par',
    adding: 'Ajout…',
    skip: (votes, needed) => `Passer (${String(votes)}/${String(needed)})`,
    skipVoted: 'Vote pour passer envoyé',
    remove: 'Retirer de la file',
  },
};

/** A track's felt-coloured adder name, matching chat's seat colouring. */
function AdderName({ name, seat }: { readonly name: string; readonly seat?: number | undefined }) {
  return (
    <span
      className="font-bold text-(--color-ap-violet-soft)"
      style={
        typeof seat === 'number'
          ? { color: seat % 2 === 0 ? 'var(--color-team-a)' : 'var(--color-team-b)' }
          : undefined
      }
    >
      {name}
    </span>
  );
}

export interface MusicQueuePanelProps {
  /** Your absolute seat, or null (spectator) — gates the skip vote. */
  readonly me: number | null;
}

/**
 * The shared queue EDITOR inside RoomComms: paste-a-link add, now-playing row
 * with the majority skip vote, and the queue with remove-your-own. Playback —
 * listening opt-in, volume, the video itself — belongs to the MusicDock, so
 * each control lives in exactly one place.
 */
export function MusicQueuePanel({ me }: MusicQueuePanelProps) {
  const t = T[useLang()];
  const state = useMusicStore((s) => s.state);
  const notice = useGameStore((s) => s.notice);
  const [url, setUrl] = useState('');
  // The just-submitted link, shown as a ghost "Adding…" row until the next
  // music state (success) or an error notice (rejection) arrives.
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) setPendingUrl(null);
    mounted.current = true;
  }, [state]);

  useEffect(() => {
    if (notice !== null) setPendingUrl(null);
  }, [notice]);

  const submit = () => {
    const trimmed = url.trim();
    if (trimmed === '') return;
    // Optimistic clear — a rejection (bad link, full queue, rate limit) comes
    // back as the standard error toast via the socket's notice path, which
    // also clears the pending ghost row above.
    send({ t: 'music_add', url: trimmed });
    setPendingUrl(trimmed);
    setUrl('');
  };

  const current = state?.current ?? null;
  const queue = state?.queue ?? [];

  return (
    <div data-testid="music-panel" className="flex w-full flex-col gap-2 p-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-(--color-ap-muted)">
          {t.heading}
        </span>
      </div>

      {current === null && queue.length === 0 && pendingUrl === null && (
        <p className="px-1 text-xs text-(--color-ap-muted)">{t.empty}</p>
      )}

      {current !== null && (
        <div
          data-testid="music-current"
          className="flex items-center gap-2 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-1.5"
        >
          {current.thumb !== '' && (
            <img src={current.thumb} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />
          )}
          {/* Title clamps to two lines and the adder gets its own line — the
              one-line truncate lost the whole track identity ("Un…" · "Adde…"). */}
          <span className="flex min-w-0 flex-1 flex-col text-xs leading-tight">
            <span className="line-clamp-2 font-bold text-(--color-ap-text)">{current.title}</span>
            <span className="truncate text-(--color-ap-muted)">
              {t.addedByLabel} <AdderName name={current.addedBy} seat={current.addedBySeat} />
            </span>
          </span>
          {me !== null && (
            <button
              type="button"
              data-testid="music-skip"
              disabled={state?.youVotedSkip === true}
              title={state?.youVotedSkip === true ? t.skipVoted : undefined}
              onClick={() => send({ t: 'music_skip_vote' })}
              className="shrink-0 cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-2 py-1 text-[10px] font-bold uppercase text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover) disabled:cursor-default disabled:opacity-50"
            >
              {t.skip(state?.skipVotes ?? 0, state?.skipNeeded ?? 1)}
            </button>
          )}
        </div>
      )}

      {(queue.length > 0 || pendingUrl !== null) && (
        <div className="flex flex-col gap-1 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-(--color-ap-muted)">
            {t.upNext}
          </span>
          <ul data-testid="music-queue" className="flex max-h-32 flex-col gap-1 overflow-y-auto">
            {pendingUrl !== null && (
              <li
                data-testid="music-pending"
                className="flex items-center gap-2 text-xs leading-tight text-(--color-ap-muted) opacity-70"
              >
                <span className="min-w-0 flex-1 truncate italic">
                  {t.adding} {pendingUrl}
                </span>
              </li>
            )}
            {queue.map((track) => (
              <li key={track.id} className="flex items-center gap-2 text-xs leading-tight">
                {track.thumb !== '' && (
                  <img src={track.thumb} alt="" className="h-6 w-8 shrink-0 rounded object-cover" />
                )}
                {/* Title clamps (2 lines) and the adder sits outside the clamp,
                    so neither swallows the other mid-word ("…de d'là Gin…"). */}
                <span className="line-clamp-2 min-w-0 flex-1 text-(--color-ap-text)">
                  {track.title}
                </span>
                <span className="shrink-0">
                  <AdderName name={track.addedBy} seat={track.addedBySeat} />
                </span>
                {track.mine === true && (
                  <button
                    type="button"
                    aria-label={t.remove}
                    title={t.remove}
                    onClick={() => send({ t: 'music_remove', id: track.id })}
                    className="shrink-0 cursor-pointer rounded px-1 text-(--color-ap-muted) hover:text-(--color-ap-text)"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={300}
          placeholder={t.placeholder}
          aria-label={t.inputLabel}
          data-testid="music-input"
          className="min-w-0 flex-1 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-2.5 py-1.5 text-xs text-(--color-ap-text) placeholder:text-(--color-ap-muted)"
        />
        <button
          type="submit"
          data-testid="music-add"
          className="cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-1.5 font-arcade-display text-[0.7em] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:bg-(--color-ap-panel-hover) active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          {t.add}
        </button>
      </form>
    </div>
  );
}

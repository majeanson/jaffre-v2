import { useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { send } from '../net/socket.js';
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
    addedBy: (name: string) => string;
    skip: (votes: number, needed: number) => string;
    skipVoted: string;
    remove: string;
    listen: string;
    stopListening: string;
    volume: string;
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
    addedBy: (name) => `Added by ${name}`,
    skip: (votes, needed) => `Skip (${String(votes)}/${String(needed)})`,
    skipVoted: 'Skip vote cast',
    remove: 'Remove from queue',
    listen: 'Listen',
    stopListening: 'Stop listening',
    volume: 'Your volume',
  },
  fr: {
    heading: 'Musique',
    empty: 'Rien en file — colle un lien YouTube pour lancer le son.',
    placeholder: 'Colle un lien YouTube…',
    inputLabel: 'Lien YouTube',
    add: 'Ajouter',
    nowPlaying: 'En lecture',
    upNext: 'À suivre',
    addedBy: (name) => `Ajoutée par ${name}`,
    skip: (votes, needed) => `Passer (${String(votes)}/${String(needed)})`,
    skipVoted: 'Vote pour passer envoyé',
    remove: 'Retirer de la file',
    listen: 'Écouter',
    stopListening: 'Couper la musique',
    volume: 'Ton volume',
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
 * The shared queue surface inside RoomComms: paste-a-link add, now-playing
 * row with the majority skip vote, the queue with remove-your-own, and the
 * local listen/volume controls that drive the App-level MusicDock.
 */
export function MusicQueuePanel({ me }: MusicQueuePanelProps) {
  const t = T[useLang()];
  const { state, listening, volume, setListening, setVolume } = useMusicStore();
  const [url, setUrl] = useState('');

  const submit = () => {
    const trimmed = url.trim();
    if (trimmed === '') return;
    // Optimistic clear — a rejection (bad link, full queue, rate limit) comes
    // back as the standard error toast via the socket's notice path.
    send({ t: 'music_add', url: trimmed });
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
        <button
          type="button"
          data-testid="music-listen"
          aria-pressed={listening}
          onClick={() => setListening(!listening)}
          className={`cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-2.5 py-1 font-arcade-display text-[0.65em] uppercase tracking-wide shadow-(--shadow-ap-sm) transition-colors ${
            listening
              ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
              : 'bg-(--color-ap-panel) text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)'
          }`}
        >
          {listening ? t.stopListening : t.listen}
        </button>
      </div>

      {current === null && queue.length === 0 && (
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
          <span className="flex min-w-0 flex-1 flex-col text-xs leading-tight">
            <span className="truncate font-bold text-(--color-ap-text)">{current.title}</span>
            <span className="truncate text-(--color-ap-muted)">
              {current.author} · {t.addedBy('')}
              <AdderName name={current.addedBy} seat={current.addedBySeat} />
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

      {queue.length > 0 && (
        <div className="flex flex-col gap-1 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-(--color-ap-muted)">
            {t.upNext}
          </span>
          <ul data-testid="music-queue" className="flex max-h-32 flex-col gap-1 overflow-y-auto">
            {queue.map((track) => (
              <li key={track.id} className="flex items-center gap-2 text-xs leading-tight">
                {track.thumb !== '' && (
                  <img src={track.thumb} alt="" className="h-6 w-8 shrink-0 rounded object-cover" />
                )}
                <span className="min-w-0 flex-1 truncate text-(--color-ap-text)">
                  {track.title} <AdderName name={track.addedBy} seat={track.addedBySeat} />
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

      <label className="flex items-center gap-2 px-1 text-[11px] text-(--color-ap-muted)">
        <span className="shrink-0">{t.volume}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          aria-label={t.volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="min-w-0 flex-1 accent-(--color-ap-gold)"
        />
      </label>
    </div>
  );
}

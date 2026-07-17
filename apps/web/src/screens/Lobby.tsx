import { ChatPanel, Cta, useLang, type Lang } from '@jaffre/ui';
import { useChatSend } from '../chat/useChatSend.js';
import { HelpButton } from '../help/HelpButton.js';
import { send } from '../net/socket.js';
import { SeatPicker } from '../room/SeatPicker.js';
import { ShareButton } from '../components/ShareButton.js';
import { useGameStore } from '../state/gameStore.js';
import { VoiceControls } from '../voice/VoiceControls.js';

export interface LobbyProps {
  readonly code: string;
  readonly onLeave: () => void;
}

const T: Record<
  Lang,
  {
    room: (code: string) => string;
    share: string;
    reconnecting: string;
    connecting: string;
    start: string;
    waiting: string;
    voice: string;
    back: string;
    howToPlay: string;
  }
> = {
  en: {
    room: (code) => `Room ${code}`,
    share: 'Share this code with your table.',
    reconnecting: 'Reconnecting…',
    connecting: 'Connecting…',
    start: 'Start the game',
    waiting: 'Waiting for 4 players…',
    voice: 'Table voice',
    back: '← Back home',
    howToPlay: 'How to play',
  },
  fr: {
    room: (code) => `Salon ${code}`,
    share: 'Partage ce code avec ta table.',
    reconnecting: 'Reconnexion…',
    connecting: 'Connexion…',
    start: 'Commencer la partie',
    waiting: 'En attente de 4 joueurs…',
    voice: 'Vocal de table',
    back: "← Retour à l'accueil",
    howToPlay: 'Comment jouer',
  },
};

/** Pre-game room: pick a seat, fill the rest with bots, start. */
export function Lobby({ code, onLeave }: LobbyProps) {
  const t = T[useLang()];
  const { roster, viewer, connection, chat } = useGameStore();
  const sendChat = useChatSend();
  const full = roster !== null && roster.seats.every((s) => s !== null);

  return (
    <main className="table-felt grid min-h-screen place-items-center p-6">
      <div className="flex w-full max-w-md flex-col gap-5">
        <header className="text-center">
          <div className="flex items-center justify-center gap-2">
            <h1 className="font-arcade-display text-3xl uppercase text-(--color-ap-gold)">
              {t.room(code)}
            </h1>
            <ShareButton code={code} />
          </div>
          <p className="mt-1 text-sm text-(--color-ap-muted)">
            {connection === 'open'
              ? t.share
              : connection === 'reconnecting'
                ? t.reconnecting
                : t.connecting}
          </p>
        </header>

        <SeatPicker
          roster={roster}
          viewer={viewer}
          onSit={(seat) => send({ t: 'sit', seat })}
          onAddBot={(seat, difficulty) => send({ t: 'add_bot', seat, difficulty })}
        />

        <Cta onClick={() => send({ t: 'start' })} disabled={!full} className="w-full">
          {full ? t.start : t.waiting}
        </Cta>

        {typeof viewer === 'number' && (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[11px] font-semibold tracking-widest text-(--color-ap-muted) uppercase">
              {t.voice}
            </span>
            <VoiceControls me={viewer} />
          </div>
        )}

        <ChatPanel entries={chat} onSend={sendChat} />

        <div className="flex items-center justify-center gap-5">
          <button
            onClick={onLeave}
            className="text-sm text-(--color-ap-muted) hover:text-(--color-ap-text) cursor-pointer"
          >
            {t.back}
          </button>
          <HelpButton
            label={t.howToPlay}
            className="text-sm text-(--color-ap-muted) hover:text-(--color-ap-text) cursor-pointer"
          />
        </div>
      </div>
    </main>
  );
}

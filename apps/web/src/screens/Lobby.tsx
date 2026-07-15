import { ChatPanel } from '@jaffre/ui';
import { useChatSend } from '../chat/useChatSend.js';
import { HelpButton } from '../help/HelpButton.js';
import { send } from '../net/socket.js';
import { SeatPicker } from '../room/SeatPicker.js';
import { useGameStore } from '../state/gameStore.js';

export interface LobbyProps {
  readonly code: string;
  readonly onLeave: () => void;
}

/** Pre-game room: pick a seat, fill the rest with bots, start. */
export function Lobby({ code, onLeave }: LobbyProps) {
  const { roster, viewer, connection, chat } = useGameStore();
  const sendChat = useChatSend();
  const full = roster !== null && roster.seats.every((s) => s !== null);

  return (
    <main className="table-felt grid min-h-screen place-items-center p-6">
      <div className="flex w-full max-w-md flex-col gap-5">
        <header className="text-center">
          <h1 className="font-display text-3xl text-(--color-lamplight)">Room {code}</h1>
          <p className="mt-1 text-sm text-(--color-ivory)/55">
            {connection === 'open'
              ? 'Share this code with your table.'
              : connection === 'reconnecting'
                ? 'Reconnecting…'
                : 'Connecting…'}
          </p>
        </header>

        <SeatPicker
          roster={roster}
          viewer={viewer}
          onSit={(seat) => send({ t: 'sit', seat })}
          onAddBot={(seat) => send({ t: 'add_bot', seat })}
        />

        <button
          onClick={() => send({ t: 'start' })}
          disabled={!full}
          className={`rounded-(--radius-panel) px-4 py-3.5 font-semibold shadow-(--shadow-panel) ${
            full
              ? 'bg-(--color-lamplight) text-(--color-felt-950) hover:brightness-110 cursor-pointer'
              : 'bg-white/8 text-(--color-ivory)/35'
          }`}
        >
          {full ? 'Start the game' : 'Waiting for 4 players…'}
        </button>

        <ChatPanel entries={chat} onSend={sendChat} />

        <div className="flex items-center justify-center gap-5">
          <button
            onClick={onLeave}
            className="text-sm text-(--color-ivory)/50 hover:text-(--color-ivory)/80 cursor-pointer"
          >
            ← Back home
          </button>
          <HelpButton
            label="How to play"
            className="text-sm text-(--color-ivory)/50 hover:text-(--color-ivory)/80 cursor-pointer"
          />
        </div>
      </div>
    </main>
  );
}

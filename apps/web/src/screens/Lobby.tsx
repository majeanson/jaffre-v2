import { ChatPanel, Seat } from '@jaffre/ui';
import { send } from '../net/socket.js';
import { useGameStore } from '../state/gameStore.js';
import { useChatSend } from './Table.js';

export interface LobbyProps {
  readonly code: string;
  readonly onLeave: () => void;
}

/** Pre-game room: pick a seat, fill the rest with bots, start. */
export function Lobby({ code, onLeave }: LobbyProps) {
  const { roster, viewer, connection, chat } = useGameStore();
  const sendChat = useChatSend();
  const seated = viewer !== null && viewer !== 'spectator';
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

        <div className="flex flex-col gap-2.5">
          {([0, 1, 2, 3] as const).map((seat) => {
            const info = roster?.seats[seat] ?? null;
            return (
              <div key={seat} data-testid={`seat-row-${seat}`} className="flex items-center gap-3">
                <span className="w-16 text-right text-xs text-(--color-ivory)/45">
                  Seat {seat + 1} · Team {seat % 2 === 0 ? 'A' : 'B'}
                </span>
                {info !== null ? (
                  <Seat
                    name={seat === viewer ? 'You' : info.name}
                    team={(seat % 2) as 0 | 1}
                    isBot={info.isBot}
                    connected={info.connected}
                  />
                ) : (
                  <span className="flex gap-2">
                    <button
                      onClick={() => send({ t: 'sit', seat })}
                      disabled={seated}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        seated
                          ? 'border-white/8 text-(--color-ivory)/30'
                          : 'border-(--color-accent)/50 text-(--color-lamplight) hover:bg-(--color-accent)/10 cursor-pointer'
                      }`}
                    >
                      Sit here
                    </button>
                    <button
                      onClick={() => send({ t: 'add_bot', seat })}
                      className="rounded-lg border border-white/15 px-3 py-2 text-sm text-(--color-ivory)/75 hover:bg-white/8 cursor-pointer"
                    >
                      Add bot
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>

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

        <button
          onClick={onLeave}
          className="text-sm text-(--color-ivory)/50 hover:text-(--color-ivory)/80 cursor-pointer"
        >
          ← Back home
        </button>
      </div>
    </main>
  );
}

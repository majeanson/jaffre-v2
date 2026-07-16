import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { GHOST_BTN } from '../components/buttonStyles.js';
import { getGuestToken, getRecoveryCode, recoverIdentity } from '../net/auth.js';
import { playerName, setPlayerName } from '../net/socket.js';

const PANEL =
  'rounded-(--radius-panel) border border-white/10 bg-(--color-felt-800)/85 shadow-(--shadow-panel)';

/**
 * Warm, zero-friction identity card: shows the 3-word recovery code once a
 * guest identity is minted, and a quiet "I have a code" affordance to
 * restore one on a new device. No accounts vocabulary anywhere.
 */
export function RecoveryCard() {
  const [code, setCode] = useState<string | null>(getRecoveryCode());
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');
  const [enteredName, setEnteredName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Establish identity as soon as the home screen shows (not only once a
    // room connects) so a brand-new browser sees its words right away.
    void getGuestToken(playerName()).then(() => setCode(getRecoveryCode()));
  }, []);

  const copy = () => {
    if (code === null) return;
    void navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard API unavailable/denied — the words are still on screen.
      });
  };

  const submitRecover = (e: FormEvent) => {
    e.preventDefault();
    const trimmedCode = enteredCode.trim().toLowerCase();
    if (trimmedCode === '' || busy) return;
    setBusy(true);
    setError(null);
    const trimmedName = enteredName.trim();
    void recoverIdentity(trimmedCode, trimmedName === '' ? undefined : trimmedName).then(
      (result) => {
        setBusy(false);
        if (result === null) {
          setError("That code didn't match — check the words and try again.");
          return;
        }
        setPlayerName(result.name);
        location.reload();
      },
    );
  };

  if (code === null && !showForm) {
    // Nothing to show yet (identity still minting) and the recovery form is
    // closed — render just the quiet affordance so Home doesn't jump around.
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="rise-in text-(length:--text-fluid-xs) text-(--color-ivory)/50 hover:text-(--color-ivory)/80 hover:underline"
      >
        I have a code
      </button>
    );
  }

  return (
    <div
      className={`rise-in flex w-full max-w-xs flex-col items-center gap-2 p-4 text-center ${PANEL}`}
      style={{ '--rise-delay': '200ms' } as CSSProperties}
    >
      {code !== null && !showForm && (
        <>
          <p className="text-(length:--text-fluid-xs) text-(--color-ivory)/70">
            These words get your name and games back on a new phone.
          </p>
          <p className="font-display text-(length:--text-fluid-sm) font-semibold tracking-wide text-(--color-lamplight)">
            {code}
          </p>
          <button
            type="button"
            onClick={copy}
            className={`${GHOST_BTN} px-3 py-1.5 text-(length:--text-fluid-xs) text-(--color-ivory)/80`}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => setShowForm((s) => !s)}
        className="text-(length:--text-fluid-xs) text-(--color-ivory)/50 hover:text-(--color-ivory)/80 hover:underline"
      >
        {showForm ? 'Never mind' : 'I have a code'}
      </button>

      {showForm && (
        <form onSubmit={submitRecover} className="flex w-full flex-col gap-2">
          <input
            value={enteredCode}
            onChange={(e) => setEnteredCode(e.target.value)}
            placeholder="lampe-tricot-hibou"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-center text-(--color-ivory) placeholder:text-(--color-ivory)/40 focus:border-(--color-accent)"
          />
          <input
            value={enteredName}
            onChange={(e) => setEnteredName(e.target.value)}
            placeholder="Name (optional)"
            maxLength={20}
            className="min-w-0 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-center text-(--color-ivory) placeholder:text-(--color-ivory)/40 focus:border-(--color-accent)"
          />
          {error !== null && (
            <p className="text-(length:--text-fluid-xs) text-(--color-danger-text)">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="cursor-pointer rounded-lg border border-(--color-accent)/60 px-4 py-2 font-semibold text-(--color-accent) hover:bg-(--color-accent)/10 disabled:cursor-default disabled:opacity-50"
          >
            {busy ? 'Restoring…' : 'Restore'}
          </button>
        </form>
      )}
    </div>
  );
}

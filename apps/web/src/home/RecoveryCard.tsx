import { useEffect, useState, type FormEvent } from 'react';
import { Cta, WordPlate, useLang, type Lang } from '@jaffre/ui';
import { getGuestToken, getRecoveryCode, recoverIdentity } from '../net/auth.js';
import { playerName, setPlayerName } from '../net/socket.js';

/**
 * A forced state for the scene viewer — lets the design surface stage the
 * empty / loading / code / error variants without a live server round-trip.
 */
export type RecoveryStage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'recover-error' };

/** Split 'lampe-tricot-hibou' into its three words for the plate trio. */
function words(code: string): readonly string[] {
  return code.split('-').filter((w) => w !== '');
}

const T: Record<
  Lang,
  {
    recoverError: string;
    minting: string;
    wordsGetBack: string;
    copied: string;
    copy: string;
    haveCode: string;
    neverMind: string;
    namePlaceholder: string;
    restoring: string;
    restore: string;
  }
> = {
  en: {
    recoverError: "That code didn't match — check the words and try again.",
    minting: 'Minting your words…',
    wordsGetBack: 'These words get your name and games back on a new phone.',
    copied: 'Copied',
    copy: 'Copy',
    haveCode: 'I have a code',
    neverMind: 'Never mind',
    namePlaceholder: 'Name (optional)',
    restoring: 'Restoring…',
    restore: 'Restore',
  },
  fr: {
    recoverError: 'Ce code ne correspond pas — vérifie les mots et réessaie.',
    minting: 'Création de tes mots…',
    wordsGetBack: 'Ces mots ramènent ton nom et tes parties sur un nouveau téléphone.',
    copied: 'Copié',
    copy: 'Copier',
    haveCode: "J'ai un code",
    neverMind: 'Laisse faire',
    namePlaceholder: 'Nom (facultatif)',
    restoring: 'Restauration…',
    restore: 'Restaurer',
  },
};

export interface RecoveryCardProps {
  /** Scene-only: force a state instead of minting against the server. */
  readonly stage?: RecoveryStage;
}

/**
 * Warm, zero-friction identity card in the arcade shell: shows the 3-word
 * recovery code as an ivory WordPlate trio once a guest identity is minted,
 * plus a quiet "I have a code" affordance to restore one on a new device. No
 * account vocabulary anywhere — these words just get your games back.
 */
export function RecoveryCard({ stage }: RecoveryCardProps) {
  const t = T[useLang()];
  const staged = stage !== undefined;
  const [code, setCode] = useState<string | null>(
    stage?.kind === 'code' ? stage.code : getRecoveryCode(),
  );
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(stage?.kind === 'recover-error');
  const [enteredCode, setEnteredCode] = useState(
    stage?.kind === 'recover-error' ? 'aaaa-bbbb-cccc' : '',
  );
  const [enteredName, setEnteredName] = useState('');
  const [error, setError] = useState<string | null>(
    stage?.kind === 'recover-error' ? t.recoverError : null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (staged) return; // scene mode: never touch the network
    // Establish identity as soon as the home screen shows (not only once a
    // room connects) so a brand-new browser sees its words right away.
    void getGuestToken(playerName()).then(() => setCode(getRecoveryCode()));
  }, [staged]);

  const copy = () => {
    if (code === null || staged) return;
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
    if (staged) return;
    const trimmedCode = enteredCode.trim().toLowerCase();
    if (trimmedCode === '' || busy) return;
    setBusy(true);
    setError(null);
    const trimmedName = enteredName.trim();
    void recoverIdentity(trimmedCode, trimmedName === '' ? undefined : trimmedName).then(
      (result) => {
        setBusy(false);
        if (result === null) {
          setError(t.recoverError);
          return;
        }
        setPlayerName(result.name);
        location.reload();
      },
    );
  };

  const loading = stage?.kind === 'loading' || (!staged && code === null);

  // Loading + form-closed: on the live screen show only the quiet affordance so
  // Home doesn't jump around. In the loading scene, show the shimmer.
  if (loading && !showForm && stage?.kind !== 'loading') {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="rise-in font-arcade-ui text-[0.8em] text-(--color-ap-muted) hover:text-(--color-ap-text) hover:underline"
      >
        {t.haveCode}
      </button>
    );
  }

  return (
    <div className="rise-in flex w-full max-w-xs flex-col items-center gap-[0.7em] rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1.1em] text-center shadow-(--shadow-ap)">
      {stage?.kind === 'loading' && (
        <>
          <p className="font-arcade-ui text-[0.8em] text-(--color-ap-muted)">{t.minting}</p>
          <div data-testid="recovery-loading" aria-hidden className="flex items-center gap-[0.5em]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-[2em] w-[4.5em] animate-pulse rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel-hover)"
              />
            ))}
          </div>
        </>
      )}

      {code !== null && !showForm && stage?.kind !== 'loading' && (
        <>
          <p className="font-arcade-ui text-[0.8em] text-(--color-ap-muted)">{t.wordsGetBack}</p>
          <div className="flex flex-wrap items-center justify-center gap-[0.5em]">
            {words(code).map((w, i) => (
              <WordPlate key={i}>{w}</WordPlate>
            ))}
            {/* The e2e + screen readers read the raw code from here; the plates
                above are decorative (uppercased via CSS, which would corrupt an
                innerText read). */}
            <span data-testid="recovery-code" className="sr-only">
              {code}
            </span>
          </div>
          <Cta type="button" variant="secondary" onClick={copy}>
            {copied ? t.copied : t.copy}
          </Cta>
        </>
      )}

      <button
        type="button"
        onClick={() => setShowForm((s) => !s)}
        className="font-arcade-ui text-[0.8em] text-(--color-ap-muted) hover:text-(--color-ap-text) hover:underline"
      >
        {showForm ? t.neverMind : t.haveCode}
      </button>

      {showForm && (
        <form onSubmit={submitRecover} className="flex w-full flex-col gap-[0.6em]">
          <input
            value={enteredCode}
            onChange={(e) => setEnteredCode(e.target.value)}
            placeholder="lampe-tricot-hibou"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-3 py-2 text-center font-arcade-ui text-(--color-ap-text) placeholder:text-(--color-ap-muted) focus:bg-(--color-ap-panel-hover)"
          />
          <input
            value={enteredName}
            onChange={(e) => setEnteredName(e.target.value)}
            placeholder={t.namePlaceholder}
            maxLength={20}
            className="min-w-0 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-3 py-2 text-center font-arcade-ui text-(--color-ap-text) placeholder:text-(--color-ap-muted) focus:bg-(--color-ap-panel-hover)"
          />
          {error !== null && (
            <p role="alert" className="font-arcade-ui text-[0.8em] text-(--color-ap-danger-text)">
              {error}
            </p>
          )}
          <Cta type="submit" disabled={busy}>
            {busy ? t.restoring : t.restore}
          </Cta>
        </form>
      )}
    </div>
  );
}

import { ARCADE, Cta, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useState, type FormEvent } from 'react';
import {
  fetchAuthMethods,
  getLinks,
  googleLoginUrl,
  isLinked,
  startEmailLogin,
  verifyEmailLogin,
} from '../net/auth.js';
import { setPlayerName } from '../net/socket.js';

const T: Record<
  Lang,
  {
    keep: string;
    linkedTo: (what: string) => string;
    google: string;
    email: string;
    emailPlaceholder: string;
    sendCode: string;
    sending: string;
    rate: string;
    sendError: string;
    codeSent: (email: string) => string;
    codePlaceholder: string;
    confirm: string;
    checking: string;
    wrong: string;
    expired: string;
    nudge: string;
  }
> = {
  en: {
    keep: 'Keep your games on any device',
    linkedTo: (what) => `Linked · ${what}`,
    google: 'Continue with Google',
    email: 'Use my email',
    emailPlaceholder: 'you@example.com',
    sendCode: 'Send me a code',
    sending: 'Sending…',
    rate: 'Too many codes — try again in a bit.',
    sendError: "Couldn't send the code — try again.",
    codeSent: (email) => `Code sent to ${email} — check your inbox.`,
    codePlaceholder: '6-digit code',
    confirm: 'Confirm',
    checking: 'Checking…',
    wrong: 'Wrong code — check the digits.',
    expired: 'Code expired — send a new one.',
    nudge: 'Keep your games — link an account under Customize on the home screen.',
  },
  fr: {
    keep: 'Garde tes parties sur tous tes appareils',
    linkedTo: (what) => `Lié · ${what}`,
    google: 'Continuer avec Google',
    email: 'Utiliser mon courriel',
    emailPlaceholder: 'toi@exemple.com',
    sendCode: 'Envoie-moi un code',
    sending: 'Envoi…',
    rate: 'Trop de codes — réessaie dans un moment.',
    sendError: "Le code n'est pas parti — réessaie.",
    codeSent: (email) => `Code envoyé à ${email} — regarde ta boîte.`,
    codePlaceholder: 'Code à 6 chiffres',
    confirm: 'Confirmer',
    checking: 'Vérification…',
    wrong: 'Mauvais code — vérifie les chiffres.',
    expired: 'Code expiré — demande-en un nouveau.',
    nudge: "Garde tes parties — lie un compte sous Personnaliser à l'accueil.",
  },
};

const INPUT_CLS =
  'min-w-0 flex-1 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-3 py-2 text-center font-arcade-ui text-(--color-ap-text) placeholder:text-(--color-ap-muted) focus:bg-(--color-ap-panel-hover)';

/**
 * "Keep your games" — the optional account link, guest-first and never a wall.
 * Shows only the methods this deployment actually offers; once anything is
 * linked it collapses to a single quiet "Linked · …" line. On success the app
 * reloads so every surface adopts the (possibly different) identity.
 */
export function LinkAccount() {
  const t = T[useLang()];
  const [methods, setMethods] = useState<{ email: boolean; google: boolean } | null>(null);
  const [stage, setStage] = useState<'idle' | 'email' | 'code'>('idle');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const links = getLinks();

  useEffect(() => {
    void fetchAuthMethods().then(setMethods);
  }, []);

  if (isLinked()) {
    return (
      <p className="font-arcade-ui text-[0.8em] text-(--color-ap-ok)">
        ✓ {t.linkedTo(links.email ?? 'Google')}
      </p>
    );
  }
  // Nothing configured (local dev) or still probing: show nothing at all.
  if (methods === null || (!methods.email && !methods.google)) return null;

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || email.trim() === '') return;
    setBusy(true);
    setError(null);
    const result = await startEmailLogin(email.trim());
    setBusy(false);
    if (result === 'sent') setStage('code');
    else setError(result === 'rate' ? t.rate : t.sendError);
  };

  const confirmCode = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || code.trim().length !== 6) return;
    setBusy(true);
    setError(null);
    const result = await verifyEmailLogin(email.trim(), code.trim());
    setBusy(false);
    if (result === 'wrong') setError(t.wrong);
    else if (result === 'expired' || result === null) {
      setError(t.expired);
      setStage('email');
      setCode('');
    } else {
      setPlayerName(result.name);
      location.reload();
    }
  };

  return (
    <div
      className={`${ARCADE.inner} flex w-full flex-col items-center gap-[0.6em] bg-(--color-ap-ground)/60 p-[0.8em]`}
    >
      <p className="font-arcade-display text-[0.7em] uppercase tracking-[0.12em] text-(--color-ap-text)">
        {t.keep}
      </p>
      {methods.google && stage === 'idle' && (
        <a href={googleLoginUrl()} className="w-full">
          <Cta type="button" variant="secondary" className="w-full">
            {t.google}
          </Cta>
        </a>
      )}
      {methods.email && stage === 'idle' && (
        <button
          type="button"
          onClick={() => setStage('email')}
          className="cursor-pointer font-arcade-ui text-[0.8em] text-(--color-ap-muted) hover:text-(--color-ap-text) hover:underline"
        >
          {t.email}
        </button>
      )}
      {stage === 'email' && (
        <form onSubmit={sendCode} className="flex w-full flex-col gap-[0.5em]">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            autoComplete="email"
            className={INPUT_CLS}
          />
          <Cta type="submit" disabled={busy} className="w-full">
            {busy ? t.sending : t.sendCode}
          </Cta>
        </form>
      )}
      {stage === 'code' && (
        <form onSubmit={confirmCode} className="flex w-full flex-col gap-[0.5em]">
          <p className="font-arcade-ui text-[0.75em] text-(--color-ap-muted)">
            {t.codeSent(email.trim())}
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={t.codePlaceholder}
            inputMode="numeric"
            autoComplete="one-time-code"
            className={`${INPUT_CLS} font-arcade-display tracking-[0.3em]`}
          />
          <Cta type="submit" disabled={busy || code.length !== 6} className="w-full">
            {busy ? t.checking : t.confirm}
          </Cta>
        </form>
      )}
      {error !== null && (
        <p role="alert" className="font-arcade-ui text-[0.75em] text-(--color-ap-danger-text)">
          {error}
        </p>
      )}
    </div>
  );
}

/** The one-line nudge for quiet moments (game recap, lobby) — muted text,
 * gone forever once anything is linked. Never a wall, never a modal. */
export function LinkNudge() {
  const t = T[useLang()];
  if (isLinked()) return null;
  return (
    <p className="text-center font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
      <span aria-hidden className="text-(--color-ap-gold)">
        ✦
      </span>{' '}
      {t.nudge}
    </p>
  );
}

import { Cta, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchAuthMethods,
  getLinks,
  googleLoginUrl,
  isLinked,
  recoverIdentity,
  startEmailLogin,
  verifyEmailLogin,
} from '../net/auth.js';
import { setPlayerName } from '../net/socket.js';
import { GHOST_BTN } from './buttonStyles.js';

const T: Record<
  Lang,
  {
    login: string;
    close: string;
    optional: string;
    linkedTo: (what: string) => string;
    linkedNote: string;
    done: string;
    google: string;
    googleHint: string;
    emailTitle: string;
    emailHint: string;
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
    haveWords: string;
    wordsHint: string;
    namePlaceholder: string;
    restoring: string;
    restore: string;
    recoverError: string;
  }
> = {
  en: {
    login: 'Log in',
    close: 'Close login',
    optional:
      "Optional — you're already playing as a guest. Logging in just keeps your name, stats and card skins on any device.",
    linkedTo: (what) => `Linked · ${what}`,
    linkedNote: 'Your games follow you — log in with the same account on any device.',
    done: 'Done',
    google: 'Continue with Google',
    googleHint: 'One tap with your Google account — no password.',
    emailTitle: 'Use my email',
    emailHint: "We email you a 6-digit code — type it back here. That's it, no password.",
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
    haveWords: 'I have a 3-word code',
    wordsHint: 'Got words like lampe-tricot-hibou from another device? They bring those games back.',
    namePlaceholder: 'Name (optional)',
    restoring: 'Restoring…',
    restore: 'Restore',
    recoverError: "That code didn't match — check the words and try again.",
  },
  fr: {
    login: 'Connexion',
    close: 'Fermer la connexion',
    optional:
      'Facultatif — tu joues déjà comme invité. Te connecter garde simplement ton nom, tes stats et tes habillages sur tous tes appareils.',
    linkedTo: (what) => `Lié · ${what}`,
    linkedNote: 'Tes parties te suivent — connecte-toi avec le même compte sur tous tes appareils.',
    done: 'Terminé',
    google: 'Continuer avec Google',
    googleHint: 'Un seul geste avec ton compte Google — pas de mot de passe.',
    emailTitle: 'Utiliser mon courriel',
    emailHint:
      "On t'envoie un code à 6 chiffres par courriel — tape-le ici. C'est tout, pas de mot de passe.",
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
    haveWords: "J'ai un code à 3 mots",
    wordsHint:
      "Tu as des mots comme lampe-tricot-hibou d'un autre appareil? Ils ramènent ces parties.",
    namePlaceholder: 'Nom (facultatif)',
    restoring: 'Restauration…',
    restore: 'Restaurer',
    recoverError: 'Ce code ne correspond pas — vérifie les mots et réessaie.',
  },
};

const INPUT_CLS =
  'min-w-0 flex-1 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-3 py-2 text-center font-arcade-ui text-(--color-ap-text) placeholder:text-(--color-ap-muted) focus:bg-(--color-ap-panel-hover)';

/** A method block: bold label row + a muted one-line hint under it. */
function Hint({ children }: { readonly children: string }) {
  return <p className="text-[0.75em] leading-snug text-(--color-ap-muted)">{children}</p>;
}

/**
 * The one dedicated login surface: every way in (Google, emailed code, 3-word
 * restore) side by side, each with a plain-words hint. Guest-first — the sheet
 * opens only from the quiet "Log in" trigger and leads with "optional", so a
 * first-timer who never taps it is never asked for anything.
 */
export function LoginSheet({ onClose }: { readonly onClose: () => void }) {
  const t = T[useLang()];
  const [methods, setMethods] = useState<{ email: boolean; google: boolean } | null>(null);
  // Email-code flow: entering the address, then entering the received digits.
  const [emailStage, setEmailStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  // 3-word restore, folded until asked for — it's the rare path.
  const [wordsOpen, setWordsOpen] = useState(false);
  const [words, setWords] = useState('');
  const [wordsName, setWordsName] = useState('');
  const [wordsBusy, setWordsBusy] = useState(false);
  const [wordsError, setWordsError] = useState<string | null>(null);
  const links = getLinks();

  useEffect(() => {
    void fetchAuthMethods().then(setMethods);
  }, []);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (emailBusy || email.trim() === '') return;
    setEmailBusy(true);
    setEmailError(null);
    const result = await startEmailLogin(email.trim());
    setEmailBusy(false);
    if (result === 'sent') setEmailStage('code');
    else setEmailError(result === 'rate' ? t.rate : t.sendError);
  };

  const confirmCode = async (e: FormEvent) => {
    e.preventDefault();
    if (emailBusy || code.trim().length !== 6) return;
    setEmailBusy(true);
    setEmailError(null);
    const result = await verifyEmailLogin(email.trim(), code.trim());
    setEmailBusy(false);
    if (result === 'wrong') setEmailError(t.wrong);
    else if (result === 'expired' || result === null) {
      setEmailError(t.expired);
      setEmailStage('email');
      setCode('');
    } else {
      setPlayerName(result.name);
      location.reload();
    }
  };

  const submitRestore = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = words.trim().toLowerCase();
    if (trimmed === '' || wordsBusy) return;
    setWordsBusy(true);
    setWordsError(null);
    const name = wordsName.trim();
    void recoverIdentity(trimmed, name === '' ? undefined : name).then((result) => {
      setWordsBusy(false);
      if (result === null) {
        setWordsError(t.recoverError);
        return;
      }
      setPlayerName(result.name);
      location.reload();
    });
  };

  // Portaled to <body>: the home screen's animated chrome bar is a stacking
  // context, so an inline fixed overlay would slip under the hero fan.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.login}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-5 font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-lg)"
      >
        <div aria-hidden className="mx-auto h-1.5 w-11 rounded-full bg-(--color-ap-ink)/40" />

        <div className="text-center">
          <h2 className="font-arcade-display text-[1.7em] leading-none text-(--color-ap-gold)">
            {t.login}
          </h2>
          <p className="mt-2 text-[0.8em] leading-snug text-(--color-ap-muted)">
            {isLinked() ? t.linkedNote : t.optional}
          </p>
        </div>

        {isLinked() ? (
          <p className="text-center font-arcade-ui text-[0.9em] text-(--color-ap-ok)">
            ✓ {t.linkedTo(links.email ?? 'Google')}
          </p>
        ) : (
          <>
            {methods?.google === true && (
              <div className="flex flex-col gap-1.5">
                <a href={googleLoginUrl()} className="w-full">
                  <Cta type="button" variant="secondary" className="w-full">
                    {t.google}
                  </Cta>
                </a>
                <Hint>{t.googleHint}</Hint>
              </div>
            )}

            {methods?.email === true && (
              <div className="flex flex-col gap-1.5">
                {emailStage === 'email' ? (
                  <form onSubmit={sendCode} className="flex w-full flex-col gap-[0.5em]">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t.emailPlaceholder}
                      autoComplete="email"
                      className={INPUT_CLS}
                    />
                    <Cta type="submit" disabled={emailBusy} className="w-full">
                      {emailBusy ? t.sending : t.sendCode}
                    </Cta>
                  </form>
                ) : (
                  <form onSubmit={confirmCode} className="flex w-full flex-col gap-[0.5em]">
                    <p className="text-[0.75em] text-(--color-ap-muted)">{t.codeSent(email.trim())}</p>
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder={t.codePlaceholder}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className={`${INPUT_CLS} font-arcade-display tracking-[0.3em]`}
                    />
                    <Cta type="submit" disabled={emailBusy || code.length !== 6} className="w-full">
                      {emailBusy ? t.checking : t.confirm}
                    </Cta>
                  </form>
                )}
                {emailStage === 'email' && <Hint>{t.emailHint}</Hint>}
                {emailError !== null && (
                  <p role="alert" className="text-[0.75em] text-(--color-ap-danger-text)">
                    {emailError}
                  </p>
                )}
              </div>
            )}

            {/* 3-word restore — always available (works without any server
                secret), folded because most players will never need it. */}
            <div className="flex flex-col gap-1.5 border-t-2 border-(--color-ap-ink)/30 pt-3">
              <button
                type="button"
                onClick={() => setWordsOpen((s) => !s)}
                className="cursor-pointer text-[0.8em] text-(--color-ap-muted) hover:text-(--color-ap-text) hover:underline"
              >
                {t.haveWords}
              </button>
              <Hint>{t.wordsHint}</Hint>
              {wordsOpen && (
                <form onSubmit={submitRestore} className="flex w-full flex-col gap-[0.5em]">
                  <input
                    value={words}
                    onChange={(e) => setWords(e.target.value)}
                    placeholder="lampe-tricot-hibou"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={INPUT_CLS}
                  />
                  <input
                    value={wordsName}
                    onChange={(e) => setWordsName(e.target.value)}
                    placeholder={t.namePlaceholder}
                    maxLength={20}
                    className={INPUT_CLS}
                  />
                  {wordsError !== null && (
                    <p role="alert" className="text-[0.75em] text-(--color-ap-danger-text)">
                      {wordsError}
                    </p>
                  )}
                  <Cta type="submit" disabled={wordsBusy}>
                    {wordsBusy ? t.restoring : t.restore}
                  </Cta>
                </form>
              )}
            </div>
          </>
        )}

        <Cta type="button" variant="secondary" onClick={onClose} className="w-full">
          {t.done}
        </Cta>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The quiet trigger for the login sheet — lives in the home screen's chrome
 * bar so first-timers can ignore it entirely. Once linked it turns into a
 * green check + what's linked (still tappable to see the linked state).
 */
export function LoginButton() {
  const t = T[useLang()];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const links = getLinks();
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`px-3 py-1.5 font-arcade-display text-(length:--text-fluid-xs) uppercase tracking-wide ${
          isLinked() ? 'text-(--color-ap-ok)' : 'text-(--color-ap-text)'
        } ${GHOST_BTN}`}
      >
        {isLinked() ? `✓ ${t.linkedTo(links.email ?? 'Google')}` : t.login}
      </button>
      {open && (
        <LoginSheet
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

import { PlayingCard, SUIT_NAMES, SUIT_STYLES, SuitShape, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TEAMS } from '../teams.js';

export interface HelpSheetProps {
  readonly onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

const T: Record<
  Lang,
  {
    title: string;
    close: string;
    rules: string;
    divider: string;
    advanced: string;
    optional: string;
  }
> = {
  en: {
    title: 'How to play',
    close: 'Close help',
    rules: 'Rules',
    divider: 'for when you’ve played a few rounds',
    advanced: 'Advanced strategy',
    optional: 'optional',
  },
  fr: {
    title: 'Comment jouer',
    close: "Fermer l'aide",
    rules: 'Règles',
    divider: 'pour quand tu auras joué quelques rondes',
    advanced: 'Stratégie avancée',
    optional: 'facultatif',
  },
};

function Rule({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-4 shadow-(--shadow-ap-sm)">
      <h3 className="font-arcade-display text-(length:--text-fluid-lg) uppercase text-(--color-ap-gold)">
        {title}
      </h3>
      <div className="mt-1.5 space-y-2 text-(length:--text-fluid-sm) leading-relaxed text-(--color-ap-text)/85">
        {children}
      </div>
    </section>
  );
}

function Strong({ children }: { readonly children: ReactNode }) {
  return <strong className="font-semibold text-(--color-ap-text)">{children}</strong>;
}

function Tip({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <p>
      <Strong>{label}</Strong> {children}
    </p>
  );
}

/** The rule cards in English — the exact strings the e2e suite asserts. */
function RulesEn() {
  return (
    <>
      <Rule title="The basics">
        <p>
          Four players, two teams — <Strong>you and the player across from you</Strong> (
          {TEAMS[0].label} vs {TEAMS[1].label}). The deck has <Strong>32 cards</Strong>: four suits,
          values 0–7. Everyone is dealt <Strong>8 cards</Strong>.
        </p>
        <p aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
          {(['red', 'brown', 'green', 'blue'] as const).map((suit) => (
            <span key={suit} className="flex items-center gap-1.5 whitespace-nowrap">
              <SuitShape suit={suit} size="1.05em" />
              <span className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                {SUIT_STYLES[suit].label}
              </span>
            </span>
          ))}
        </p>
      </Rule>

      <Rule title="Bidding">
        <p>
          One round only — each player speaks once, dealer last:{' '}
          <Strong>bid 7 to 12 trick points</Strong> or pass. Bidding <Strong>sans atout</Strong>{' '}
          means playing with no trump and <Strong>doubles the stake</Strong> — and an equal bid
          played sans atout outbids the plain one. If all four players pass, the dealer is forced to
          a bid of 7.
        </p>
      </Rule>

      <Rule title="Trump">
        <p>
          The <Strong>first card the contract winner leads</Strong> sets the trump suit for the
          round (there is none on a sans-atout contract). You must{' '}
          <Strong>follow the led suit</Strong> whenever you can.
        </p>
      </Rule>

      <Rule title="Tricks">
        <p>
          The <Strong>highest trump</Strong> in the trick wins it; if nobody played a trump, the{' '}
          <Strong>highest card of the led suit</Strong> wins. The winner leads the next trick.
        </p>
      </Rule>

      <Rule title="Points">
        <p>
          Every trick is worth <Strong>1 point</Strong> — and two cards carry a surprise for whoever
          takes the trick they are in:
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-2">
          <figure className="flex flex-col items-center gap-1.5">
            <PlayingCard card={{ suit: 'red', value: 0 }} />
            <figcaption className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
              Red 0 · <span className="font-semibold text-(--color-suit-green)">+5 points</span>
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-1.5">
            <PlayingCard card={{ suit: 'brown', value: 0 }} />
            <figcaption className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
              Brown 0 · <span className="font-semibold text-(--color-suit-red)">−2 points</span>
            </figcaption>
          </figure>
        </div>
        <p>
          8 tricks + 5 − 2 means a round always totals <Strong>11 points</Strong>.
        </p>
      </Rule>

      <Rule title="Scoring">
        <p>
          Make your bet and your team scores <Strong>+bet</Strong> (×2 sans atout); miss it and you
          score <Strong>−bet</Strong> (×2 sans atout). The defenders always keep the trick points
          they took. First team to <Strong>41</Strong> wins — if both teams cross in the same round,
          the higher total takes it (the contract team on an exact tie).
        </p>
      </Rule>

      <Rule title="Reading the table">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            The <Strong>top bar</Strong> shows score · bet · trump; tap it for round details, the
            skin picker, and the game log.
          </li>
          <li>
            During the auction, <Strong>bid bubbles</Strong> appear over each seat as players speak.
          </li>
          <li>
            The <Strong>trick banner</Strong> calls out who took the trick before the cards sweep
            away.
          </li>
        </ul>
      </Rule>
    </>
  );
}

/** The English strategy tips (inside the "Advanced strategy" disclosure). */
function TipsEn() {
  return (
    <>
      <Tip label="Bidding is about your best suit.">
        Size up your hand once for each suit as trump — your longest, strongest suit is your real
        strength. Then bid the <Strong>smallest number that wins the auction</Strong>: making 12 on
        a bet of 7 still only scores 7.
      </Tip>
      <Tip label="When you win the bet, you set trump.">
        Your <Strong>first card names the trump suit</Strong> — lead your best suit, and lead trumps
        high to strip them from the defenders. Once your points reach your bet, stop pushing; extra
        tricks are worthless to you.
      </Tip>
      <Tip label="When you&rsquo;re defending, take everything.">
        Every point you win, you <Strong>keep</Strong> — so grab all you can. And if one more trick
        would push the bettors below their number, spend anything to win it and{' '}
        <Strong>set the contract</Strong>.
      </Tip>
      <Tip label="The red 0 is the whole game (+5).">
        Never lead it and never throw it away. <Strong>Cash it</Strong> on a trick your partner has
        already won. On defense, hold a high trump for the trick it shows up in.
      </Tip>
      <Tip label="The brown 0 is a gift you re-gift (−2).">
        Hand it to a trick the <Strong>opponents</Strong> are winning — best of all when you
        can&rsquo;t follow suit and would waste a card anyway. Never dump it on your partner.
      </Tip>
      <Tip label="Count what&rsquo;s been played.">
        Every played card is public. Track the high cards that are gone — yours may now be
        <Strong> unbeatable</Strong> — and note who <Strong>failed to follow a suit</Strong>:
        they&rsquo;re out of it, so don&rsquo;t lead it into their trump.
      </Tip>
      <Tip label="Play with your partner.">
        If your partner is already winning the trick, <Strong>play low</Strong> — never overtake
        your own side or waste a trump on a trick you were going to win anyway.
      </Tip>
    </>
  );
}

/** Les règles en français québécois — même structure, mêmes cartes. */
function RulesFr() {
  return (
    <>
      <Rule title="Les bases">
        <p>
          Quatre joueurs, deux équipes — <Strong>toi et le joueur en face de toi</Strong> (Équipe
          Soleil c. Équipe Lune). Le paquet a <Strong>32 cartes</Strong> : quatre couleurs, valeurs
          de 0 à 7. Chaque joueur reçoit <Strong>8 cartes</Strong>.
        </p>
        <p aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
          {(['red', 'brown', 'green', 'blue'] as const).map((suit) => (
            <span key={suit} className="flex items-center gap-1.5 whitespace-nowrap">
              <SuitShape suit={suit} size="1.05em" />
              <span className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                {SUIT_NAMES.fr[suit]}
              </span>
            </span>
          ))}
        </p>
      </Rule>

      <Rule title="Les mises">
        <p>
          Une seule ronde de mises — chaque joueur parle une fois, le brasseur en dernier :{' '}
          <Strong>mise de 7 à 12 points de levées</Strong>, ou passe. Miser{' '}
          <Strong>sans atout</Strong> veut dire jouer sans couleur d'atout et{' '}
          <Strong>double la mise (mise ×2)</Strong> — et une mise égale jouée sans atout l'emporte
          sur la mise ordinaire. Si les quatre joueurs passent, le brasseur est forcé de miser 7.
        </p>
      </Rule>

      <Rule title="L'atout">
        <p>
          La <Strong>première carte jouée par le gagnant du contrat</Strong> détermine l'atout de la
          ronde (il n'y en a pas sur un contrat sans atout). Tu dois{' '}
          <Strong>fournir la couleur demandée</Strong> chaque fois que tu le peux.
        </p>
      </Rule>

      <Rule title="Les levées">
        <p>
          L'<Strong>atout le plus haut</Strong> dans la levée la remporte; si personne n'a joué
          d'atout, la <Strong>plus haute carte de la couleur demandée</Strong> gagne. Le gagnant
          entame la levée suivante.
        </p>
      </Rule>

      <Rule title="Les points">
        <p>
          Chaque levée vaut <Strong>1 point</Strong> — et deux cartes réservent une surprise à qui
          prend la levée où elles se trouvent :
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-2">
          <figure className="flex flex-col items-center gap-1.5">
            <PlayingCard card={{ suit: 'red', value: 0 }} />
            <figcaption className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
              Rouge 0 · <span className="font-semibold text-(--color-suit-green)">+5 points</span>
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-1.5">
            <PlayingCard card={{ suit: 'brown', value: 0 }} />
            <figcaption className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
              Brun 0 · <span className="font-semibold text-(--color-suit-red)">−2 points</span>
            </figcaption>
          </figure>
        </div>
        <p>
          8 levées + 5 − 2 : une ronde totalise toujours <Strong>11 points</Strong>.
        </p>
      </Rule>

      <Rule title="Le pointage">
        <p>
          Fais ton contrat et ton équipe marque <Strong>+la mise</Strong> (×2 sans atout); rate-le
          et tu marques <Strong>−la mise</Strong> (×2 sans atout). Les défenseurs gardent toujours
          les points de levées qu'ils ont pris. La première équipe à <Strong>41</Strong> gagne la
          partie — si les deux équipes passent 41 dans la même ronde, le plus haut total l'emporte
          (l'équipe du contrat en cas d'égalité parfaite).
        </p>
      </Rule>

      <Rule title="Lire la table">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            La <Strong>barre du haut</Strong> montre pointage · mise · atout; touche-la pour les
            détails de la ronde, le choix d'habillage et le journal de partie.
          </li>
          <li>
            Pendant les mises, des <Strong>bulles de mise</Strong> apparaissent au-dessus de chaque
            siège quand les joueurs parlent.
          </li>
          <li>
            La <Strong>bannière de levée</Strong> annonce qui a pris la levée avant que les cartes
            se rangent.
          </li>
        </ul>
      </Rule>
    </>
  );
}

/** Les conseils de stratégie avancée, en français. */
function TipsFr() {
  return (
    <>
      <Tip label="Miser, c'est une question de meilleure couleur.">
        Évalue ta main une fois pour chaque couleur comme atout — ta couleur la plus longue et la
        plus forte, c'est ta vraie force. Ensuite, mise le{' '}
        <Strong>plus petit nombre qui remporte les mises</Strong> : faire 12 sur une mise de 7 ne
        rapporte quand même que 7.
      </Tip>
      <Tip label="Quand tu gagnes la mise, c'est toi qui choisis l'atout.">
        Ta <Strong>première carte nomme la couleur d'atout</Strong> — entame ta meilleure couleur,
        et joue tes atouts hauts pour les enlever aux défenseurs. Une fois ta mise atteinte, arrête
        de pousser; les levées en trop ne te donnent rien.
      </Tip>
      <Tip label="Quand tu défends, prends tout.">
        Chaque point que tu gagnes, tu le <Strong>gardes</Strong> — ramasse tout ce que tu peux. Et
        si une levée de plus fait tomber les miseurs sous leur nombre, sacrifie n'importe quoi pour
        la gagner et <Strong>faire rater le contrat</Strong>.
      </Tip>
      <Tip label="Le zéro rouge, c'est toute la partie (+5).">
        Ne l'entame jamais et ne le jette jamais. <Strong>Encaisse-le</Strong> sur une levée que ton
        partenaire a déjà gagnée. En défense, garde un gros atout pour la levée où il sort.
      </Tip>
      <Tip label="Le zéro brun, c'est un cadeau que tu refiles (−2).">
        Donne-le sur une levée que les <Strong>adversaires</Strong> sont en train de gagner — encore
        mieux quand tu ne peux pas fournir et que tu gaspillerais une carte de toute façon. Ne le
        refile jamais à ton partenaire.
      </Tip>
      <Tip label="Compte ce qui est sorti.">
        Chaque carte jouée est publique. Suis les grosses cartes déjà sorties — les tiennes sont
        peut-être maintenant <Strong>imbattables</Strong> — et remarque qui{' '}
        <Strong>n'a pas fourni une couleur</Strong> : il n'en a plus, alors ne l'entame pas dans son
        atout.
      </Tip>
      <Tip label="Joue avec ton partenaire.">
        Si ton partenaire est déjà en train de gagner la levée, <Strong>joue petit</Strong> — ne
        dépasse jamais ton propre camp et ne gaspille pas un atout sur une levée que tu allais
        gagner de toute façon.
      </Tip>
    </>
  );
}

/**
 * The rules, in one themed full-screen sheet. Shared by Home, Lobby, and the
 * table so "how do I play?" is never more than one tap away.
 */
export function HelpSheet({ onClose }: HelpSheetProps) {
  const lang = useLang();
  const t = T[lang];
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the dialog on open; Escape closes; Tab stays inside.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || panelRef.current === null) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Portaled to <body>: an animated (transformed) ancestor — e.g. Home's
  // rise-in footer — would otherwise become the containing block and pin
  // this "fullscreen" sheet to itself.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="pop-in relative flex max-h-[min(88dvh,60rem)] w-[min(96vw,46rem)] flex-col overflow-hidden rounded-(--radius-ap-hero) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) font-arcade-ui shadow-(--shadow-ap-hero)"
      >
        <header className="flex items-center justify-between gap-4 border-b-2 border-(--color-ap-ink) px-5 py-3.5">
          <h2
            id="help-title"
            className="font-arcade-display text-(length:--text-fluid-2xl) uppercase text-(--color-ap-gold)"
          >
            {t.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
          >
            ✕
          </button>
        </header>

        {/* Scrollable region must be keyboard-focusable (axe). */}
        <div
          role="region"
          aria-label={t.rules}
          tabIndex={0}
          className="space-y-3 overflow-y-auto px-5 py-4"
        >
          {lang === 'fr' ? <RulesFr /> : <RulesEn />}

          <div className="flex items-center gap-3 pt-1" aria-hidden>
            <span className="h-0.5 flex-1 bg-(--color-ap-ink)/25" />
            <span className="text-(length:--text-fluid-xs) tracking-wide text-(--color-ap-muted)">
              {t.divider}
            </span>
            <span className="h-0.5 flex-1 bg-(--color-ap-ink)/25" />
          </div>

          <details className="group rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap-sm)">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-(--radius-ap-card) p-4 hover:bg-(--color-ap-panel-hover)">
              <span className="font-arcade-display text-(length:--text-fluid-lg) uppercase text-(--color-ap-gold)">
                {t.advanced}
                <span className="ml-2 align-middle text-(length:--text-fluid-xs) font-normal text-(--color-ap-muted)">
                  {t.optional}
                </span>
              </span>
              <span
                aria-hidden
                className="text-(--color-ap-muted) transition-transform duration-(--duration-flick) group-open:rotate-90"
              >
                ▸
              </span>
            </summary>
            <div className="space-y-2 border-t-2 border-(--color-ap-ink) px-4 pb-4 pt-3 text-(length:--text-fluid-sm) leading-relaxed text-(--color-ap-text)/85">
              {lang === 'fr' ? <TipsFr /> : <TipsEn />}
            </div>
          </details>
        </div>
      </div>
    </div>,
    document.body,
  );
}

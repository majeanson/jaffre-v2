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

/** A themed group of tips inside the Advanced-strategy disclosure. */
function TipSection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <details className="group/tips rounded-(--radius-ap-control) border-2 border-(--color-ap-ink)/50 bg-(--color-ap-ground)/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-(--radius-ap-control) px-3 py-2.5 hover:bg-(--color-ap-panel-hover)">
        <span className="font-arcade-display text-(length:--text-fluid-sm) uppercase tracking-wide text-(--color-ap-gold)">
          {title}
        </span>
        <span
          aria-hidden
          className="text-(--color-ap-muted) transition-transform duration-(--duration-flick) group-open/tips:rotate-90"
        >
          ▸
        </span>
      </summary>
      <div className="space-y-2 border-t-2 border-(--color-ap-ink)/50 px-3 pb-3 pt-2.5">
        {children}
      </div>
    </details>
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
      <TipSection title="Bidding & hand reading">
        <Tip label="Bidding is about your best suit.">
          Size up your hand once for each suit as trump — your longest, strongest suit is your real
          strength. Then bid the <Strong>smallest number that wins the auction</Strong>: making 12
          on a bet of 7 still only scores 7.
        </Tip>
        <Tip label="Count your sure tricks.">
          Every <Strong>7 is a trick</Strong>, and a 6 with cover — 7-6 together, or a 6 with a
          spare card behind it — usually is too. Add about one trick of partner help, and
          that&rsquo;s the number your bid has to live on.
        </Tip>
        <Tip label="Count your losers too.">
          In each suit, count{' '}
          <Strong>one loser for each of the 7, 6 and 5 you&rsquo;re missing</Strong> — but never
          more losers than you hold cards in that suit. Eight minus your losers is roughly your
          tricks. When your two counts disagree, <Strong>trust the lower one</Strong>.
        </Tip>
        <Tip label="Shape beats high cards.">
          A <Strong>void plus three trumps</Strong> is worth about an extra trick — you ruff instead
          of following. And <Strong>7-6 together</Strong> in one long suit takes more tricks than
          two lonely 7s scattered around: concentrated strength keeps you on lead.
        </Tip>
        <Tip label="Sans atout wants running suits.">
          The dream hand: <Strong>two suits headed by 7-6</Strong> (or 7-6-5) and a stopper — a 7 or
          a guarded 6 — in what&rsquo;s left. The contract winner leads first, so you start cashing
          before the defenders ever get in.{' '}
          <Strong>Never bid sans atout with an unstopped suit</Strong>: one lead there and they run
          it against you.
        </Tip>
        <Tip label="Forced to 7? Play your longest suit.">
          All four pass and the dealer is stuck with 7. Don&rsquo;t panic:{' '}
          <Strong>name your longest suit trump</Strong> even without the 7, lean on your
          partner&rsquo;s tricks, and use every trick the opponents win to unload the brown 0. Seven
          is reachable with a bad hand and a plan.
        </Tip>
      </TipSection>

      <TipSection title="The two bonhommes (red 0 & brown 0)">
        <Tip label="The red 0 is the whole game (+5).">
          Never lead it and never throw it away. <Strong>Cash it</Strong> on a trick your partner
          has already won. On defense, hold a high trump for the trick it shows up in.
        </Tip>
        <Tip label="Force it out — or feed it to your partner.">
          Holding <Strong>red 7-6</Strong>? Lead red: whoever holds the red 0 has to follow, and it
          falls <Strong>under your winner</Strong> for +5. Holding the red 0 yourself while void in
          the suit led? <Strong>Drop it onto a trick your partner has already won.</Strong>
        </Tip>
        <Tip label="The brown 0 is a gift you re-gift (−2).">
          Hand it to a trick the <Strong>opponents</Strong> are winning — best of all when you
          can&rsquo;t follow suit and would waste a card anyway. Never dump it on your partner.
        </Tip>
        <Tip label="Keep a low brown as your escape hatch.">
          While the brown 0 is in your hand, <Strong>keep a low brown beside it</Strong>. When brown
          is led at you, duck with the low one — never win the very trick your −2 has to land in.
          The brown 0 only leaves on tricks the opponents are winning.
        </Tip>
        <Tip label="Throw the brown 0 instead of ruffing.">
          When a trick is already lost — or winning it gains you nothing — don&rsquo;t spend a trump
          on it. <Strong>Discard the brown 0 instead</Strong>: you lose the trick either way, and
          now it costs them 2.
        </Tip>
        <Tip label="Ask the two questions every trick.">
          Before you play: <Strong>is the red 0 still out? is the brown 0 still out?</Strong> While
          the red 0 lives, any red trick can suddenly be worth up to 6 points — keep a way to win
          one. Once it&rsquo;s gone, red is just another suit: spend your stoppers freely.
        </Tip>
      </TipSection>

      <TipSection title="Declarer play">
        <Tip label="When you win the bet, you set trump.">
          Your <Strong>first card names the trump suit</Strong> — lead your best suit, and lead
          trumps high to strip them from the defenders. Once your points reach your bet, stop
          pushing; extra tricks are worthless to you.
        </Tip>
        <Tip label="Spend trumps like money.">
          <Strong>Stop drawing the moment only the master trump is left out</Strong> — it wins
          whenever it wants, and chasing it trades two of yours for one of theirs. Choose your first
          lead the same way: with a strong trump suit, open the 7 and draw; with a thin one, lead a
          low trump and keep the big ones for ruffs.
        </Tip>
        <Tip label="Make a void while it&rsquo;s cheap.">
          A lone card in a side suit is a ruff waiting to happen.{' '}
          <Strong>Shed it on someone else&rsquo;s trick by trick 3 or 4</Strong>, and from then on
          you ruff that suit instead of following. Five blues and a lone red? Throw the red early —
          then every red trick, red 0 included, can be yours for a trump.
        </Tip>
        <Tip label="Tricks 7 and 8 are dump magnets.">
          Nobody has safe cards left at the end — the last tricks collect every forced discard:
          brown 0s, stranded high cards, sometimes even the red 0.{' '}
          <Strong>Keep one trump for the finish.</Strong> And if everyone can see you must win the
          last trick, lose an early one on purpose so the dumps don&rsquo;t all land on you.
        </Tip>
        <Tip label="Win with the lowest of equals.">
          With touching winners — 7-6, or 7-6-5 —{' '}
          <Strong>take the trick with the lowest of them</Strong>. It wins exactly the same tricks,
          but the 5 winning tells the table nothing, while the 7 announces where the 6 isn&rsquo;t.
          One exception: if your partner still has to play and might feed you the red 0,{' '}
          <Strong>win big and visible</Strong> — partner only drops the +5 on a trick they can prove
          is yours.
        </Tip>
      </TipSection>

      <TipSection title="Defense & inference">
        <Tip label="When you&rsquo;re defending, take everything.">
          Every point you win, you <Strong>keep</Strong> — so grab all you can. And if one more
          trick would push the bettors below their number, spend anything to win it and{' '}
          <Strong>set the contract</Strong>.
        </Tip>
        <Tip label="Second hand low, third hand high.">
          Second to play on an opponent&rsquo;s low lead? <Strong>Play low</Strong> — your partner
          still speaks after them. Third, with your partner&rsquo;s card losing?{' '}
          <Strong>Go high</Strong>: you&rsquo;re the last cheap chance to win the trick for your
          side.
        </Tip>
        <Tip label="Make the declarer ruff, and ruff again.">
          <Strong>Four trumps behind the declarer is a weapon.</Strong> Every time you get in, lead
          the suit they&rsquo;re void in and force them to trump it. Each ruff shortens their trumps
          toward yours — until the round comes when you hold more than they do.
        </Tip>
        <Tip label="Read the first card — with a grain of salt.">
          The declarer&rsquo;s first card names trump, so it&rsquo;s also a statement:{' '}
          <Strong>the 7 says &ldquo;strong suit, I&rsquo;m drawing&rdquo;</Strong>; a low card says
          &ldquo;thin trumps, saving them for ruffs&rdquo;. Read it — then remember a good declarer
          knows you&rsquo;re reading it, and will <Strong>open low from strength</Strong> to leave
          you guessing. When you declare, do exactly that.
        </Tip>
        <Tip label="What they didn&rsquo;t do talks too.">
          A player who <Strong>didn&rsquo;t ruff</Strong> your winner still holds the suit. Whoever{' '}
          <Strong>passed</Strong> in the auction is weak. And a defender who calmly ducked a red
          trick wasn&rsquo;t afraid of the red 0 landing there — that tells you where it
          isn&rsquo;t.
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
      </TipSection>

      <TipSection title="Playing to 41">
        <Tip label="Count to your number, then change gears.">
          A round holds <Strong>11 points</Strong>. Declaring, count what you&rsquo;ve captured
          toward your bet — the moment it&rsquo;s home, stop spending winners and start shedding
          losers safely. Defending, run the same count: once the contract is decided either way,{' '}
          <Strong>stop paying to fight it and grab every point in reach</Strong> — defenders keep
          what they take, so there is no passive trick.
        </Tip>
        <Tip label="Play the score, not just the hand.">
          First team to <Strong>41</Strong> ends it. When the other team sits at 35 or more, a cheap
          contract hands them the game — <Strong>bid to deny</Strong>, even a notch past comfort.
          Trailing badly? <Strong>Sans atout doubles the stake</Strong> — the natural catch-up
          weapon, and a needless risk when you&rsquo;re the team ahead.
        </Tip>
      </TipSection>
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
      <TipSection title="Miser et lire ta main">
        <Tip label="Miser, c'est une question de meilleure couleur.">
          Évalue ta main une fois pour chaque couleur comme atout — ta couleur la plus longue et la
          plus forte, c'est ta vraie force. Ensuite, mise le{' '}
          <Strong>plus petit nombre qui remporte les mises</Strong> : faire 12 sur une mise de 7 ne
          rapporte quand même que 7.
        </Tip>
        <Tip label="Compte tes levées sûres.">
          Chaque <Strong>7 est une levée</Strong>, et un 6 protégé — 7-6 ensemble, ou un 6 avec une
          carte de réserve derrière — l'est presque toujours aussi. Ajoute environ une levée d'aide
          de ton partenaire : c'est le nombre sur lequel ta mise doit vivre.
        </Tip>
        <Tip label="Compte tes perdantes aussi.">
          Dans chaque couleur, compte{' '}
          <Strong>une perdante pour chaque 7, 6 et 5 qui te manque</Strong> — mais jamais plus de
          perdantes que de cartes dans la couleur. Huit moins tes perdantes, c'est à peu près tes
          levées. Quand tes deux comptes se contredisent, <Strong>fie-toi au plus bas</Strong>.
        </Tip>
        <Tip label="La forme bat les grosses cartes.">
          Une <Strong>chute avec trois atouts</Strong> vaut à peu près une levée de plus — tu coupes
          au lieu de fournir. Et <Strong>7-6 ensemble</Strong> dans une longue couleur prend plus de
          levées que deux 7 éparpillés : la force concentrée te garde en main.
        </Tip>
        <Tip label="Le sans atout veut des couleurs qui déroulent.">
          La main de rêve : <Strong>deux couleurs menées par 7-6</Strong> (ou 7-6-5) et un arrêt —
          un 7 ou un 6 protégé — dans le reste. Le gagnant du contrat entame en premier, alors tu
          encaisses avant même que les défenseurs touchent au jeu.{' '}
          <Strong>Ne mise jamais sans atout avec une couleur sans arrêt</Strong> : une entame là et
          ils la déroulent contre toi.
        </Tip>
        <Tip label="Forcé à 7? Joue ta plus longue couleur.">
          Quatre passes et le brasseur est pris avec 7. Panique pas :{' '}
          <Strong>nomme ta plus longue couleur comme atout</Strong> même sans le 7, appuie-toi sur
          les levées de ton partenaire, et profite de chaque levée que les adversaires gagnent pour
          te débarrasser du 0 brun. Sept, ça se fait avec une mauvaise main et un plan.
        </Tip>
      </TipSection>

      <TipSection title="Les deux bonshommes (0 rouge et 0 brun)">
        <Tip label="Le zéro rouge, c'est toute la partie (+5).">
          Ne l'entame jamais et ne le jette jamais. <Strong>Encaisse-le</Strong> sur une levée que
          ton partenaire a déjà gagnée. En défense, garde un gros atout pour la levée où il sort.
        </Tip>
        <Tip label="Fais-le sortir — ou donne-le à ton partenaire.">
          Tu tiens <Strong>7-6 de rouge</Strong>? Entame rouge : celui qui a le 0 rouge doit
          fournir, et il tombe <Strong>sous ta gagnante</Strong> pour +5. C'est toi qui as le 0
          rouge et tu ne peux pas fournir?{' '}
          <Strong>Dépose-le sur une levée que ton partenaire a déjà gagnée.</Strong>
        </Tip>
        <Tip label="Le zéro brun, c'est un cadeau que tu refiles (−2).">
          Donne-le sur une levée que les <Strong>adversaires</Strong> sont en train de gagner —
          encore mieux quand tu ne peux pas fournir et que tu gaspillerais une carte de toute façon.
          Ne le refile jamais à ton partenaire.
        </Tip>
        <Tip label="Garde un petit brun comme porte de sortie.">
          Tant que le 0 brun est dans ta main, <Strong>garde un petit brun à côté</Strong>. Quand on
          entame brun vers toi, fournis le petit et perds la levée — ne gagne jamais la levée où ton
          −2 doit atterrir. Le 0 brun sort seulement sur une levée que les adversaires gagnent.
        </Tip>
        <Tip label="Jette le zéro brun au lieu de couper.">
          Quand une levée est déjà perdue — ou que la gagner ne te donne rien — ne dépense pas un
          atout dessus. <Strong>Défausse le 0 brun à la place</Strong> : tu perds la levée de toute
          façon, et maintenant elle leur coûte 2.
        </Tip>
        <Tip label="Pose-toi les deux questions à chaque levée.">
          Avant de jouer : <Strong>le 0 rouge est-il encore en jeu? le 0 brun aussi?</Strong> Tant
          que le 0 rouge circule, n'importe quelle levée rouge peut soudain valoir jusqu'à 6 points
          — garde de quoi en gagner une. Une fois sorti, le rouge redevient une couleur ordinaire :
          dépense tes arrêts sans gêne.
        </Tip>
      </TipSection>

      <TipSection title="Mener le contrat">
        <Tip label="Quand tu gagnes la mise, c'est toi qui choisis l'atout.">
          Ta <Strong>première carte nomme la couleur d'atout</Strong> — entame ta meilleure couleur,
          et joue tes atouts hauts pour les enlever aux défenseurs. Une fois ta mise atteinte,
          arrête de pousser; les levées en trop ne te donnent rien.
        </Tip>
        <Tip label="Dépense tes atouts comme de l'argent.">
          <Strong>Arrête de tirer les atouts dès qu'il ne reste que le maître dehors</Strong> — il
          gagnera quand il voudra, et le chasser échange deux des tiens contre un des leurs. Choisis
          ta première entame pareil : avec un atout solide, ouvre le 7 et tire; avec un atout mince,
          entame petit et garde les gros pour couper.
        </Tip>
        <Tip label="Fais-toi une chute pendant que c'est pas cher.">
          Une carte seule dans une couleur, c'est une coupe qui attend.{' '}
          <Strong>Jette-la sur la levée de quelqu'un d'autre avant la levée 3 ou 4</Strong>, et à
          partir de là tu coupes cette couleur au lieu de fournir. Cinq bleus et un rouge tout seul?
          Jette le rouge de bonne heure — ensuite chaque levée rouge, 0 rouge inclus, peut être à
          toi pour un atout.
        </Tip>
        <Tip label="Les levées 7 et 8 sont des aimants à défausses.">
          Plus personne n'a de cartes sûres à la fin — les dernières levées ramassent toutes les
          défausses forcées : les 0 bruns, les grosses cartes coincées, parfois même le 0 rouge.{' '}
          <Strong>Garde un atout pour la fin.</Strong> Et si tout le monde voit que tu dois gagner
          la dernière levée, perds-en une de bonne heure exprès pour que les défausses
          n'atterrissent pas toutes sur toi.
        </Tip>
        <Tip label="Gagne avec la plus petite des égales.">
          Avec des gagnantes qui se touchent — 7-6, ou 7-6-5 —{' '}
          <Strong>prends la levée avec la plus petite</Strong>. Elle gagne exactement les mêmes
          levées, mais le 5 qui gagne ne dit rien à la table, tandis que le 7 annonce où le 6 n'est
          pas. Une exception : si ton partenaire doit encore jouer et pourrait te donner le 0 rouge,{' '}
          <Strong>gagne gros et visible</Strong> — il ne dépose le +5 que sur une levée qu'il peut
          prouver gagnée.
        </Tip>
      </TipSection>

      <TipSection title="Défendre et déduire">
        <Tip label="Quand tu défends, prends tout.">
          Chaque point que tu gagnes, tu le <Strong>gardes</Strong> — ramasse tout ce que tu peux.
          Et si une levée de plus fait tomber les miseurs sous leur nombre, sacrifie n'importe quoi
          pour la gagner et <Strong>faire rater le contrat</Strong>.
        </Tip>
        <Tip label="Deuxième joue petit, troisième joue gros.">
          Deuxième à jouer sur une petite entame adverse? <Strong>Joue petit</Strong> — ton
          partenaire parle encore après eux. Troisième, et la carte de ton partenaire est en train
          de perdre? <Strong>Monte</Strong> : tu es la dernière chance pas chère de gagner la levée
          pour ton camp.
        </Tip>
        <Tip label="Fais couper le meneur, encore et encore.">
          <Strong>Quatre atouts derrière le meneur, c'est une arme.</Strong> Chaque fois que tu
          prends la main, entame la couleur où il est en chute et force-le à couper. Chaque coupe
          rapproche ses atouts des tiens — jusqu'à la ronde où c'est toi qui en as le plus.
        </Tip>
        <Tip label="Lis la première carte — avec un grain de sel.">
          La première carte du meneur nomme l'atout, alors c'est aussi une déclaration :{' '}
          <Strong>le 7 dit « couleur solide, je tire »</Strong>; une petite carte dit « atouts
          minces, je les garde pour couper ». Lis-la — puis rappelle-toi qu'un bon meneur sait que
          tu la lis, et va <Strong>ouvrir petit avec du gros jeu</Strong> pour te laisser deviner.
          Quand c'est toi qui mènes, fais exactement ça.
        </Tip>
        <Tip label="Ce qu'ils n'ont pas fait parle aussi.">
          Un joueur qui <Strong>n'a pas coupé</Strong> ta gagnante a encore de la couleur. Celui qui{' '}
          <Strong>a passé</Strong> aux mises est faible. Et un défenseur qui a laissé filer une
          levée rouge sans se battre n'avait pas peur que le 0 rouge y tombe — ça te dit où il n'est
          pas.
        </Tip>
        <Tip label="Compte ce qui est sorti.">
          Chaque carte jouée est publique. Suis les grosses cartes déjà sorties — les tiennes sont
          peut-être maintenant <Strong>imbattables</Strong> — et remarque qui{' '}
          <Strong>n'a pas fourni une couleur</Strong> : il n'en a plus, alors ne l'entame pas dans
          son atout.
        </Tip>
        <Tip label="Joue avec ton partenaire.">
          Si ton partenaire est déjà en train de gagner la levée, <Strong>joue petit</Strong> — ne
          dépasse jamais ton propre camp et ne gaspille pas un atout sur une levée que tu allais
          gagner de toute façon.
        </Tip>
      </TipSection>

      <TipSection title="Jouer pour le 41">
        <Tip label="Compte jusqu'à ton nombre, puis change de vitesse.">
          Une ronde contient <Strong>11 points</Strong>. En attaque, compte ce que tu as ramassé
          vers ta mise — dès qu'elle est faite, arrête de dépenser tes gagnantes et mets tes
          perdantes en sécurité. En défense, fais le même compte : dès que le contrat est décidé
          d'un bord ou de l'autre,{' '}
          <Strong>arrête de payer pour le contester et ramasse tous les points à ta portée</Strong>{' '}
          — les défenseurs gardent ce qu'ils prennent, alors aucune levée n'est passive.
        </Tip>
        <Tip label="Joue le pointage, pas juste ta main.">
          La première équipe à <Strong>41</Strong> finit la partie. Quand l'autre équipe est rendue
          à 35 ou plus, un petit contrat leur donne la partie — <Strong>mise pour bloquer</Strong>,
          même un cran au-dessus de ton confort. Loin derrière?{' '}
          <Strong>Le sans atout double la mise</Strong> — l'arme de rattrapage naturelle, et un
          risque inutile quand c'est toi qui mènes.
        </Tip>
      </TipSection>
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

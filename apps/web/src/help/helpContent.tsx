import {
  PlayingCard,
  SUIT_NAMES,
  SUIT_STYLES,
  SuitShape,
  type CardData,
  type Lang,
} from '@jaffre/ui';
import type { ReactNode } from 'react';
import { TEAMS } from '../teams.js';
import { G, Strong, TipExample } from './helpPrimitives.js';

export interface HelpCard {
  readonly title: Record<Lang, string>;
  /** en and fr ADJACENT — one card, one place, so structure can never drift. */
  readonly body: Record<Lang, ReactNode>;
}

export interface TipDef {
  readonly label: Record<Lang, string>;
  readonly body: Record<Lang, ReactNode>;
}

export interface TipSectionDef {
  readonly title: Record<Lang, string>;
  readonly tips: readonly TipDef[];
}

// ---------------------------------------------------------------------------
// Shared visuals — the art is identical in both languages; only the words
// around it differ. Defined once here and referenced from both bodies below,
// so a card can never gain an image in one language and not the other.
// ---------------------------------------------------------------------------

const LEGEND_SUITS = ['red', 'brown', 'green', 'blue'] as const;

/** The suit legend row under "The basics" — same layout, per-language names. */
function suitLegend(lang: Lang): ReactNode {
  return (
    <p aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
      {LEGEND_SUITS.map((suit) => (
        <span key={suit} className="flex items-center gap-1.5 whitespace-nowrap">
          <SuitShape suit={suit} size="1.05em" />
          <span className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
            {lang === 'fr' ? SUIT_NAMES.fr[suit] : SUIT_STYLES[suit].label}
          </span>
        </span>
      ))}
    </p>
  );
}

const RED_0: CardData = { suit: 'red', value: 0 };
const BROWN_0: CardData = { suit: 'brown', value: 0 };

/** The Points card's two bonhomme figures — same cards in both languages,
 * only the glossary-linked caption text differs. */
function pointsFigures(lang: Lang): ReactNode {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-2">
      <figure className="flex flex-col items-center gap-1.5">
        <PlayingCard card={RED_0} />
        <figcaption className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
          <G id="red0">{lang === 'fr' ? 'Rouge 0' : 'Red 0'}</G> ·{' '}
          <span className="font-semibold text-(--color-suit-green)">+5 points</span>
        </figcaption>
      </figure>
      <figure className="flex flex-col items-center gap-1.5">
        <PlayingCard card={BROWN_0} />
        <figcaption className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
          <G id="brown0">{lang === 'fr' ? 'Brun 0' : 'Brown 0'}</G> ·{' '}
          <span className="font-semibold text-(--color-suit-red)">−3 points</span>
        </figcaption>
      </figure>
    </div>
  );
}

/** Card data reused by a matched pair of TipExamples (en + fr) — the cards
 * shown are the same in both languages; only the caption text differs. */
interface ExampleCards {
  readonly trick: readonly CardData[];
  readonly you: CardData;
}

const EX_RED0_FALLS: ExampleCards = {
  trick: [{ suit: 'red', value: 7 }],
  you: { suit: 'red', value: 0 },
};
const EX_BROWN0_GIFT: ExampleCards = {
  trick: [
    { suit: 'green', value: 7 },
    { suit: 'green', value: 4 },
  ],
  you: { suit: 'brown', value: 0 },
};
const EX_BROWN0_ESCAPE_HATCH: ExampleCards = {
  trick: [{ suit: 'brown', value: 6 }],
  you: { suit: 'brown', value: 2 },
};
const EX_BROWN0_INSTEAD_OF_RUFF: ExampleCards = {
  trick: [
    { suit: 'blue', value: 7 },
    { suit: 'blue', value: 3 },
  ],
  you: { suit: 'brown', value: 0 },
};
const EX_VOID_EARLY: ExampleCards = {
  trick: [
    { suit: 'green', value: 7 },
    { suit: 'green', value: 5 },
  ],
  you: { suit: 'red', value: 1 },
};
const EX_LOWEST_OF_EQUALS: ExampleCards = {
  trick: [
    { suit: 'green', value: 4 },
    { suit: 'green', value: 3 },
    { suit: 'green', value: 2 },
  ],
  you: { suit: 'green', value: 5 },
};

// ---------------------------------------------------------------------------
// Rules — taught in learning order: shape + goal, then the two mechanics that
// define a trick, then what a trick is worth, then the auction that starts a
// round, then how the round becomes a score, then the on-screen chrome.
// ---------------------------------------------------------------------------

export const RULES: readonly HelpCard[] = [
  {
    title: { en: 'The basics', fr: 'Les bases' },
    body: {
      en: (
        <>
          <p>
            Four players, two teams — <Strong>you and the player across from you</Strong> (
            {TEAMS[0].label} vs {TEAMS[1].label}). The deck has <Strong>32 cards</Strong>: four
            suits, values 0–7. Everyone is dealt <Strong>8 cards</Strong>.
          </p>
          {suitLegend('en')}
          <p>
            Each round is one quick auction, then 8 tricks.{' '}
            <Strong>First team to 41 points wins the game.</Strong>
          </p>
        </>
      ),
      fr: (
        <>
          <p>
            Quatre joueurs, deux équipes — <Strong>toi et le joueur en face de toi</Strong> (Équipe
            Soleil c. Équipe Lune). Le paquet a <Strong>32 cartes</Strong> : quatre couleurs,
            valeurs de 0 à 7. Chaque joueur reçoit <Strong>8 cartes</Strong>.
          </p>
          {suitLegend('fr')}
          <p>
            Une ronde, c'est une mise chacun, puis 8 levées. La première équipe à{' '}
            <Strong>41 points</Strong> gagne la partie.
          </p>
        </>
      ),
    },
  },
  {
    title: { en: 'Tricks & trump', fr: "Les levées et l'atout" },
    body: {
      en: (
        <>
          <p>
            Everyone plays <Strong>one card each</Strong>, in turn. You must{' '}
            <Strong>follow the led suit</Strong> whenever you can. The{' '}
            <Strong>highest card of the led suit</Strong> wins the <G id="levee">trick</G> — unless
            a trump was played, then the <Strong>highest trump</Strong> wins. The winner leads the
            next trick.
          </p>
          <p>
            The <Strong>first card the auction winner leads</Strong> sets the{' '}
            <G id="atout">trump suit</G> for the whole round — a <G id="sansatout">sans-atout</G>{' '}
            bid has none.
          </p>
        </>
      ),
      fr: (
        <>
          <p>
            Chacun joue <Strong>une carte à son tour</Strong>. Tu dois{' '}
            <Strong>fournir la couleur demandée</Strong> chaque fois que tu le peux. La{' '}
            <Strong>plus haute carte de la couleur demandée</Strong> remporte la{' '}
            <G id="levee">levée</G> — à moins qu'un atout ait été joué, auquel cas l'
            <Strong>atout le plus haut</Strong> gagne. Le gagnant entame la levée suivante.
          </p>
          <p>
            La <Strong>première carte jouée par le gagnant des mises</Strong> détermine l'
            <G id="atout">atout</G> de la ronde — une mise <G id="sansatout">sans atout</G> n'en a
            pas.
          </p>
        </>
      ),
    },
  },
  {
    title: { en: 'Points', fr: 'Les points' },
    body: {
      en: (
        <>
          <p>
            Every trick is worth <Strong>1 point</Strong> — and two cards carry a surprise for
            whoever takes the trick they are in:
          </p>
          {pointsFigures('en')}
          <p>
            8 tricks + 5 − 3 means a round always totals <Strong>10 points</Strong>.
          </p>
        </>
      ),
      fr: (
        <>
          <p>
            Chaque levée vaut <Strong>1 point</Strong> — et deux cartes réservent une surprise à qui
            prend la levée où elles se trouvent :
          </p>
          {pointsFigures('fr')}
          <p>
            8 levées + 5 − 3 : une ronde totalise toujours <Strong>10 points</Strong>.
          </p>
        </>
      ),
    },
  },
  {
    title: { en: 'Bidding', fr: 'Les mises' },
    body: {
      en: (
        <>
          <p>
            One round only — each player speaks once, dealer last:{' '}
            <Strong>bid 7 to 12 trick points</Strong> or pass.
          </p>
          <p>
            Bidding <G id="sansatout">sans atout</G> means playing with no trump and{' '}
            <Strong>doubles the stake</Strong> — and an equal bid played sans atout outbids the
            plain one.
          </p>
          <p>
            Speaking last, the <G id="brasseur">dealer</G> has the{' '}
            <Strong>privilege of matching</Strong> the standing bid — an equal bid takes the
            contract from it. If all four players pass, the dealer is forced to a bid of 7.
          </p>
        </>
      ),
      fr: (
        <>
          <p>
            Une seule ronde de mises — chaque joueur parle une fois, le brasseur en dernier :{' '}
            <Strong>mise de 7 à 12 points de levées</Strong>, ou passe.
          </p>
          <p>
            Miser <G id="sansatout">sans atout</G> veut dire jouer sans couleur d'atout et{' '}
            <Strong>double les points en jeu (×2)</Strong> — et une mise égale jouée sans atout
            l'emporte sur la mise ordinaire.
          </p>
          <p>
            Parlant en dernier, le <G id="brasseur">brasseur</G> a le{' '}
            <Strong>privilège d'égaler</Strong> la mise en cours — une mise égale lui donne le
            contrat. Si les quatre joueurs passent, le brasseur est forcé de miser 7.
          </p>
        </>
      ),
    },
  },
  {
    title: { en: 'Scoring', fr: 'Le pointage' },
    body: {
      en: (
        <p>
          Make your bid and your team scores <Strong>+bid</Strong> (×2 sans atout); miss it and you
          score <Strong>−bid</Strong> (×2 sans atout). The defenders always keep the trick points
          they took. If both teams cross <Strong>41</Strong> in the same round, the higher total
          takes the game (the contract team on an exact tie).
        </p>
      ),
      fr: (
        <p>
          Réussis ton contrat et ton équipe marque <Strong>le montant misé</Strong> (×2 sans atout);
          rate-le et elle <Strong>le perd</Strong> (×2 sans atout). Les défenseurs gardent toujours
          les points de levées qu'ils ont pris. Si les deux équipes passent <Strong>41</Strong> dans
          la même ronde, le plus haut total l'emporte (l'équipe du contrat en cas d'égalité
          parfaite).
        </p>
      ),
    },
  },
  {
    title: { en: 'Reading the table', fr: 'Lire la table' },
    body: {
      en: (
        <ul className="list-disc space-y-1 pl-4">
          <li>
            The <Strong>top bar</Strong> shows score · bid · trump; tap it for round details, the
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
      ),
      fr: (
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
      ),
    },
  },
];

// ---------------------------------------------------------------------------
// Advanced strategy tips — six sections, simple → advanced, ending on the
// optional hail-mary gamble. Order and content unchanged from before; this is
// a pure restructure into data.
// ---------------------------------------------------------------------------

export const TIP_SECTIONS: readonly TipSectionDef[] = [
  {
    title: { en: 'Bidding & hand reading', fr: 'Miser et lire ta main' },
    tips: [
      {
        label: {
          en: 'Bidding is about your best suit.',
          fr: "Miser, c'est une question de meilleure couleur.",
        },
        body: {
          en: (
            <>
              Size up your hand once for each suit as trump — your longest, strongest suit is your
              real strength. Then bid the <Strong>smallest number that wins the auction</Strong>:
              making 12 on a bid of 7 still only scores 7.
            </>
          ),
          fr: (
            <>
              Évalue ta main une fois pour chaque couleur comme atout — ta couleur la plus longue et
              la plus forte, c'est ta vraie force. Ensuite, mise le{' '}
              <Strong>plus petit nombre qui remporte les mises</Strong> : faire 12 sur une mise de 7
              ne rapporte quand même que 7.
            </>
          ),
        },
      },
      {
        label: { en: 'Count your sure tricks.', fr: 'Compte tes levées sûres.' },
        body: {
          en: (
            <>
              Every <Strong>7 is a trick</Strong>, and a 6 with cover — 7-6 together, or a 6 with a
              spare card behind it — usually is too. Add about one trick of partner help, and
              that&rsquo;s the number your bid has to live on.
            </>
          ),
          fr: (
            <>
              Chaque <Strong>7 est une levée</Strong>, et un 6 protégé — 7-6 ensemble, ou un 6 avec
              une carte de réserve derrière — l'est presque toujours aussi. Ajoute environ une levée
              d'aide de ton partenaire : c'est le nombre sur lequel ta mise doit vivre.
            </>
          ),
        },
      },
      {
        label: { en: 'Count your losers too.', fr: 'Compte tes perdantes aussi.' },
        body: {
          en: (
            <>
              In each suit, count{' '}
              <Strong>one loser for each of the 7, 6 and 5 you&rsquo;re missing</Strong> — but never
              more losers than you hold cards in that suit. Eight minus your losers is roughly your
              tricks. When your two counts disagree, <Strong>trust the lower one</Strong>.
            </>
          ),
          fr: (
            <>
              Dans chaque couleur, compte{' '}
              <Strong>une perdante pour chaque 7, 6 et 5 qui te manque</Strong> — mais jamais plus
              de perdantes que de cartes dans la couleur. Huit moins tes perdantes, c'est à peu près
              tes levées. Quand tes deux comptes se contredisent,{' '}
              <Strong>fie-toi au plus bas</Strong>.
            </>
          ),
        },
      },
      {
        label: { en: 'Shape beats high cards.', fr: 'La forme bat les grosses cartes.' },
        body: {
          en: (
            <>
              A <Strong>void plus three trumps</Strong> is worth about an extra trick — you ruff
              instead of following. And <Strong>7-6 together</Strong> in one long suit takes more
              tricks than two lonely 7s scattered around: concentrated strength keeps you on lead.
            </>
          ),
          fr: (
            <>
              Une <Strong>chute avec trois atouts</Strong> vaut à peu près une levée de plus — tu
              coupes au lieu de fournir. Et <Strong>7-6 ensemble</Strong> dans une longue couleur
              prend plus de levées que deux 7 éparpillés : la force concentrée te garde en main.
            </>
          ),
        },
      },
      {
        label: {
          en: 'Sans atout wants running suits.',
          fr: 'Le sans atout veut des couleurs qui déroulent.',
        },
        body: {
          en: (
            <>
              The dream hand: <Strong>two suits headed by 7-6</Strong> (or 7-6-5) and a stopper — a
              7 or a guarded 6 — in what&rsquo;s left. The contract winner leads first, so you start
              cashing before the defenders ever get in.{' '}
              <Strong>Never bid sans atout with an unstopped suit</Strong>: one lead there and they
              run it against you.
            </>
          ),
          fr: (
            <>
              La main de rêve : <Strong>deux couleurs menées par 7-6</Strong> (ou 7-6-5) et un arrêt
              — un 7 ou un 6 protégé — dans le reste. Le gagnant du contrat entame en premier, alors
              tu encaisses avant même que les défenseurs touchent au jeu.{' '}
              <Strong>Ne mise jamais sans atout avec une couleur sans arrêt</Strong> : une entame là
              et ils la déroulent contre toi.
            </>
          ),
        },
      },
      {
        label: {
          en: 'Forced to 7? Play your longest suit.',
          fr: 'Forcé à 7? Joue ta plus longue couleur.',
        },
        body: {
          en: (
            <>
              All four pass and the dealer is stuck with 7. Don&rsquo;t panic:{' '}
              <Strong>name your longest suit trump</Strong> even without the 7, lean on your
              partner&rsquo;s tricks, and use every trick the opponents win to unload the brown 0.
              Seven is reachable with a bad hand and a plan.
            </>
          ),
          fr: (
            <>
              Quatre passes et le brasseur est pris avec 7. Panique pas :{' '}
              <Strong>nomme ta plus longue couleur comme atout</Strong> même sans le 7, appuie-toi
              sur les levées de ton partenaire, et profite de chaque levée que les adversaires
              gagnent pour te débarrasser du 0 brun. Sept, ça se fait avec une mauvaise main et un
              plan.
            </>
          ),
        },
      },
    ],
  },
  {
    title: {
      en: 'The two bonhommes (red 0 & brown 0)',
      fr: 'Les deux bonshommes (0 rouge et 0 brun)',
    },
    tips: [
      {
        label: {
          en: 'The red 0 is the whole game (+5).',
          fr: "Le zéro rouge, c'est toute la partie (+5).",
        },
        body: {
          en: (
            <>
              Never lead it and never throw it away. <Strong>Cash it</Strong> on a trick your
              partner has already won. On defense, hold a high trump for the trick it shows up in.
            </>
          ),
          fr: (
            <>
              Ne l'entame jamais et ne le jette jamais. <Strong>Encaisse-le</Strong> sur une levée
              que ton partenaire a déjà gagnée. En défense, garde un gros atout pour la levée où il
              sort.
            </>
          ),
        },
      },
      {
        label: {
          en: 'Force it out — or feed it to your partner.',
          fr: 'Fais-le sortir — ou donne-le à ton partenaire.',
        },
        body: {
          en: (
            <>
              Holding <Strong>red 7-6</Strong>? Lead red: whoever holds the red 0 has to follow, and
              it falls <Strong>under your winner</Strong> for +5. Holding the red 0 yourself while
              void in the suit led?{' '}
              <Strong>Drop it onto a trick your partner has already won.</Strong>
              <TipExample
                trick={EX_RED0_FALLS.trick}
                you={EX_RED0_FALLS.you}
                caption="You lead the red 7 — the red 0 must follow, and falls under your winner: +5."
              />
            </>
          ),
          fr: (
            <>
              Tu tiens <Strong>7-6 de rouge</Strong>? Entame rouge : celui qui a le 0 rouge doit
              fournir, et il tombe <Strong>sous ta gagnante</Strong> pour +5. C'est toi qui as le 0
              rouge et tu ne peux pas fournir?{' '}
              <Strong>Dépose-le sur une levée que ton partenaire a déjà gagnée.</Strong>
              <TipExample
                trick={EX_RED0_FALLS.trick}
                you={EX_RED0_FALLS.you}
                caption="Tu entames le 7 rouge — le 0 rouge doit fournir et tombe sous ta gagnante : +5."
              />
            </>
          ),
        },
      },
      {
        label: {
          en: 'The brown 0 is a gift you re-gift (−3).',
          fr: "Le zéro brun, c'est un cadeau que tu refiles (−3).",
        },
        body: {
          en: (
            <>
              Hand it to a trick the <Strong>opponents</Strong> are winning — best of all when you
              can&rsquo;t follow suit and would waste a card anyway. Never dump it on your partner.
              <TipExample
                trick={EX_BROWN0_GIFT.trick}
                you={EX_BROWN0_GIFT.you}
                caption="Their green 7 has the trick — your brown 0 hitches a ride: −3 for them."
              />
            </>
          ),
          fr: (
            <>
              Donne-le sur une levée que les <Strong>adversaires</Strong> sont en train de gagner —
              encore mieux quand tu ne peux pas fournir et que tu gaspillerais une carte de toute
              façon. Ne le refile jamais à ton partenaire.
              <TipExample
                trick={EX_BROWN0_GIFT.trick}
                you={EX_BROWN0_GIFT.you}
                caption="Le 7 vert adverse tient la levée — ton 0 brun embarque dessus : −3 pour eux."
              />
            </>
          ),
        },
      },
      {
        label: {
          en: 'Keep a low brown as your escape hatch.',
          fr: 'Garde un petit brun comme porte de sortie.',
        },
        body: {
          en: (
            <>
              While the brown 0 is in your hand, <Strong>keep a low brown beside it</Strong>. When
              brown is led at you, duck with the low one — never win the very trick your −3 has to
              land in. The brown 0 only leaves on tricks the opponents are winning.
              <TipExample
                trick={EX_BROWN0_ESCAPE_HATCH.trick}
                you={EX_BROWN0_ESCAPE_HATCH.you}
                caption="Brown led at you — duck with the 2, and the 0 stays safe for an opponent's trick."
              />
            </>
          ),
          fr: (
            <>
              Tant que le 0 brun est dans ta main, <Strong>garde un petit brun à côté</Strong>.
              Quand on entame brun vers toi, fournis le petit et perds la levée — ne gagne jamais la
              levée où ton −3 doit atterrir. Le 0 brun sort seulement sur une levée que les
              adversaires gagnent.
              <TipExample
                trick={EX_BROWN0_ESCAPE_HATCH.trick}
                you={EX_BROWN0_ESCAPE_HATCH.you}
                caption="On entame brun vers toi — fournis le 2, pis le 0 reste en sécurité pour une levée adverse."
              />
            </>
          ),
        },
      },
      {
        label: {
          en: 'Throw the brown 0 instead of ruffing.',
          fr: 'Jette le zéro brun au lieu de couper.',
        },
        body: {
          en: (
            <>
              When a trick is already lost — or winning it gains you nothing — don&rsquo;t spend a
              trump on it. <Strong>Discard the brown 0 instead</Strong>: you lose the trick either
              way, and now it costs them 2.
              <TipExample
                trick={EX_BROWN0_INSTEAD_OF_RUFF.trick}
                you={EX_BROWN0_INSTEAD_OF_RUFF.you}
                caption="Their blue 7 is boss — don't spend a trump; the brown 0 rides along instead."
              />
            </>
          ),
          fr: (
            <>
              Quand une levée est déjà perdue — ou que la gagner ne te donne rien — ne dépense pas
              un atout dessus. <Strong>Défausse le 0 brun à la place</Strong> : tu perds la levée de
              toute façon, et maintenant elle leur coûte 3.
              <TipExample
                trick={EX_BROWN0_INSTEAD_OF_RUFF.trick}
                you={EX_BROWN0_INSTEAD_OF_RUFF.you}
                caption="Leur 7 bleu est maître — gaspille pas d'atout; le 0 brun embarque à la place."
              />
            </>
          ),
        },
      },
      {
        label: {
          en: 'Ask the two questions every trick.',
          fr: 'Pose-toi les deux questions à chaque levée.',
        },
        body: {
          en: (
            <>
              Before you play: <Strong>is the red 0 still out? is the brown 0 still out?</Strong>{' '}
              While the red 0 lives, any red trick can suddenly be worth up to 6 points — keep a way
              to win one. Once it&rsquo;s gone, red is just another suit: spend your stoppers
              freely.
            </>
          ),
          fr: (
            <>
              Avant de jouer : <Strong>le 0 rouge est-il encore en jeu? le 0 brun aussi?</Strong>{' '}
              Tant que le 0 rouge circule, n'importe quelle levée rouge peut soudain valoir jusqu'à
              6 points — garde de quoi en gagner une. Une fois sorti, le rouge redevient une couleur
              ordinaire : dépense tes arrêts sans gêne.
            </>
          ),
        },
      },
    ],
  },
  {
    title: { en: 'Declarer play', fr: 'Jouer le contrat' },
    tips: [
      {
        label: {
          en: 'When you win the bid, you set trump.',
          fr: "Quand tu gagnes la mise, c'est toi qui choisis l'atout.",
        },
        body: {
          en: (
            <>
              Your <Strong>first card names the trump suit</Strong> — lead your best suit, and lead
              trumps high to strip them from the defenders. Once your points reach your bid, stop
              pushing; extra tricks are worthless to you.
            </>
          ),
          fr: (
            <>
              Ta <Strong>première carte nomme la couleur d'atout</Strong> — entame ta meilleure
              couleur, et joue tes atouts hauts pour les enlever aux défenseurs. Une fois ta mise
              atteinte, arrête de pousser; les levées en trop ne te donnent rien.
            </>
          ),
        },
      },
      {
        label: { en: 'Spend trumps like money.', fr: "Dépense tes atouts comme de l'argent." },
        body: {
          en: (
            <>
              <Strong>Stop drawing the moment only the master trump is left out</Strong> — it wins
              whenever it wants, and chasing it trades two of yours for one of theirs. Choose your
              first lead the same way: with a strong trump suit, open the 7 and draw; with a thin
              one, lead a low trump and keep the big ones for ruffs.
            </>
          ),
          fr: (
            <>
              <Strong>Arrête de tirer les atouts dès qu'il ne reste que le maître en jeu</Strong> —
              il gagnera quand il voudra, et le chasser échange deux des tiens contre un des leurs.
              Choisis ta première entame pareil : avec un atout solide, ouvre le 7 et tire; avec un
              atout mince, entame petit et garde les gros pour couper.
            </>
          ),
        },
      },
      {
        label: {
          en: 'Make a void while it&rsquo;s cheap.',
          fr: "Fais-toi une chute pendant que c'est pas cher.",
        },
        body: {
          en: (
            <>
              A lone card in a side suit is a ruff waiting to happen.{' '}
              <Strong>Shed it on someone else&rsquo;s trick by trick 3 or 4</Strong>, and from then
              on you ruff that suit instead of following. Five blues and a lone red? Throw the red
              early — then every red trick, red 0 included, can be yours for a trump.
              <TipExample
                trick={EX_VOID_EARLY.trick}
                you={EX_VOID_EARLY.you}
                caption="Their trick anyway — shed your lone red 1; from now on, red tricks meet your trumps."
              />
            </>
          ),
          fr: (
            <>
              Une carte seule dans une couleur, c'est une coupe qui attend.{' '}
              <Strong>Jette-la sur la levée de quelqu'un d'autre d'ici la levée 3 ou 4</Strong>, et
              à partir de là tu coupes cette couleur au lieu de fournir. Cinq bleus et un rouge tout
              seul? Jette le rouge de bonne heure — ensuite chaque levée rouge, 0 rouge inclus, peut
              être à toi pour un atout.
              <TipExample
                trick={EX_VOID_EARLY.trick}
                you={EX_VOID_EARLY.you}
                caption="Leur levée de toute façon — jette ton 1 rouge seul; les prochaines levées rouges rencontrent tes atouts."
              />
            </>
          ),
        },
      },
      {
        label: {
          en: 'Tricks 7 and 8 are dump magnets.',
          fr: 'Les levées 7 et 8 sont des aimants à défausses.',
        },
        body: {
          en: (
            <>
              Nobody has safe cards left at the end — the last tricks collect every forced discard:
              brown 0s, stranded high cards, sometimes even the red 0.{' '}
              <Strong>Keep one trump for the finish.</Strong> And if everyone can see you must win
              the last trick, lose an early one on purpose so the dumps don&rsquo;t all land on you.
            </>
          ),
          fr: (
            <>
              Plus personne n'a de cartes sûres à la fin — les dernières levées ramassent toutes les
              défausses forcées : les 0 bruns, les grosses cartes coincées, parfois même le 0 rouge.{' '}
              <Strong>Garde un atout pour la fin.</Strong> Et si tout le monde voit que tu dois
              gagner la dernière levée, perds-en une de bonne heure exprès pour que les défausses
              n'atterrissent pas toutes sur toi.
            </>
          ),
        },
      },
      {
        label: {
          en: 'Win with the lowest of equals.',
          fr: 'Gagne avec la plus petite des égales.',
        },
        body: {
          en: (
            <>
              With touching winners — 7-6, or 7-6-5 —{' '}
              <Strong>take the trick with the lowest of them</Strong>. It wins exactly the same
              tricks, but the 5 winning tells the table nothing, while the 7 announces where the 6
              isn&rsquo;t. One exception: if your partner still has to play and might feed you the
              red 0, <Strong>win big and visible</Strong> — partner only drops the +5 on a trick
              they can prove is yours.
              <TipExample
                trick={EX_LOWEST_OF_EQUALS.trick}
                you={EX_LOWEST_OF_EQUALS.you}
                caption="Holding 7-6-5: the 5 wins this trick just as surely — and tells the table nothing."
              />
            </>
          ),
          fr: (
            <>
              Avec des gagnantes qui se touchent — 7-6, ou 7-6-5 —{' '}
              <Strong>prends la levée avec la plus petite</Strong>. Elle gagne exactement les mêmes
              levées, mais le 5 qui gagne ne dit rien à la table, tandis que le 7 annonce où le 6
              n'est pas. Une exception : si ton partenaire doit encore jouer et pourrait te donner
              le 0 rouge, <Strong>gagne gros et visible</Strong> — il ne dépose le +5 que sur une
              levée qu'il peut prouver gagnée.
              <TipExample
                trick={EX_LOWEST_OF_EQUALS.trick}
                you={EX_LOWEST_OF_EQUALS.you}
                caption="Avec 7-6-5 : le 5 gagne cette levée aussi sûrement — et ne dit rien à la table."
              />
            </>
          ),
        },
      },
    ],
  },
  {
    title: { en: 'Defense & inference', fr: 'Défendre et déduire' },
    tips: [
      {
        label: {
          en: "When you're defending, take everything.",
          fr: 'Quand tu défends, prends tout.',
        },
        body: {
          en: (
            <>
              Every point you win, you <Strong>keep</Strong> — so grab all you can. And if one more
              trick would push the bettors below their number, spend anything to win it and{' '}
              <Strong>set the contract</Strong>.
            </>
          ),
          fr: (
            <>
              Chaque point que tu gagnes, tu le <Strong>gardes</Strong> — ramasse tout ce que tu
              peux. Et si une levée de plus fait tomber les miseurs sous leur nombre, sacrifie
              n'importe quoi pour la gagner et <Strong>faire rater le contrat</Strong>.
            </>
          ),
        },
      },
      {
        label: {
          en: 'Second hand low, third hand high.',
          fr: 'Deuxième joue petit, troisième joue gros.',
        },
        body: {
          en: (
            <>
              Second to play on an opponent&rsquo;s low lead? <Strong>Play low</Strong> — your
              partner still speaks after them. Third, with your partner&rsquo;s card losing?{' '}
              <Strong>Go high</Strong>: you&rsquo;re the last cheap chance to win the trick for your
              side.
            </>
          ),
          fr: (
            <>
              Deuxième à jouer sur une petite entame adverse? <Strong>Joue petit</Strong> — ton
              partenaire joue encore après eux. Troisième, et la carte de ton partenaire est en
              train de perdre? <Strong>Monte</Strong> : tu es la dernière chance pas chère de gagner
              la levée pour ton camp.
            </>
          ),
        },
      },
      {
        label: {
          en: 'Make the declarer ruff, and ruff again.',
          fr: 'Fais couper le preneur, encore et encore.',
        },
        body: {
          en: (
            <>
              <Strong>Four trumps behind the declarer is a weapon.</Strong> Every time you get in,
              lead the suit they&rsquo;re <G id="chute">void</G> in and force them to trump it. Each{' '}
              <G id="coupe">ruff</G> shortens their trumps toward yours — until the round comes when
              you hold more than they do.
            </>
          ),
          fr: (
            <>
              <Strong>Quatre atouts derrière le preneur, c'est une arme.</Strong> Chaque fois que tu
              prends la main, entame la couleur où il est en <G id="chute">chute</G> et force-le à
              couper. Chaque <G id="coupe">coupe</G> rapproche ses atouts des tiens — jusqu'à la
              ronde où c'est toi qui en as le plus.
            </>
          ),
        },
      },
      {
        label: {
          en: 'Read the first card — with a grain of salt.',
          fr: 'Lis la première carte — avec un grain de sel.',
        },
        body: {
          en: (
            <>
              The declarer&rsquo;s first card names trump, so it&rsquo;s also a statement:{' '}
              <Strong>the 7 says &ldquo;strong suit, I&rsquo;m drawing&rdquo;</Strong>; a low card
              says &ldquo;thin trumps, saving them for ruffs&rdquo;. Read it — then remember a good
              declarer knows you&rsquo;re reading it, and will{' '}
              <Strong>open low from strength</Strong> to leave you guessing. When you declare, do
              exactly that.
            </>
          ),
          fr: (
            <>
              La première carte du preneur nomme l'atout, alors c'est aussi une déclaration :{' '}
              <Strong>le 7 dit « couleur solide, je tire »</Strong>; une petite carte dit « atouts
              minces, je les garde pour couper ». Lis-la — puis rappelle-toi qu'un bon preneur sait
              que tu la lis, et va <Strong>ouvrir petit avec du gros jeu</Strong> pour te laisser
              deviner. Quand c'est toi qui prends, fais exactement ça.
            </>
          ),
        },
      },
      {
        label: {
          en: "What they didn't do talks too.",
          fr: "Ce qu'ils n'ont pas fait parle aussi.",
        },
        body: {
          en: (
            <>
              A player who <Strong>didn&rsquo;t ruff</Strong> your winner still holds the suit.
              Whoever <Strong>passed</Strong> in the auction is weak. And a defender who calmly
              ducked a red trick wasn&rsquo;t afraid of the red 0 landing there — that tells you
              where it isn&rsquo;t.
            </>
          ),
          fr: (
            <>
              Un joueur qui <Strong>n'a pas coupé</Strong> ta gagnante a encore de la couleur. Celui
              qui <Strong>a passé</Strong> aux mises est faible. Et un défenseur qui a laissé filer
              une levée rouge sans se battre n'avait pas peur que le 0 rouge y tombe — ça te dit où
              il n'est pas.
            </>
          ),
        },
      },
      {
        label: { en: "Count what's been played.", fr: 'Compte ce qui est sorti.' },
        body: {
          en: (
            <>
              Every played card is public. Track the high cards that are gone — yours may now be{' '}
              <G id="maitre">unbeatable</G> — and note who <Strong>failed to follow a suit</Strong>:
              they&rsquo;re out of it, so don&rsquo;t lead it into their trump.
            </>
          ),
          fr: (
            <>
              Chaque carte jouée est publique. Suis les grosses cartes déjà sorties — les tiennes
              sont peut-être maintenant <G id="maitre">imbattables</G> — et remarque qui{' '}
              <Strong>n'a pas fourni une couleur</Strong> : il n'en a plus, alors ne l'entame pas
              dans son atout.
            </>
          ),
        },
      },
      {
        label: { en: 'Play with your partner.', fr: 'Joue avec ton partenaire.' },
        body: {
          en: (
            <>
              If your partner is already winning the trick, <Strong>play low</Strong> — never
              overtake your own side or waste a trump on a trick you were going to win anyway.
            </>
          ),
          fr: (
            <>
              Si ton partenaire est déjà en train de gagner la levée, <Strong>joue petit</Strong> —
              ne dépasse jamais ton propre camp et ne gaspille pas un atout sur une levée que tu
              allais gagner de toute façon.
            </>
          ),
        },
      },
    ],
  },
  {
    title: { en: 'Playing to 41', fr: 'Jouer pour le 41' },
    tips: [
      {
        label: {
          en: 'Count to your number, then change gears.',
          fr: "Compte jusqu'à ton nombre, puis change de vitesse.",
        },
        body: {
          en: (
            <>
              A round holds <Strong>10 points</Strong>. Declaring, count what you&rsquo;ve captured
              toward your bid — the moment it&rsquo;s home, stop spending winners and start shedding
              losers safely. Defending, run the same count: once the contract is decided either way,{' '}
              <Strong>stop paying to fight it and grab every point in reach</Strong> — defenders
              keep what they take, so there is no passive trick.
            </>
          ),
          fr: (
            <>
              Une ronde contient <Strong>10 points</Strong>. En attaque, compte ce que tu as ramassé
              vers ta mise — dès qu'elle est faite, arrête de dépenser tes gagnantes et mets tes
              perdantes en sécurité. En défense, fais le même compte : dès que le contrat est décidé
              d'un bord ou de l'autre,{' '}
              <Strong>
                arrête de payer pour le contester et ramasse tous les points à ta portée
              </Strong>{' '}
              — les défenseurs gardent ce qu'ils prennent, alors aucune levée n'est passive.
            </>
          ),
        },
      },
      {
        label: {
          en: 'Play the score, not just the hand.',
          fr: 'Joue le pointage, pas juste ta main.',
        },
        body: {
          en: (
            <>
              First team to <Strong>41</Strong> ends it. When the other team sits at 35 or more, a
              cheap contract hands them the game — <Strong>bid to deny</Strong>, even a notch past
              comfort. Trailing badly? <G id="sansatout">Sans atout</G>{' '}
              <Strong>doubles the stake</Strong> — the natural catch-up weapon, and a needless risk
              when you&rsquo;re the team ahead.
            </>
          ),
          fr: (
            <>
              La première équipe à <Strong>41</Strong> finit la partie. Quand l'autre équipe est
              rendue à 35 ou plus, un petit contrat leur donne la partie —{' '}
              <Strong>mise pour bloquer</Strong>, même un cran au-dessus de ton confort. Loin
              derrière? <G id="sansatout">Le sans atout</G> <Strong>double la mise</Strong> — l'arme
              de rattrapage naturelle, et un risque inutile quand c'est ton équipe qui mène au
              pointage.
            </>
          ),
        },
      },
    ],
  },
  {
    // The hail-mary is an OPTIONAL table rule and a pure gamble — it lives
    // with the advanced tips, not in the base rules a first-timer reads.
    title: { en: 'Hail-Mary 12 sans atout', fr: '12 sans atout — tout ou rien' },
    tips: [
      {
        label: {
          en: 'Win the game on the spot — or lose it.',
          fr: "Gagne la partie d'un coup — ou perds-la.",
        },
        body: {
          en: (
            <>
              An <Strong>optional table rule</Strong>, switched on in the lobby before the game.
              Call <G id="hailmary">12 sans atout</G> and make it — your team{' '}
              <Strong>wins the whole game on the spot</Strong>. Miss it and you{' '}
              <Strong>lose the game outright</Strong>, whatever the score. It is the comeback gamble
              when you are far behind.
            </>
          ),
          fr: (
            <>
              Une <Strong>règle de table optionnelle</Strong>, activée dans le salon avant la
              partie. Demande <G id="hailmary">12 sans atout</G> et réussis-la — ton équipe{' '}
              <Strong>gagne toute la partie sur-le-champ</Strong>. Rate-la et tu{' '}
              <Strong>perds la partie d'un coup</Strong>, peu importe le pointage. C'est le pari de
              remontée quand tu tires de l'arrière.
            </>
          ),
        },
      },
      {
        label: {
          en: '12 is more than a clean sweep.',
          fr: "12, c'est plus que ramasser les huit levées.",
        },
        body: {
          en: (
            <>
              Making 12 means <Strong>12 trick points</Strong>: take every trick but hand the{' '}
              <G id="brown0">brown 0</G> to the other team — a clean sweep of all eight is only 10.
            </>
          ),
          fr: (
            <>
              Réussir 12, ça veut dire <Strong>12 points de levées</Strong> : prends toutes les
              levées mais refile le <G id="brown0">0 brun</G> à l'autre équipe — ramasser les huit
              levées n'en fait que 10.
            </>
          ),
        },
      },
    ],
  },
];

import { useEffect, useState, type CSSProperties } from 'react';
import {
  Bonhomme,
  CardSkinProvider,
  OG_PAPER,
  CARD_SKIN_RENDERERS,
  CosmeticPicker,
  Panel,
  PlayingCard,
  TrickArea,
  TrickSweepProvider,
  trickSweepById,
  useLang,
  type CardData,
  type CosmeticTile,
  type Lang,
} from '@jaffre/ui';
import {
  BONHOMME_SKINS,
  CARD_SKINS,
  DEFAULT_BONHOMME_SKIN,
  DEFAULT_CARD_SKIN,
  DEV_UNLOCK_ALL,
  applyBonhommeSkin,
  applyCardSkin,
  bonhommeLabel,
  currentBonhommeSkin,
  currentCardSkin,
  owned,
  type Cosmetic,
} from '../cosmetics.js';
import { DEFAULT_THEME, THEMES, applyTheme, currentTheme } from '../theme.js';
import { DEFAULT_FELT, FELTS, applyFelt, currentFelt } from '../felt.js';
import { SWEEPS, applySweep, currentSweep, playSweepSound } from '../sweeps.js';
import { getProfile, saveProfile } from '../net/auth.js';
import { fetchStats, type Stats } from '../net/history.js';
import { fetchAwards } from '../net/awards.js';
import { grantedRewardIds } from '../awards.js';
import { feedback } from '../audio/clicks.js';
import { MetaHeader } from '../components/MetaHeader.js';
import { MetaNav } from '../components/MetaNav.js';
import { Toast } from '../components/Toast.js';

export interface CollectionProps {
  readonly onLeave: () => void;
  /** Label for the leave button — "Home" by default, "Close" when the gallery is
   * shown as an in-game modal (so it doesn't imply leaving the table). */
  readonly leaveLabel?: string;
  /** Scene viewer: a staged record so the gallery renders without the network. */
  readonly demoStats?: Stats;
  /**
   * A cosmetic id to scroll to and briefly ring — where a cross-link lands.
   * "You unlocked Tavern Wood" is only useful if it can take you to Tavern
   * Wood, so every announcement and every Journey/Awards reward points here.
   */
  readonly focus?: string | null;
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    preview: string;
    previewHint: string;
    cardSkins: string;
    bonhommes: string;
    themes: string;
    felts: string;
    sweeps: string;
    showAll: string;
    blurb: string;
    paintFirst: string;
    equipped: (name: string) => string;
  }
> = {
  en: {
    title: 'Collection',
    home: 'Home',
    preview: 'How it looks',
    previewHint: 'Your whole table — deck, felt, and the way tricks leave it.',
    cardSkins: 'Card skins',
    bonhommes: 'Bonhommes',
    themes: 'Themes',
    felts: 'Felts',
    sweeps: 'Trick sweeps',
    showAll: 'Show all (dev)',
    blurb:
      'Level up on the Journey for the track skins and themes; the rest are challenge unlocks. Equip any you own — it follows your account.',
    paintFirst: 'Paint your card first',
    equipped: (name) => `Equipped ${name}`,
  },
  fr: {
    title: 'Collection',
    home: 'Accueil',
    preview: 'Aperçu',
    previewHint:
      'Ta table au complet — tes cartes, ton tapis, et la façon dont les levées partent.',
    cardSkins: 'Habillages de cartes',
    bonhommes: 'Bonhommes',
    themes: 'Thèmes',
    felts: 'Tapis',
    sweeps: 'Ramassage des levées',
    showAll: 'Tout afficher (dev)',
    blurb:
      'Les habillages et thèmes du Parcours arrivent avec les niveaux ; les autres sont des défis. Équipe ceux que tu possèdes — ils suivent ton compte.',
    paintFirst: 'Peins ta carte d’abord',
    equipped: (name) => `Équipé : ${name}`,
  },
};

/** Look up a cosmetic's display label by id (for the preview caption). */
function labelOf(catalog: readonly Cosmetic[], id: string): string {
  return catalog.find((c) => c.id === id)?.label ?? id;
}

/** Sample hand for a preview — one special (red 0 = Joffre) + two plain cards
 * so both the bonhomme and the geometric marks show under each skin. */
const SAMPLE: readonly CardData[] = [
  { suit: 'red', value: 0 },
  { suit: 'green', value: 7 },
  { suit: 'blue', value: 4 },
];

/** A small fanned deck, rendered under a given card skin's tokens + renderers.
 * Your painted card (if any) rides along on the red 0 — the personalised card
 * previews as part of every skin, exactly as it looks at the table. The fan
 * ends on a face-DOWN card so the skin's back (striped or custom-printed)
 * shows in the tile too. */
function MiniDeck() {
  const paint = getProfile().paint;
  return (
    <div className="flex items-center justify-center">
      {SAMPLE.map((card, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : '-0.9em', zIndex: i }}>
          <PlayingCard card={card} size="sm" tilt={(i - 1) * 7} paint={paint} />
        </div>
      ))}
      <div style={{ marginLeft: '-0.9em', zIndex: SAMPLE.length }}>
        <PlayingCard card={{ suit: 'red', value: 5 }} size="sm" tilt={14} faceDown />
      </div>
    </div>
  );
}

/** Card-skin preview: scope the skin to this subtree (`data-card-skin` +
 * the matching renderers) so the tile shows that skin's real look. */
function CardSkinPreview({ id }: { readonly id: string }) {
  // The default skin declares no token block — its cards are the THEME's
  // cards. Emitting nothing left this tile inheriting whatever skin was
  // equipped on <html>, so the "Arcade" tile showed Noir. Naming the current
  // theme scopes it to what Arcade actually means. (Same fix as FeltPreview;
  // `dark` is addressable for exactly this reason — see tokens.css.)
  const attrs =
    id === DEFAULT_CARD_SKIN ? { 'data-theme': currentTheme() } : { 'data-card-skin': id };
  return (
    <div {...attrs}>
      <CardSkinProvider value={{ id, renderers: CARD_SKIN_RENDERERS[id] ?? {} }}>
        <MiniDeck />
      </CardSkinProvider>
    </div>
  );
}

/** Theme preview: scope the theme to this subtree (`data-theme`) — a felt strip
 * with the two team chips + one card (under the currently-equipped card skin). */
function ThemePreview({ id, cardSkin }: { readonly id: string; readonly cardSkin: string }) {
  // ALWAYS named, including the default: `dark` now has a block of its own, so
  // this tile no longer inherits the equipped theme and show sepia when it
  // says "Classic dark".
  return (
    <div data-theme={id} className="flex w-full flex-col items-center gap-[0.5em]">
      <div className="flex h-[2.2em] w-full items-center justify-center gap-[0.5em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-felt-800)">
        <span
          className="size-[1em] rounded-full border-2 border-(--color-ap-ink)"
          style={{ background: 'var(--color-team-a)' }}
        />
        <span
          className="size-[1em] rounded-full border-2 border-(--color-ap-ink)"
          style={{ background: 'var(--color-team-b)' }}
        />
      </div>
      <CardSkinProvider value={{ id: cardSkin, renderers: CARD_SKIN_RENDERERS[cardSkin] ?? {} }}>
        <PlayingCard card={{ suit: 'red', value: 0 }} size="sm" paint={getProfile().paint} />
      </CardSkinProvider>
    </div>
  );
}

/**
 * Felt preview: a bare miniature of the playing surface — the same
 * `.felt-oval` recipe the table uses (radial highlight + optional texture +
 * inset ring), scoped to this tile with `data-felt`. Deliberately shows NO
 * cards: this axis is the table, and every other grid on this screen already
 * shows a card.
 */
function FeltPreview({ id }: { readonly id: string }) {
  // EVERY tile scopes itself explicitly. Emitting no attribute for the default
  // (as the theme tiles do) leaves that tile inheriting whatever is equipped
  // on <html> — so equipping Tavern Wood repainted the House Green tile as
  // tavern. A directly-matched rule always beats an inherited value, so the
  // default tile names the current THEME instead: its felt is the theme's
  // felt, which is exactly what "House Green" means.
  const attrs = id === DEFAULT_FELT ? { 'data-theme': currentTheme() } : { 'data-felt': id };
  return (
    <div
      {...attrs}
      // The colours come from the theme block above, but --felt-texture would
      // still inherit from the equipped felt, printing tavern's grain on the
      // house tile. Reset it here; the token blocks have no "no texture" state.
      style={id === DEFAULT_FELT ? ({ '--felt-texture': 'none' } as CSSProperties) : undefined}
      className="flex w-full items-center justify-center p-[0.35em]"
    >
      {/* A fixed size, NOT w-full: the picker's preview slot shrink-wraps its
          content, and a bare swatch has no intrinsic width to wrap around —
          `w-full` resolved against a collapsed parent and rendered a 4px
          slice. The card/theme previews get their width from the card inside
          them; this has to state its own. */}
      <div className="felt-oval felt-swatch h-[3.1em] w-[5.6em] rounded-[46%]" />
    </div>
  );
}

/**
 * Sweep preview: a looping miniature of the real thing — four cards on a felt
 * oval, resolving toward the top seat over and over. A still image cannot show
 * a motion cosmetic, and a hover-to-play preview hides it on touch, so this
 * just runs.
 *
 * It drives the ACTUAL variant through the ACTUAL TrickArea, scoped by a local
 * TrickSweepProvider — the tile can't drift from the table, because it is the
 * table's component. Honours reduced motion for free (MotionConfig zeroes the
 * transitions, so the tile settles instead of looping).
 */
/** The virtual stage the preview renders at, then scales down. TrickArea lays
 * cards out in absolute px (seat offsets ~140px, sweep travel ~260px), so it
 * cannot simply be given a tiny box — everything would land outside it and be
 * clipped. Rendering at table scale and shrinking the whole thing keeps the
 * positions, the travel and the card size in proportion, and means the tile
 * shows the REAL motion rather than an approximation of it. */
const SWEEP_STAGE_PX = 220;
const SWEEP_STAGE_SCALE = 0.42;
/** The hero panel's stage. Wider than the tiles' (300 vs 220) because it plays
 * its trick with `md` cards rather than `sm` ones: TrickArea seats a card
 * against each edge, so four cards of a given size need a stage with room for
 * two of them end to end, or the trick piles up in the middle. Scaled down to
 * ~186px, which is where a card reads as a card and the sweep still has room
 * to be a journey. */
const LIVE_STAGE_PX = 300;
const LIVE_STAGE_SCALE = 0.62;

function SweepPreview({ id }: { readonly id: string }) {
  const [sweeping, setSweeping] = useState(false);
  useEffect(() => {
    // Slightly longer than the sweep itself, so the cards are seen landing,
    // gone, and dealt again rather than strobing.
    const period = 1400;
    const t = setInterval(() => setSweeping((s) => !s), period);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex w-full items-center justify-center p-[0.3em]">
      {/* Explicit px, for the same reason as FeltPreview above — and because
          the stage inside is laid out in px, so the frame has to be too. */}
      <div
        className="felt-oval felt-swatch relative overflow-hidden rounded-[46%]"
        style={{
          width: `${String(Math.round(SWEEP_STAGE_PX * SWEEP_STAGE_SCALE * 1.3))}px`,
          height: `${String(Math.round(SWEEP_STAGE_PX * SWEEP_STAGE_SCALE))}px`,
        }}
      >
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: `${String(SWEEP_STAGE_PX)}px`,
            height: `${String(SWEEP_STAGE_PX)}px`,
            transform: `translate(-50%, -50%) scale(${String(SWEEP_STAGE_SCALE)})`,
          }}
        >
          <TrickSweepProvider value={trickSweepById(id)}>
            <TrickArea plays={SWEEP_PREVIEW_TRICK} sweepTo={sweeping ? 2 : null} size="sm" />
          </TrickSweepProvider>
        </div>
      </div>
    </div>
  );
}

/** Four cards, one per seat — the smallest thing that reads as a real trick. */
const SWEEP_PREVIEW_TRICK = [
  { position: 0 as const, card: { suit: 'red' as const, value: 7 as const } },
  { position: 1 as const, card: { suit: 'green' as const, value: 4 as const } },
  { position: 2 as const, card: { suit: 'blue' as const, value: 6 as const } },
  { position: 3 as const, card: { suit: 'brown' as const, value: 2 as const } },
];

/** Bonhomme-skin preview: shows what that mode puts on the 0-card figure —
 * the pixel sprite, the player's own painting (or a muted placeholder + hint
 * when they haven't painted one yet), or the photographed OG portrait (same
 * mix-blend "melt into the paper" trick as ogArt in cardSkin.tsx). */
function BonhommePreview({ id, paintHint }: { readonly id: string; readonly paintHint: string }) {
  if (id === 'pixel') {
    return (
      <div className="flex items-center justify-center p-[0.5em]">
        <Bonhomme kind="joffre" size="2.6em" />
      </div>
    );
  }
  if (id === 'og') {
    // Fixed aged-paper backdrop (NOT --color-card-face): the darken-blended
    // photo disappears whenever the active skin/theme makes the face dark.
    return (
      <div
        className="flex items-center justify-center p-[0.5em]"
        style={{ background: OG_PAPER, isolation: 'isolate' }}
      >
        <img
          src="/og-cards/red_bon.jpg"
          alt=""
          aria-hidden
          draggable={false}
          width={440}
          height={511}
          className="pointer-events-none w-[2.9em] select-none object-contain"
          style={{ mixBlendMode: 'darken' }}
        />
      </div>
    );
  }
  // 'painted'
  const paint = getProfile().paint;
  return (
    <div className="flex flex-col items-center justify-center gap-[0.35em] p-[0.5em]">
      {paint !== null ? (
        <img
          src={paint}
          alt=""
          className="size-[2.6em] rounded-[0.2em] border-[0.1em] border-(--color-ap-ink) object-cover"
        />
      ) : (
        <>
          <span className="grid size-[2.6em] place-items-center rounded-[0.2em] border-[0.12em] border-dashed border-(--color-ap-muted) font-arcade-display text-[1.2em] text-(--color-ap-muted)">
            ?
          </span>
          <span className="text-center font-arcade-ui text-[0.55em] leading-tight text-(--color-ap-muted)">
            {paintHint}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * The "How it looks" preview — the ONE place the equipped combination is shown
 * together, so it has to be the WHOLE outfit. All five axes: the theme and the
 * card skin scope the panel, the felt is the real surface underneath, a trick
 * of your cards leaves it on your sweep, and your bonhomme rides the red 0 in
 * the fan. The selection grids below each preview a single cosmetic in
 * isolation (and so never shift when another axis changes); this is the only
 * place they are ever seen as one table.
 */
function LivePreview({
  cardSkin,
  theme,
  bonhomme,
  felt,
  sweep,
}: {
  readonly cardSkin: string;
  readonly theme: string;
  readonly bonhomme: 'pixel' | 'painted' | 'og';
  readonly felt: string;
  readonly sweep: string;
}) {
  // A slow, LOPSIDED cycle: the trick sits on the felt for 3.4s and is gone
  // for 1.2s. The sweep tiles below run an even 1400ms toggle because they are
  // a demonstration you are meant to study; this is ambience under your own
  // hand, and an even split would both twitch and leave the hero panel showing
  // an empty table half the time anyone (or the screenshot sweep) looked at
  // it. Reduced motion needs no special case: MotionConfig zeroes the
  // transitions, so the trick simply appears and disappears.
  const [sweeping, setSweeping] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (on: boolean) => {
      timer = setTimeout(
        () => {
          setSweeping(on);
          schedule(!on);
        },
        on ? 3400 : 1200,
      );
    };
    schedule(true);
    return () => clearTimeout(timer);
  }, []);

  const themeAttrs = theme === DEFAULT_THEME ? {} : { 'data-theme': theme };
  const skinAttrs = cardSkin === DEFAULT_CARD_SKIN ? {} : { 'data-card-skin': cardSkin };
  // Same escape as FeltPreview, for the same reason but the opposite risk: the
  // default felt means "whatever the theme says", and with no attribute of its
  // own this surface would inherit the felt equipped on <html> — showing
  // tavern wood to someone who just went back to House Green.
  const feltAttrs = felt === DEFAULT_FELT ? { 'data-theme': theme } : { 'data-felt': felt };
  const skin = {
    id: cardSkin,
    renderers: CARD_SKIN_RENDERERS[cardSkin] ?? {},
    // This local provider SHADOWS App's — it must re-carry `bonhommes`, or
    // the equipped figure choice silently drops to the default here.
    bonhommes: bonhomme,
  };
  return (
    <div
      data-testid="live-preview"
      {...themeAttrs}
      // Both axes scope the WHOLE panel, exactly as they do on <html>: the
      // trick on the felt has to be your deck too, and a provider only carries
      // the renderers — the tokens (face, back, suit colours) ride the
      // attribute. Scoping it to the fan alone left the played cards arcade.
      {...skinAttrs}
      className="flex flex-col items-center gap-[0.9em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-[1.1em]"
    >
      <div className="flex items-center gap-[0.6em]">
        <span
          className="size-[1.1em] rounded-full border-2 border-(--color-ap-ink)"
          style={{ background: 'var(--color-team-a)' }}
        />
        <span
          className="size-[1.1em] rounded-full border-2 border-(--color-ap-ink)"
          style={{ background: 'var(--color-team-b)' }}
        />
      </div>

      {/* The surface. This panel used to sit on a flat --color-felt-800
          rectangle, which was honest when the felt was the theme's business;
          now that it is an axis of its own, "how it looks" has to show the
          table you actually chose — and a trick of YOUR cards leaving it with
          YOUR sweep, which is the only way a motion cosmetic can be seen at
          all. Same scaled-stage trick as SweepPreview: TrickArea lays its
          seats out in absolute px, so it is rendered at table size and shrunk
          whole, keeping travel, spacing and card size in proportion. */}
      <div
        {...feltAttrs}
        style={felt === DEFAULT_FELT ? ({ '--felt-texture': 'none' } as CSSProperties) : undefined}
      >
        <div
          className="felt-oval felt-swatch relative overflow-hidden rounded-[46%]"
          style={{
            // The oval is as TALL as the scaled stage, so the top and bottom
            // seats land on the felt instead of hanging off it, and wider than
            // it is tall so it reads as a table rather than a coin.
            width: `${String(Math.round(LIVE_STAGE_PX * LIVE_STAGE_SCALE * 1.45))}px`,
            height: `${String(Math.round(LIVE_STAGE_PX * LIVE_STAGE_SCALE))}px`,
          }}
        >
          <div
            className="absolute top-1/2 left-1/2"
            style={{
              width: `${String(LIVE_STAGE_PX)}px`,
              height: `${String(LIVE_STAGE_PX)}px`,
              transform: `translate(-50%, -50%) scale(${String(LIVE_STAGE_SCALE)})`,
            }}
          >
            <CardSkinProvider value={skin}>
              <TrickSweepProvider value={trickSweepById(sweep)}>
                <TrickArea plays={SWEEP_PREVIEW_TRICK} sweepTo={sweeping ? 2 : null} size="md" />
              </TrickSweepProvider>
            </CardSkinProvider>
          </div>
        </div>
      </div>

      <CardSkinProvider value={skin}>
        <div className="flex items-end justify-center">
          {SAMPLE.map((card, i) => (
            <div key={i} style={{ marginLeft: i === 0 ? 0 : '-1.1em', zIndex: i }}>
              <PlayingCard card={card} size="md" tilt={(i - 1) * 8} paint={getProfile().paint} />
            </div>
          ))}
          {/* The skin's BACK rides at the fan's end at full size — it's what
              other players see for the brief instant your deck "deals"
              each round (DealIntro). */}
          <div style={{ marginLeft: '-1.1em', zIndex: SAMPLE.length }}>
            <PlayingCard card={{ suit: 'red', value: 5 }} size="md" tilt={16} faceDown />
          </div>
        </div>
      </CardSkinProvider>
    </div>
  );
}

/** Build the tiles for one catalog against the owned set + current selection. */
function buildTiles(
  catalog: readonly Cosmetic[],
  ownedIds: Set<string>,
  selected: string,
  stats: Stats | null,
  lang: Lang,
  preview: (id: string) => CosmeticTile['preview'],
): CosmeticTile[] {
  return catalog.map((c) => {
    const locked = !ownedIds.has(c.id);
    return {
      id: c.id,
      label: c.label,
      preview: preview(c.id),
      locked,
      selected: selected === c.id,
      // The "why" stays visible AFTER the unlock too — an earned skin keeps
      // its story ("Win 3 in a row") instead of turning into an unexplained
      // possession. The picker renders it without the progress bar once owned.
      ...(stats !== null && c.requirement !== undefined
        ? { requirement: c.requirement(stats, lang) }
        : {}),
    };
  });
}

/**
 * The Collection gallery — a dedicated Balatro-style view with two sections
 * (card skins + themes). Owned tiles equip on click (applied instantly +
 * persisted to the profile); locked tiles are dimmed with their unlock
 * requirement + a progress bar. A dev "Show all" toggle reveals every skin.
 */
export function Collection({ onLeave, leaveLabel, demoStats, focus }: CollectionProps) {
  const lang = useLang();
  const t = T[lang];
  const [stats, setStats] = useState<Stats | null>(demoStats ?? null);
  const [rewards, setRewards] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(DEV_UNLOCK_ALL);
  const [cardSkin, setCardSkin] = useState(currentCardSkin());
  const [theme, setTheme] = useState(currentTheme());
  const [bonhomme, setBonhomme] = useState(currentBonhommeSkin());
  const [felt, setFelt] = useState(currentFelt());
  const [sweep, setSweep] = useState(currentSweep());
  const [toast, setToast] = useState<string | null>(null);

  // Land on the tile a cross-link named. Runs after the catalogs have rendered
  // (the tile must exist to be scrolled to), and the ring is transient — this
  // is a "here it is" gesture, not a selection state.
  useEffect(() => {
    if (focus === null || focus === undefined) return undefined;
    const tile = document.querySelector<HTMLElement>(`[data-testid="cosmetic-tile-${focus}"]`);
    if (tile === null) return undefined;
    // Instant, not smooth: the tile has to BE there when you arrive. A smooth
    // scroll also fights `prefers-reduced-motion`, and this is navigation, not
    // decoration.
    tile.scrollIntoView({ block: 'center', behavior: 'auto' });
    tile.classList.add('cosmetic-found');
    const id = setTimeout(() => tile.classList.remove('cosmetic-found'), 2200);
    return () => clearTimeout(id);
  }, [focus, stats, rewards]);

  useEffect(() => {
    if (demoStats !== undefined) return;
    let live = true;
    fetchStats()
      .then((s) => live && setStats(s))
      .catch(() => {
        /* offline: everything stays free/locked, no progress bars */
      });
    // Award-granted cosmetics (e.g. the tutorial's OG bonhomme) are owned even
    // without the matching stats — fold them into the owned set.
    fetchAwards()
      .then((a) => live && setRewards(grantedRewardIds(a.map((x) => x.id))))
      .catch(() => {
        /* offline: no award-granted cosmetics shown */
      });
    return () => {
      live = false;
    };
  }, [demoStats]);

  const ownedCards = owned(CARD_SKINS, stats, showAll, rewards);
  const ownedThemes = owned(THEMES, stats, showAll, rewards);
  const ownedFelts = owned(FELTS, stats, showAll, rewards);
  const ownedSweeps = owned(SWEEPS, stats, showAll, rewards);
  // Localized labels live alongside (not inside) the catalog — see
  // bonhommeLabel's doc comment in cosmetics.ts — so build a per-render
  // catalog with `label` filled in for the tile grid + toast/equipped copy.
  const bonhommeCatalog: readonly Cosmetic[] = BONHOMME_SKINS.map((c) => ({
    ...c,
    label: bonhommeLabel(c.id, lang),
  }));
  // pixel is free; painted unlocks by painting your card, og by the tutorial
  // award's reward grant — all resolved by the same owned() plumbing.
  const ownedBonhommes = owned(bonhommeCatalog, stats, showAll, rewards);

  const chooseCardSkin = (id: string) => {
    applyCardSkin(id);
    setCardSkin(id);
    void saveProfile({ cardSkin: id });
    feedback('select');
    setToast(t.equipped(labelOf(CARD_SKINS, id)));
  };
  const chooseTheme = (id: string) => {
    applyTheme(id);
    setTheme(id);
    void saveProfile({ theme: id });
    feedback('select');
    setToast(t.equipped(labelOf(THEMES, id)));
  };
  const chooseBonhomme = (id: string) => {
    const mode = id === 'pixel' || id === 'og' ? id : DEFAULT_BONHOMME_SKIN;
    applyBonhommeSkin(mode);
    setBonhomme(mode);
    void saveProfile({ bonhommeSkin: mode });
    feedback('select');
    setToast(t.equipped(labelOf(bonhommeCatalog, mode)));
  };

  const chooseSweep = (id: string) => {
    applySweep(id);
    setSweep(id);
    void saveProfile({ sweep: id });
    // Play the sweep's OWN sound rather than the generic select tick — picking
    // a sweep should sound like the thing you just picked.
    feedback('select');
    playSweepSound();
    setToast(t.equipped(labelOf(SWEEPS, id)));
  };
  const chooseFelt = (id: string) => {
    applyFelt(id);
    setFelt(id);
    void saveProfile({ felt: id });
    feedback('select');
    setToast(t.equipped(labelOf(FELTS, id)));
  };

  const cardTiles = buildTiles(CARD_SKINS, ownedCards, cardSkin, stats, lang, (id) => (
    <CardSkinPreview id={id} />
  ));
  // Felt tiles preview the SURFACE only — a bare oval swatch with no cards on
  // it, so the axis reads as "the table" rather than a second theme grid.
  const feltTiles = buildTiles(FELTS, ownedFelts, felt, stats, lang, (id) => (
    <FeltPreview id={id} />
  ));
  const sweepTiles = buildTiles(SWEEPS, ownedSweeps, sweep, stats, lang, (id) => (
    <SweepPreview id={id} />
  ));
  // Theme tiles preview against a FIXED reference skin (the default), so picking
  // a card skin never re-renders every theme tile — each grid shows one axis.
  const themeTiles = buildTiles(THEMES, ownedThemes, theme, stats, lang, (id) => (
    <ThemePreview id={id} cardSkin={DEFAULT_CARD_SKIN} />
  ));
  const bonhommeTiles = buildTiles(bonhommeCatalog, ownedBonhommes, bonhomme, stats, lang, (id) => (
    <BonhommePreview id={id} paintHint={t.paintFirst} />
  ));

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={leaveLabel ?? t.home} onLeave={onLeave} />

        {/* Not in the in-game modal (leaveLabel set): navigating away via the
            strip would tear the table route down mid-game. */}
        {leaveLabel === undefined && <MetaNav current="collection" />}

        <div className="flex items-center justify-between gap-4">
          <p className="font-arcade-ui text-[0.85em] text-(--color-ap-muted)">{t.blurb}</p>
          <label className="flex shrink-0 cursor-pointer items-center gap-[0.5em] font-arcade-ui text-[0.72em] uppercase tracking-wide text-(--color-ap-muted)">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="size-[1.1em] accent-(--color-ap-violet)"
            />
            {t.showAll}
          </label>
        </div>

        <Panel as="section" className="flex flex-col gap-[0.9em] p-[1.1em]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
              {t.preview}
            </h2>
            {/* Names what the panel shows — all five axes now, and WRAPPING
                rather than truncating: the sweep sits last and is the one
                cosmetic whose name you cannot read off the picture, so
                clipping the line would hide exactly the label that matters
                most. */}
            <span className="text-right font-arcade-ui text-[0.72em] uppercase tracking-wide text-(--color-ap-muted)">
              {labelOf(CARD_SKINS, cardSkin)} · {bonhommeLabel(bonhomme, lang)} ·{' '}
              {labelOf(THEMES, theme)} · {labelOf(FELTS, felt)} · {labelOf(SWEEPS, sweep)}
            </span>
          </div>
          <LivePreview
            cardSkin={cardSkin}
            theme={theme}
            bonhomme={bonhomme}
            felt={felt}
            sweep={sweep}
          />
          <p className="font-arcade-ui text-[0.72em] text-(--color-ap-muted)">{t.previewHint}</p>
        </Panel>

        <Panel as="section" className="flex flex-col gap-[0.9em] p-[1.1em]">
          <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
            {t.cardSkins}
          </h2>
          <CosmeticPicker tiles={cardTiles} onSelect={chooseCardSkin} label={t.cardSkins} />
        </Panel>

        <Panel as="section" className="flex flex-col gap-[0.9em] p-[1.1em]">
          <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
            {t.bonhommes}
          </h2>
          <CosmeticPicker tiles={bonhommeTiles} onSelect={chooseBonhomme} label={t.bonhommes} />
        </Panel>

        <Panel as="section" className="flex flex-col gap-[0.9em] p-[1.1em]">
          <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
            {t.themes}
          </h2>
          <CosmeticPicker tiles={themeTiles} onSelect={chooseTheme} label={t.themes} />
        </Panel>

        {/* Felt last: it is the axis the theme used to own, so it reads as
            "and the table itself" once you've picked everything else. */}
        <Panel as="section" className="flex flex-col gap-[0.9em] p-[1.1em]">
          <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
            {t.felts}
          </h2>
          <CosmeticPicker tiles={feltTiles} onSelect={chooseFelt} label={t.felts} />
        </Panel>

        {/* Sweeps last: it's the only axis you can't judge from a still, so it
            wants the reader's full attention rather than a glance in passing. */}
        <Panel as="section" className="flex flex-col gap-[0.9em] p-[1.1em]">
          <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
            {t.sweeps}
          </h2>
          <CosmeticPicker tiles={sweepTiles} onSelect={chooseSweep} label={t.sweeps} />
        </Panel>
      </div>
      {toast !== null && <Toast message={toast} onDone={() => setToast(null)} />}
    </main>
  );
}

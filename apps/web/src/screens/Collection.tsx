import { useEffect, useState } from 'react';
import {
  Bonhomme,
  CardSkinProvider,
  CARD_SKIN_RENDERERS,
  CosmeticPicker,
  Panel,
  PlayingCard,
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
    previewHint: 'Your equipped skin + theme, together.',
    cardSkins: 'Card skins',
    bonhommes: 'Bonhommes',
    themes: 'Themes',
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
    previewHint: 'Ton habillage + thème équipés, ensemble.',
    cardSkins: 'Habillages de cartes',
    bonhommes: 'Bonhommes',
    themes: 'Thèmes',
    showAll: 'Tout afficher (dev)',
    blurb:
      'Les habillages et thèmes du Parcours arrivent avec les niveaux; les autres sont des défis. Équipe ceux que tu possèdes — ils suivent ton compte.',
    paintFirst: "Peins ta carte d'abord",
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
  const attrs = id === DEFAULT_CARD_SKIN ? {} : { 'data-card-skin': id };
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
  const attrs = id === DEFAULT_THEME ? {} : { 'data-theme': id };
  return (
    <div {...attrs} className="flex w-full flex-col items-center gap-[0.5em]">
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
    return (
      <div className="flex items-center justify-center bg-(--color-card-face) p-[0.5em]">
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
 * together. Scopes BOTH the current theme (`data-theme`) and the current card
 * skin to a felt scene with the two team chips + a fanned hand, so players see
 * the real table look before the selection grids (which each preview a single
 * cosmetic in isolation, and so never shift when the other axis changes).
 */
function LivePreview({
  cardSkin,
  theme,
  bonhomme,
}: {
  readonly cardSkin: string;
  readonly theme: string;
  readonly bonhomme: 'pixel' | 'painted' | 'og';
}) {
  const themeAttrs = theme === DEFAULT_THEME ? {} : { 'data-theme': theme };
  const skinAttrs = cardSkin === DEFAULT_CARD_SKIN ? {} : { 'data-card-skin': cardSkin };
  return (
    <div
      {...themeAttrs}
      className="flex flex-col items-center gap-[0.9em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-felt-800) p-[1.1em]"
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
      {/* This local provider SHADOWS App's — it must re-carry `bonhommes`, or
          the equipped figure choice silently drops to the default here. */}
      <div {...skinAttrs}>
        <CardSkinProvider
          value={{
            id: cardSkin,
            renderers: CARD_SKIN_RENDERERS[cardSkin] ?? {},
            bonhommes: bonhomme,
          }}
        >
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
export function Collection({ onLeave, leaveLabel, demoStats }: CollectionProps) {
  const lang = useLang();
  const t = T[lang];
  const [stats, setStats] = useState<Stats | null>(demoStats ?? null);
  const [rewards, setRewards] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(DEV_UNLOCK_ALL);
  const [cardSkin, setCardSkin] = useState(currentCardSkin());
  const [theme, setTheme] = useState(currentTheme());
  const [bonhomme, setBonhomme] = useState(currentBonhommeSkin());
  const [toast, setToast] = useState<string | null>(null);

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

  const cardTiles = buildTiles(CARD_SKINS, ownedCards, cardSkin, stats, lang, (id) => (
    <CardSkinPreview id={id} />
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
            <span className="truncate font-arcade-ui text-[0.72em] uppercase tracking-wide text-(--color-ap-muted)">
              {labelOf(CARD_SKINS, cardSkin)} · {bonhommeLabel(bonhomme, lang)} ·{' '}
              {labelOf(THEMES, theme)}
            </span>
          </div>
          <LivePreview cardSkin={cardSkin} theme={theme} bonhomme={bonhomme} />
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
      </div>
      {toast !== null && <Toast message={toast} onDone={() => setToast(null)} />}
    </main>
  );
}

import { useEffect, useState } from 'react';
import {
  CardSkinProvider,
  CARD_SKIN_RENDERERS,
  CosmeticPicker,
  Cta,
  Panel,
  PlayingCard,
  useLang,
  type CardData,
  type CosmeticTile,
  type Lang,
} from '@jaffre/ui';
import {
  CARD_SKINS,
  DEFAULT_CARD_SKIN,
  DEV_UNLOCK_ALL,
  applyCardSkin,
  currentCardSkin,
  owned,
  type Cosmetic,
} from '../cosmetics.js';
import { DEFAULT_THEME, THEMES, applyTheme, currentTheme } from '../theme.js';
import { saveProfile } from '../net/auth.js';
import { fetchStats, type Stats } from '../net/history.js';

export interface CollectionProps {
  readonly onLeave: () => void;
  /** Scene viewer: a staged record so the gallery renders without the network. */
  readonly demoStats?: Stats;
}

const T: Record<
  Lang,
  { title: string; home: string; cardSkins: string; themes: string; showAll: string; blurb: string }
> = {
  en: {
    title: 'Collection',
    home: 'Home',
    cardSkins: 'Card skins',
    themes: 'Themes',
    showAll: 'Show all (dev)',
    blurb: 'Unlock skins and themes as you play. Equip any you own — it follows your account.',
  },
  fr: {
    title: 'Collection',
    home: 'Accueil',
    cardSkins: 'Habillages de cartes',
    themes: 'Thèmes',
    showAll: 'Tout afficher (dev)',
    blurb: 'Débloque des habillages et des thèmes en jouant. Équipe ceux que tu possèdes — ils suivent ton compte.',
  },
};

/** Sample hand for a preview — one special (red 0 = Joffre) + two plain cards
 * so both the bonhomme and the geometric marks show under each skin. */
const SAMPLE: readonly CardData[] = [
  { suit: 'red', value: 0 },
  { suit: 'green', value: 7 },
  { suit: 'blue', value: 4 },
];

/** A small fanned deck, rendered under a given card skin's tokens + renderers. */
function MiniDeck() {
  return (
    <div className="flex items-center justify-center">
      {SAMPLE.map((card, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : '-0.9em', zIndex: i }}>
          <PlayingCard card={card} size="sm" tilt={(i - 1) * 7} />
        </div>
      ))}
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
        <PlayingCard card={{ suit: 'red', value: 0 }} size="sm" />
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
      ...(locked && stats !== null && c.requirement !== undefined
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
export function Collection({ onLeave, demoStats }: CollectionProps) {
  const lang = useLang();
  const t = T[lang];
  const [stats, setStats] = useState<Stats | null>(demoStats ?? null);
  const [showAll, setShowAll] = useState(DEV_UNLOCK_ALL);
  const [cardSkin, setCardSkin] = useState(currentCardSkin());
  const [theme, setTheme] = useState(currentTheme());

  useEffect(() => {
    if (demoStats !== undefined) return;
    let live = true;
    fetchStats()
      .then((s) => live && setStats(s))
      .catch(() => {
        /* offline: everything stays free/locked, no progress bars */
      });
    return () => {
      live = false;
    };
  }, [demoStats]);

  const ownedCards = owned(CARD_SKINS, stats, showAll);
  const ownedThemes = owned(THEMES, stats, showAll);

  const chooseCardSkin = (id: string) => {
    applyCardSkin(id);
    setCardSkin(id);
    void saveProfile({ cardSkin: id });
  };
  const chooseTheme = (id: string) => {
    applyTheme(id);
    setTheme(id);
    void saveProfile({ theme: id });
  };

  const cardTiles = buildTiles(CARD_SKINS, ownedCards, cardSkin, stats, lang, (id) => (
    <CardSkinPreview id={id} />
  ));
  const themeTiles = buildTiles(THEMES, ownedThemes, theme, stats, lang, (id) => (
    <ThemePreview id={id} cardSkin={cardSkin} />
  ));

  return (
    <main className="min-h-dvh overflow-y-auto bg-(--color-ap-ground) p-6 text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-arcade-display text-[2.2em] uppercase leading-none text-(--color-ap-gold)">
            {t.title}
          </h1>
          <Cta variant="secondary" onClick={onLeave}>
            {t.home}
          </Cta>
        </header>

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
          <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
            {t.cardSkins}
          </h2>
          <CosmeticPicker tiles={cardTiles} onSelect={chooseCardSkin} label={t.cardSkins} />
        </Panel>

        <Panel as="section" className="flex flex-col gap-[0.9em] p-[1.1em]">
          <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
            {t.themes}
          </h2>
          <CosmeticPicker tiles={themeTiles} onSelect={chooseTheme} label={t.themes} />
        </Panel>
      </div>
    </main>
  );
}

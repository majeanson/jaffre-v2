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
import { getProfile, saveProfile } from '../net/auth.js';
import { fetchStats, type Stats } from '../net/history.js';
import { feedback } from '../audio/clicks.js';
import { Toast } from '../components/Toast.js';

export interface CollectionProps {
  readonly onLeave: () => void;
  /** Label for the leave button — "Home" by default, "Close" when the gallery is
   * shown as an in-game modal (so it doesn't imply leaving the table). */
  readonly leaveLabel?: string;
  /** Scene viewer: a staged record so the gallery renders without the network. */
  readonly demoStats?: Stats;
}

/** sessionStorage key holding the route to return to when the gallery closes —
 * set by SkinLink so opening Skins mid-game and going back lands you in the
 * game, not on Home. */
export const COLLECTION_RETURN_KEY = 'jaffre-collection-return';

/** Where the gallery's back button should go: the stashed route (a game in
 * progress), or Home when there isn't one. Consumes the stash. */
export function collectionReturnHash(): string {
  const back = sessionStorage.getItem(COLLECTION_RETURN_KEY);
  sessionStorage.removeItem(COLLECTION_RETURN_KEY);
  return back !== null && back !== '#collection' ? back : '';
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    preview: string;
    previewHint: string;
    cardSkins: string;
    themes: string;
    showAll: string;
    blurb: string;
    equipped: (name: string) => string;
  }
> = {
  en: {
    title: 'Collection',
    home: 'Home',
    preview: 'How it looks',
    previewHint: 'Your equipped skin + theme, together.',
    cardSkins: 'Card skins',
    themes: 'Themes',
    showAll: 'Show all (dev)',
    blurb: 'Unlock skins and themes as you play. Equip any you own — it follows your account.',
    equipped: (name) => `Equipped ${name}`,
  },
  fr: {
    title: 'Collection',
    home: 'Accueil',
    preview: 'Aperçu',
    previewHint: 'Ton habillage + thème équipés, ensemble.',
    cardSkins: 'Habillages de cartes',
    themes: 'Thèmes',
    showAll: 'Tout afficher (dev)',
    blurb:
      'Débloque des habillages et des thèmes en jouant. Équipe ceux que tu possèdes — ils suivent ton compte.',
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
 * previews as part of every skin, exactly as it looks at the table. */
function MiniDeck() {
  const paint = getProfile().paint;
  return (
    <div className="flex items-center justify-center">
      {SAMPLE.map((card, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : '-0.9em', zIndex: i }}>
          <PlayingCard card={card} size="sm" tilt={(i - 1) * 7} paint={paint} />
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
        <PlayingCard card={{ suit: 'red', value: 0 }} size="sm" paint={getProfile().paint} />
      </CardSkinProvider>
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
function LivePreview({ cardSkin, theme }: { readonly cardSkin: string; readonly theme: string }) {
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
      <div {...skinAttrs}>
        <CardSkinProvider value={{ id: cardSkin, renderers: CARD_SKIN_RENDERERS[cardSkin] ?? {} }}>
          <div className="flex items-end justify-center">
            {SAMPLE.map((card, i) => (
              <div key={i} style={{ marginLeft: i === 0 ? 0 : '-1.1em', zIndex: i }}>
                <PlayingCard card={card} size="md" tilt={(i - 1) * 8} paint={getProfile().paint} />
              </div>
            ))}
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
export function Collection({ onLeave, leaveLabel, demoStats }: CollectionProps) {
  const lang = useLang();
  const t = T[lang];
  const [stats, setStats] = useState<Stats | null>(demoStats ?? null);
  const [showAll, setShowAll] = useState(DEV_UNLOCK_ALL);
  const [cardSkin, setCardSkin] = useState(currentCardSkin());
  const [theme, setTheme] = useState(currentTheme());
  const [toast, setToast] = useState<string | null>(null);

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

  const cardTiles = buildTiles(CARD_SKINS, ownedCards, cardSkin, stats, lang, (id) => (
    <CardSkinPreview id={id} />
  ));
  // Theme tiles preview against a FIXED reference skin (the default), so picking
  // a card skin never re-renders every theme tile — each grid shows one axis.
  const themeTiles = buildTiles(THEMES, ownedThemes, theme, stats, lang, (id) => (
    <ThemePreview id={id} cardSkin={DEFAULT_CARD_SKIN} />
  ));

  return (
    <main className="min-h-dvh overflow-y-auto bg-(--color-ap-ground) p-6 text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-arcade-display text-[2.2em] uppercase leading-none text-(--color-ap-gold)">
            {t.title}
          </h1>
          <Cta variant="secondary" onClick={onLeave}>
            {leaveLabel ?? t.home}
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
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
              {t.preview}
            </h2>
            <span className="truncate font-arcade-ui text-[0.72em] uppercase tracking-wide text-(--color-ap-muted)">
              {labelOf(CARD_SKINS, cardSkin)} · {labelOf(THEMES, theme)}
            </span>
          </div>
          <LivePreview cardSkin={cardSkin} theme={theme} />
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
            {t.themes}
          </h2>
          <CosmeticPicker tiles={themeTiles} onSelect={chooseTheme} label={t.themes} />
        </Panel>
      </div>
      {toast !== null && <Toast message={toast} onDone={() => setToast(null)} />}
    </main>
  );
}

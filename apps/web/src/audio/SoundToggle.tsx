import { useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { IconButton } from '../components/IconButton.js';
import { IconSpeaker } from '../components/icons.js';
import { playClick, setSoundEnabled, soundEnabled } from './clicks.js';

const T: Record<Lang, { on: string; off: string; title: string }> = {
  en: {
    on: 'Sound on — card sounds & haptics',
    off: 'Sound off — card sounds & haptics',
    title: 'Sound',
  },
  fr: {
    on: 'Sons activés — sons de cartes et vibrations',
    off: 'Sons désactivés — sons de cartes et vibrations',
    title: 'Sons',
  },
};

/** Icon toggle for the card sounds & haptics. Off by default. Pass `labeled`
 * to show the title beside the icon where there's room (e.g. options drawer). */
export function SoundToggle({ labeled = false }: { readonly labeled?: boolean } = {}) {
  const t = T[useLang()];
  const [on, setOn] = useState(soundEnabled());
  return (
    <IconButton
      label={on ? t.on : t.off}
      text={labeled ? t.title : undefined}
      aria-pressed={on}
      active={on}
      onClick={() => {
        const next = !on;
        setSoundEnabled(next);
        setOn(next);
        if (next) playClick('select'); // audible confirmation on enable
      }}
    >
      <IconSpeaker muted={!on} />
    </IconButton>
  );
}

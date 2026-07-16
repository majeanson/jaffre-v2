import { useState } from 'react';
import { IconButton } from '../components/IconButton.js';
import { IconSpeaker } from '../components/icons.js';
import { playClick, setSoundEnabled, soundEnabled } from './clicks.js';

/** Icon toggle for the card sounds & haptics. Off by default. */
export function SoundToggle() {
  const [on, setOn] = useState(soundEnabled());
  return (
    <IconButton
      label={on ? 'Sound on — card sounds & haptics' : 'Sound off — card sounds & haptics'}
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

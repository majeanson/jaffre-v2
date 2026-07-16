import { useState } from 'react';
import { GHOST_BTN } from '../components/buttonStyles.js';
import { playClick, setSoundEnabled, soundEnabled } from './clicks.js';

/** Top-bar toggle for the click/haptic feedback. Off by default. */
export function SoundToggle() {
  const [on, setOn] = useState(soundEnabled());
  return (
    <button
      type="button"
      aria-pressed={on}
      title="Card clicks & haptics"
      onClick={() => {
        const next = !on;
        setSoundEnabled(next);
        setOn(next);
        if (next) playClick('select'); // audible confirmation on enable
      }}
      className={`whitespace-nowrap px-3 py-1.5 text-sm ${GHOST_BTN} ${
        on ? 'text-(--color-lamplight)' : 'text-(--color-ivory)/80'
      }`}
    >
      {on ? '♪ Sound on' : 'Sound'}
    </button>
  );
}

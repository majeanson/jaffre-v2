import '@fontsource-variable/fraunces';
import '@fontsource-variable/instrument-sans';
// Arcade shell type: Silkscreen (display — the compact-pixel stand-in for the
// design's "Visitor" face; swap in the licensed Visitor TTF via the arcade
// --font-arcade-display token later) + Rubik (UI).
import '@fontsource/silkscreen';
import '@fontsource/silkscreen/700.css';
import '@fontsource-variable/rubik';
import '@jaffre/ui/tokens.css';
import { JaffreMotionConfig } from '@jaffre/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { installTelemetry } from './net/telemetry.js';
import { initTheme } from './theme.js';
import { initLang } from './lang.js';

initTheme();
initLang();
installTelemetry();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <JaffreMotionConfig>
      <App />
    </JaffreMotionConfig>
  </StrictMode>,
);

import '@fontsource-variable/fraunces';
import '@fontsource-variable/instrument-sans';
// Arcade skin type: Pixelify Sans (display) + Rubik (UI). Pixelify stands in
// for the design's "Visitor" pixel face until the licensed Visitor TTF is
// dropped in; swap the --font-display family in the arcade token block then.
import '@fontsource-variable/pixelify-sans';
import '@fontsource-variable/rubik';
import '@jaffre/ui/tokens.css';
import { JaffreMotionConfig } from '@jaffre/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { installTelemetry } from './net/telemetry.js';
import { initTheme } from './theme.js';

initTheme();
installTelemetry();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <JaffreMotionConfig>
      <App />
    </JaffreMotionConfig>
  </StrictMode>,
);

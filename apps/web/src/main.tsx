import '@fontsource-variable/fraunces';
import '@fontsource-variable/instrument-sans';
import '@jaffre/ui/tokens.css';
import { JaffreMotionConfig } from '@jaffre/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { initTheme } from './theme.js';

initTheme();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <JaffreMotionConfig>
      <App />
    </JaffreMotionConfig>
  </StrictMode>,
);

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
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { consumeLoginFragment } from './net/auth.js';
import { setPlayerName } from './net/socket.js';
import { installTelemetry } from './net/telemetry.js';
import { initTheme } from './theme.js';
import { initCardSkin } from './cosmetics.js';
import { initLang } from './lang.js';
import { initInstallCapture } from './pwa/install.js';
import { initBadge } from './pwa/badge.js';

initTheme();
initCardSkin();
initLang();
installTelemetry();
// beforeinstallprompt can fire before React mounts — capture it now.
initInstallCapture();
initBadge();
// Google's OAuth callback bounces back with #login=<token> — adopt that
// identity before anything renders, then reload cosmetics for it.
void consumeLoginFragment().then((identity) => {
  if (identity !== null) {
    setPlayerName(identity.name);
    location.reload();
  }
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {/* Outer boundary: catches a throw from App's own body/providers (lang,
        card-skin, cosmetics-reconcile effects) — the inner one in App.tsx only
        ever saw crashes inside AppRoutes. It sits outside LangProvider, but
        useLang() defaults to 'en' with no provider, so the fallback still
        renders (in English) instead of white-screening. Kept additive
        alongside the themed inner boundary rather than replacing it, so
        route-level crashes keep their localized recovery UI. */}
    <ErrorBoundary>
      <JaffreMotionConfig>
        <App />
      </JaffreMotionConfig>
    </ErrorBoundary>
  </StrictMode>,
);

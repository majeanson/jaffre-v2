import { useEffect, useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { ICON_BTN_NEUTRAL } from '../components/IconButton.js';
import { IconBell } from '../components/icons.js';
import { Toast } from '../components/Toast.js';
import { disablePush, enablePush, fetchVapidKey, pushPrefOn, pushSupported } from './pushClient.js';

const T: Record<Lang, { on: string; off: string; denied: string; failed: string }> = {
  en: {
    on: 'Turn alerts · on',
    off: 'Turn alerts · off',
    denied: 'Notifications are blocked for this site',
    failed: "Couldn't turn alerts on — try again.",
  },
  fr: {
    on: 'Alertes de tour · activées',
    off: 'Alertes de tour · désactivées',
    denied: 'Les notifications sont bloquées pour ce site',
    failed: 'Impossible d’activer les alertes — réessaie.',
  },
};

/**
 * "It's your turn" push alerts, home-chrome bell. Renders nothing until the
 * server confirms push is configured (VAPID key present) and the browser
 * supports it — so the button never dangles a feature that can't work.
 */
export function NotificationsToggle() {
  const t = T[useLang()];
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [on, setOn] = useState(() => pushPrefOn() && Notification.permission === 'granted');
  const [blocked, setBlocked] = useState(false);
  // J6: a failure that ISN'T a permission denial (subscribe rejected, the
  // server 404s, offline mid-request) used to fail silently — the bell just
  // stayed off with no explanation. Distinct from `blocked`: that one names
  // a browser setting the player can go fix; this one just says "try again".
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!pushSupported() || navigator.webdriver) return;
    let live = true;
    void fetchVapidKey().then((key) => {
      if (live) setVapidKey(key);
    });
    return () => {
      live = false;
    };
  }, []);

  if (vapidKey === null) return null;
  const label = on ? t.on : t.off;
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        title={label}
        className={ICON_BTN_NEUTRAL}
        onClick={() => {
          if (on) {
            setOn(false);
            void disablePush();
          } else if (Notification.permission === 'denied') {
            setBlocked(true);
          } else {
            void enablePush(vapidKey).then((ok) => {
              setOn(ok);
              if (!ok) {
                if (Notification.permission === 'denied') setBlocked(true);
                else setFailed(true);
              }
            });
          }
        }}
      >
        <IconBell off={!on} />
      </button>
      {blocked && <Toast message={t.denied} onDone={() => setBlocked(false)} />}
      {failed && <Toast message={t.failed} onDone={() => setFailed(false)} />}
    </>
  );
}

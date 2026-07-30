import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Cta, Panel, useLang } from '@jaffre/ui';
import { reportError } from '../net/telemetry.js';

/**
 * App-level error boundary: a React render crash used to white-screen (only a
 * window.onerror beacon fired). This catches it into an arcade-styled fallback
 * and still beacons the error through the first-party telemetry path.
 *
 * A class component is required (only classes can be error boundaries); the
 * fallback is a functional child so it can localize via useLang().
 */
interface Props {
  readonly children: ReactNode;
}
interface State {
  readonly crashed: boolean;
  /** J6: set by componentDidCatch right after the crash render, so a user
   * report ("it crashed, here's the code") can be matched to the exact
   * telemetry beacon — see reportError's return value in net/telemetry.ts.
   * Null for the one render before componentDidCatch's setState lands. */
  readonly errorId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { crashed: false, errorId: null };

  static getDerivedStateFromError(): Partial<State> {
    return { crashed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const errorId = reportError(error, info.componentStack ?? undefined);
    this.setState({ errorId });
  }

  override render(): ReactNode {
    if (this.state.crashed) return <CrashFallback errorId={this.state.errorId} />;
    return this.props.children;
  }
}

/** The localized fallback surface — offers a reload (fresh boot) and a hard
 * escape back to the menu, since the crashed screen may be unreachable. */
function CrashFallback({ errorId }: { readonly errorId: string | null }) {
  const lang = useLang();
  const t = (en: string, fr: string) => (lang === 'fr' ? fr : en);
  return (
    <main className="grid min-h-full place-items-center bg-(--color-ap-ground) p-[1.5rem]">
      <Panel className="flex max-w-sm flex-col items-center gap-[1em] p-[1.5em] text-center">
        <h1 className="font-arcade-display text-[1.3em] uppercase tracking-wide text-(--color-ap-text)">
          {t('Something broke', 'Une erreur est survenue')}
        </h1>
        <p className="font-arcade-ui text-[0.95em] text-(--color-ap-muted)">
          {t(
            'The screen hit an unexpected error. Reloading usually fixes it.',
            "L'écran a rencontré une erreur inattendue. Un rechargement règle habituellement le problème.",
          )}
        </p>
        {errorId !== null && (
          <p className="font-arcade-ui text-[0.75em] text-(--color-ap-muted)">
            {t(`Error id: ${errorId}`, `Code d'erreur : ${errorId}`)}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-[0.6em]">
          <Cta onClick={() => location.reload()}>{t('Reload', 'Recharger')}</Cta>
          <Cta
            variant="secondary"
            onClick={() => {
              location.hash = '';
              location.reload();
            }}
          >
            {t('Back to menu', 'Retour au menu')}
          </Cta>
        </div>
      </Panel>
    </main>
  );
}

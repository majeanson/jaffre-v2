/**
 * Whether the app's internal tools are reachable: local `vite dev` builds
 * (import.meta.env.DEV) and automated runs against the prod build
 * (navigator.webdriver — same idiom as UpdateToast / NotificationsToggle /
 * TutorialCoach). Real prod users never see them.
 *
 * Its own module so the router can gate the `#scenes` route on the flag
 * without pulling the dev console's component into the main chunk.
 */
export const DEV_TOOLS_ENABLED =
  import.meta.env.DEV || (typeof navigator !== 'undefined' && navigator.webdriver === true);

/**
 * The collection-gallery "return to where you came from" stash, split out of
 * Collection.tsx so callers that only need it (SkinLink, the App router)
 * don't force the whole gallery screen — cosmetic pickers, theme data, its
 * net fetches — into their bundle. Keeping this a standalone module lets
 * Collection.tsx stay behind React.lazy().
 */

/** sessionStorage key holding the route to return to when the gallery closes —
 * set by SkinLink so opening Skins mid-game and going back lands you in the
 * game, not on Home. */
export const COLLECTION_RETURN_KEY = 'jaffre-collection-return';

/** Where the gallery's back button should go: the stashed route (a game in
 * progress), or Home when there isn't one. Consumes the stash. */
export function collectionReturnHash(): string {
  const back = sessionStorage.getItem(COLLECTION_RETURN_KEY);
  sessionStorage.removeItem(COLLECTION_RETURN_KEY);
  return back !== null && back !== '#collection' ? back : '';
}

-- Two new cosmetic axes, shipping together: felt (the playing surface) and
-- sweep (how a won trick leaves the table).
--
-- Both were always separable from the theme — the felt reads only the
-- --color-felt-* tokens, and the sweep is pure motion — so this persists the
-- player's chosen surface and gesture the way the other cosmetics already are,
-- and they follow the account across devices.
--
-- Migrations are forward-only and filename-locked: never edit an applied one,
-- add the next number instead. Additive + nullable so it is safe to apply to a
-- live table (existing rows keep NULL = "whatever the defaults say").

ALTER TABLE users ADD COLUMN felt TEXT;
ALTER TABLE users ADD COLUMN sweep TEXT;

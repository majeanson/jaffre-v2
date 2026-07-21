/**
 * The paint palette. The eight identity hexes are the arcade set (shared with
 * the profile-colour swatches — ProfileCard imports IDENTITY_PALETTE from here
 * so the two never drift). The studio expands each into a darker + lighter
 * shade for shading work, and adds neutrals. Every value is a literal hex (no
 * color-mix / CSS vars) because these strings get baked into the saved SVG.
 */

/** The eight base identity colours — the profile-colour swatch set. */
export const IDENTITY_PALETTE = [
  '#7a6ff0', // violet
  '#f2b712', // gold
  '#e05252', // red
  '#58b884', // green
  '#82c7dc', // sky
  '#f2c66d', // sand
  '#b07a2e', // brown
  '#ebe6f5', // ivory
] as const;

/** Shade ramps for the studio: [dark, base, light] per identity hue, chosen by
 * eye (roughly ±35% luminance) and frozen as literals so they serialize. */
export const SHADE_RAMPS: readonly (readonly [string, string, string])[] = [
  ['#4b3fb0', '#7a6ff0', '#b3acf7'], // violet
  ['#b3860a', '#f2b712', '#f8d976'], // gold
  ['#9c2f2f', '#e05252', '#ef9494'], // red
  ['#367a55', '#58b884', '#97d4b3'], // green
  ['#4d8ba3', '#82c7dc', '#b6e0ec'], // sky
  ['#b8912f', '#f2c66d', '#f8dfa8'], // sand
  ['#6f4c17', '#b07a2e', '#d2a463'], // brown
  ['#0b0713', '#8a7f9c', '#ebe6f5'], // ink → grey → ivory (neutral ramp)
];

/** The full studio swatch grid, flattened in ramp order (dark, base, light per
 * hue) so shades of one colour sit together. 24 swatches. */
export const STUDIO_PALETTE: readonly string[] = SHADE_RAMPS.flat();

/** Pure black + white as explicit endpoints (outlines, highlights). */
export const MONO = ['#0b0713', '#ffffff'] as const;

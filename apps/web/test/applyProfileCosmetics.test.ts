import { describe, expect, it, vi } from 'vitest';
import { applyProfileCosmetics } from '../src/applyProfileCosmetics.js';
import type { Profile } from '../src/net/auth.js';

// The appliers themselves touch localStorage/`document` (real DOM work that
// belongs to the Collection/theme/felt/sweep unit tests, which already cover
// it) — this test is only about applyProfileCosmetics' OWN job: deciding
// which appliers to call, with what, for a given saved profile. Mock the five
// appliers and leave every other export of these modules real.
const { applyCardSkin, applyTheme, applyFelt, applySweep, applyBonhommeSkin } = vi.hoisted(() => ({
  applyCardSkin: vi.fn(),
  applyTheme: vi.fn(),
  applyFelt: vi.fn(),
  applySweep: vi.fn(),
  applyBonhommeSkin: vi.fn(),
}));

vi.mock('../src/cosmetics.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/cosmetics.js')>();
  return { ...actual, applyCardSkin, applyBonhommeSkin };
});
vi.mock('../src/theme.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/theme.js')>();
  return { ...actual, applyTheme };
});
vi.mock('../src/felt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/felt.js')>();
  return { ...actual, applyFelt };
});
vi.mock('../src/sweeps.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/sweeps.js')>();
  return { ...actual, applySweep };
});

const EMPTY_PROFILE: Profile = {
  color: null,
  paint: null,
  cardSkin: null,
  theme: null,
  bonhommeSkin: null,
  felt: null,
  sweep: null,
  awardOrder: null,
};

describe('applyProfileCosmetics', () => {
  it('applies every non-null equip field via its own applier', () => {
    applyProfileCosmetics({
      ...EMPTY_PROFILE,
      cardSkin: 'noir',
      theme: 'sepia',
      felt: 'casino',
      sweep: 'riffle',
      bonhommeSkin: 'og',
    });
    expect(applyCardSkin).toHaveBeenCalledWith('noir');
    expect(applyTheme).toHaveBeenCalledWith('sepia');
    expect(applyFelt).toHaveBeenCalledWith('casino');
    expect(applySweep).toHaveBeenCalledWith('riffle');
    expect(applyBonhommeSkin).toHaveBeenCalledWith('og');
  });

  it('touches nothing for a profile that never equipped anything (a device keeps its own look)', () => {
    applyCardSkin.mockClear();
    applyTheme.mockClear();
    applyFelt.mockClear();
    applySweep.mockClear();
    applyBonhommeSkin.mockClear();
    applyProfileCosmetics(EMPTY_PROFILE);
    expect(applyCardSkin).not.toHaveBeenCalled();
    expect(applyTheme).not.toHaveBeenCalled();
    expect(applyFelt).not.toHaveBeenCalled();
    expect(applySweep).not.toHaveBeenCalled();
    expect(applyBonhommeSkin).not.toHaveBeenCalled();
  });

  it('applies fields independently — a profile with only one equip touches only that applier', () => {
    applyCardSkin.mockClear();
    applyTheme.mockClear();
    applyFelt.mockClear();
    applySweep.mockClear();
    applyBonhommeSkin.mockClear();
    applyProfileCosmetics({ ...EMPTY_PROFILE, felt: 'slate' });
    expect(applyFelt).toHaveBeenCalledWith('slate');
    expect(applyCardSkin).not.toHaveBeenCalled();
    expect(applyTheme).not.toHaveBeenCalled();
    expect(applySweep).not.toHaveBeenCalled();
    expect(applyBonhommeSkin).not.toHaveBeenCalled();
  });

  it('ignores an unrecognised bonhommeSkin value instead of passing it through', () => {
    // bonhommeSkin is a closed literal union, unlike the open-catalog string
    // ids of the other four axes — a corrupt/foreign value must not reach
    // applyBonhommeSkin (which assumes its argument is already valid).
    applyBonhommeSkin.mockClear();
    applyProfileCosmetics({ ...EMPTY_PROFILE, bonhommeSkin: 'not-a-real-skin' });
    expect(applyBonhommeSkin).not.toHaveBeenCalled();
  });
});

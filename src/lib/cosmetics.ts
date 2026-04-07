export type EquippedCosmetics = Partial<{
  theme: string;
}>;

const THEME_BUNDLES: Record<string, string[]> = {
  theme_cyberpunk: ["theme-grid-cyberpunk", "theme-letters-glitch", "theme-bg-cyberpunk", "theme-anim-decrypt"],
  theme_library: ["theme-grid-library", "theme-letters-stamped", "theme-bg-library", "theme-anim-ink"],
  theme_minimalist: ["theme-grid-glass", "theme-letters-pebble", "theme-bg-aurora", "theme-anim-solar"],
  theme_cosmic_voyager: ["theme-grid-cosmic", "theme-letters-cosmic", "theme-bg-galaxy", "theme-anim-warp"],
  theme_arcade_8bit: ["theme-grid-arcade", "theme-letters-arcade", "theme-bg-arcade", "theme-anim-pixel"],
  theme_cathedral: ["theme-grid-cathedral", "theme-letters-gothic", "theme-bg-cloister", "theme-anim-sunbeam"],
  theme_origami_zen: ["theme-grid-origami", "theme-letters-sumie", "theme-bg-zen", "theme-anim-fold"],
  theme_shadow_puppet: ["theme-grid-shadow", "theme-letters-silhouette", "theme-bg-silk", "theme-anim-lantern"],
  theme_tapestry: ["theme-grid-canvas", "theme-letters-yarn", "theme-bg-basket", "theme-anim-sewing"],
};

export const getEquippedCosmeticThemeClasses = (equippedCosmetics?: EquippedCosmetics | null) => {
  const themeId = equippedCosmetics?.theme;
  if (!themeId) return [];
  return THEME_BUNDLES[themeId] || [];
};

export const getEquippedCosmeticThemeClassName = (equippedCosmetics?: EquippedCosmetics | null) =>
  getEquippedCosmeticThemeClasses(equippedCosmetics).join(" ");

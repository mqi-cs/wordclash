export type EquippedCosmetics = Partial<{
  theme: string;
}>;

const THEME_BUNDLES: Record<string, string[]> = {
  theme_cyberpunk: ["theme-grid-cyberpunk", "theme-letters-glitch", "theme-bg-cyberpunk", "theme-anim-decrypt"],
  theme_library: ["theme-grid-library", "theme-letters-stamped", "theme-bg-library", "theme-anim-ink"],
  theme_minimalist: ["theme-grid-glass", "theme-letters-pebble", "theme-bg-aurora", "theme-anim-solar"],
  theme_fantasy: ["theme-grid-retro", "theme-letters-chiseled", "theme-bg-starfield", "theme-anim-slam"],
};

export const getEquippedCosmeticThemeClasses = (equippedCosmetics?: EquippedCosmetics | null) => {
  const themeId = equippedCosmetics?.theme;
  if (!themeId) return [];
  return THEME_BUNDLES[themeId] || [];
};

export const getEquippedCosmeticThemeClassName = (equippedCosmetics?: EquippedCosmetics | null) =>
  getEquippedCosmeticThemeClasses(equippedCosmetics).join(" ");


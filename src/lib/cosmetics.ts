export type EquippedCosmetics = Partial<{
  letters: string;
  grid: string;
  background: string;
  animation: string;
}>;

const EQUIPPED_COSMETIC_SLOTS = ["letters", "grid", "background", "animation"] as const;

export const getEquippedCosmeticThemeClasses = (equippedCosmetics?: EquippedCosmetics | null) =>
  EQUIPPED_COSMETIC_SLOTS.flatMap((slot) => {
    const cosmeticId = equippedCosmetics?.[slot];
    return cosmeticId ? [`theme-${cosmeticId.replace(/_/g, "-")}`] : [];
  });

export const getEquippedCosmeticThemeClassName = (equippedCosmetics?: EquippedCosmetics | null) =>
  getEquippedCosmeticThemeClasses(equippedCosmetics).join(" ");

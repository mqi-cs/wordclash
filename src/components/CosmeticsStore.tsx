import { CSSProperties, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Type,
  Grid3X3,
  Wallpaper,
  Sparkles,
  Diamond,
  Gift,
  Check,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getEquippedCosmeticThemeClassName } from "@/lib/cosmetics";

// ── Category metadata for icons + colors ────────────────────────────

const CATEGORY_META: Record<
  string,
  { icon: React.ReactNode; accentHsl: string; label: string }
> = {
  theme: {
    icon: <Sparkles className="w-5 h-5" />,
    accentHsl: "280 72% 58%",
    label: "Theme Bundles",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

function getTimeUntilReset(): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

// ── Component ────────────────────────────────────────────────────────

export const CosmeticsStore = () => {
  const { user } = useAuth();

  const wallet = useQuery(api.cosmetics.getMyCosmetics, user ? {} : "skip");
  const catalog = useQuery(api.cosmetics.getCatalog, {});

  const purchase = useMutation(api.cosmetics.purchaseCosmetic);
  const equip = useMutation(api.cosmetics.equipCosmetic);

  const [storeOpen, setStoreOpen] = useState(true);

  const shards = wallet?.shards ?? 0;
  const owned = wallet?.ownedCosmetics ?? [];
  const equipped = wallet?.equippedCosmetics ?? {};

  // ── Handlers ──────────────────────────────────────────────────────

  const handlePurchase = async (cosmeticId: string) => {
    try {
      await purchase({ cosmeticId });
      toast.success("Cosmetic unlocked! ✨");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to purchase");
    }
  };

  const handleEquip = async (cosmeticId: string) => {
    try {
      await equip({ cosmeticId });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to equip");
    }
  };

  // ── Not signed in ─────────────────────────────────────────────────

  if (!user) {
    return (
      <section className="space-y-5 animate-fade-in">
        <SectionHeader shards={0} />
        <Card className="border-border/70 bg-card/60 p-8 text-center space-y-3">
          <Diamond className="w-10 h-10 mx-auto text-purple-400/50" />
          <p className="text-sm text-muted-foreground">
            Sign in to access daily quests and earn cosmetics
          </p>
        </Card>
      </section>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  const catalogItems = catalog ?? [];

  // Group catalog by category
  const grouped: Record<string, typeof catalogItems> = {};
  for (const item of catalogItems) {
    const cat = item.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  return (
    <section className="space-y-6 animate-fade-in" id="cosmetics-section">
      <SectionHeader shards={shards} />

      {/* ── Store Toggle ───────────────────────────────────────── */}
      <Button
        variant="outline"
        className="w-full border-purple-500/25 bg-purple-500/5 text-purple-300 hover:bg-purple-500/10 hover:border-purple-400/40 transition-all duration-300"
        onClick={() => setStoreOpen(!storeOpen)}
        id="cosmetics-store-toggle"
      >
        <ShoppingCart className="w-4 h-4 mr-2" />
        {storeOpen ? "Hide" : "Browse"} Cosmetics Store
        {storeOpen ? (
          <ChevronUp className="w-4 h-4 ml-2" />
        ) : (
          <ChevronDown className="w-4 h-4 ml-2" />
        )}
      </Button>

      {/* ── Store Grid ─────────────────────────────────────────── */}
      {storeOpen && (
        <div className="space-y-6 animate-fade-in">
          {Object.entries(grouped).map(([category, items]) => {
            const meta = CATEGORY_META[category];
            if (!meta) return null;
            return (
              <div key={category} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: `hsl(${meta.accentHsl} / 0.3)`,
                      backgroundColor: `hsl(${meta.accentHsl} / 0.08)`,
                      color: `hsl(${meta.accentHsl})`,
                    }}
                  >
                    {meta.icon}
                  </div>
                  <h4 className="text-sm font-bold tracking-tight text-foreground">
                    {meta.label}
                  </h4>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => {
                    const isOwned = owned.includes(item.id);
                    const isEquipped =
                      equipped &&
                      Object.values(equipped).includes(item.id);
                    const canAfford = shards >= item.cost;

                    return (
                      <Card
                        key={item.id}
                        id={`cosmetic-item-${item.id}`}
                        className={`relative overflow-hidden border-border/70 bg-card/60 p-4 space-y-3 transition-all duration-300 ${
                          isEquipped
                            ? "ring-2 ring-purple-500/60 border-purple-500/40"
                            : ""
                        }`}
                      >
                        {/* Equipped indicator */}
                        {isEquipped && (
                          <div className="absolute top-2 right-2">
                            <Badge className="border-0 bg-purple-500 text-[10px] text-white px-1.5 py-0.5">
                              Equipped
                            </Badge>
                          </div>
                        )}

                        <div className="space-y-1">
                          <h5 className="text-sm font-bold text-foreground">
                            {item.name}
                          </h5>
                          <p className="text-xs text-muted-foreground leading-snug">
                            {item.description}
                          </p>
                        </div>

                        {item.category === "theme" && (
                          <ThemeBundlePreview themeId={item.id} />
                        )}

                        {isOwned ? (
                          <Button
                            size="sm"
                            variant={isEquipped ? "secondary" : "outline"}
                            className="w-full text-xs h-8"
                            onClick={() => handleEquip(item.id)}
                          >
                            {isEquipped ? "Unequip" : "Equip"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className={`w-full text-xs h-8 ${
                              canAfford
                                ? "bg-purple-600 text-white hover:bg-purple-700"
                                : "opacity-50 cursor-not-allowed"
                            }`}
                            disabled={!canAfford}
                            onClick={() => handlePurchase(item.id)}
                          >
                            <Diamond className="w-3 h-3 mr-1" />
                            {item.cost} Shard{item.cost !== 1 ? "s" : ""}
                          </Button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

// ── Sub-components ───────────────────────────────────────────────────

const previewRevealStyles: CSSProperties = {
  "--flip-bg": "hsl(var(--game-correct))",
  "--flip-border": "hsl(var(--game-correct))",
  "--flip-text": "#ffffff",
} as CSSProperties;

const THEME_PREVIEW_ROWS = [
  [
    { letter: "W", className: "tile-revealed tile-correct bg-game-correct border-game-correct text-white" },
    { letter: "O", className: "tile-revealed tile-present bg-game-present border-game-present text-white" },
    { letter: "R", className: "tile-revealed tile-absent bg-game-absent border-game-absent text-white" },
    { letter: "D", className: "tile-filled border-game-border-active bg-game-empty" },
    { letter: "", className: "tile-empty border-game-border bg-game-empty" },
  ],
  [
    {
      letter: "C",
      className: "tile-revealing tile-correct border-game-border bg-game-empty text-game-text animate-flip-reveal",
      style: previewRevealStyles,
    },
    { letter: "L", className: "tile-filled border-game-border-active bg-game-empty" },
    { letter: "A", className: "tile-filled border-game-border-active bg-game-empty" },
    { letter: "S", className: "tile-filled border-game-border-active bg-game-empty" },
    { letter: "H", className: "tile-filled border-game-border-active bg-game-empty" },
  ],
];

function ThemeBundlePreview({ themeId }: { themeId: string }) {
  const themeClassName = getEquippedCosmeticThemeClassName({ theme: themeId });

  if (!themeClassName) {
    return null;
  }

  return (
    <div
      className={cn(
        "cosmetic-preview relative overflow-hidden rounded-xl border border-border/60 p-3",
        themeClassName,
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/10" />
      <div className="relative z-[1] space-y-2">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/80">
          <span>Preview</span>
          <span>Live Theme</span>
        </div>
        <div className="mx-auto flex w-full max-w-[220px] flex-col gap-1.5">
          {THEME_PREVIEW_ROWS.map((row, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-5 gap-1.5">
              {row.map((tile, tileIndex) => (
                <div
                  key={`${rowIndex}-${tileIndex}`}
                  className={cn(
                    "relative flex aspect-square w-full items-center justify-center overflow-hidden border-2 text-lg font-bold uppercase transition-all duration-100 tile",
                    tile.className,
                  )}
                  style={tile.style}
                >
                  {tile.letter}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ shards }: { shards: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-400/30 bg-purple-500/12">
          <Sparkles className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Cosmetics
          </h2>
          <p className="text-xs text-muted-foreground">
            Complete quests · Earn shards · Unlock styles
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-purple-500/25 bg-purple-500/8 px-4 py-1.5">
        <Diamond className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-bold text-purple-300">{shards}</span>
      </div>
    </div>
  );
}

interface QuestSlot {
  questId: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  reward: number;
}

export const DailyQuestsSidebar = () => {
  const { user } = useAuth();
  const quests = useQuery(api.cosmetics.getMyQuests, user ? {} : "skip");
  const seedQuests = useMutation(api.cosmetics.seedDailyQuests);
  const claimReward = useMutation(api.cosmetics.claimQuestReward);
  const [resetTimer, setResetTimer] = useState(getTimeUntilReset);

  useEffect(() => {
    if (user) {
      seedQuests().catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    const t = setInterval(() => setResetTimer(getTimeUntilReset()), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleClaim = async (questId: string) => {
    try {
      await claimReward({ questId });
      toast.success("+3 shards earned! 💎");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to claim");
    }
  };

  if (!user) {
    return (
      <Card className="overflow-hidden border-border/70 bg-card/60">
        <div className="border-b border-border/60 bg-gradient-to-br from-amber-400/10 via-background to-background p-5">
          <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
            <Gift className="w-4 h-4 text-amber-400" />
            Daily Quests
          </h3>
        </div>
        <div className="p-5 text-sm text-muted-foreground">
          Sign in to view today&apos;s quests and claim shard rewards.
        </div>
      </Card>
    );
  }

  const questSlots = quests?.questSlots ?? [];

  return (
    <Card className="overflow-hidden border-border/70 bg-card/60">
      <div className="border-b border-border/60 bg-gradient-to-br from-amber-400/10 via-background to-background p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
              <Gift className="w-4 h-4 text-amber-400" />
              Daily Quests
            </h3>
            <p className="text-xs text-muted-foreground">
              Knock these out to stack shards for new cosmetic drops.
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {resetTimer}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {questSlots.map((slot) => (
          <QuestCard
            key={slot.questId}
            slot={slot}
            onClaim={() => handleClaim(slot.questId)}
          />
        ))}
        {questSlots.length === 0 && (
          <Card className="border-dashed border-border/70 bg-background/40 p-6 text-center">
            <p className="text-sm text-muted-foreground">Loading quests…</p>
          </Card>
        )}
      </div>
    </Card>
  );
};

function QuestCard({
  slot,
  onClaim,
}: {
  slot: QuestSlot;
  onClaim: () => void;
}) {
  const pct = Math.min((slot.progress / slot.target) * 100, 100);

  return (
    <Card
      id={`quest-${slot.questId}`}
      className={`relative overflow-hidden border-border/70 bg-card/60 p-4 space-y-3 transition-all duration-300 ${
        slot.claimed ? "opacity-55" : ""
      }`}
    >
      <div className="space-y-1">
        <h4 className="text-sm font-bold text-foreground">{slot.title}</h4>
        <p className="text-xs text-muted-foreground">{slot.description}</p>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {slot.progress}/{slot.target}
          </span>
          <span className="flex items-center gap-1">
            <Diamond className="w-3 h-3 text-purple-400" />
            {slot.reward}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${pct}%`,
              background:
                slot.completed
                  ? "linear-gradient(90deg, hsl(149 60% 45%), hsl(149 70% 55%))"
                  : "linear-gradient(90deg, hsl(280 72% 50%), hsl(280 72% 62%))",
            }}
          />
        </div>
      </div>

      {/* Action */}
      {slot.claimed ? (
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Check className="w-3.5 h-3.5" />
          Claimed
        </div>
      ) : slot.completed ? (
        <Button
          size="sm"
          className="w-full text-xs h-8 bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700"
          onClick={onClaim}
        >
          <Gift className="w-3.5 h-3.5 mr-1" />
          Claim +{slot.reward} Shards
        </Button>
      ) : (
        <div className="h-8 flex items-center justify-center text-xs text-muted-foreground">
          In Progress…
        </div>
      )}
    </Card>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, X } from "lucide-react";

const TOUR_KEY = "wordclash_tour_seen";

interface TourStep {
  targetId: string;
  title: string;
  description: string;
  accentVar: string;
  position: "bottom" | "top" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "tour-header",
    title: "Welcome to WordClash",
    description:
      "Tactical word battles in a neon-lit arena. Let us show you around!",
    accentVar: "primary",
    position: "bottom",
  },
  {
    targetId: "tour-classic",
    title: "Classic Mode",
    description:
      "Guess the 5-letter word in 6 tries. Green means correct, yellow means wrong spot, grey means not in the word.",
    accentVar: "menu-classic",
    position: "bottom",
  },
  {
    targetId: "tour-hard",
    title: "Hard Mode",
    description:
      "No yellow hints — only green or grey. You get 10 guesses and a special hint that eliminates wrong letters from the keyboard.",
    accentVar: "menu-hard",
    position: "bottom",
  },
  {
    targetId: "tour-timed",
    title: "Timed Mode",
    description:
      "Start with 90 seconds. Solve words to earn +30s bonus time. How many can you complete before the clock runs out?",
    accentVar: "menu-timed",
    position: "bottom",
  },
  {
    targetId: "tour-multiplayer",
    title: "Multiplayer & Challenges",
    description:
      "Create a lobby, invite friends, and race to solve the same word. First to guess it wins! Add friends and send direct challenges.",
    accentVar: "menu-multiplayer",
    position: "top",
  },
  {
    targetId: "tour-auth",
    title: "Sign In to Unlock More",
    description:
      "Create an account to track stats, add friends, send challenges, and climb the leaderboard.",
    accentVar: "primary",
    position: "bottom",
  },
  {
    targetId: "tour-help-btn",
    title: "Need Help Later?",
    description:
      "Tap this button anytime to read detailed guides for every game mode and feature.",
    accentVar: "primary",
    position: "bottom",
  },
];

const STEP_DURATION = 5000; // 5 seconds per step
const TRANSITION_DURATION = 400;

interface GuidedTourProps {
  onComplete: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const GuidedTour = ({ onComplete }: GuidedTourProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(
    null
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  const updateSpotlight = useCallback(
    (stepIndex: number) => {
      const s = TOUR_STEPS[stepIndex];
      const el = document.getElementById(s.targetId);
      if (!el) {
        // Element not found — skip to next or finish
        if (stepIndex < TOUR_STEPS.length - 1) {
          setCurrentStep(stepIndex + 1);
        } else {
          handleComplete();
        }
        return;
      }

      el.scrollIntoView({ behavior: "smooth", block: "center" });

      // Wait for scroll to settle before measuring
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const padding = 12;
        const newRect = {
          top: rect.top - padding + window.scrollY,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        };
        setSpotlightRect(newRect);

        // Position tooltip
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const tooltipWidth = Math.min(340, viewportWidth - 32);
        const viewportRect = {
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        };

        const newTooltipStyle: React.CSSProperties = {
          width: tooltipWidth,
          position: "fixed",
          zIndex: 60,
        };

        // Horizontal centering relative to the element
        let tooltipLeft =
          viewportRect.left + viewportRect.width / 2 - tooltipWidth / 2;
        tooltipLeft = Math.max(16, Math.min(tooltipLeft, viewportWidth - tooltipWidth - 16));
        newTooltipStyle.left = tooltipLeft;

        // Vertical positioning
        const spaceBelow = viewportHeight - (viewportRect.top + viewportRect.height);
        const spaceAbove = viewportRect.top;

        if (s.position === "top" || spaceBelow < 180) {
          // Place above
          newTooltipStyle.bottom = viewportHeight - viewportRect.top + 12;
          newTooltipStyle.top = "auto";
        } else {
          // Place below
          newTooltipStyle.top = viewportRect.top + viewportRect.height + 12;
          newTooltipStyle.bottom = "auto";
        }

        setTooltipStyle(newTooltipStyle);
        setIsTransitioning(false);
      }, 350);
    },
    []
  );

  // Auto-advance timer
  useEffect(() => {
    if (isTransitioning) return;

    timerRef.current = setTimeout(() => {
      if (isLast) {
        handleComplete();
      } else {
        goToStep(currentStep + 1);
      }
    }, STEP_DURATION);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStep, isTransitioning, isLast]);

  // Initial spotlight
  useEffect(() => {
    // Small delay for the menu to render and animate in
    const initTimer = setTimeout(() => updateSpotlight(0), 600);
    return () => clearTimeout(initTimer);
  }, []);

  // Recalculate on resize
  useEffect(() => {
    const handleResize = () => updateSpotlight(currentStep);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [currentStep, updateSpotlight]);

  const goToStep = (index: number) => {
    if (isTransitioning) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(index);
      updateSpotlight(index);
    }, TRANSITION_DURATION / 2);
  };

  const handleComplete = () => {
    localStorage.setItem(TOUR_KEY, "true");
    onComplete();
  };

  const handleNext = () => {
    if (isLast) {
      handleComplete();
    } else {
      goToStep(currentStep + 1);
    }
  };

  return (
    <>
      {/* Dark overlay with spotlight cutout using CSS mask */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 transition-all"
        style={{
          background: "rgba(0, 0, 0, 0.7)",
          ...(spotlightRect
            ? {
                maskImage: `radial-gradient(ellipse ${spotlightRect.width * 0.6}px ${spotlightRect.height * 0.6}px at ${spotlightRect.left + spotlightRect.width / 2}px ${spotlightRect.top + spotlightRect.height / 2 - window.scrollY}px, transparent 60%, black 100%)`,
                WebkitMaskImage: `radial-gradient(ellipse ${spotlightRect.width * 0.6}px ${spotlightRect.height * 0.6}px at ${spotlightRect.left + spotlightRect.width / 2}px ${spotlightRect.top + spotlightRect.height / 2 - window.scrollY}px, transparent 60%, black 100%)`,
              }
            : {}),
        }}
        onClick={handleNext}
      />

      {/* Spotlight border ring */}
      {spotlightRect && (
        <div
          className={cn(
            "pointer-events-none fixed z-50 rounded-2xl border-2 transition-all",
            isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
          )}
          style={{
            top: spotlightRect.top - window.scrollY,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            borderColor: `hsl(var(--${step.accentVar}))`,
            boxShadow: `0 0 30px 4px hsl(var(--${step.accentVar}) / 0.3), inset 0 0 20px 2px hsl(var(--${step.accentVar}) / 0.1)`,
            transitionDuration: `${TRANSITION_DURATION}ms`,
          }}
        />
      )}

      {/* Skip button */}
      <button
        onClick={handleComplete}
        className="fixed right-4 top-4 z-[60] flex items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur transition-colors hover:bg-black/80 hover:text-white sm:right-6 sm:top-6 sm:px-4 sm:py-2 sm:text-sm"
      >
        Skip Tour
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Tooltip */}
      <div
        className={cn(
          "pointer-events-auto z-[60] transition-all",
          isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
        )}
        style={{
          ...tooltipStyle,
          transitionDuration: `${TRANSITION_DURATION}ms`,
        }}
      >
        <div
          className="overflow-hidden rounded-2xl border bg-card/95 shadow-2xl backdrop-blur-md"
          style={{
            borderColor: `hsl(var(--${step.accentVar}) / 0.4)`,
          }}
        >
          {/* Progress bar */}
          <div className="h-1 w-full bg-muted/50">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progress}%`,
                backgroundColor: `hsl(var(--${step.accentVar}))`,
              }}
            />
          </div>

          <div className="p-4 sm:p-5">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                {step.title}
              </h3>
              <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground sm:text-xs">
                {currentStep + 1}/{TOUR_STEPS.length}
              </span>
            </div>

            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>

            <div className="flex items-center justify-between">
              {/* Step dots */}
              <div className="flex gap-1.5">
                {TOUR_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      goToStep(i);
                    }}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === currentStep
                        ? "w-5"
                        : "w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/40"
                    )}
                    style={
                      i === currentStep
                        ? {
                            backgroundColor: `hsl(var(--${step.accentVar}))`,
                          }
                        : undefined
                    }
                  />
                ))}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 sm:text-sm"
                style={{
                  backgroundColor: `hsl(var(--${step.accentVar}))`,
                }}
              >
                {isLast ? "Start Playing!" : "Next"}
                {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Timer ring animation */}
      {!isTransitioning && (
        <div
          className="fixed z-[60] pointer-events-none"
          style={{
            ...tooltipStyle,
            width: "auto",
            left: "auto",
            right: 16,
            top: tooltipStyle.top !== "auto" ? (typeof tooltipStyle.top === 'number' ? tooltipStyle.top - 6 : tooltipStyle.top) : "auto",
            bottom: tooltipStyle.bottom !== "auto" ? (typeof tooltipStyle.bottom === 'number' ? tooltipStyle.bottom - 6 : tooltipStyle.bottom) : "auto"
          }}
        >
        </div>
      )}
    </>
  );
};

export const hasSeenTour = (): boolean => {
  return localStorage.getItem(TOUR_KEY) === "true";
};

export const resetTour = (): void => {
  localStorage.removeItem(TOUR_KEY);
};

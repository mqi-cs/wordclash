import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { usePostHog } from "@/contexts/PostHogContext";
import {
  Flame,
  Timer,
  Zap,
  Bot,
  Lightbulb,
  Swords,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ONBOARDING_KEY = "wordclash_onboarding_seen";

interface SlideData {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  accentVar: string; // CSS variable name like "menu-classic"
}

const slides: SlideData[] = [
  {
    icon: <Bot className="w-10 h-10" />,
    title: "Bot System",
    subtitle: "AI Opponent in Classic Mode",
    description:
      "Activate a bot opponent during Classic games to race head-to-head. Choose Easy, Medium, or Hard difficulty — the bot plays simultaneously on a split screen.",
    features: [
      "Available exclusively in Classic mode",
      "Three difficulty levels to match your skill",
      "Bot guesses are blurred until you finish",
    ],
    accentVar: "menu-classic",
  },
  {
    icon: <Lightbulb className="w-10 h-10" />,
    title: "Hints",
    subtitle: "A Helping Hand",
    description:
      "Stuck? Use a hint after your first guess. In Classic & Timed modes it reveals a correct letter position. In Hard mode, it eliminates 3 wrong letters from the keyboard instead.",
    features: [
      "One hint available per guess turn",
      "Classic / Timed — reveals a letter in the grid",
      "Hard mode — crosses out 3 absent letters on the keyboard",
    ],
    accentVar: "menu-timed",
  },
  {
    icon: <Flame className="w-10 h-10" />,
    title: "Hard Mode",
    subtitle: "Pure Skill, No Yellow Hints",
    description:
      "An intense variant where tiles only show green (correct) or grey (wrong). No yellow hints means you rely purely on logic and vocabulary.",
    features: [
      "10 guesses instead of 6 to compensate",
      "Only green and grey feedback — no yellow",
      "Hint eliminates letters instead of revealing them",
    ],
    accentVar: "menu-hard",
  },
  {
    icon: <Timer className="w-10 h-10" />,
    title: "Timed Mode",
    subtitle: "Race the Clock",
    description:
      "Start with 75 seconds on the clock. Every word you solve earns a +25 second bonus, and each hint costs 10 seconds. Solve as many words as possible before time runs out!",
    features: [
      "Unlimited guesses per word",
      "+25 seconds added for each solved word",
      "Hints cost 10 seconds",
      "Total words completed is your final score",
    ],
    accentVar: "menu-timed",
  },
  {
    icon: <Zap className="w-10 h-10" />,
    title: "Multiplayer",
    subtitle: "Real-Time Word Battles",
    description:
      "Create or join a lobby using a shareable code. Up to 4 players race to solve the same word — first to guess it wins!",
    features: [
      "Host a lobby with a unique code",
      "Up to 4 players compete live",
      "First solver wins the match",
    ],
    accentVar: "menu-multiplayer",
  },
  {
    icon: <Swords className="w-10 h-10" />,
    title: "Challenges & Friends",
    subtitle: "Build Your Network",
    description:
      "Search for other players by username and send friend requests. Once connected, challenge friends to direct 1v1 matches right from the home screen.",
    features: [
      "Search and add friends by username",
      "Send and receive challenge invitations",
      "Track your win rate and best streak in stats",
    ],
    accentVar: "menu-multiplayer",
  },
];

interface OnboardingGuideProps {
  onComplete: () => void;
}

export const OnboardingGuide = ({ onComplete }: OnboardingGuideProps) => {
  const { trackGame } = usePostHog();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [isAnimating, setIsAnimating] = useState(false);

  // Track initial slide view
  useEffect(() => {
    trackGame("onboarding_viewed", { slide_index: 0, slide_title: slides[0].title });
  }, [trackGame]);

  const slide = slides[currentSlide];
  const isLast = currentSlide === slides.length - 1;
  const isFirst = currentSlide === 0;

  const goTo = (index: number) => {
    if (isAnimating || index === currentSlide) return;
    setDirection(index > currentSlide ? "right" : "left");
    setIsAnimating(true);
    
    // Track slide transition
    trackGame("onboarding_slide_viewed", { 
      slide_index: index, 
      slide_title: slides[index].title,
      direction: index > currentSlide ? "forward" : "backward"
    });

    setTimeout(() => {
      setCurrentSlide(index);
      setIsAnimating(false);
    }, 200);
  };

  const next = () => {
    if (isLast) {
      handleComplete("finished");
    } else {
      goTo(currentSlide + 1);
    }
  };

  const prev = () => {
    if (!isFirst) goTo(currentSlide - 1);
  };

  const handleComplete = (reason: "finished" | "skipped" = "skipped") => {
    trackGame("onboarding_completed", { 
      reason, 
      last_slide_index: currentSlide,
      percent_complete: Math.round(((currentSlide + 1) / slides.length) * 100)
    });
    localStorage.setItem(ONBOARDING_KEY, "true");
    onComplete();
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") handleComplete();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentSlide, isAnimating, next, prev]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 transition-all duration-700"
        style={{
          background: `radial-gradient(circle at 50% 40%, hsl(var(--${slide.accentVar}) / 0.15), transparent 55%)`,
        }}
      />

      {/* Skip button */}
      <button
        onClick={() => handleComplete()}
        className="absolute right-4 top-4 z-50 flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition-colors hover:bg-card hover:text-foreground sm:right-6 sm:top-6 sm:px-4 sm:py-2 sm:text-sm"
      >
        Skip
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Content card */}
      <div className="relative mx-4 flex w-full max-w-lg flex-col items-center">
        {/* Slide content */}
        <div
          className={cn(
            "flex w-full flex-col items-center text-center transition-all duration-200",
            isAnimating && direction === "right" && "translate-x-4 opacity-0",
            isAnimating && direction === "left" && "-translate-x-4 opacity-0",
            !isAnimating && "translate-x-0 opacity-100"
          )}
        >
          {/* Icon */}
          <div
            className="mb-6 flex h-20 w-20 items-center justify-center rounded-[1.6rem] border transition-colors duration-500 sm:h-24 sm:w-24"
            style={{
              borderColor: `hsl(var(--${slide.accentVar}) / 0.4)`,
              backgroundColor: `hsl(var(--${slide.accentVar}) / 0.12)`,
              color: `hsl(var(--${slide.accentVar}))`,
            }}
          >
            {slide.icon}
          </div>

          {/* Title area */}
          <h2 className="mb-1 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            {slide.title}
          </h2>
          <p
            className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] sm:text-base"
            style={{ color: `hsl(var(--${slide.accentVar}))` }}
          >
            {slide.subtitle}
          </p>

          {/* Description */}
          <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            {slide.description}
          </p>

          {/* Features */}
          <div className="mb-8 w-full max-w-sm space-y-2.5">
            {slide.features.map((feature, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3 text-left text-sm text-muted-foreground backdrop-blur-sm"
              >
                <div
                  className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: `hsl(var(--${slide.accentVar}))` }}
                />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation controls */}
        <div className="flex w-full items-center justify-between gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={prev}
            disabled={isFirst}
            className="h-10 w-10 rounded-full"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          {/* Dots */}
          <div className="flex items-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === currentSlide ? "w-6" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                style={
                  i === currentSlide
                    ? { backgroundColor: `hsl(var(--${slide.accentVar}))` }
                    : undefined
                }
              />
            ))}
          </div>

          {isLast ? (
            <Button
              onClick={() => handleComplete("finished")}
              className="h-10 rounded-full px-5 font-semibold"
              style={{
                backgroundColor: `hsl(var(--${slide.accentVar}))`,
                color: "hsl(var(--primary-foreground))",
              }}
            >
              Let's Play!
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={next}
              className="h-10 w-10 rounded-full"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Slide counter */}
        <p className="mt-4 text-xs text-muted-foreground/60">
          {currentSlide + 1} / {slides.length}
        </p>
      </div>
    </div>
  );
};

export const hasSeenOnboarding = (): boolean => {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
};

export const resetOnboarding = (): void => {
  localStorage.removeItem(ONBOARDING_KEY);
};

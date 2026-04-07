import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type WalkthroughSlide = {
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
  accentVar: string;
};

interface FeatureWalkthroughDialogProps {
  open: boolean;
  slides: WalkthroughSlide[];
  actionLabel?: string;
  onAction: () => void;
  onOpenChange: (open: boolean) => void;
}

export const FeatureDiscoveryHalo = ({ accentVar }: { accentVar: string }) => (
  <>
    <div
      className="pointer-events-none absolute -inset-2 rounded-[2rem] animate-pulse"
      style={{
        boxShadow: `0 0 0 2px hsl(var(--${accentVar}) / 0.8), 0 0 30px hsl(var(--${accentVar}) / 0.45), 0 0 60px hsl(var(--${accentVar}) / 0.2)`,
      }}
    />
    <div
      className="pointer-events-none absolute -inset-4 rounded-[2.25rem] opacity-80"
      style={{
        background: `radial-gradient(circle, hsl(var(--${accentVar}) / 0.16) 0%, transparent 65%)`,
      }}
    />
  </>
);

export const FeatureWalkthroughDialog = ({
  open,
  slides,
  actionLabel = "Continue",
  onAction,
  onOpenChange,
}: FeatureWalkthroughDialogProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (open) {
      setCurrentSlide(0);
    }
  }, [open]);

  const slide = useMemo(() => slides[currentSlide], [slides, currentSlide]);
  const isLastSlide = currentSlide === slides.length - 1;

  const handlePrimary = () => {
    if (isLastSlide) {
      onAction();
      return;
    }
    setCurrentSlide((prev) => prev + 1);
  };

  const handleBack = () => {
    if (currentSlide === 0) {
      onOpenChange(false);
      return;
    }
    setCurrentSlide((prev) => prev - 1);
  };

  if (!slide) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/70 bg-background/95 sm:max-w-2xl">
        <DialogHeader className="space-y-4 text-left">
          <div className="flex items-center justify-between gap-4">
            <div
              className="inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]"
              style={{
                borderColor: `hsl(var(--${slide.accentVar}) / 0.35)`,
                color: `hsl(var(--${slide.accentVar}))`,
                backgroundColor: `hsl(var(--${slide.accentVar}) / 0.08)`,
              }}
            >
              {slide.subtitle}
            </div>
            <div className="flex items-center gap-2">
              {slides.map((entry, index) => (
                <div
                  key={`${entry.title}-${index}`}
                  className="h-2.5 w-2.5 rounded-full transition-all"
                  style={{
                    backgroundColor:
                      index === currentSlide
                        ? `hsl(var(--${slide.accentVar}))`
                        : "hsl(var(--border))",
                    transform: index === currentSlide ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>
          <DialogTitle className="text-2xl font-black tracking-tight">
            {slide.title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-7 text-muted-foreground">
            {slide.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {slide.bullets.map((bullet) => (
            <div
              key={bullet}
              className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3"
            >
              <div
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: `hsl(var(--${slide.accentVar}))` }}
              />
              <p className="text-sm text-muted-foreground">{bullet}</p>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={handleBack}>
            {currentSlide === 0 ? "Close" : "Back"}
          </Button>
          <Button
            onClick={handlePrimary}
            style={{
              backgroundColor: `hsl(var(--${slide.accentVar}))`,
              color: "hsl(var(--primary-foreground))",
            }}
          >
            {isLastSlide ? actionLabel : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

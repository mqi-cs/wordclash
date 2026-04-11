import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";

type CoachCallout = {
  targetId: string;
  title: string;
  description: string;
  accentVar: string;
  position?: "top" | "bottom" | "left" | "right";
};

type MeasuredCallout = CoachCallout & {
  rect: DOMRect;
};

interface InteractiveFeatureCoachProps {
  open: boolean;
  callouts: CoachCallout[];
  cursorTargetId?: string;
  cursorPressed?: boolean;
  onSkip: () => void;
}

const getCalloutStyle = (
  rect: DOMRect,
  position: CoachCallout["position"] = "bottom",
): React.CSSProperties => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isMobile = viewportWidth < 640;
  const width = Math.min(isMobile ? 360 : 320, viewportWidth - 24);

  if (isMobile) {
    return {
      width,
      left: Math.max(12, (viewportWidth - width) / 2),
      top: 14,
    };
  }

  if (position === "top") {
    return {
      width,
      left: Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, viewportWidth - width - 16)),
      top: Math.max(16, rect.top - 150),
    };
  }

  if (position === "left") {
    return {
      width,
      left: Math.max(16, rect.left - width - 20),
      top: Math.max(16, Math.min(rect.top + rect.height / 2 - 60, viewportHeight - 140)),
    };
  }

  if (position === "right") {
    return {
      width,
      left: Math.min(viewportWidth - width - 16, rect.right + 20),
      top: Math.max(16, Math.min(rect.top + rect.height / 2 - 60, viewportHeight - 140)),
    };
  }

  return {
    width,
    left: Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, viewportWidth - width - 16)),
    top: Math.min(viewportHeight - 140, rect.bottom + 18),
  };
};

export const InteractiveFeatureCoach = ({
  open,
  callouts,
  cursorTargetId,
  cursorPressed = false,
  onSkip,
}: InteractiveFeatureCoachProps) => {
  const [measuredCallouts, setMeasuredCallouts] = useState<MeasuredCallout[]>([]);

  useEffect(() => {
    if (!open) {
      setMeasuredCallouts([]);
      return;
    }

    const updateMeasurements = () => {
      const next = callouts
        .map((callout) => {
          const element = document.getElementById(callout.targetId);
          if (!element) {
            return null;
          }
          return {
            ...callout,
            rect: element.getBoundingClientRect(),
          };
        })
        .filter((callout): callout is MeasuredCallout => callout !== null);

      setMeasuredCallouts(next);
    };

    updateMeasurements();
    window.addEventListener("resize", updateMeasurements);
    window.addEventListener("scroll", updateMeasurements, true);

    return () => {
      window.removeEventListener("resize", updateMeasurements);
      window.removeEventListener("scroll", updateMeasurements, true);
    };
  }, [callouts, open]);

  const cursorRect = useMemo(() => {
    if (!cursorTargetId) {
      return null;
    }
    return measuredCallouts.find((callout) => callout.targetId === cursorTargetId)?.rect ?? null;
  }, [cursorTargetId, measuredCallouts]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-background/75 backdrop-blur-sm" />

      {measuredCallouts.map((callout) => (
        <div
          key={callout.targetId}
          className="pointer-events-none fixed rounded-[1.4rem] border-2"
          style={{
            top: callout.rect.top - 10,
            left: callout.rect.left - 10,
            width: callout.rect.width + 20,
            height: callout.rect.height + 20,
            borderColor: `hsl(var(--${callout.accentVar}))`,
            boxShadow: `0 0 28px hsl(var(--${callout.accentVar}) / 0.45), inset 0 0 18px hsl(var(--${callout.accentVar}) / 0.12)`,
          }}
        />
      ))}

      {measuredCallouts.map((callout) => (
        <div
          key={`${callout.targetId}-label`}
          className="fixed z-[121] rounded-2xl border border-border/70 bg-background/95 px-4 py-3 shadow-2xl"
          style={getCalloutStyle(callout.rect, callout.position)}
        >
          <div
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: `hsl(var(--${callout.accentVar}))` }}
          >
            Feature Guide
          </div>
          <h3 className="text-sm font-bold text-foreground">{callout.title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {callout.description}
          </p>
        </div>
      ))}

      {cursorRect && (
        <div
          className={cn(
            "pointer-events-none fixed z-[122] transition-all duration-700 ease-out",
            cursorPressed && "scale-90",
          )}
          style={{
            top: cursorRect.top + cursorRect.height / 2 - 8,
            left: cursorRect.left + cursorRect.width / 2 - 8,
          }}
        >
          <MousePointer2 className="h-8 w-8 fill-white text-foreground drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]" />
        </div>
      )}

      <div className="fixed left-1/2 top-4 z-[123] -translate-x-1/2 sm:left-auto sm:right-6 sm:top-auto sm:bottom-6 sm:translate-x-0">
        <Button variant="outline" className="bg-background/95" onClick={onSkip}>
          Skip Tutorial
        </Button>
      </div>
    </div>
  );
};

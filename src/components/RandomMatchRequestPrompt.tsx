import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type RandomMatchRequestPromptProps = {
  requesterUsername: string;
  processing?: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export const RandomMatchRequestPrompt = ({
  requesterUsername,
  processing = false,
  onAccept,
  onDecline,
}: RandomMatchRequestPromptProps) => {
  return (
    <Card className="fixed left-1/2 top-4 z-[120] w-[calc(100vw-1.5rem)] max-w-[24rem] -translate-x-1/2 border-primary/25 bg-background/95 p-4 shadow-2xl backdrop-blur sm:left-auto sm:right-6 sm:top-auto sm:bottom-6 sm:w-[min(92vw,24rem)] sm:translate-x-0 sm:p-5">
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            Random Opponent
          </p>
          <h3 className="text-base font-bold sm:text-lg">{requesterUsername} wants to play</h3>
          <p className="text-sm text-muted-foreground">
            Accept to jump into a classic challenge right away.
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Button className="flex-1" disabled={processing} onClick={onAccept}>
            {processing ? "Loading..." : "Accept"}
          </Button>
          <Button
            className="flex-1"
            disabled={processing}
            onClick={onDecline}
            variant="outline"
          >
            Decline
          </Button>
        </div>
      </div>
    </Card>
  );
};

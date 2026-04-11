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
    <Card className="fixed bottom-6 right-6 z-[120] w-[min(92vw,24rem)] border-primary/25 bg-background/95 p-5 shadow-2xl backdrop-blur">
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            Random Opponent
          </p>
          <h3 className="text-lg font-bold">{requesterUsername} wants to play</h3>
          <p className="text-sm text-muted-foreground">
            Accept to jump into a classic challenge right away.
          </p>
        </div>
        <div className="flex gap-3">
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

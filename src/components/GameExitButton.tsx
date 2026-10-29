import { useState } from "react";
import { useMutation } from "convex/react";
import { LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { usePostHog } from "@/contexts/PostHogContext";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type GameExitButtonProps = {
  game: {
    _id: Id<"games">;
    gameType: "multiplayer" | "challenge";
    status: "waiting" | "in_progress" | "finished" | "abandoned";
    mode?: "classic" | "hard" | "timed";
    // From the server: what leaving means for this player.
    exitAction: "delete" | "leave";
  };
  onExited?: () => void;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  // Show only the icon on small screens.
  compactLabel?: boolean;
};

const getCopy = (game: GameExitButtonProps["game"]) => {
  const noun = game.gameType === "challenge" ? "challenge" : "lobby";
  if (game.exitAction === "delete") {
    return {
      label: "Delete",
      pending: "Deleting...",
      title: `Delete this ${noun}?`,
      description: `This cancels the ${noun} for everyone who joined.`,
      done: `${noun === "lobby" ? "Lobby" : "Challenge"} deleted`,
    };
  }
  if (game.status === "waiting") {
    return {
      label: "Leave",
      pending: "Leaving...",
      title: "Leave this lobby?",
      description: "You can rejoin with the lobby code while it's still open.",
      done: "You left the lobby",
    };
  }
  return {
    label: "Forfeit",
    pending: "Forfeiting...",
    title: "Forfeit this match?",
    description: "You'll be counted as having lost. The match carries on for the other players.",
    done: "You forfeited the match",
  };
};

export const GameExitButton = ({
  game,
  onExited,
  variant = "outline",
  size,
  className,
  compactLabel = false,
}: GameExitButtonProps) => {
  const { trackGame } = usePostHog();
  const deleteGame = useMutation(api.games.deleteGame);
  const leaveGame = useMutation(api.games.leaveGame);
  const [pending, setPending] = useState(false);
  const copy = getCopy(game);
  const Icon = game.exitAction === "delete" ? Trash2 : LogOut;

  const handleConfirm = async () => {
    setPending(true);
    try {
      if (game.exitAction === "delete") {
        await deleteGame({ gameId: game._id });
      } else {
        await leaveGame({ gameId: game._id });
      }
      trackGame(game.exitAction === "delete" ? "game_deleted" : "game_left", {
        game_id: game._id,
        game_type: game.gameType,
        mode: game.mode ?? "classic",
        status: game.status,
      });
      toast.success(copy.done);
      onExited?.();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, `Couldn't ${copy.label.toLowerCase()} this game`));
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          disabled={pending}
          className={cn("text-destructive hover:text-destructive", className)}
        >
          <Icon className={cn("h-4 w-4", compactLabel && "h-3 w-3 sm:h-4 sm:w-4")} />
          <span className={cn(compactLabel && "hidden sm:inline")}>
            {pending ? copy.pending : copy.label}
          </span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void handleConfirm()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {copy.label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

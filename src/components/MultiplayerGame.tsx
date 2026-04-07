import { useState, useEffect, useCallback, useRef } from "react";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Users, Crown, Copy, Check, Play } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { getEquippedCosmeticThemeClassName } from "@/lib/cosmetics";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const TURN_DURATION = 20;
const MAX_MULTIPLAYER_PLAYERS = 4;
const LOBBY_CODE_REGEX = /^[A-Z0-9]{6}$/;

interface MultiplayerGameProps {
  onBackToMenu: () => void;
  themeClassName?: string;
}

type EntryMode = "select" | "join" | null;

type PlayerBoard = {
  id: string;
  username: string;
  isHost: boolean;
  themeClassName: string;
  guesses: string[];
  evaluations: Array<Array<"correct" | "present" | "absent">>;
  hasWon: boolean;
  isOut: boolean;
  solvedCount: number;
};

const syncMultiplayerUrl = (gameId: string) => {
  window.history.replaceState({}, "", `/?mode=multiplayer&game=${gameId}`);
};

const resetMultiplayerUrl = () => {
  window.history.replaceState({}, "", "/");
};

const isLobbyCode = (value: string) => LOBBY_CODE_REGEX.test(value.trim().toUpperCase());

export const MultiplayerGame = ({ onBackToMenu, themeClassName }: MultiplayerGameProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [entryMode, setEntryMode] = useState<EntryMode>(null);
  const [joinCode, setJoinCode] = useState("");
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const [myCurrentGuess, setMyCurrentGuess] = useState("");
  const [myLetterStatus, setMyLetterStatus] = useState<Record<string, "correct" | "present" | "absent">>({});
  const [shake, setShake] = useState(false);
  const [copiedLobbyCode, setCopiedLobbyCode] = useState(false);
  const [subMode, setSubMode] = useState<"classic" | "hard" | "timed">("classic");
  const [turnTimer, setTurnTimer] = useState(TURN_DURATION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [gameTimeLeft, setGameTimeLeft] = useState(0);
  const gameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const game = useQuery(api.games.getGame, gameId ? { gameId } : "skip");
  const shouldFetchGuesses =
    !!gameId &&
    game !== undefined &&
    game !== null &&
    !(game.status === "waiting" && game.gameType === "multiplayer");
  const guesses = useQuery(
    api.guesses.getGuesses,
    shouldFetchGuesses && gameId ? { gameId } : "skip",
  );
  const targetWord = useQuery(
    api.games.getTargetWord,
    gameId && (game?.status === "finished" || game?.status === "abandoned")
      ? { gameId }
      : "skip",
  );

  const createGameMut = useMutation(api.games.createGame);
  const joinGameMut = useMutation(api.games.joinGame);
  const joinGameByCodeMut = useMutation(api.games.joinGameByCode);
  const startGameMut = useMutation(api.games.startGame);
  const submitGuessMut = useMutation(api.guesses.submitGuess);
  const captureUserEvent = useMutation(api.analyticsEvents.captureUserEvent);

  const players = game?.players ?? [];
  const boards: PlayerBoard[] = players.map((player) => {
    const playerGuessesRaw = (guesses ?? []).filter((guess) => guess.playerId === player.id);
    const mode = game?.mode ?? "classic";

    if (mode === "timed") {
      const solved = playerGuessesRaw.filter(g => g.evaluation.every(e => e === "correct"));
      const latestWordIndex = solved.length;
      const currentWordGuesses = playerGuessesRaw.filter(g => (g.wordIndex ?? 0) === latestWordIndex);
      const evaluations = currentWordGuesses.map((guess) => guess.evaluation);

      return {
        id: player.id,
        username: player.username,
        isHost: player.isHost,
        themeClassName: getEquippedCosmeticThemeClassName(player.equippedCosmetics),
        guesses: currentWordGuesses.map((guess) => guess.guess),
        evaluations,
        hasWon: false, // In timed mode, you win when time is up and you have most solved
        isOut: false,
        solvedCount: solved.length,
      };
    }

    const evaluations = playerGuessesRaw.map((guess) => guess.evaluation);
    const maxGuesses = mode === "hard" ? 10 : 6;
    return {
      id: player.id,
      username: player.username,
      isHost: player.isHost,
      themeClassName: getEquippedCosmeticThemeClassName(player.equippedCosmetics),
      guesses: playerGuessesRaw.map((guess) => guess.guess),
      evaluations,
      hasWon: evaluations.some((evaluation) => evaluation.every((status) => status === "correct")),
      isOut: playerGuessesRaw.length >= maxGuesses,
      solvedCount: evaluations.some((evaluation) => evaluation.every((status) => status === "correct")) ? 1 : 0,
    };
  });

  const myBoard = boards.find((board) => board.id === user?.id) ?? null;
  const otherBoards = boards.filter((board) => board.id !== user?.id);
  const isHost = game?.player1Id === user?.id;
  const isChallenge = game?.gameType === "challenge";
  const mode = game?.mode ?? "classic";
  const maxGuesses = mode === "hard" ? 10 : mode === "timed" ? 999 : 6;
  const gameStarted = game?.status === "in_progress" || game?.status === "finished";
  const myGameOver = myBoard ? (mode !== "timed" && (myBoard.hasWon || myBoard.isOut)) || game?.status === "finished" : false;
  const winningBoard = game?.winnerId
    ? boards.find((board) => board.id === game.winnerId) ?? null
    : null;
  const isDraw = game?.isDraw;
  const challengeOpponent = otherBoards[0] ?? null;
  const hideOpponentLetters = game?.status !== "finished" && game?.status !== "abandoned";
  const isMyTurn =
    isChallenge && game?.status === "in_progress" && myBoard && challengeOpponent
      ? myBoard.guesses.length === challengeOpponent.guesses.length
        ? isHost
        : myBoard.guesses.length < challengeOpponent.guesses.length
      : true;

  const handleJoinByCode = useCallback(
    async (code: string) => {
      try {
        const joinedGameId = await joinGameByCodeMut({ lobbyCode: code.trim().toUpperCase() });
        setGameId(joinedGameId);
        setEntryMode(null);
        syncMultiplayerUrl(joinedGameId);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to join lobby";
        toast.error(errorMessage);
      }
    },
    [joinGameByCodeMut],
  );

  const resolveRequestedGame = useCallback(
    async (requestedGameId: Id<"games">) => {
      try {
        const resolvedGameId = await joinGameMut({ gameId: requestedGameId });
        setGameId(resolvedGameId);
        setEntryMode(null);
        syncMultiplayerUrl(resolvedGameId);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to open multiplayer game";
        toast.error(errorMessage);
        setGameId(null);
        setEntryMode("select");
        resetMultiplayerUrl();
      }
    },
    [joinGameMut],
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth");
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const requestedGameId = urlParams.get("game");
    const requestedJoinTarget = urlParams.get("join");

    if (requestedGameId) {
      void resolveRequestedGame(requestedGameId as Id<"games">);
      return;
    }

    if (requestedJoinTarget) {
      if (isLobbyCode(requestedJoinTarget)) {
        void handleJoinByCode(requestedJoinTarget);
      } else {
        void resolveRequestedGame(requestedJoinTarget as Id<"games">);
      }
      return;
    }

    setEntryMode("select");
  }, [handleJoinByCode, loading, navigate, resolveRequestedGame, user]);

  useEffect(() => {
    if (!myBoard) {
      setMyLetterStatus({});
      return;
    }

    const nextStatus: Record<string, "correct" | "present" | "absent"> = {};
    myBoard.guesses.forEach((guess, rowIndex) => {
      guess.split("").forEach((letter, letterIndex) => {
        const currentStatus = nextStatus[letter];
        const evaluatedStatus = myBoard.evaluations[rowIndex]?.[letterIndex];

        if (
          evaluatedStatus &&
          (!currentStatus ||
            (currentStatus === "absent" && evaluatedStatus !== "absent") ||
            (currentStatus === "present" && evaluatedStatus === "correct"))
        ) {
          nextStatus[letter] = evaluatedStatus;
        }
      });
    });

    setMyLetterStatus(nextStatus);
  }, [myBoard]);

  useEffect(() => {
    if (!isChallenge || !gameStarted || game?.status === "finished" || !gameId) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTurnTimer(TURN_DURATION);
      return;
    }

    if (isMyTurn && !myGameOver) {
      timerRef.current = setInterval(() => {
        setTurnTimer((previousValue) => {
          if (previousValue <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            toast.error("Time's up! Submitting a blank guess as penalty.");
            void submitGuessMut({ gameId, guess: "XXXXX" }).catch(() => null);
            return TURN_DURATION;
          }
          return previousValue - 1;
        });
      }, 1000);
    } else {
      setTurnTimer(TURN_DURATION);
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [game?.status, gameId, gameStarted, isChallenge, isMyTurn, myGameOver, submitGuessMut]);

  // Timed mode game timer
  useEffect(() => {
    if (mode !== "timed" || game?.status !== "in_progress" || !game?.gameEndTime) {
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      setGameTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const remainingTime = Math.max(0, Math.floor((game.gameEndTime! - Date.now()) / 1000));
      setGameTimeLeft(remainingTime);
      if (remainingTime <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    gameTimerRef.current = interval;
    return () => clearInterval(interval);
  }, [game?.gameEndTime, game?.status, mode]);

  const handleCreateLobby = async () => {
    try {
      const newGameId = await createGameMut({ gameType: "multiplayer", mode: subMode });
      setGameId(newGameId);
      setEntryMode(null);
      syncMultiplayerUrl(newGameId);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create lobby";
      toast.error(errorMessage);
    }
  };

  const handleResumeGame = async (existingGameId: Id<"games">) => {
    try {
      const resolvedGameId = await joinGameMut({ gameId: existingGameId });
      setGameId(resolvedGameId);
      setEntryMode(null);
      syncMultiplayerUrl(resolvedGameId);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to open game";
      toast.error(errorMessage);
    }
  };

  const handleStartGame = async () => {
    if (!gameId) return;

    try {
      await startGameMut({ gameId });
      toast.success("Game started!");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to start game";
      toast.error(errorMessage);
    }
  };

  const handleCopyLobbyCode = async () => {
    if (!game?.lobbyCode) return;

    await navigator.clipboard.writeText(game.lobbyCode);
    setCopiedLobbyCode(true);
    toast.success("Lobby code copied!");
    window.setTimeout(() => setCopiedLobbyCode(false), 1500);
  };

  const handleBack = () => {
    if (gameId && game && game.status !== "finished") {
      void captureUserEvent({
        event: "game_abandoned",
        properties: {
          game_id: gameId,
          game_type: game.gameType,
          mode: game.mode ?? "classic",
          status: game.status,
          player_count: game.playerCount,
          abandon_reason:
            game.status === "waiting" ? "returned_to_menu_from_lobby" : "returned_to_menu",
        },
      }).catch(() => null);
    }

    onBackToMenu();
  };

  const handleKeyPress = useCallback(
    (key: string) => {
      if (myGameOver || !gameStarted || myCurrentGuess.length >= WORD_LENGTH) return;
      if (isChallenge && !isMyTurn) return;
      if (mode === "timed" && gameTimeLeft <= 0) return;
      setMyCurrentGuess((previousValue) => previousValue + key);
    },
    [gameStarted, isChallenge, isMyTurn, myCurrentGuess.length, myGameOver, mode, gameTimeLeft],
  );

  const handleDelete = useCallback(() => {
    if (myGameOver || !gameStarted) return;
    if (isChallenge && !isMyTurn) return;
    setMyCurrentGuess((previousValue) => previousValue.slice(0, -1));
  }, [gameStarted, isChallenge, isMyTurn, myGameOver]);

  const handleEnter = useCallback(async () => {
    if (myGameOver || !gameStarted || !gameId) return;
    if (isChallenge && !isMyTurn) return;

    if (myCurrentGuess.length !== WORD_LENGTH) {
      toast.error("Not enough letters");
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      return;
    }

    try {
      await submitGuessMut({ gameId, guess: myCurrentGuess });
      setMyCurrentGuess("");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit guess";
      toast.error(errorMessage);
    }
  }, [gameId, gameStarted, isChallenge, isMyTurn, myCurrentGuess, myGameOver, submitGuessMut]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        void handleEnter();
      } else if (event.key === "Backspace") {
        handleDelete();
      } else if (/^[a-zA-Z]$/.test(event.key)) {
        handleKeyPress(event.key.toUpperCase());
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDelete, handleEnter, handleKeyPress]);

  const renderEntryScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Button variant="ghost" className="self-start -ml-4" onClick={handleBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      <div className="flex flex-col items-center max-w-xl w-full gap-6">
        <Card className="w-full p-8 space-y-6 text-center border-primary/15">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Multiplayer Lobby</h2>
            <p className="text-muted-foreground">
              Create a lobby for up to 4 players or join one with a 6-character code.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Button
              className="h-16 text-lg bg-primary hover:bg-primary/90"
              onClick={handleCreateLobby}
            >
              <Users className="mr-2 h-5 w-5" /> Create Lobby
            </Button>
            <Button
              className="h-16 text-lg"
              variant="secondary"
              onClick={() => setEntryMode("join")}
            >
              Join Lobby
            </Button>
          </div>

          {entryMode === "join" && (
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="Enter lobby code"
                className="h-12 text-center text-lg tracking-[0.35em] uppercase"
                maxLength={6}
              />
              <Button
                className="h-12 px-8"
                disabled={!isLobbyCode(joinCode)}
                onClick={() => void handleJoinByCode(joinCode)}
              >
                Join
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );

  const renderLobby = () => (
    <div className="flex flex-col items-center max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="w-full flex justify-between items-center">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Exit
        </Button>
        <div className="flex items-center gap-2 bg-secondary/60 px-3 py-1.5 rounded-full text-sm font-medium">
          <Users className="h-4 w-4 text-primary" /> {game?.playerCount ?? 0}/{MAX_MULTIPLAYER_PLAYERS} Players
        </div>
      </div>

      <Card className="w-full p-8 space-y-6 border-primary/15">
        <div className="text-center space-y-3">
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Lobby Code</p>
          <div className="flex items-center justify-center gap-3">
            <div className="text-4xl font-black tracking-[0.3em]">{game?.lobbyCode ?? "------"}</div>
            <Button variant="outline" size="icon" onClick={() => void handleCopyLobbyCode()}>
              {copiedLobbyCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Share this code so other players can join your lobby.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Mode</h3>
          <div className="grid grid-cols-3 gap-2">
            {(["classic", "hard", "timed"] as const).map((m) => (
              <Button
                key={m}
                variant={isHost ? (subMode === m ? "default" : "outline") : (game?.mode === m ? "default" : "outline")}
                onClick={() => isHost && setSubMode(m)}
                disabled={!isHost}
                className="capitalize h-10"
              >
                {m}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Players</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  {player.isHost && <Crown className="h-4 w-4 text-primary" />}
                  <span className="font-medium">{player.username}</span>
                </div>
                {player.id === user?.id && (
                  <span className="text-xs text-muted-foreground">You</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {isHost ? (
            <Button
              className="flex-1 h-12 bg-primary hover:bg-primary/90"
              disabled={(game?.playerCount ?? 0) < 2}
              onClick={() => void handleStartGame()}
            >
              <Play className="mr-2 h-4 w-4" /> Start Game
            </Button>
          ) : (
            <div className="flex-1 rounded-lg border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
              Waiting for the host to start the game.
            </div>
          )}
        </div>
      </Card>
    </div>
  );

  const renderChallengeBoard = () => {
    const opponentBoard = challengeOpponent;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
        <div className="flex flex-col items-center">
          <h2
            className={cn(
              "text-xl font-bold tracking-tight mb-4 transition-colors",
              !isMyTurn && gameStarted ? "text-primary" : "text-muted-foreground",
            )}
          >
            {opponentBoard?.username ?? "Opponent"}
          </h2>
          <div
            className={cn(
              "scale-75 origin-top rounded-3xl border border-primary/10 p-4 md:scale-90 opacity-80 overflow-hidden",
              opponentBoard?.themeClassName,
            )}
          >
            <GameGrid
              guesses={opponentBoard?.guesses ?? []}
              currentGuess=""
              evaluations={opponentBoard?.evaluations ?? []}
              shake={false}
              isOpponent={true}
              blurCompletedGuesses={hideOpponentLetters}
            />
          </div>
        </div>

        <div className="flex flex-col items-center">
          <h2
            className={cn(
              "text-xl font-bold tracking-tight mb-4 transition-colors",
              isMyTurn && gameStarted ? "text-primary" : "",
            )}
          >
            You
          </h2>
          <div
            className={cn(
              "rounded-3xl border border-primary/10 p-4 overflow-hidden",
              myBoard?.themeClassName,
            )}
          >
            <GameGrid
              guesses={myBoard?.guesses ?? []}
              currentGuess={myCurrentGuess}
              evaluations={myBoard?.evaluations ?? []}
              shake={shake}
              isOpponent={false}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderMultiplayerBoards = () => (
    <div className="w-full space-y-8">
        <div className="flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold">{user?.username ?? "You"}</h2>
          <div
            className={cn(
              "rounded-3xl border border-primary/10 p-4 overflow-hidden",
              myBoard?.themeClassName,
            )}
          >
            <GameGrid
              guesses={myBoard?.guesses ?? []}
              currentGuess={myCurrentGuess}
              evaluations={myBoard?.evaluations ?? []}
              maxGuesses={maxGuesses}
              shake={shake}
              isOpponent={false}
            />
          </div>
        </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-center">Other Players</h3>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {otherBoards.map((board) => (
            <Card key={board.id} className={cn("p-4 space-y-4 border-primary/10 overflow-hidden", board.themeClassName)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {board.isHost && <Crown className="h-4 w-4 text-primary" />}
                  <span className="font-semibold">{board.username}</span>
                </div>
                {board.hasWon && (
                  <span className="text-xs font-medium text-primary">Solved</span>
                )}
                {mode === "timed" && (
                    <span className="text-xs font-bold text-primary">{board.solvedCount} words</span>
                )}
              </div>
              <div className="scale-[0.82] origin-top">
                <GameGrid
                  guesses={board.guesses}
                  currentGuess=""
                  evaluations={board.evaluations}
                  maxGuesses={maxGuesses}
                  shake={false}
                  isOpponent={true}
                  blurCompletedGuesses={hideOpponentLetters}
                />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading || (!entryMode && gameId && game === undefined)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading multiplayer...</p>
        </div>
      </div>
    );
  }

  if (entryMode !== null || !gameId) {
    return renderEntryScreen();
  }

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <p className="text-muted-foreground">Game not found.</p>
        <Button onClick={handleBack}>Return to Menu</Button>
      </div>
    );
  }

  if (game.status === "waiting" && game.gameType === "multiplayer") {
    return renderLobby();
  }

  return (
    <div className={cn("flex flex-col h-[100dvh] bg-background w-full max-w-6xl mx-auto animate-in fade-in duration-500 overflow-hidden", themeClassName)}>
      <div className="w-full flex justify-between items-center p-2 sm:p-4 flex-shrink-0">
        <Button variant="ghost" onClick={handleBack} size="sm">
          <ArrowLeft className="mr-1 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Exit</span>
        </Button>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2 bg-secondary/50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium">
            <Users className="h-3 w-3 sm:h-4 sm:w-4 text-primary" /> {game.playerCount}/{isChallenge ? 2 : MAX_MULTIPLAYER_PLAYERS}
          </div>
          {mode === "timed" && gameStarted && (
            <div
                className={cn(
                    "flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-bold transition-colors",
                    gameTimeLeft <= 10 ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary text-primary-foreground",
                )}
            >
                {gameTimeLeft}s | {myBoard?.solvedCount ?? 0} words
            </div>
          )}
          {isChallenge && gameStarted && mode !== "timed" && (
            <div
              className={cn(
                "flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-bold transition-colors",
                isMyTurn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {isMyTurn ? `${turnTimer}s` : "Opponent's Turn"}
            </div>
          )}
        </div>
        {game.lobbyCode ? (
          <Button variant="outline" onClick={() => void handleCopyLobbyCode()} size="sm">
            {copiedLobbyCode ? <Check className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" /> : <Copy className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />}
            <span className="hidden sm:inline">Copy</span>
          </Button>
        ) : (
          <div className="w-[60px] sm:w-[108px]" />
        )}
      </div>

      <div className="flex-1 w-full flex flex-col min-h-0 overflow-y-auto px-2 sm:px-4 pb-4">
        <div className="flex flex-col items-center w-full max-w-4xl mx-auto space-y-6 my-auto">
          {isChallenge ? renderChallengeBoard() : renderMultiplayerBoards()}

          {game.status === "finished" && (
            <Card className="w-full max-w-md p-6 text-center shadow-lg border-primary/20 bg-background/95 backdrop-blur z-10 animate-in slide-in-from-bottom-8">
              <h2 className="text-2xl font-bold mb-4">
                {isDraw ? "It's a Draw!" : winningBoard
                  ? winningBoard.id === user?.id
                    ? "You Won!"
                    : `${winningBoard.username} won!`
                  : "Game Over"}
              </h2>
              {mode === "timed" ? (
                  <div className="space-y-2 mb-6">
                      <p className="text-lg">Words Completed:</p>
                      <div className="grid grid-cols-2 gap-4">
                          {boards.sort((a, b) => b.solvedCount - a.solvedCount).map(b => (
                              <div key={b.id} className={cn("p-2 rounded border", b.id === user?.id ? "border-primary bg-primary/10" : "border-border")}>
                                  <p className="text-sm truncate">{b.username}</p>
                                  <p className="text-xl font-bold">{b.solvedCount}</p>
                              </div>
                          ))}
                      </div>
                  </div>
              ) : (
                <p className="text-xl mb-6">
                    The word was: <span className="font-bold text-primary">{targetWord}</span>
                </p>
              )}
              <Button onClick={handleBack} className="w-full">Return to Menu</Button>
            </Card>
          )}

          {!gameStarted && !isHost && (
              <p className="text-sm font-medium text-muted-foreground bg-muted/50 px-4 py-2 rounded-full border border-border/30">
                  Mode: <span className="text-foreground capitalize">{game.mode}</span>
              </p>
          )}

          {(mode === "timed" || (myGameOver && game.status !== "finished")) && gameStarted && (
             <Card className="p-4 text-center border-primary/20 bg-background/80 backdrop-blur animate-in fade-in">
                {mode === "timed" && gameTimeLeft > 0 ? (
                    <p className="text-primary font-bold">Solve as many words as you can!</p>
                ) : (
                    <p className="text-muted-foreground font-medium">Waiting for other players to finish...</p>
                )}
             </Card>
          )}

          {!gameStarted && game.gameType === "challenge" && (
            <Card className="w-full max-w-md p-6 text-center border-primary/20 bg-background/95 backdrop-blur">
              <div className="animate-pulse space-y-4">
                <h3 className="text-lg font-semibold text-primary">Waiting for opponent...</h3>
                <p className="text-sm text-muted-foreground">Challenge will start as soon as the other player joins.</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {gameStarted && !myGameOver && (
        <div className="w-full flex-shrink-0 flex justify-center pb-2 sm:pb-4 px-2">
          <div className="w-full sm:w-[500px]">
            <Keyboard
              onKeyPress={handleKeyPress}
              onDelete={handleDelete}
              onEnter={() => void handleEnter()}
              letterStatus={myLetterStatus}
              disabled={isChallenge && !isMyTurn}
            />
          </div>
        </div>
      )}
    </div>
  );
};

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

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const TURN_DURATION = 20;
const MAX_MULTIPLAYER_PLAYERS = 4;
const LOBBY_CODE_REGEX = /^[A-Z0-9]{6}$/;

interface MultiplayerGameProps {
  onBackToMenu: () => void;
}

type EntryMode = "select" | "join" | null;

type PlayerBoard = {
  id: string;
  username: string;
  isHost: boolean;
  guesses: string[];
  evaluations: Array<Array<"correct" | "present" | "absent">>;
  hasWon: boolean;
  isOut: boolean;
};

const syncMultiplayerUrl = (gameId: string) => {
  window.history.replaceState({}, "", `/?mode=multiplayer&game=${gameId}`);
};

const resetMultiplayerUrl = () => {
  window.history.replaceState({}, "", "/");
};

const isLobbyCode = (value: string) => LOBBY_CODE_REGEX.test(value.trim().toUpperCase());

export const MultiplayerGame = ({ onBackToMenu }: MultiplayerGameProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [entryMode, setEntryMode] = useState<EntryMode>(null);
  const [joinCode, setJoinCode] = useState("");
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const [myCurrentGuess, setMyCurrentGuess] = useState("");
  const [myLetterStatus, setMyLetterStatus] = useState<Record<string, "correct" | "present" | "absent">>({});
  const [shake, setShake] = useState(false);
  const [copiedLobbyCode, setCopiedLobbyCode] = useState(false);
  const [turnTimer, setTurnTimer] = useState(TURN_DURATION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const players = game?.players ?? [];
  const boards: PlayerBoard[] = players.map((player) => {
    const playerGuessesRaw = (guesses ?? []).filter((guess) => guess.playerId === player.id);
    const evaluations = playerGuessesRaw.map((guess) => guess.evaluation);
    return {
      id: player.id,
      username: player.username,
      isHost: player.isHost,
      guesses: playerGuessesRaw.map((guess) => guess.guess),
      evaluations,
      hasWon: evaluations.some((evaluation) => evaluation.every((status) => status === "correct")),
      isOut: playerGuessesRaw.length >= MAX_GUESSES,
    };
  });

  const myBoard = boards.find((board) => board.id === user?.id) ?? null;
  const otherBoards = boards.filter((board) => board.id !== user?.id);
  const isHost = game?.player1Id === user?.id;
  const isChallenge = game?.gameType === "challenge";
  const gameStarted = game?.status === "in_progress" || game?.status === "finished";
  const myGameOver = myBoard ? myBoard.hasWon || myBoard.isOut || game?.status === "finished" : false;
  const winningBoard = game?.winnerId
    ? boards.find((board) => board.id === game.winnerId) ?? null
    : null;
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

  const handleCreateLobby = async () => {
    try {
      const newGameId = await createGameMut({ gameType: "multiplayer" });
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

  const handleKeyPress = useCallback(
    (key: string) => {
      if (myGameOver || !gameStarted || myCurrentGuess.length >= WORD_LENGTH) return;
      if (isChallenge && !isMyTurn) return;
      setMyCurrentGuess((previousValue) => previousValue + key);
    },
    [gameStarted, isChallenge, isMyTurn, myCurrentGuess.length, myGameOver],
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
      <Button variant="ghost" className="self-start -ml-4" onClick={onBackToMenu}>
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
        <Button variant="ghost" onClick={onBackToMenu}>
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
          <div className="scale-75 origin-top md:scale-90 opacity-80">
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
          <GameGrid
            guesses={myBoard?.guesses ?? []}
            currentGuess={myCurrentGuess}
            evaluations={myBoard?.evaluations ?? []}
            shake={shake}
            isOpponent={false}
          />
        </div>
      </div>
    );
  };

  const renderMultiplayerBoards = () => (
    <div className="w-full space-y-8">
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-2xl font-bold">You</h2>
        <GameGrid
          guesses={myBoard?.guesses ?? []}
          currentGuess={myCurrentGuess}
          evaluations={myBoard?.evaluations ?? []}
          shake={shake}
          isOpponent={false}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-center">Other Players</h3>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {otherBoards.map((board) => (
            <Card key={board.id} className="p-4 space-y-4 border-primary/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {board.isHost && <Crown className="h-4 w-4 text-primary" />}
                  <span className="font-semibold">{board.username}</span>
                </div>
                {board.hasWon && (
                  <span className="text-xs font-medium text-primary">Solved</span>
                )}
              </div>
              <div className="scale-[0.82] origin-top">
                <GameGrid
                  guesses={board.guesses}
                  currentGuess=""
                  evaluations={board.evaluations}
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
        <Button onClick={onBackToMenu}>Return to Menu</Button>
      </div>
    );
  }

  if (game.status === "waiting" && game.gameType === "multiplayer") {
    return renderLobby();
  }

  return (
    <div className="flex flex-col items-center max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="w-full flex justify-between items-center mb-4">
        <Button variant="ghost" onClick={onBackToMenu}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Exit
        </Button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-full text-sm font-medium">
            <Users className="h-4 w-4 text-primary" /> {game.playerCount}/{isChallenge ? 2 : MAX_MULTIPLAYER_PLAYERS} Players
          </div>
          {isChallenge && gameStarted && (
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold transition-colors",
                isMyTurn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {isMyTurn ? `${turnTimer}s` : "Opponent's Turn"}
            </div>
          )}
        </div>
        {game.lobbyCode ? (
          <Button variant="outline" onClick={() => void handleCopyLobbyCode()}>
            {copiedLobbyCode ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            Copy Code
          </Button>
        ) : (
          <div className="w-[108px]" />
        )}
      </div>

      {isChallenge ? renderChallengeBoard() : renderMultiplayerBoards()}

      {game.status === "finished" && (
        <Card className="w-full max-w-md p-6 text-center shadow-lg border-primary/20 bg-background/95 backdrop-blur z-10 animate-in slide-in-from-bottom-8">
          <h2 className="text-2xl font-bold mb-4">
            {winningBoard
              ? winningBoard.id === user?.id
                ? "You Won!"
                : `${winningBoard.username} won!`
              : "Game Over"}
          </h2>
          <p className="text-xl mb-6">
            The word was: <span className="font-bold text-primary">{targetWord}</span>
          </p>
          <Button onClick={onBackToMenu} className="w-full">Return to Menu</Button>
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

      {gameStarted && !myGameOver && (
        <div className="w-[100vw] sm:w-[500px] mt-8">
          <Keyboard
            onKeyPress={handleKeyPress}
            onDelete={handleDelete}
            onEnter={() => void handleEnter()}
            letterStatus={myLetterStatus}
            disabled={isChallenge && !isMyTurn}
          />
        </div>
      )}
    </div>
  );
};

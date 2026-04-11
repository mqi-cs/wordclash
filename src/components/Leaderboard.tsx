import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  getGuestLeaderboardSeries,
  subscribeToGuestLeaderboard,
  type GuestLeaderboardMode,
  type GuestLeaderboardRound,
  type GuestLeaderboardSeries,
} from "@/lib/guestLeaderboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type LeaderboardMode = GuestLeaderboardMode;
type LeaderboardPeriod = "daily" | "weekly";

type Cell =
  | { kind: "score"; value: number }
  | { kind: "failed" }
  | { kind: "empty" };

type LeaderboardRow = {
  rank?: number;
  username: string;
  status: "qualified" | "in_progress" | "disqualified";
  cells: [Cell, Cell, Cell];
  total: Cell;
  sourceDayKey?: string;
};

type LeaderboardRowLike = Omit<LeaderboardRow, "cells"> & {
  cells: Cell[];
};

type DisplayRow = LeaderboardRow & {
  key: string;
  isGuestPreview?: boolean;
  isViewerRow?: boolean;
};

interface LeaderboardProps {
  open: boolean;
  onClose: () => void;
}

const getModeHintCopy = (mode: LeaderboardMode) =>
  mode === "timed"
    ? "Timed totals are the total words completed across 3 sessions."
    : "Classic and Hard totals include a +1 guess penalty for every hint used.";

const cellToText = (cell: Cell) => {
  if (cell.kind === "score") return String(cell.value);
  if (cell.kind === "failed") return "×";
  return "—";
};

const toGuestCell = (mode: LeaderboardMode, round: GuestLeaderboardRound | undefined): Cell => {
  if (!round || round.status === "in_progress") {
    return { kind: "empty" };
  }

  if (mode === "timed") {
    if (round.status === "abandoned") {
      return { kind: "failed" };
    }
    return {
      kind: "score",
      value: round.wordsCompleted ?? round.adjustedScore ?? 0,
    };
  }

  if (round.status === "won") {
    return {
      kind: "score",
      value: round.adjustedScore ?? 0,
    };
  }

  return { kind: "failed" };
};

const toGuestRow = (
  series: GuestLeaderboardSeries,
  rank?: number,
): DisplayRow => {
  const rounds = [...series.rounds].sort((a, b) => a.slot - b.slot);
  const cells = [1, 2, 3].map((slot) => toGuestCell(series.mode, rounds.find((round) => round.slot === slot))) as [
    Cell,
    Cell,
    Cell,
  ];

  return {
    key: `guest-${series.mode}-${series.dayKey}`,
    username: "You (guest)",
    ...(typeof rank === "number" ? { rank } : {}),
    status: series.rankingStatus,
    cells,
    total:
      series.rankingStatus === "qualified" && typeof series.totalScore === "number"
        ? { kind: "score", value: series.totalScore }
        : series.rankingStatus === "disqualified"
          ? { kind: "failed" }
          : { kind: "empty" },
    isGuestPreview: true,
    sourceDayKey: series.dayKey,
  };
};

const buildDisplayRows = (
  rankedRows: LeaderboardRowLike[],
  viewerRow: LeaderboardRowLike | null | undefined,
  guestSeries: GuestLeaderboardSeries | null,
  projectedGuestRank: number | null | undefined,
  showGuestProjection: boolean,
): DisplayRow[] => {
  const baseRows: DisplayRow[] = rankedRows.map((row, index) => ({
    ...row,
    cells: row.cells as [Cell, Cell, Cell],
    rank: index + 1,
    key: `ranked-${row.username}-${index}`,
  }));

  if (showGuestProjection && guestSeries) {
    if (
      guestSeries.rankingStatus === "qualified" &&
      typeof projectedGuestRank === "number" &&
      projectedGuestRank <= 10
    ) {
      const guestRow = toGuestRow(guestSeries, projectedGuestRank);
      const withGuest = [...baseRows];
      withGuest.splice(projectedGuestRank - 1, 0, guestRow);

      return withGuest.slice(0, 10).map((row, index) => ({
        ...row,
        ...(row.status === "qualified" ? { rank: index + 1 } : {}),
      }));
    }

    const guestRow = toGuestRow(
      guestSeries,
      guestSeries.rankingStatus === "qualified" ? projectedGuestRank ?? undefined : undefined,
    );
    return [...baseRows, guestRow];
  }

  if (viewerRow) {
    return [
      ...baseRows,
      {
        ...viewerRow,
        cells: viewerRow.cells as [Cell, Cell, Cell],
        key: `viewer-${viewerRow.username}-${viewerRow.sourceDayKey ?? "current"}`,
        isViewerRow: true,
      },
    ];
  }

  return baseRows;
};

const LeaderboardTable = ({ rows }: { rows: DisplayRow[] }) => {
  if (rows.length === 0) {
    return (
      <div className="rounded-[1.4rem] border border-dashed border-border/70 bg-background/50 px-6 py-12 text-center">
        <Trophy className="mx-auto mb-4 h-10 w-10 text-muted-foreground/60" />
        <p className="text-sm font-medium text-muted-foreground">
          No ranked runs yet for this filter.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[1.4rem] border border-border/70 bg-background/45">
      <table className="w-full min-w-[680px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border/70 bg-background/70 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <th className="px-4 py-3 font-semibold">Rank</th>
            <th className="px-4 py-3 font-semibold">Player</th>
            <th className="px-4 py-3 text-center font-semibold">First</th>
            <th className="px-4 py-3 text-center font-semibold">Second</th>
            <th className="px-4 py-3 text-center font-semibold">Third</th>
            <th className="px-4 py-3 text-center font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={cn(
                "border-b border-border/60 last:border-b-0",
                row.isGuestPreview && "bg-primary/5",
                row.isViewerRow && "bg-amber-400/6",
              )}
            >
              <td className="px-4 py-4 text-sm font-semibold text-foreground">
                {typeof row.rank === "number" ? `#${row.rank}` : "—"}
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{row.username}</span>
                  {row.isGuestPreview && (
                    <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[11px]">
                      Preview
                    </Badge>
                  )}
                  {row.isViewerRow && (
                    <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 text-[11px]">
                      You
                    </Badge>
                  )}
                  {row.status === "disqualified" && (
                    <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-[11px]">
                      Disqualified
                    </Badge>
                  )}
                  {row.status === "in_progress" && (
                    <Badge variant="outline" className="border-border/70 bg-background/70 text-[11px]">
                      In Progress
                    </Badge>
                  )}
                </div>
                {row.sourceDayKey && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.isGuestPreview ? "Today only" : `Source day: ${row.sourceDayKey}`}
                  </p>
                )}
              </td>
              {row.cells.map((cell, index) => (
                <td key={`${row.key}-cell-${index}`} className="px-4 py-4 text-center text-sm font-semibold text-foreground">
                  {cellToText(cell)}
                </td>
              ))}
              <td className="px-4 py-4 text-center text-sm font-bold text-foreground">
                {cellToText(row.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const Leaderboard = ({ open, onClose }: LeaderboardProps) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<LeaderboardMode>("classic");
  const [period, setPeriod] = useState<LeaderboardPeriod>("daily");
  const [guestSeries, setGuestSeries] = useState<GuestLeaderboardSeries | null>(() =>
    getGuestLeaderboardSeries("classic"),
  );

  const leaderboard = useQuery(api.leaderboards.getLeaderboard, { mode, period });
  const projectedGuestRank = useQuery(
    api.leaderboards.getGuestProjectedRank,
    !user && period === "daily" && guestSeries
      ? {
          mode,
          rankingStatus: guestSeries.rankingStatus,
          totalHintsUsed: guestSeries.totalHintsUsed,
          ...(typeof guestSeries.totalScore === "number" ? { totalScore: guestSeries.totalScore } : {}),
          ...(typeof guestSeries.completedAt === "number" ? { completedAt: guestSeries.completedAt } : {}),
        }
      : "skip",
  );

  useEffect(() => {
    setGuestSeries(getGuestLeaderboardSeries(mode));
    return subscribeToGuestLeaderboard(() => {
      setGuestSeries(getGuestLeaderboardSeries(mode));
    });
  }, [mode]);

  const rows = useMemo(() => {
    const rankedRows = (leaderboard?.rankedRows ?? []) as LeaderboardRowLike[];
    const viewerRow = (leaderboard?.viewerRow ?? null) as LeaderboardRowLike | null;

    return buildDisplayRows(
      rankedRows,
      viewerRow,
      guestSeries,
      projectedGuestRank?.rank ?? null,
      !user && period === "daily",
    );
  }, [guestSeries, leaderboard?.rankedRows, leaderboard?.viewerRow, period, projectedGuestRank?.rank, user]);

  const helperCopy = useMemo(() => {
    if (!user && period === "daily") {
      return "This is your projected rank for today only. Sign in to save this ranking.";
    }
    return getModeHintCopy(mode);
  }, [mode, period, user]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto border-border/70 bg-card/92">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Trophy className="h-5 w-5 text-amber-400" />
            Ranked Leaderboards
          </DialogTitle>
          <p className="text-sm leading-6 text-muted-foreground">{helperCopy}</p>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={period} onValueChange={(value) => setPeriod(value as LeaderboardPeriod)}>
            <TabsList className="grid w-full grid-cols-2 rounded-2xl border border-border/70 bg-background/60 p-1">
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={mode} onValueChange={(value) => setMode(value as LeaderboardMode)}>
            <TabsList className="grid w-full grid-cols-3 rounded-2xl border border-border/70 bg-background/60 p-1">
              <TabsTrigger value="classic">Classic</TabsTrigger>
              <TabsTrigger value="hard">Hard</TabsTrigger>
              <TabsTrigger value="timed">Timed</TabsTrigger>
            </TabsList>
          </Tabs>

          {leaderboard === undefined ? (
            <div className="rounded-[1.4rem] border border-border/70 bg-background/50 px-6 py-12 text-center text-sm text-muted-foreground">
              Loading rankings...
            </div>
          ) : (
            <LeaderboardTable rows={rows} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

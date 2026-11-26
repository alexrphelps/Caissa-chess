import React, { useMemo, useState } from 'react';
import {
  getRankTierForRating,
  getStartingTierOption,
  getUndoAllowanceForRating,
  isBlunderAlertEnabledForRating,
  RatedJourneyProfile,
  RatedMatchRecord,
  SavedGamesCalibrationProgress,
  SavedGamesCalibrationResult,
  STARTING_TIER_OPTIONS,
  StartingTierId,
  UNDO_LADDER_STEPS,
} from '../chess/ratedJourney';
import { StoredGameSession } from '../chess/types';

interface RatedJourneyViewProps {
  profile: RatedJourneyProfile;
  savedSessions: StoredGameSession[];
  puzzleRatingPrior: number | null;
  calibrationProgress: SavedGamesCalibrationProgress | null;
  calibrationResult: SavedGamesCalibrationResult | null;
  isCalibrating: boolean;
  onSelectStartingTier: (tierId: StartingTierId, customElo?: number) => void;
  onStartNextMatch: () => void;
  onRunSavedGamesCalibration: () => void;
  onResetJourney: () => void;
  onOpenMatchInReplay: (sessionId: string) => void;
  onExit: () => void;
}

function formatDateShort(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export const RatedJourneyView: React.FC<RatedJourneyViewProps> = ({
  profile,
  savedSessions,
  puzzleRatingPrior,
  calibrationProgress,
  calibrationResult,
  isCalibrating,
  onSelectStartingTier,
  onStartNextMatch,
  onRunSavedGamesCalibration,
  onResetJourney,
  onOpenMatchInReplay,
  onExit,
}) => {
  const [selectedStartTier, setSelectedStartTier] = useState<StartingTierId>(
    calibrationResult?.suggestedTier ?? 'beginner'
  );
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const eligibleSavedGamesCount = useMemo(
    () =>
      savedSessions.filter(
        (s) =>
          s.gameMode === 'ai' &&
          Array.isArray(s.stateStack) &&
          s.stateStack.length >= 11
      ).length,
    [savedSessions]
  );

  const savedSessionsById = useMemo(() => {
    const map = new Map<string, StoredGameSession>();
    for (const s of savedSessions) {
      map.set(s.id, s);
    }
    return map;
  }, [savedSessions]);

  const tierInfo = useMemo(
    () => getRankTierForRating(profile.rating),
    [profile.rating]
  );
  const undoAllowance = getUndoAllowanceForRating(profile.rating);
  const blunderAlertsActive = isBlunderAlertEnabledForRating(profile.rating);
  const isProvisional = profile.gamesPlayed < 5 || profile.rd > 150;

  // Chronological points for SVG Rating Chart (oldest -> newest)
  const chartPoints = useMemo(() => {
    const chronological = [...profile.history].reverse();
    if (chronological.length === 0) {
      return [
        {
          id: 'start',
          label: 'Start',
          rating: profile.rating,
          match: null as RatedMatchRecord | null,
        },
      ];
    }
    const pts = [
      {
        id: 'start',
        label: 'Start',
        rating: chronological[0].ratingBefore,
        match: null as RatedMatchRecord | null,
      },
    ];
    chronological.forEach((m, idx) => {
      pts.push({
        id: m.id,
        label: `M${idx + 1}`,
        rating: m.ratingAfter,
        match: m,
      });
    });
    return pts;
  }, [profile.history, profile.rating]);

  const averageAccuracy = useMemo(() => {
    if (profile.history.length === 0) return null;
    const sum = profile.history.reduce((acc, m) => acc + m.accuracy, 0);
    return Math.round((sum / profile.history.length) * 10) / 10;
  }, [profile.history]);

  const selectedMatch = useMemo(
    () =>
      profile.history.find((m) => m.id === selectedMatchId) ??
      profile.history[0] ??
      null,
    [profile.history, selectedMatchId]
  );

  // =========================================================================
  // ONBOARDING VIEW (Not yet initialized: Prompt user for starting tier)
  // =========================================================================
  if (!profile.initialized) {
    const activeTierOption = getStartingTierOption(selectedStartTier);
    const useCalibratedElo =
      calibrationResult &&
      calibrationResult.gamesAnalyzed > 0 &&
      calibrationResult.suggestedTier === selectedStartTier;

    return (
      <div
        data-testid="rated-journey-onboarding"
        className="min-h-screen w-full bg-[#111815] text-[#F4EFE6] flex flex-col justify-between px-4 py-5 sm:px-8 md:px-14 md:py-8 overflow-x-hidden"
      >
        {/* Top Bar */}
        <div className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4 pb-6 border-b border-[#24322A]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              data-testid="journey-exit-btn"
              onClick={onExit}
              className="px-3 py-2 rounded-lg bg-[#1A241F] hover:bg-[#23322A] border border-[#2F4037] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              ← Back to Salon
            </button>
            <span className="text-xs font-mono text-[#A69F91] truncate hidden sm:inline">
              Rated Journey · Adaptive Skill Calibration
            </span>
          </div>
          <span className="text-xs font-mono text-[#C6923A] tabular-nums whitespace-nowrap shrink-0">
            400–3000 Elo Ladder
          </span>
        </div>

        {/* Main Onboarding Content */}
        <main className="max-w-5xl w-full mx-auto my-auto py-8 space-y-8">
          <div className="max-w-2xl space-y-2.5">
            <h1
              className="text-3xl sm:text-4xl font-bold text-[#F4EFE6] tracking-tight"
              style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
            >
              Choose Your Starting Pace
            </h1>
            <p className="text-sm sm:text-base text-[#B8B1A3] leading-relaxed">
              Tell us where you feel most comfortable starting. After every
              match, Caïssa blends your game result with move-by-move engine
              accuracy to calibrate your rating and select your next AI
              opponent. Beginners start with{' '}
              <strong className="text-[#F4EFE6]">3 Undos per game</strong>,
              which taper off as your rating climbs.
            </p>
          </div>

          {/* 4 Starting Tier Cards */}
          <div
            role="radiogroup"
            aria-label="Choose starting difficulty tier"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
          >
            {STARTING_TIER_OPTIONS.map((opt) => {
              const isSelected = selectedStartTier === opt.id;
              const isSuggested = calibrationResult?.suggestedTier === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-testid={`journey-tier-${opt.id}`}
                  onClick={() => setSelectedStartTier(opt.id)}
                  className={`text-left p-5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                    isSelected
                      ? 'bg-[#1D2B23] border-[#C6923A] shadow-[0_12px_28px_rgba(0,0,0,0.45)]'
                      : 'bg-[#16201B] border-[#28362F] hover:border-[#42574C] hover:bg-[#1A2620]'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="text-lg font-bold text-[#F4EFE6]"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {opt.name}
                      </span>
                      <span className="text-xs font-mono font-bold text-[#C6923A] tabular-nums whitespace-nowrap">
                        {opt.eloLabel}
                      </span>
                    </div>

                    {isSuggested && (
                      <div className="text-xs font-mono font-semibold text-[#4ADE80]">
                        Suggested from your saved games
                      </div>
                    )}

                    <p className="text-xs text-[#A69F91] leading-relaxed">
                      {opt.summary}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#25332C] flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-mono text-[#D6CFC2] tabular-nums">
                    <span className="whitespace-nowrap">
                      {opt.undosPerGame}{' '}
                      {opt.undosPerGame === 1 ? 'Undo' : 'Undos'} / game
                    </span>
                    <span className="text-[#8E8779] whitespace-nowrap">
                      {opt.blunderAlerts ? 'Blunder Alerts' : 'Unassisted'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Optional Past Saved Games Calibration Strip */}
          <div className="p-4 sm:p-5 rounded-xl bg-[#16201B] border border-[#28362F] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="text-sm font-semibold text-[#F4EFE6]">
                Not sure which level fits? Scan your past games
              </div>
              <div className="text-xs text-[#A69F91]">
                {isCalibrating && calibrationProgress ? (
                  <span className="font-mono text-[#C6923A] tabular-nums">
                    Analyzing game {calibrationProgress.completedGames} of{' '}
                    {calibrationProgress.totalGames} ·{' '}
                    {calibrationProgress.currentGameTitle}
                  </span>
                ) : calibrationResult ? (
                  calibrationResult.gamesAnalyzed > 0 ? (
                    <span className="text-[#D6CFC2] font-mono tabular-nums">
                      Analyzed {calibrationResult.gamesAnalyzed}{' '}
                      {calibrationResult.gamesAnalyzed === 1 ? 'game' : 'games'}{' '}
                      ({calibrationResult.pliesAnalyzed} moves) · Avg Accuracy{' '}
                      <strong className="text-[#4ADE80]">
                        {calibrationResult.avgAccuracy}%
                      </strong>{' '}
                      · Estimated{' '}
                      <strong className="text-[#C6923A]">
                        {calibrationResult.estimatedElo} Elo
                      </strong>{' '}
                      (Suggested:{' '}
                      {getStartingTierOption(calibrationResult.suggestedTier).name})
                    </span>
                  ) : (
                    <span>
                      No saved AI games with 10+ plies found yet.
                      {puzzleRatingPrior
                        ? ` Puzzle rating prior (${puzzleRatingPrior} Elo) suggests ${
                            getStartingTierOption(calibrationResult.suggestedTier)
                              .name
                          }.`
                        : ' Beginner (600 Elo) is a great starting point.'}
                    </span>
                  )
                ) : eligibleSavedGamesCount > 0 ? (
                  <span>
                    Found {eligibleSavedGamesCount} eligible saved AI{' '}
                    {eligibleSavedGamesCount === 1 ? 'match' : 'matches'} in your
                    archive ready for engine accuracy estimation.
                  </span>
                ) : (
                  <span>
                    No saved AI games in archive yet
                    {puzzleRatingPrior
                      ? ` · We can still use your ${puzzleRatingPrior} Puzzle Rating as a hint.`
                      : ' · Play a match or pick any starting level above.'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="journey-scan-saved-btn"
                disabled={isCalibrating}
                onClick={onRunSavedGamesCalibration}
                className="px-4 py-2.5 rounded-lg bg-[#202E27] hover:bg-[#2A3C33] disabled:opacity-50 border border-[#384D42] text-xs font-semibold text-[#EADBC8] transition-colors cursor-pointer whitespace-nowrap"
              >
                {isCalibrating
                  ? 'Scanning Archive...'
                  : 'Analyze Saved Games'}
              </button>
              {calibrationResult && calibrationResult.gamesAnalyzed > 0 && (
                <button
                  type="button"
                  data-testid="journey-apply-calibration-btn"
                  onClick={() => {
                    setSelectedStartTier(calibrationResult.suggestedTier);
                    onSelectStartingTier(
                      calibrationResult.suggestedTier,
                      calibrationResult.estimatedElo
                    );
                  }}
                  className="px-4 py-2.5 rounded-lg bg-[#23382C] hover:bg-[#2C4737] border border-[#4ADE80]/50 text-xs font-semibold text-[#4ADE80] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Start at {calibrationResult.estimatedElo} Elo
                </button>
              )}
            </div>
          </div>

          {/* Primary Launch Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div className="text-xs font-mono text-[#A69F91] tabular-nums">
              Selected: <strong className="text-[#F4EFE6]">{activeTierOption.name}</strong> ·{' '}
              {useCalibratedElo && calibrationResult
                ? `${calibrationResult.estimatedElo} Elo (Calibrated)`
                : activeTierOption.eloLabel}{' '}
              · {activeTierOption.undosPerGame}{' '}
              {activeTierOption.undosPerGame === 1 ? 'Undo' : 'Undos'} / game
            </div>
            <button
              type="button"
              data-testid="journey-confirm-start-btn"
              onClick={() =>
                onSelectStartingTier(
                  selectedStartTier,
                  useCalibratedElo && calibrationResult
                    ? calibrationResult.estimatedElo
                    : undefined
                )
              }
              className="px-7 py-3.5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] active:bg-[#B5822D] text-[#111815] font-bold text-sm tracking-wide transition-colors cursor-pointer shadow-[0_6px_20px_rgba(198,146,58,0.28)] whitespace-nowrap"
            >
              Begin Rated Journey as {activeTierOption.name} →
            </button>
          </div>
        </main>

        <div className="max-w-5xl w-full mx-auto pt-4 text-xs font-mono text-[#7F796C] text-center">
          Live Tactical Coach arrows and Eval Bar stay hidden during Rated
          matches · Full Post-Game Review unlocks after every match
        </div>
      </div>
    );
  }

  // =========================================================================
  // INITIALIZED JOURNEY HUB VIEW
  // =========================================================================
  const minChartElo = Math.min(...chartPoints.map((p) => p.rating)) - 60;
  const maxChartElo = Math.max(...chartPoints.map((p) => p.rating)) + 60;
  const chartSpan = Math.max(120, maxChartElo - minChartElo);
  const svgW = 560;
  const svgH = 170;
  const padX = 28;
  const padY = 20;

  const plotted = chartPoints.map((pt, idx) => {
    const x =
      chartPoints.length === 1
        ? svgW / 2
        : padX + (idx / (chartPoints.length - 1)) * (svgW - padX * 2);
    const y =
      padY +
      (1 - (pt.rating - minChartElo) / chartSpan) * (svgH - padY * 2);
    return { ...pt, x, y };
  });

  const linePath = plotted
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    plotted.length > 1
      ? `${linePath} L ${plotted[plotted.length - 1].x.toFixed(1)} ${(
          svgH - padY
        ).toFixed(1)} L ${plotted[0].x.toFixed(1)} ${(svgH - padY).toFixed(1)} Z`
      : '';

  return (
    <div
      data-testid="rated-journey-hub"
      className="min-h-screen w-full bg-[#111815] text-[#F4EFE6] flex flex-col px-4 py-5 sm:px-8 md:px-14 md:py-8 overflow-x-hidden"
    >
      {/* Top Bar */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4 pb-5 border-b border-[#24322A]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            data-testid="journey-exit-btn"
            onClick={onExit}
            className="px-3 py-2 rounded-lg bg-[#1A241F] hover:bg-[#23322A] border border-[#2F4037] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            ← Title Screen
          </button>
          <span className="text-xs font-mono text-[#A69F91] truncate hidden sm:inline">
            Rated Journey · {tierInfo.name} ·{' '}
            {isProvisional
              ? `Provisional (${Math.min(5, profile.gamesPlayed)}/5 Placement)`
              : 'Established Rating'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!confirmingReset ? (
            <button
              type="button"
              data-testid="journey-reset-trigger"
              onClick={() => setConfirmingReset(true)}
              className="px-3 py-1.5 rounded-lg bg-[#18221D] hover:bg-[#23312A] border border-[#2F4037] text-xs font-medium text-[#A69F91] hover:text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap"
            >
              Reset Journey
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#F87171] hidden sm:inline">
                Erase rating history?
              </span>
              <button
                type="button"
                data-testid="journey-reset-confirm"
                onClick={() => {
                  setConfirmingReset(false);
                  onResetJourney();
                }}
                className="px-3 py-1.5 rounded-lg bg-[#7F1D1D] hover:bg-[#991B1B] text-xs font-semibold text-[#FEE2E2] transition-colors cursor-pointer whitespace-nowrap"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="px-2.5 py-1.5 rounded-lg bg-[#1F2D26] hover:bg-[#2B3D34] text-xs text-[#D6CFC2] transition-colors cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl w-full mx-auto py-7 space-y-7 flex-1">
        {/* Hero Strip: Current Estimated Rating + Primary Next Match CTA */}
        <section className="p-6 sm:p-7 rounded-xl bg-[#16201B] border border-[#2C3C34] grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-3">
            <div className="text-xs font-mono text-[#A69F91] flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[#C6923A] font-semibold">
                {tierInfo.name}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {isProvisional
                  ? `Provisional (${Math.min(5, profile.gamesPlayed)}/5 placement games)`
                  : 'Established Rating'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Peak <strong className="text-[#F4EFE6] tabular-nums">{profile.peakRating}</strong>
              </span>
            </div>

            <div className="flex items-baseline gap-3 flex-wrap">
              <span
                data-testid="journey-current-rating"
                className="text-5xl sm:text-6xl font-bold text-[#F4EFE6] tabular-nums leading-none"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {profile.rating}
              </span>
              <span className="text-base font-mono text-[#A69F91] tabular-nums">
                ± {profile.rd} Elo
              </span>
            </div>

            {/* Tier Progress Bar */}
            <div className="max-w-md space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-mono text-[#A69F91] tabular-nums">
                <span>{tierInfo.name}</span>
                <span>
                  {tierInfo.nextTierName && tierInfo.nextTierElo
                    ? `${Math.max(0, tierInfo.nextTierElo - profile.rating)} Elo to ${tierInfo.nextTierName} (${tierInfo.nextTierElo})`
                    : 'Highest Salon Rank Achieved'}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#101714] overflow-hidden border border-[#25332C]">
                <div
                  className="h-full bg-[#C6923A] transition-all duration-300"
                  style={{ width: `${tierInfo.progressPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Next Challenger Launch Card */}
          <div className="lg:col-span-5 lg:border-l lg:border-[#26352E] lg:pl-6 space-y-4">
            <div className="space-y-1">
              <div className="text-xs font-mono text-[#A69F91]">
                Next Adaptive Challenger · Match #{profile.gamesPlayed + 1}
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span
                  data-testid="journey-next-opponent-elo"
                  className="text-2xl font-bold font-mono text-[#F4EFE6] tabular-nums"
                >
                  AI {profile.nextOpponentElo} Elo
                </span>
                <span className="text-xs font-mono text-[#D6CFC2]">
                  Playing as{' '}
                  <strong className="text-[#F4EFE6]">
                    {profile.nextColor === 'w' ? 'White' : 'Black'}
                  </strong>
                </span>
              </div>
              <div className="text-xs text-[#A69F91] font-mono tabular-nums">
                {undoAllowance}{' '}
                {undoAllowance === 1 ? 'Undo' : 'Undos'} allowed ·{' '}
                {blunderAlertsActive
                  ? 'Blunder Alerts active'
                  : 'Coach & Eval Bar locked'}
              </div>
            </div>

            <button
              type="button"
              data-testid="journey-play-next-btn"
              onClick={onStartNextMatch}
              className="w-full py-3.5 px-6 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] active:bg-[#B5822D] text-[#111815] font-bold text-sm tracking-wide transition-colors cursor-pointer shadow-[0_6px_20px_rgba(198,146,58,0.26)] whitespace-nowrap text-center"
            >
              Play Match #{profile.gamesPlayed + 1} vs. {profile.nextOpponentElo}{' '}
              Elo →
            </button>
          </div>
        </section>

        {/* Key Career Metrics Row (Unboxed Typographic Dividers) */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-[#16201B] border border-[#26352E]">
            <div className="text-xs text-[#A69F91]">Record (W–D–L)</div>
            <div
              data-testid="journey-record-value"
              className="text-xl font-bold font-mono text-[#F4EFE6] tabular-nums mt-1"
            >
              {profile.wins}–{profile.draws}–{profile.losses}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#16201B] border border-[#26352E]">
            <div className="text-xs text-[#A69F91]">Average Accuracy</div>
            <div className="text-xl font-bold font-mono text-[#4ADE80] tabular-nums mt-1">
              {averageAccuracy !== null ? `${averageAccuracy}%` : '—'}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#16201B] border border-[#26352E]">
            <div className="text-xs text-[#A69F91]">Current Streak</div>
            <div className="text-xl font-bold font-mono text-[#F4EFE6] tabular-nums mt-1">
              {profile.currentStreak > 0
                ? `+${profile.currentStreak} ${
                    profile.currentStreak === 1 ? 'Win' : 'Wins'
                  }`
                : profile.currentStreak < 0
                ? `${Math.abs(profile.currentStreak)} ${
                    Math.abs(profile.currentStreak) === 1 ? 'Loss' : 'Losses'
                  }`
                : 'Even'}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#16201B] border border-[#26352E]">
            <div className="text-xs text-[#A69F91]">Undo Allowance</div>
            <div
              data-testid="journey-undo-allowance-value"
              className="text-xl font-bold font-mono text-[#C6923A] tabular-nums mt-1"
            >
              {undoAllowance} / game
            </div>
          </div>
        </section>

        {/* Middle Split: Rating Trajectory Chart + Undo Taper Ladder */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Rating Trajectory SVG Chart */}
          <section className="lg:col-span-7 p-5 rounded-xl bg-[#16201B] border border-[#26352E] flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2
                  className="text-lg font-bold text-[#F4EFE6]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Rating Trajectory
                </h2>
                <p className="text-xs text-[#A69F91]">
                  Hybrid Elo updated from match outcome and move accuracy
                </p>
              </div>
              {selectedMatch && (
                <div className="text-right text-xs font-mono tabular-nums">
                  <div className="text-[#F4EFE6]">
                    vs. {selectedMatch.opponentElo} Elo ·{' '}
                    <span
                      className={
                        selectedMatch.delta >= 0
                          ? 'text-[#4ADE80]'
                          : 'text-[#F87171]'
                      }
                    >
                      {selectedMatch.delta >= 0
                        ? `+${selectedMatch.delta}`
                        : selectedMatch.delta}
                    </span>
                  </div>
                  <div className="text-[#A69F91]">
                    Acc {selectedMatch.accuracy}% · Perf{' '}
                    {selectedMatch.performanceRating}
                  </div>
                </div>
              )}
            </div>

            <div className="w-full overflow-hidden">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full h-44"
                role="img"
                aria-label="Rated Journey Elo progression chart"
              >
                <defs>
                  <linearGradient
                    id="journeyAreaGrad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#C6923A" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#C6923A" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid Lines */}
                {[0, 0.5, 1].map((frac) => {
                  const y = padY + frac * (svgH - padY * 2);
                  const val = Math.round(maxChartElo - frac * chartSpan);
                  return (
                    <g key={frac}>
                      <line
                        x1={padX}
                        y1={y}
                        x2={svgW - padX}
                        y2={y}
                        stroke="#25342C"
                        strokeWidth="1"
                        strokeDasharray="3 4"
                      />
                      <text
                        x={4}
                        y={y + 3}
                        fill="#7E786B"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {areaPath && <path d={areaPath} fill="url(#journeyAreaGrad)" />}
                {plotted.length > 1 && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#C6923A"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {plotted.map((pt) => {
                  const isFocused =
                    pt.match && selectedMatch?.id === pt.match.id;
                  return (
                    <g
                      key={pt.id}
                      onClick={() =>
                        pt.match && setSelectedMatchId(pt.match.id)
                      }
                      className={pt.match ? 'cursor-pointer' : ''}
                    >
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isFocused ? 6 : 4.2}
                        fill={isFocused ? '#4ADE80' : '#C6923A'}
                        stroke="#111815"
                        strokeWidth="2"
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>

          {/* Progressive Undo Taper Ladder */}
          <section className="lg:col-span-5 p-5 rounded-xl bg-[#16201B] border border-[#26352E] space-y-4">
            <div>
              <h2
                className="text-lg font-bold text-[#F4EFE6]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Undo Allowance Ladder
              </h2>
              <p className="text-xs text-[#A69F91]">
                Beginner takebacks reduce automatically as your Elo climbs
              </p>
            </div>

            <div className="space-y-2.5">
              {UNDO_LADDER_STEPS.map((step) => {
                const isCurrent =
                  profile.rating >= step.minElo &&
                  profile.rating <= step.maxElo;
                const isPassed = profile.rating > step.maxElo;
                return (
                  <div
                    key={step.undos}
                    className={`px-3.5 py-2.5 rounded-lg border flex items-center justify-between gap-3 ${
                      isCurrent
                        ? 'bg-[#202E26] border-[#C6923A] text-[#F4EFE6]'
                        : isPassed
                        ? 'bg-[#131C18] border-[#223029] text-[#7E786B]'
                        : 'bg-[#141D18] border-[#25342C] text-[#A69F91]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-bold tabular-nums">
                        {step.undos} {step.undos === 1 ? 'Undo' : 'Undos'} / game
                        {isCurrent && (
                          <span className="ml-2 text-[#C6923A] font-semibold">
                            · Current
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#8E8779] truncate">
                        {step.note}
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums shrink-0">
                      {step.rangeLabel}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-[#24322B] text-xs text-[#A69F91] leading-relaxed">
              Blunder Alerts:{' '}
              <strong
                className={
                  blunderAlertsActive ? 'text-[#FACC15]' : 'text-[#4ADE80]'
                }
              >
                {blunderAlertsActive
                  ? 'Active (Graduates at 1000 Elo)'
                  : 'Graduated (Unassisted Play)'}
              </strong>
            </div>
          </section>
        </div>

        {/* Recent Rated Matches List */}
        <section className="p-5 rounded-xl bg-[#16201B] border border-[#26352E] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                className="text-lg font-bold text-[#F4EFE6]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Rated Match History
              </h2>
              <p className="text-xs text-[#A69F91]">
                Every completed game records outcome, accuracy, performance
                rating, and undo usage
              </p>
            </div>
            {eligibleSavedGamesCount > 0 && (
              <button
                type="button"
                data-testid="journey-hub-scan-btn"
                disabled={isCalibrating}
                onClick={onRunSavedGamesCalibration}
                className="px-3.5 py-2 rounded-lg bg-[#1F2C25] hover:bg-[#2A3B32] disabled:opacity-50 border border-[#364A3F] text-xs font-semibold text-[#EADBC8] transition-colors cursor-pointer whitespace-nowrap"
              >
                {isCalibrating ? 'Scanning Saved Games...' : 'Scan Saved Archive'}
              </button>
            )}
          </div>

          {calibrationResult && calibrationResult.gamesAnalyzed > 0 && (
            <div className="px-4 py-3 rounded-lg bg-[#1A2820] border border-[#345040] flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-mono text-[#D6CFC2] tabular-nums">
                Archive Scan: {calibrationResult.gamesAnalyzed} saved games · Avg
                Accuracy {calibrationResult.avgAccuracy}% · Estimated{' '}
                <strong className="text-[#4ADE80]">
                  {calibrationResult.estimatedElo} Elo
                </strong>
              </span>
              <button
                type="button"
                onClick={() =>
                  onSelectStartingTier(
                    calibrationResult.suggestedTier,
                    calibrationResult.estimatedElo
                  )
                }
                className="px-3 py-1.5 rounded bg-[#23382C] hover:bg-[#2E493A] border border-[#4ADE80]/50 text-[#4ADE80] font-semibold cursor-pointer whitespace-nowrap"
              >
                Recalibrate to {calibrationResult.estimatedElo} Elo
              </button>
            </div>
          )}

          {profile.history.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#A69F91] border border-dashed border-[#2A3931] rounded-lg">
              No rated matches played yet. Start Match #1 above to establish
              your first rating point.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-[#25342C] text-[#8E8779]">
                    <th className="py-2.5 pr-4 font-medium">Match</th>
                    <th className="py-2.5 pr-4 font-medium">Result</th>
                    <th className="py-2.5 pr-4 font-medium">Opponent</th>
                    <th className="py-2.5 pr-4 font-medium">Rating</th>
                    <th className="py-2.5 pr-4 font-medium">Perf / Acc</th>
                    <th className="py-2.5 pr-4 font-medium">Undos</th>
                    <th className="py-2.5 text-right font-medium">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202D26]">
                  {profile.history.slice(0, 15).map((match, idx) => {
                    const matchNum = profile.gamesPlayed - idx;
                    const hasSavedSession = Boolean(
                      match.sessionId && savedSessionsById.has(match.sessionId)
                    );
                    const outcomeColor =
                      match.outcome === 'win'
                        ? 'text-[#4ADE80]'
                        : match.outcome === 'loss'
                        ? 'text-[#F87171]'
                        : 'text-[#EADBC8]';
                    const outcomeLabel =
                      match.outcome === 'win'
                        ? 'Win'
                        : match.outcome === 'loss'
                        ? 'Loss'
                        : 'Draw';

                    return (
                      <tr
                        key={match.id}
                        onClick={() => setSelectedMatchId(match.id)}
                        className={`hover:bg-[#1B2721] transition-colors cursor-pointer ${
                          selectedMatch?.id === match.id ? 'bg-[#1A2620]' : ''
                        }`}
                      >
                        <td className="py-3 pr-4 text-[#D6CFC2] whitespace-nowrap">
                          #{matchNum} · {formatDateShort(match.playedAt)}
                        </td>
                        <td
                          className={`py-3 pr-4 font-bold whitespace-nowrap ${outcomeColor}`}
                        >
                          {outcomeLabel} ({match.playerColor === 'w' ? 'W' : 'B'})
                        </td>
                        <td className="py-3 pr-4 text-[#F4EFE6] whitespace-nowrap">
                          AI {match.opponentElo}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <span className="text-[#F4EFE6] font-bold">
                            {match.ratingAfter}
                          </span>{' '}
                          <span
                            className={
                              match.delta >= 0
                                ? 'text-[#4ADE80]'
                                : 'text-[#F87171]'
                            }
                          >
                            ({match.delta >= 0 ? `+${match.delta}` : match.delta})
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-[#D6CFC2] whitespace-nowrap">
                          {match.performanceRating} · {match.accuracy}%
                        </td>
                        <td className="py-3 pr-4 text-[#A69F91] whitespace-nowrap">
                          {match.undosUsed}/{match.undosAllowed}
                        </td>
                        <td className="py-3 text-right whitespace-nowrap">
                          {hasSavedSession && match.sessionId ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenMatchInReplay(match.sessionId!);
                              }}
                              className="px-2.5 py-1 rounded bg-[#212F27] hover:bg-[#2C3E34] border border-[#384D42] text-[11px] font-sans font-semibold text-[#EADBC8] cursor-pointer"
                            >
                              Replay
                            </button>
                          ) : (
                            <span className="text-[#6F695E]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

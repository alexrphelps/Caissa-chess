import React from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Compass,
  GitBranch,
  Loader2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  PgnVariationLine,
  ReplayPlyCoachInsight,
} from '../chess/pgnTypes';
import { REPLAY_VERDICT_META } from '../chess/replayCoach';
import { RecommendedMove } from '../chess/tacticsHelper';
import { Color } from '../chess/types';

interface ReplayCoachCardProps {
  insight: ReplayPlyCoachInsight | null;
  isAnalyzing: boolean;
  isAutoPlaying: boolean;
  isSideline: boolean;
  ply: number;
  playedSan?: string | null;
  turnNumber: number;
  moveColor?: Color | null;
  pgnComment?: string | null;
  pgnVariations?: PgnVariationLine[];
  isExpanded: boolean;
  expandToFill?: boolean;
  onToggleExpanded: () => void;
  hoveredAltIndex: number | null;
  onHoverAlternative: (index: number | null) => void;
  onTryAlternative: (alt: RecommendedMove) => void;
  onLoadPgnVariation: (variation: PgnVariationLine) => void;
}

export const ReplayCoachCard: React.FC<ReplayCoachCardProps> = ({
  insight,
  isAnalyzing,
  isAutoPlaying,
  isSideline,
  ply,
  playedSan,
  turnNumber,
  moveColor,
  pgnComment,
  pgnVariations,
  isExpanded,
  expandToFill = false,
  onToggleExpanded,
  hoveredAltIndex,
  onHoverAlternative,
  onTryAlternative,
  onLoadPgnVariation,
}) => {
  const verdictMeta = insight ? REPLAY_VERDICT_META[insight.verdict] : null;

  const moveLabel = playedSan
    ? `${turnNumber}${moveColor === 'w' ? '.' : '...'} ${playedSan}`
    : 'Starting Position';

  const hasAuthorNote = Boolean(pgnComment && pgnComment.trim().length > 0);
  const hasVariations = Boolean(pgnVariations && pgnVariations.length > 0);

  return (
    <section
      data-testid="replay-coach-card"
      aria-label="Engine tactical coach commentary"
      className={`bg-[#16201B] border-b border-[#293830] ${
        expandToFill && isExpanded
          ? 'flex-1 min-h-0 flex flex-col'
          : 'shrink-0'
      }`}
    >
      {/* Pinned 1-Line Collapsible Summary Header */}
      <button
        type="button"
        data-testid="replay-coach-toggle"
        aria-expanded={isExpanded}
        onClick={onToggleExpanded}
        className="w-full h-[40px] shrink-0 px-3.5 flex items-center justify-between gap-2 text-left hover:bg-[#1B2721] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-[#C6923A] shrink-0" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#A69F91] shrink-0">
            Coach
          </span>

          {isAutoPlaying ? (
            <span className="text-xs font-medium text-[#857F72] truncate">
              Paused during playback
            </span>
          ) : isAnalyzing && !insight ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#C6923A] font-mono truncate">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              <span>Analyzing {moveLabel}...</span>
            </span>
          ) : insight && verdictMeta ? (
            <span className="flex items-center gap-1.5 min-w-0 truncate">
              <span
                data-testid="replay-coach-verdict"
                className="text-xs font-bold whitespace-nowrap"
                style={{ color: verdictMeta.hex }}
              >
                {verdictMeta.symbol} {verdictMeta.label}
              </span>
              {playedSan && (
                <span className="text-xs font-mono text-[#D6CFC2] truncate">
                  · {moveLabel}
                </span>
              )}
              {isSideline && (
                <span className="text-[10px] font-mono text-[#38BDF8] shrink-0">
                  · What-If
                </span>
              )}
            </span>
          ) : (
            <span className="text-xs text-[#A69F91] truncate">
              {ply === 0 ? 'Ready at start position' : moveLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {insight && (
            <span
              data-testid="replay-coach-eval"
              className="text-xs font-mono font-bold tabular-nums text-[#F4EFE6]"
            >
              {insight.formattedEval}
            </span>
          )}
          {isAnalyzing && insight && (
            <Loader2 className="w-3 h-3 text-[#C6923A] animate-spin" />
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[#A69F91]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#A69F91]" />
          )}
        </div>
      </button>

      {/* Expanded Tactical Coach Body — fixed height when Move List is open so Play/Arrow controls below NEVER bounce */}
      {isExpanded && (
        <div
          data-testid="replay-coach-body"
          className={`px-3.5 pb-2.5 pt-2 space-y-2 overflow-y-auto border-t border-[#223028]/80 ${
            expandToFill ? 'flex-1 min-h-0' : 'h-[196px] shrink-0'
          }`}
        >
          {isAutoPlaying ? (
            <p className="text-xs text-[#A69F91] leading-relaxed">
              Pause playback or click any move to run engine tactical commentary,
              compare alternatives, and explore sidelines.
            </p>
          ) : isAnalyzing && !insight ? (
            <div className="py-2 flex items-center gap-2 text-xs text-[#C6BFA8]">
              <Loader2 className="w-3.5 h-3.5 text-[#C6923A] animate-spin shrink-0" />
              <span>Evaluating tactical motifs and best alternatives...</span>
            </div>
          ) : insight ? (
            <>
              {/* Opening Book Context (when in known theory) */}
              {insight.openingInfo && (
                <div className="flex items-center gap-1.5 text-[11px] text-[#C6923A] font-mono">
                  <BookOpen className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    {insight.openingInfo.fullTitle}
                  </span>
                </div>
              )}

              {/* Primary Coach Assessment & Move Plan */}
              <div className="space-y-1">
                <p
                  data-testid="replay-coach-summary"
                  className="text-xs text-[#F4EFE6] leading-relaxed font-medium"
                >
                  {insight.planSummary}
                </p>
                {insight.followUpNote && (
                  <p className="text-[11px] text-[#B8B1A2] leading-relaxed flex items-start gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-[#C6923A] shrink-0 mt-0.5" />
                    <span>{insight.followUpNote}</span>
                  </p>
                )}
              </div>

              {/* Active Threat / Next-Turn Watch */}
              {insight.afterMoveThreat && (() => {
                const threatMaker =
                  moveColor === 'w'
                    ? 'White threatens'
                    : moveColor === 'b'
                    ? 'Black threatens'
                    : 'Watch';
                const cleanedDetail = insight.afterMoveThreat.detail
                  .replace(/\s*Our #1 recommended move accounts for this threat\.?/i, '')
                  .replace(/^Opponent's best next move if unaddressed is /i, 'Next idea if unaddressed: ');
                return (
                  <p className="text-[11px] text-[#FBBF24] leading-relaxed flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#F59E0B] shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-mono">
                        {threatMaker} {insight.afterMoveThreat.san}:
                      </strong>{' '}
                      {cleanedDetail}
                    </span>
                  </p>
                );
              })()}

              {/* Top Alternatives (hover = board arrow, click = enter sideline) */}
              {insight.alternatives.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-[#223028]">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[#857F72]">
                    <span>
                      {ply === 0 ? 'Top Opening Lines' : 'Other Engine Options'}
                    </span>
                    <span>Hover arrow · Click to try</span>
                  </div>
                  <div className="space-y-1">
                    {insight.alternatives.map((alt, idx) => {
                      const isHovered = hoveredAltIndex === idx;
                      const isPlayed = Boolean(playedSan && alt.san === playedSan);
                      return (
                        <button
                          key={`${alt.san}-${idx}`}
                          type="button"
                          data-testid={`replay-coach-alt-${idx}`}
                          onMouseEnter={() => onHoverAlternative(idx)}
                          onMouseLeave={() => onHoverAlternative(null)}
                          onFocus={() => onHoverAlternative(idx)}
                          onBlur={() => onHoverAlternative(null)}
                          onClick={() => onTryAlternative(alt)}
                          className={`w-full px-2 py-1.5 rounded-md text-left flex items-center justify-between gap-2 transition-colors cursor-pointer border ${
                            isHovered
                              ? 'bg-[#22342A] border-[#C6923A]/70 text-[#F4EFE6]'
                              : isPlayed
                              ? 'bg-[#1A2720] border-[#2D4035] text-[#EADBC8]'
                              : 'bg-[#121A16] border-[#223028] hover:bg-[#1C2822] text-[#D6CFC2]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`text-[10px] font-mono font-bold w-4 shrink-0 ${
                                idx === 0
                                  ? 'text-[#22C55E]'
                                  : idx === 1
                                  ? 'text-[#38BDF8]'
                                  : 'text-[#A69F91]'
                              }`}
                            >
                              #{alt.rank}
                            </span>
                            <span className="font-mono text-xs font-bold text-[#F4EFE6] shrink-0">
                              {alt.san}
                            </span>
                            {isPlayed && (
                              <span className="text-[10px] font-mono text-[#C6923A] shrink-0">
                                played
                              </span>
                            )}
                            {alt.pvLine && alt.pvLine.length > 1 && (
                              <span className="text-[10px] font-mono text-[#857F72] truncate">
                                {alt.pvLine
                                  .slice(1, 4)
                                  .map((step) => step.san)
                                  .join(' ')}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono font-semibold tabular-nums text-[#EADBC8] shrink-0">
                            {alt.formattedEval}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Subtle Meta Line */}
              <div className="flex items-center justify-between text-[10px] font-mono text-[#7A7467] tabular-nums pt-0.5">
                <span>
                  {insight.centipawnLoss > 0 && ply > 0
                    ? `Eval loss: -${insight.centipawnLoss} cp · ${insight.motif}`
                    : ply > 0
                    ? `${insight.motif} · Top precision`
                    : 'Local 0x88 tactical engine'}
                </span>
                <span>Depth {insight.searchDepth}</span>
              </div>
            </>
          ) : null}

          {/* PGN Author Note (separated cleanly from Engine Coach) */}
          {hasAuthorNote && (
            <div
              data-testid="replay-active-comment"
              className="pt-2 border-t border-[#26342C] text-xs text-[#EADBC8] leading-relaxed"
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#C6923A] mr-1.5">
                Author Note:
              </span>
              <span>{pgnComment}</span>
            </div>
          )}

          {/* Parsed PGN Recursive Variations (...) */}
          {hasVariations && pgnVariations && (
            <div
              data-testid="replay-pgn-variations"
              className="pt-2 border-t border-[#26342C] space-y-1.5"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#38BDF8]">
                <GitBranch className="w-3 h-3" />
                <span>PGN Sidelines</span>
              </div>
              <div className="space-y-1">
                {pgnVariations.map((variation, vIdx) => (
                  <button
                    key={variation.id}
                    type="button"
                    data-testid={`replay-pgn-variation-${vIdx}`}
                    onClick={() => onLoadPgnVariation(variation)}
                    className="w-full px-2 py-1.5 rounded-md bg-[#121B17] hover:bg-[#1B2922] border border-[#293D33] hover:border-[#38BDF8]/60 text-left font-mono text-[11px] text-[#CBE6F5] transition-colors cursor-pointer truncate"
                    title="Load this PGN variation into the What-If sandbox"
                  >
                    ({variation.label})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

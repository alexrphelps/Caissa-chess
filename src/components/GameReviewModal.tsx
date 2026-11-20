import React, { useState } from 'react';
import {
  CLASSIFICATION_COLORS,
  GameReviewReport,
  MoveClassification,
  TurningPoint,
} from '../chess/gameReview';
import { Color, GameMode, GameState } from '../chess/types';
import { gameStateToFen } from '../chess/sessionStorage';
import { exportSessionToPgn, createStoredSession } from '../chess/sessionStorage';
import { createEngineProfileFromPreset } from '../chess/evaluation';

interface GameReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: GameReviewReport;
  gameState: GameState;
  stateStack: GameState[];
  playerColor: Color;
  gameMode: GameMode;
  onSelectPreviewPly: (ply: number) => void;
  onStartRetryBlunder: (turningPoint: TurningPoint) => void;
  onPlayAgain: () => void;
}

export const GameReviewModal: React.FC<GameReviewModalProps> = ({
  isOpen,
  onClose,
  report,
  gameState,
  stateStack,
  playerColor,
  gameMode,
  onSelectPreviewPly,
  onStartRetryBlunder,
  onPlayAgain,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'graph' | 'turning_points'>('overview');
  const [copiedType, setCopiedType] = useState<'pgn' | 'fen' | null>(null);
  const [hoveredPly, setHoveredPly] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleCopyPgn = async () => {
    try {
      const dummyProfile = createEngineProfileFromPreset('casual');
      const session = createStoredSession({
        stateStack,
        gameMode,
        playerColor,
        isFlipped: playerColor === 'b',
        engineProfile: dummyProfile,
      });
      const pgn = exportSessionToPgn(session);
      await navigator.clipboard.writeText(pgn);
      setCopiedType('pgn');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {}
  };

  const handleCopyFen = async () => {
    try {
      const fen = gameStateToFen(gameState);
      await navigator.clipboard.writeText(fen);
      setCopiedType('fen');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {}
  };

  // SVG dimensions for evaluation graph
  const svgWidth = 540;
  const svgHeight = 140;
  const paddingX = 24;
  const paddingY = 16;
  const plotWidth = svgWidth - paddingX * 2;
  const plotHeight = svgHeight - paddingY * 2;
  const midY = paddingY + plotHeight / 2;

  // Max clamp at ±800 centipawns (±8.0 pawns)
  const maxEvalClamp = 800;
  const curvePoints = report.evalCurve.map((score, index) => {
    const x =
      report.evalCurve.length <= 1
        ? paddingX + plotWidth / 2
        : paddingX + (index / (report.evalCurve.length - 1)) * plotWidth;
    const clampedScore = Math.max(-maxEvalClamp, Math.min(maxEvalClamp, score));
    // Positive score = White advantage = top
    const y = midY - (clampedScore / maxEvalClamp) * (plotHeight / 2);
    return { x, y, score, ply: index };
  });

  const pathD = curvePoints.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  // Fill paths for white (above 0) and black (below 0)
  const whiteAreaD = `${pathD} L ${curvePoints[curvePoints.length - 1].x} ${midY} L ${curvePoints[0].x} ${midY} Z`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comprehensive Game Review"
      className="fixed inset-0 z-50 bg-[#0B100E]/85 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-[#17211C] border-2 border-[#C6923A] rounded-xl p-5 sm:p-6 shadow-[0_24px_60px_rgba(0,0,0,0.85)] space-y-5 text-[#F4EFE6] my-auto">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-[#2B3B32] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-[#C6923A] text-lg">📊</span>
            <div>
              <h2
                className="text-lg sm:text-xl font-bold"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Comprehensive Game Review
              </h2>
              <div className="text-xs text-[#A69F91]">
                Analyzed {report.totalPlies} plies · Engine Move Classification & Turning Points
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close Game Review"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] text-[#A69F91] hover:text-[#F4EFE6] flex items-center justify-center text-sm cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-1 bg-[#121A16] rounded-lg border border-[#26342C]">
          <button
            type="button"
            data-testid="tab-overview"
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-[#C6923A] text-[#111815] shadow-xs'
                : 'text-[#A69F91] hover:text-[#F4EFE6]'
            }`}
          >
            Overview & Accuracy
          </button>
          <button
            type="button"
            data-testid="tab-graph"
            onClick={() => setActiveTab('graph')}
            className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'graph'
                ? 'bg-[#C6923A] text-[#111815] shadow-xs'
                : 'text-[#A69F91] hover:text-[#F4EFE6]'
            }`}
          >
            Advantage Graph ({curvePoints.length} Plies)
          </button>
          <button
            type="button"
            data-testid="tab-turning-points"
            onClick={() => setActiveTab('turning_points')}
            className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-all cursor-pointer relative ${
              activeTab === 'turning_points'
                ? 'bg-[#C6923A] text-[#111815] shadow-xs'
                : 'text-[#A69F91] hover:text-[#F4EFE6]'
            }`}
          >
            Turning Points ({report.turningPoints.length})
            {report.turningPoints.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-rose-500/80 text-[10px] text-white">
                {report.turningPoints.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: OVERVIEW & ACCURACY */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Dual Accuracy Ring Cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* White Accuracy */}
              <div className="bg-[#121A16] border border-[#26342C] rounded-lg p-3.5 flex items-center gap-3">
                <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-[#26342C]"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-400"
                      strokeDasharray={`${report.whiteAccuracy}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="absolute font-mono font-bold text-sm text-[#F4EFE6]">
                    {report.whiteAccuracy}%
                  </span>
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase text-[#A69F91]">White Accuracy</div>
                  <div className="text-sm font-bold text-[#F4EFE6]">
                    {gameMode === 'pass_and_play'
                      ? 'Player 1'
                      : playerColor === 'w'
                      ? 'You (White)'
                      : 'AI (White)'}
                  </div>
                  <div className="text-[11px] text-[#A69F91]">CAPS Precision Metric</div>
                </div>
              </div>

              {/* Black Accuracy */}
              <div className="bg-[#121A16] border border-[#26342C] rounded-lg p-3.5 flex items-center gap-3">
                <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-[#26342C]"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-cyan-400"
                      strokeDasharray={`${report.blackAccuracy}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="absolute font-mono font-bold text-sm text-[#F4EFE6]">
                    {report.blackAccuracy}%
                  </span>
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase text-[#A69F91]">Black Accuracy</div>
                  <div className="text-sm font-bold text-[#F4EFE6]">
                    {gameMode === 'pass_and_play'
                      ? 'Player 2'
                      : playerColor === 'b'
                      ? 'You (Black)'
                      : 'AI (Black)'}
                  </div>
                  <div className="text-[11px] text-[#A69F91]">CAPS Precision Metric</div>
                </div>
              </div>
            </div>

            {/* Move Classification Breakdown Table */}
            <div className="bg-[#121A16] border border-[#26342C] rounded-lg p-3 space-y-2">
              <div className="text-xs font-mono uppercase text-[#A69F91] tracking-wider px-1">
                Move Quality Breakdown
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'] as MoveClassification[]).map((cat) => {
                  const meta = CLASSIFICATION_COLORS[cat];
                  const wCount = report.classificationCounts.w[cat];
                  const bCount = report.classificationCounts.b[cat];
                  return (
                    <div
                      key={cat}
                      className="p-2 rounded bg-[#17211C] border border-[#26342C] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: meta.text }}
                        />
                        <span className="text-xs font-semibold text-[#EADBC8]">{meta.label}</span>
                      </div>
                      <div className="text-xs font-mono font-bold tabular-nums text-[#F4EFE6]">
                        {wCount} <span className="text-[#A69F91] font-normal">|</span> {bCount}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-right text-[#A69F91] px-1">
                Format: White | Black counts
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ADVANTAGE GRAPH */}
        {activeTab === 'graph' && (
          <div className="space-y-3">
            <div className="text-xs text-[#A69F91] flex justify-between items-center">
              <span>Centipawn Advantage Curve (Hover or click nodes to preview ply)</span>
              <span className="font-mono text-emerald-400">▲ White</span>
              <span className="font-mono text-cyan-400">▼ Black</span>
            </div>

            <div className="bg-[#121A16] border border-[#26342C] rounded-lg p-2 overflow-hidden">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-auto select-none"
              >
                {/* Center Zero Equilibrium Line */}
                <line
                  x1={paddingX}
                  y1={midY}
                  x2={svgWidth - paddingX}
                  y2={midY}
                  stroke="#3A4E42"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />

                {/* Shaded Area */}
                <path d={whiteAreaD} fill="rgba(34, 197, 94, 0.08)" />

                {/* Momentum Curve Line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="#C6923A"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Interactive Points */}
                {curvePoints.map((pt, i) => {
                  const isHovered = hoveredPly === i;
                  return (
                    <circle
                      key={`pt-${i}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 5 : 2.5}
                      fill={pt.score >= 0 ? '#22C55E' : '#06B6D4'}
                      stroke="#17211C"
                      strokeWidth="1.5"
                      className="cursor-pointer transition-all"
                      onMouseEnter={() => setHoveredPly(i)}
                      onMouseLeave={() => setHoveredPly(null)}
                      onClick={() => onSelectPreviewPly(i)}
                    />
                  );
                })}
              </svg>

              {/* Hover / Active Ply Callout */}
              {hoveredPly !== null && curvePoints[hoveredPly] && (
                <div className="mt-2 text-center text-xs font-mono text-[#EADBC8] bg-[#17211C] p-1.5 rounded border border-[#26342C]">
                  Ply {hoveredPly}: {curvePoints[hoveredPly].score >= 0 ? '+' : ''}
                  {(curvePoints[hoveredPly].score / 100).toFixed(2)} pawns · Click to inspect on board
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TURNING POINTS */}
        {activeTab === 'turning_points' && (
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {report.turningPoints.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#A69F91]">
                No critical turning points or major blunders detected! Both sides played with high accuracy.
              </div>
            ) : (
              report.turningPoints.map((tp, idx) => {
                const meta = CLASSIFICATION_COLORS[tp.classification];
                return (
                  <div
                    key={`tp-${idx}`}
                    className="p-3 bg-[#121A16] border border-[#26342C] rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase text-white"
                          style={{ backgroundColor: meta.bg }}
                        >
                          {meta.badge}
                        </span>
                        <span className="text-xs font-bold text-[#F4EFE6]">
                          Move {tp.turnNumber} ({tp.color === 'w' ? 'White' : 'Black'})
                        </span>
                      </div>

                      <button
                        type="button"
                        data-testid={`retry-blunder-btn-${idx}`}
                        onClick={() => onStartRetryBlunder(tp)}
                        className="py-1 px-2.5 rounded bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <span>↺</span>
                        <span>Retry Position</span>
                      </button>
                    </div>

                    <div className="text-xs text-[#D6CFC2] leading-relaxed">
                      Played <span className="font-mono font-bold text-rose-400">{tp.playedSan}</span>. {tp.description}
                    </div>

                    <div className="text-[11px] text-[#A69F91] flex items-center justify-between">
                      <span>Centipawn Loss: -{tp.centipawnLoss} cp</span>
                      <button
                        type="button"
                        onClick={() => onSelectPreviewPly(tp.plyIndex)}
                        className="text-[#C6923A] hover:underline cursor-pointer"
                      >
                        Inspect Position →
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Action Footer: Export & Navigation */}
        <div className="border-t border-[#2B3B32] pt-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="copy-fen-btn"
              onClick={handleCopyFen}
              className="py-1.5 px-3 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#3A4E42] text-xs font-semibold text-[#EADBC8] hover:text-[#F4EFE6] transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>📋</span>
              <span>{copiedType === 'fen' ? 'Copied FEN!' : 'Copy FEN'}</span>
            </button>
            <button
              type="button"
              data-testid="copy-pgn-btn"
              onClick={handleCopyPgn}
              className="py-1.5 px-3 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#3A4E42] text-xs font-semibold text-[#EADBC8] hover:text-[#F4EFE6] transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>📜</span>
              <span>{copiedType === 'pgn' ? 'Copied PGN!' : 'Copy PGN'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-1.5 px-3.5 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#3A4E42] text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer"
            >
              Inspect Board
            </button>
            <button
              type="button"
              onClick={onPlayAgain}
              className="py-1.5 px-4 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] text-xs font-bold transition-colors cursor-pointer"
            >
              Play Again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

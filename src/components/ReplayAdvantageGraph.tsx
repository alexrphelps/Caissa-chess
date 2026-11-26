import React, { useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from 'lucide-react';
import {
  CLASSIFICATION_COLORS,
  GameReviewProgressEvent,
  GameReviewReport,
} from '../chess/gameReview';

interface ReplayAdvantageGraphProps {
  report: GameReviewReport | null;
  isAnalyzing: boolean;
  progress: GameReviewProgressEvent | null;
  currentPly: number;
  totalPlies: number;
  onStartFullAnalysis: () => void;
  onCancelFullAnalysis: () => void;
  onJumpToPly: (ply: number) => void;
}

export const ReplayAdvantageGraph: React.FC<ReplayAdvantageGraphProps> = ({
  report,
  isAnalyzing,
  progress,
  currentPly,
  totalPlies,
  onStartFullAnalysis,
  onCancelFullAnalysis,
  onJumpToPly,
}) => {
  const [isGraphExpanded, setIsGraphExpanded] = useState<boolean>(true);
  const [hoveredPly, setHoveredPly] = useState<number | null>(null);

  if (totalPlies === 0) return null;

  // State 1: Idle (no full report yet)
  if (!report && !isAnalyzing) {
    return (
      <div
        data-testid="replay-full-analysis-bar"
        className="px-3.5 py-2 bg-[#131C17] border-b border-[#26342C] flex items-center justify-between gap-2 shrink-0"
      >
        <div className="min-w-0">
          <span className="text-[11px] text-[#A69F91] truncate block">
            Full-Game Advantage Curve &amp; Accuracy
          </span>
        </div>
        <button
          type="button"
          data-testid="replay-analyze-full-game-btn"
          onClick={onStartFullAnalysis}
          className="px-2.5 py-1 rounded-md bg-[#212E27] hover:bg-[#2C3D34] border border-[#C6923A]/55 text-[11px] font-semibold text-[#F4EFE6] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Activity className="w-3.5 h-3.5 text-[#C6923A]" />
          <span>Analyze Full Game</span>
        </button>
      </div>
    );
  }

  // State 2: In-Progress Worker Analysis
  if (isAnalyzing) {
    const done = progress?.completedPlies ?? 0;
    const total = progress?.totalPlies ?? totalPlies;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

    return (
      <div
        data-testid="replay-full-analysis-progress"
        className="px-3.5 py-2 bg-[#131C17] border-b border-[#26342C] space-y-1.5 shrink-0"
      >
        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
          <span className="flex items-center gap-1.5 text-[#C6923A] tabular-nums">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>
              Analyzing game {done}/{total} plies ({pct}%)
            </span>
          </span>
          <button
            type="button"
            onClick={onCancelFullAnalysis}
            aria-label="Cancel full game analysis"
            className="text-[#A69F91] hover:text-[#F4EFE6] p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[#223028] overflow-hidden">
          <div
            className="h-full bg-[#C6923A] transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (!report) return null;

  // State 3: Completed Full-Game Advantage Graph + Turning Points
  const svgWidth = 380;
  const svgHeight = 76;
  const padX = 8;
  const padY = 8;
  const plotW = svgWidth - padX * 2;
  const plotH = svgHeight - padY * 2;
  const midY = padY + plotH / 2;
  const maxClamp = 700;

  const points = report.evalCurve.map((score, ply) => {
    const x =
      report.evalCurve.length <= 1
        ? padX + plotW / 2
        : padX + (ply / (report.evalCurve.length - 1)) * plotW;
    const clamped = Math.max(-maxClamp, Math.min(maxClamp, score));
    const y = midY - (clamped / maxClamp) * (plotH / 2);
    return { x, y, score, ply };
  });

  const linePath = points
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${midY.toFixed(1)} L ${points[0].x.toFixed(1)} ${midY.toFixed(1)} Z`
      : '';

  const activePoint =
    points[Math.max(0, Math.min(currentPly, points.length - 1))] ?? points[0];

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * svgWidth;
    const frac = Math.max(0, Math.min(1, (relX - padX) / plotW));
    const targetPly = Math.round(frac * (points.length - 1));
    onJumpToPly(targetPly);
  };

  return (
    <div
      data-testid="replay-advantage-graph"
      className="bg-[#131C17] border-b border-[#26342C] shrink-0"
    >
      <button
        type="button"
        data-testid="replay-graph-toggle"
        aria-expanded={isGraphExpanded}
        onClick={() => setIsGraphExpanded((prev) => !prev)}
        className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left hover:bg-[#19241E] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0 text-[11px] font-mono tabular-nums">
          <Activity className="w-3.5 h-3.5 text-[#C6923A] shrink-0" />
          <span className="text-[#F4EFE6] font-semibold">
            W {report.whiteAccuracy}%
          </span>
          <span className="text-[#6E685C]">·</span>
          <span className="text-[#D6CFC2] font-semibold">
            B {report.blackAccuracy}%
          </span>
          <span className="text-[#6E685C]">·</span>
          <span className="text-[#A69F91] truncate">
            {report.turningPoints.length} turning{' '}
            {report.turningPoints.length === 1 ? 'point' : 'points'}
          </span>
        </div>
        {isGraphExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-[#A69F91] shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[#A69F91] shrink-0" />
        )}
      </button>

      {isGraphExpanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {/* Interactive SVG Advantage Curve */}
          <div className="rounded-lg bg-[#0F1612] border border-[#223028] p-1">
            <svg
              data-testid="replay-advantage-svg"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              onClick={handleSvgClick}
              onMouseLeave={() => setHoveredPly(null)}
              className="w-full h-[54px] cursor-pointer select-none block"
            >
              {/* Zero line */}
              <line
                x1={padX}
                y1={midY}
                x2={svgWidth - padX}
                y2={midY}
                stroke="#304237"
                strokeWidth="1"
                strokeDasharray="3 3"
              />

              {/* Subtle area fill */}
              {areaPath && (
                <path d={areaPath} fill="rgba(198, 146, 58, 0.14)" />
              )}

              {/* Advantage Curve */}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#C6923A"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Turning point dots */}
              {report.turningPoints.map((tp) => {
                const pt = points[tp.plyIndex + 1];
                if (!pt) return null;
                const meta = CLASSIFICATION_COLORS[tp.classification];
                return (
                  <circle
                    key={`tp-dot-${tp.plyIndex}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredPly === tp.plyIndex + 1 ? 4.5 : 3}
                    fill={meta.text}
                    stroke="#0F1612"
                    strokeWidth="1"
                    onMouseEnter={() => setHoveredPly(tp.plyIndex + 1)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onJumpToPly(tp.plyIndex + 1);
                    }}
                  />
                );
              })}

              {/* Current Ply vertical cursor */}
              {activePoint && (
                <>
                  <line
                    x1={activePoint.x}
                    y1={padY}
                    x2={activePoint.x}
                    y2={svgHeight - padY}
                    stroke="#F4EFE6"
                    strokeWidth="1.2"
                    strokeOpacity="0.65"
                  />
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.y}
                    r="3.5"
                    fill="#F4EFE6"
                    stroke="#111815"
                    strokeWidth="1.2"
                  />
                </>
              )}
            </svg>
          </div>

          {/* Turning Points Jump Strip */}
          {report.turningPoints.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {report.turningPoints.slice(0, 6).map((tp) => {
                const targetPly = tp.plyIndex + 1;
                const isActive = currentPly === targetPly;
                const meta = CLASSIFICATION_COLORS[tp.classification];
                const glyph = tp.classification === 'blunder' ? '??' : '?';
                return (
                  <button
                    key={`tp-jump-${tp.plyIndex}`}
                    type="button"
                    data-testid={`replay-turning-point-${targetPly}`}
                    onClick={() => onJumpToPly(targetPly)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#C6923A] text-[#111815] border-[#C6923A]'
                        : 'bg-[#18221D] hover:bg-[#223028] border-[#2E4035] text-[#EADBC8]'
                    }`}
                  >
                    <span
                      className="mr-1 font-bold"
                      style={{ color: isActive ? '#111815' : meta.text }}
                    >
                      {glyph}
                    </span>
                    {tp.turnNumber}
                    {tp.color === 'w' ? '.' : '...'}
                    {tp.playedSan}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

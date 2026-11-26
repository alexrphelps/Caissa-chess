import React from 'react';
import { computeEvalBarMetrics } from '../chess/replayCoach';

interface EvalBarProps {
  evalWhiteCp: number;
  heightPx: number;
  isFlipped: boolean;
  formattedScore?: string;
  isLoading?: boolean;
  className?: string;
}

/**
 * Slim vertical evaluation bar shared between Live Matches and Replay Studio.
 * Height-synced to the chessboard frame so it never causes layout overflow.
 */
export const EvalBar: React.FC<EvalBarProps> = ({
  evalWhiteCp,
  heightPx,
  isFlipped,
  formattedScore,
  isLoading = false,
  className = '',
}) => {
  const metrics = computeEvalBarMetrics(evalWhiteCp);
  const displayLabel = formattedScore ?? metrics.label;
  const whiteWinning = metrics.whiteLeading;

  // Determine where White's fill is anchored (bottom normally, top when board is flipped)
  const whiteOnBottom = !isFlipped;
  const labelAtBottom = whiteWinning ? whiteOnBottom : !whiteOnBottom;

  // Compact display string so it fits inside a 26px-wide column cleanly
  const compactLabel = displayLabel
    .replace('+', '')
    .replace(/^-/, '')
    .slice(0, 5);
  const signedCompact = metrics.isMate
    ? displayLabel.replace(/^[+-]/, '')
    : displayLabel === '0.0'
    ? '0.0'
    : compactLabel;

  return (
    <div
      data-testid="eval-bar"
      data-eval-cp={Math.round(evalWhiteCp)}
      role="meter"
      aria-label="Engine position evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(metrics.whitePct)}
      aria-valuetext={`${displayLabel} (${
        whiteWinning ? 'White' : 'Black'
      } advantage)`}
      title={`Evaluation: ${displayLabel} (${
        metrics.whitePct.toFixed(0)
      }% White win expectation)`}
      style={{ height: `${Math.max(200, Math.round(heightPx))}px` }}
      className={`relative w-[26px] shrink-0 rounded-lg overflow-hidden border border-[#34463C] bg-[#18201C] shadow-[inset_0_1px_3px_rgba(0,0,0,0.65)] select-none ${className}`}
    >
      {/* White Advantage Fill */}
      <div
        data-testid="eval-bar-white-fill"
        className={`absolute left-0 right-0 bg-[#EAE2D3] transition-[height] duration-300 ease-out ${
          whiteOnBottom ? 'bottom-0' : 'top-0'
        }`}
        style={{ height: `${metrics.whitePct}%` }}
      />

      {/* Midpoint Equilibrium Hairline */}
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 top-1/2 -translate-y-px h-[2px] bg-[#C6923A]/75 z-10 pointer-events-none"
      />

      {/* Crisp Score Readout Anchored to Winning Side */}
      <span
        data-testid="eval-bar-label"
        className={`absolute left-0 right-0 z-20 px-0.5 text-center font-mono text-[9px] font-bold leading-none tabular-nums tracking-tight pointer-events-none ${
          labelAtBottom ? 'bottom-1.5' : 'top-1.5'
        } ${
          whiteWinning ? 'text-[#1A1612]' : 'text-[#EDE6D8]'
        } ${isLoading ? 'opacity-70' : 'opacity-100'}`}
      >
        {signedCompact}
      </span>
    </div>
  );
};

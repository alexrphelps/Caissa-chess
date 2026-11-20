import React, { useState } from 'react';
import { OpeningPrinciplesReport, PrincipleMilestone } from '../chess/openingAssistant';
import { Color } from '../chess/types';

interface OpeningPrinciplesHudProps {
  report: OpeningPrinciplesReport;
  playerColor: Color;
  isDismissed?: boolean;
  onDismiss?: () => void;
}

const STATUS_ICONS: Record<PrincipleMilestone['status'], { icon: string; color: string; badgeBg: string }> = {
  achieved: {
    icon: '✓',
    color: 'text-emerald-400',
    badgeBg: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
  },
  progress: {
    icon: '◐',
    color: 'text-amber-400',
    badgeBg: 'bg-amber-950/80 border-amber-500/40 text-amber-300',
  },
  warning: {
    icon: '!',
    color: 'text-rose-400',
    badgeBg: 'bg-rose-950/80 border-rose-500/40 text-rose-300',
  },
  pending: {
    icon: '○',
    color: 'text-stone-400',
    badgeBg: 'bg-stone-900/80 border-stone-600/40 text-stone-400',
  },
};

const GRADE_STYLES: Record<OpeningPrinciplesReport['grade'], { badge: string; text: string }> = {
  'A+': { badge: 'bg-emerald-500 text-stone-950', text: 'Master-Class Opening' },
  'A': { badge: 'bg-emerald-600 text-white', text: 'Sound Opening' },
  'B': { badge: 'bg-amber-500 text-stone-950', text: 'Fair Opening' },
  'C': { badge: 'bg-amber-600 text-white', text: 'Imprecise Opening' },
  'Developing': { badge: 'bg-stone-700 text-stone-200', text: 'Opening in Progress' },
};

export const OpeningPrinciplesHud: React.FC<OpeningPrinciplesHudProps> = ({
  report,
  playerColor,
  isDismissed = false,
  onDismiss,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [selectedMilestone, setSelectedMilestone] = useState<PrincipleMilestone | null>(null);

  if (isDismissed) {
    return null;
  }

  const gradeInfo = GRADE_STYLES[report.grade];

  return (
    <div
      role="region"
      aria-label="Opening Principles Assistant"
      data-testid="opening-principles-hud"
      className="bg-[#17211C] border border-[#2E3F35] rounded-xl overflow-hidden shadow-lg transition-all text-[#F4EFE6]"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#141C18] border-b border-[#24332B]">
        <div className="flex items-center gap-2">
          <span className="text-[#C6923A] text-sm">♔</span>
          <span className="text-xs font-bold font-mono tracking-wide uppercase text-[#EADBC8]">
            Opening Principles
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1D2922] border border-[#3A4E42] text-[#A69F91]">
            Move {report.moveNumber}/12
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Grade Badge */}
          <span
            data-testid="opening-grade-badge"
            className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${gradeInfo.badge}`}
          >
            {report.grade} ({report.overallScore}%)
          </span>

          <button
            type="button"
            aria-label={isExpanded ? 'Collapse Opening Principles' : 'Expand Opening Principles'}
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-stone-400 hover:text-stone-200 text-xs px-1.5 py-0.5 rounded hover:bg-[#212E27] cursor-pointer transition-colors"
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-2.5">
          {/* Headline Feedback */}
          <div className="text-xs text-[#D6CFC2] leading-relaxed bg-[#111714] p-2 rounded-lg border border-[#24332B] flex items-start gap-2">
            <span className="text-[#C6923A] shrink-0 mt-0.5">💡</span>
            <span>{report.headlineFeedback}</span>
          </div>

          {/* 4 Milestones List */}
          <div className="space-y-1.5">
            {report.milestones.map((milestone) => {
              const meta = STATUS_ICONS[milestone.status];
              const isSelected = selectedMilestone?.id === milestone.id;

              return (
                <div
                  key={milestone.id}
                  onClick={() => setSelectedMilestone(isSelected ? null : milestone)}
                  className={`group p-2 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#1D2922] border-[#C6923A]'
                      : 'bg-[#121A16] border-[#223028] hover:border-[#384E40]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold border ${meta.badgeBg}`}
                      >
                        {meta.icon}
                      </span>
                      <span className="text-xs font-semibold text-[#F4EFE6]">
                        {milestone.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Mini Progress Bar */}
                      <div className="w-16 h-1.5 bg-[#0D1411] rounded-full overflow-hidden border border-[#26362D]">
                        <div
                          className={`h-full transition-all duration-300 ${
                            milestone.status === 'achieved'
                              ? 'bg-emerald-500'
                              : milestone.status === 'warning'
                              ? 'bg-rose-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${milestone.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-[#A69F91] w-7 text-right">
                        {milestone.progressPercent}%
                      </span>
                    </div>
                  </div>

                  {/* Detail & Hint Sub-row */}
                  <div className="mt-1 pl-7 text-[11px] text-[#A69F91] leading-normal">
                    {milestone.detail}
                    {isSelected && (
                      <div className="mt-1.5 p-1.5 rounded bg-[#101713] border border-[#293B30] text-[#EADBC8] text-[11px]">
                        <span className="font-semibold text-[#C6923A]">Coach Tip: </span>
                        {milestone.hint}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

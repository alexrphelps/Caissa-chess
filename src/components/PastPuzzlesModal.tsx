import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  History,
  Trash2,
  Play,
  Clock,
  Filter,
  Trophy,
} from 'lucide-react';
import { ChessPuzzle, PlayedPuzzleEntry } from '../chess/puzzles/types';

interface PastPuzzlesModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: PlayedPuzzleEntry[];
  onReplayPuzzle: (puzzle: ChessPuzzle) => void;
  onClearHistory: () => void;
  activePuzzleId?: string;
}

type FilterOutcome = 'all' | 'solved' | 'failed' | 'assisted';

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'Recently';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export const PastPuzzlesModal: React.FC<PastPuzzlesModalProps> = ({
  isOpen,
  onClose,
  records,
  onReplayPuzzle,
  onClearHistory,
  activePuzzleId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<FilterOutcome>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  // Filtered list
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      // Outcome filter
      if (filterOutcome !== 'all' && rec.outcome !== filterOutcome) {
        return false;
      }
      // Search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const idMatch = rec.puzzleId.toLowerCase().includes(query);
        const descMatch = (rec.puzzle.description || '').toLowerCase().includes(query);
        const themesMatch = (rec.puzzle.themes || []).some((t) =>
          t.toLowerCase().includes(query)
        );
        const ratingMatch = rec.puzzle.rating.toString().includes(query);
        return idMatch || descMatch || themesMatch || ratingMatch;
      }
      return true;
    });
  }, [records, filterOutcome, searchTerm]);

  // Counts by outcome
  const counts = useMemo(() => {
    return {
      all: records.length,
      solved: records.filter((r) => r.outcome === 'solved').length,
      failed: records.filter((r) => r.outcome === 'failed').length,
      assisted: records.filter((r) => r.outcome === 'assisted').length,
    };
  }, [records]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="past-puzzles-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-2xl bg-[#16201C] border border-[#2A3B32] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A3B32] bg-[#121A17]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#212E27] border border-[#34463C] text-[#C6923A]">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="past-puzzles-title"
                className="text-base sm:text-lg font-bold font-serif text-[#F4EFE6] flex items-center gap-2"
              >
                <span>Past Puzzles History</span>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-[#212E27] border border-[#34463C] text-[#C6923A]">
                  {records.length} played
                </span>
              </h2>
              <p className="text-xs text-[#A69F91]">
                Review all past tactical puzzles and replay them for targeted practice.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close past puzzles modal"
            className="p-1.5 rounded-lg text-[#A69F91] hover:text-[#F4EFE6] hover:bg-[#212E27] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-[#2A3B32] bg-[#16201C] space-y-3 shrink-0">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#A69F91]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by ID, theme (e.g. Pin, Fork, Endgame), or rating..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#111815] border border-[#2A3B32] text-xs text-[#F4EFE6] placeholder-[#6E675F] focus:outline-none focus:border-[#C6923A] focus:ring-1 focus:ring-[#C6923A]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2 text-xs text-[#A69F91] hover:text-[#F4EFE6]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setFilterOutcome('all')}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer shrink-0 ${
                filterOutcome === 'all'
                  ? 'bg-[#C6923A] text-[#111815] font-bold'
                  : 'bg-[#212E27] text-[#D6CFC2] hover:bg-[#2B3B32]'
              }`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilterOutcome('solved')}
              className={`flex items-center gap-1 px-3 py-1 rounded-md font-medium transition-colors cursor-pointer shrink-0 ${
                filterOutcome === 'solved'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-[#212E27] text-emerald-400 hover:bg-[#2B3B32]'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Solved ({counts.solved})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterOutcome('failed')}
              className={`flex items-center gap-1 px-3 py-1 rounded-md font-medium transition-colors cursor-pointer shrink-0 ${
                filterOutcome === 'failed'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'bg-[#212E27] text-rose-400 hover:bg-[#2B3B32]'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Failed ({counts.failed})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterOutcome('assisted')}
              className={`flex items-center gap-1 px-3 py-1 rounded-md font-medium transition-colors cursor-pointer shrink-0 ${
                filterOutcome === 'assisted'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-[#212E27] text-amber-400 hover:bg-[#2B3B32]'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Assisted ({counts.assisted})</span>
            </button>
          </div>
        </div>

        {/* Scrollable Puzzle List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[220px]">
          {filteredRecords.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#A69F91]">
              <History className="w-10 h-10 mb-2 opacity-30 text-[#C6923A]" />
              <p className="text-sm font-semibold text-[#D6CFC2]">No past puzzles found</p>
              <p className="text-xs text-[#8A8478] max-w-xs mt-1">
                {records.length === 0
                  ? 'Play or solve puzzles in Adaptive or Tier mode to automatically build your puzzle history.'
                  : 'No puzzles matched your current search and outcome filter.'}
              </p>
            </div>
          ) : (
            filteredRecords.map((rec) => {
              const isActive = rec.puzzleId === activePuzzleId;
              return (
                <div
                  key={`${rec.puzzleId}-${rec.timestamp}`}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-[#1E2E25] border-[#C6923A] shadow-md'
                      : 'bg-[#111815]/80 hover:bg-[#1A2621] border-[#2A3B32]'
                  } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#F4EFE6]">
                        #{rec.puzzleId}
                      </span>

                      {/* Difficulty rating badge */}
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#212E27] text-[#C6923A] border border-[#34463C] font-semibold">
                        {rec.puzzle.rating} Elo
                      </span>

                      {/* Outcome badge */}
                      {rec.outcome === 'solved' ? (
                        <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Solved</span>
                          {rec.delta > 0 && <span>(+{rec.delta})</span>}
                        </span>
                      ) : rec.outcome === 'failed' ? (
                        <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-rose-950/80 text-rose-400 border border-rose-800/60 font-semibold">
                          <XCircle className="w-3 h-3" />
                          <span>Failed</span>
                          {rec.delta < 0 && <span>({rec.delta})</span>}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-400 border border-amber-800/60 font-semibold">
                          <HelpCircle className="w-3 h-3" />
                          <span>Assisted</span>
                        </span>
                      )}

                      {/* Timestamp */}
                      <span className="text-[10px] font-mono text-[#8A8478] flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formatRelativeTime(rec.timestamp)}
                      </span>

                      {isActive && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#C6923A] text-[#111815]">
                          Active on Board
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-[#D6CFC2] line-clamp-2">
                      {rec.puzzle.description || 'Solve the tactical combination.'}
                    </p>

                    {/* Themes Tags */}
                    {rec.puzzle.themes && rec.puzzle.themes.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {rec.puzzle.themes.map((theme) => (
                          <span
                            key={theme}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-[#1C2721] text-[#A69F91] border border-[#2B3B32]"
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Replay Button */}
                  <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      data-testid={`replay-puzzle-btn-${rec.puzzleId}`}
                      onClick={() => {
                        onReplayPuzzle(rec.puzzle);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#212E27] hover:bg-[#C6923A] text-[#D6CFC2] hover:text-[#111815] border border-[#34463C] hover:border-[#C6923A] text-xs font-bold transition-all cursor-pointer shadow-sm group"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#C6923A] group-hover:text-[#111815]" />
                      <span>Replay</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2A3B32] bg-[#121A17] flex items-center justify-between text-xs">
          <div>
            {confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-rose-400 text-xs">Clear all history?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearHistory();
                    setConfirmClear(false);
                  }}
                  className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer"
                >
                  Yes, Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2 py-1 rounded bg-[#212E27] text-[#D6CFC2] hover:bg-[#2B3B32] text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              records.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1 text-[#8A8478] hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              )
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] text-[#D6CFC2] hover:text-[#F4EFE6] font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  exportSessionToJson,
  exportSessionToPgn,
  generateSessionTitle,
  importSessionFromFen,
  importSessionFromJson,
} from '../chess/sessionStorage';
import {
  Color,
  EngineProfileState,
  GameMode,
  GameState,
  StoredGameSession,
} from '../chess/types';

interface SavedGamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Current game state (if in game or suspended)
  currentState?: GameState;
  currentGameMode?: GameMode;
  currentPlayerColor?: Color;
  currentEngineProfile?: EngineProfileState;
  currentIsFlipped?: boolean;
  savedSessions: StoredGameSession[];
  activeSession: StoredGameSession | null;
  onSaveCurrentSession: (customTitle?: string) => void;
  onLoadSession: (session: StoredGameSession) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onClearActiveSession?: () => void;
  onImportSession?: (session: StoredGameSession) => void;
}

export const SavedGamesModal: React.FC<SavedGamesModalProps> = ({
  isOpen,
  onClose,
  currentState,
  currentGameMode = 'ai',
  currentPlayerColor = 'w',
  currentEngineProfile,
  currentIsFlipped = false,
  savedSessions,
  activeSession,
  onSaveCurrentSession,
  onLoadSession,
  onDeleteSession,
  onRenameSession,
  onClearActiveSession,
  onImportSession,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [customSaveTitle, setCustomSaveTitle] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showImportArea, setShowImportArea] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2400);
  };

  const handleCopyPgn = async (session: StoredGameSession) => {
    const pgn = exportSessionToPgn(session);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(pgn);
        showToast('PGN copied to clipboard');
      } else {
        showToast('Clipboard unavailable');
      }
    } catch {
      showToast('Could not copy to clipboard');
    }
  };

  const handleCopyJson = async (session: StoredGameSession) => {
    const json = exportSessionToJson(session);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(json);
        showToast('JSON session copied to clipboard');
      } else {
        showToast('Clipboard unavailable');
      }
    } catch {
      showToast('Could not copy to clipboard');
    }
  };

  const handleStartRename = (session: StoredGameSession) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameSession(id, editTitle.trim());
      showToast('Game renamed');
    }
    setEditingId(null);
  };

  const handleQuickSave = () => {
    onSaveCurrentSession(customSaveTitle.trim() || undefined);
    setCustomSaveTitle('');
    showToast('Match saved to storage slots');
  };

  const handleImportSubmit = () => {
    setImportError(null);
    const text = importJsonText.trim();
    if (!text) return;

    let session: StoredGameSession | null = null;
    if (text.startsWith('{')) {
      session = importSessionFromJson(text);
      if (!session) {
        setImportError('Invalid session JSON format. Please ensure valid export data.');
        return;
      }
    } else {
      session = importSessionFromFen(text, {
        gameMode: currentGameMode,
        playerColor: currentPlayerColor,
        engineProfile: currentEngineProfile,
        isFlipped: currentIsFlipped,
      });
      if (!session) {
        setImportError(
          'Invalid FEN string. Please check standard FIDE FEN notation (e.g. "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1").'
        );
        return;
      }
    }

    if (onImportSession) {
      onImportSession(session);
      setShowImportArea(false);
      setImportJsonText('');
      showToast(`Imported "${session.title}"`);
    }
  };

  const currentMatchDefaultTitle = currentState
    ? generateSessionTitle(
        currentState,
        currentGameMode,
        currentPlayerColor,
        currentEngineProfile
      )
    : '';

  const hasCurrentGameToSave = Boolean(currentState);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stored Game Sessions"
      className="fixed inset-0 z-50 bg-[#0B100E]/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none"
    >
      <div className="w-full max-w-2xl bg-[#17211C] border-2 border-[#C6923A] rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#121A16] border-b border-[#26342C] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#25352C] border border-[#C6923A]/50 flex items-center justify-center text-[#C6923A]">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#C6923A]">
                Persistence & Archive
              </div>
              <h2
                className="text-lg sm:text-xl font-bold text-[#F4EFE6]"
                style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                Stored Game Sessions
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowImportArea((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-[11px] font-mono text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer"
            >
              {showImportArea ? 'Hide Import' : 'Import FEN / JSON'}
            </button>
            <button
              type="button"
              aria-label="Close Stored Sessions Modal"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] text-[#A69F91] hover:text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Floating Toast notification */}
        {toastMessage && (
          <div className="bg-[#C6923A] text-[#111815] px-4 py-1.5 text-xs font-bold text-center animate-fade-in shrink-0">
            ✓ {toastMessage}
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-left">
          {/* Section: Save Current Active Game (if playing) */}
          {hasCurrentGameToSave && (
            <div className="p-3.5 rounded-xl bg-[#121A16] border border-[#2E4035] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#C6923A]">
                  Save Current Session to Slot
                </span>
                <span className="text-[11px] font-mono text-[#A69F91] tabular-nums">
                  Move {currentState?.fullMoveNumber} · {currentState?.moveHistory.length} Plies
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  placeholder={currentMatchDefaultTitle || 'Enter custom session name...'}
                  value={customSaveTitle}
                  onChange={(e) => setCustomSaveTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleQuickSave();
                    }
                  }}
                  className="flex-1 w-full bg-[#1A2520] border border-[#34463C] focus:border-[#C6923A] rounded-lg px-3 py-2 text-xs font-mono text-[#F4EFE6] placeholder-[#6E685C] outline-hidden transition-colors"
                />
                <button
                  type="button"
                  data-testid="save-current-session-btn"
                  onClick={handleQuickSave}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] active:bg-[#B5822D] text-[#111815] font-bold text-xs whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  <span>Save to Slot</span>
                </button>
              </div>
            </div>
          )}

          {/* Section: Import Session JSON / FEN Area */}
          {showImportArea && (
            <div className="p-3.5 rounded-xl bg-[#131D18] border border-[#384C41] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-[#EADBC8]">
                  Import FEN or Session JSON
                </span>
                <span className="text-[10px] font-mono text-[#A69F91]">
                  Paste FEN String or Caïssa JSON Export
                </span>
              </div>
              <textarea
                rows={3}
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder='Paste FEN (e.g. "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1") or JSON session...'
                className="w-full bg-[#1B2721] border border-[#34463C] focus:border-[#C6923A] rounded-lg p-2 text-[11px] font-mono text-[#F4EFE6] outline-hidden resize-none"
              />
              {importError && (
                <div className="text-[11px] text-[#F87171] font-mono">
                  {importError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportArea(false)}
                  className="px-3 py-1 rounded bg-[#212E27] text-xs text-[#A69F91] hover:text-[#F4EFE6]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  className="px-3 py-1 rounded bg-[#C6923A] hover:bg-[#D4A048] text-xs font-bold text-[#111815]"
                >
                  Load & Import
                </button>
              </div>
            </div>
          )}

          {/* Active Auto-Save Banner (if available and different from blank initial state) */}
          {activeSession && activeSession.plyCount > 0 && (
            <div className="p-3 rounded-xl bg-[#192620] border border-[#3C5346] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-[#4ADE80]/20 text-[#4ADE80] border border-[#4ADE80]/30 text-[10px] font-mono font-bold">
                    AUTO-SAVE RESUME
                  </span>
                  <span className="text-xs font-bold text-[#F4EFE6] truncate">
                    {activeSession.title}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#A69F91]">
                  Move {activeSession.fullMoveNumber} · {activeSession.plyCount} Plies ·{' '}
                  {activeSession.gameMode === 'ai'
                    ? `vs AI (${activeSession.engineProfile?.elo ?? 1000} Elo)`
                    : '2-Player'}{' '}
                  · Last saved {new Date(activeSession.updatedAt).toLocaleTimeString()}
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                {onClearActiveSession && (
                  <button
                    type="button"
                    title="Discard Auto-Save"
                    onClick={onClearActiveSession}
                    className="px-2.5 py-1.5 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] text-xs text-[#F87171] border border-[#422B2B] transition-colors cursor-pointer"
                  >
                    Discard
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onLoadSession(activeSession);
                    onClose();
                  }}
                  className="flex-1 sm:flex-initial px-4 py-1.5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-xs font-bold text-[#111815] transition-colors cursor-pointer"
                >
                  Resume Active Match
                </button>
              </div>
            </div>
          )}

          {/* Saved Sessions Slots List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#A69F91]">
                Saved Slots ({savedSessions.length})
              </span>
              <span className="text-[10px] font-mono text-[#7A7467]">
                Saved in local browser memory
              </span>
            </div>

            {savedSessions.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#121A16] border border-[#26342C] text-center space-y-2">
                <div className="text-2xl text-[#C6923A]/70">♟</div>
                <div className="text-sm font-semibold text-[#D6CFC2]">
                  No saved matches in archive
                </div>
                <p className="text-xs text-[#A69F91] max-w-sm mx-auto">
                  Click "Save to Slot" above or press [S] in-game to preserve matches. Your active game is also auto-saved across browser reloads.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {savedSessions.map((session) => {
                  const isEditing = editingId === session.id;
                  const dateLabel = new Date(session.updatedAt).toLocaleDateString(
                    undefined,
                    {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  );

                  return (
                    <div
                      key={session.id}
                      data-testid={`saved-session-${session.id}`}
                      className="p-3.5 rounded-xl bg-[#141E19] hover:bg-[#18241E] border border-[#26342C] hover:border-[#384C41] transition-all space-y-2.5"
                    >
                      {/* Top row: Title (or inline edit input) + Status badge + Timestamp */}
                      <div className="flex items-center justify-between gap-2">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 flex-1 mr-2">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(session.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              autoFocus
                              className="flex-1 bg-[#1F2C24] border border-[#C6923A] rounded px-2 py-1 text-xs font-mono text-[#F4EFE6] outline-hidden"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveRename(session.id)}
                              className="px-2 py-1 rounded bg-[#C6923A] text-[#111815] text-[11px] font-bold"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="px-2 py-1 rounded bg-[#25352C] text-[#A69F91] text-[11px]"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-bold text-[#F4EFE6] truncate">
                              {session.title}
                            </span>
                            <button
                              type="button"
                              title="Rename Session"
                              onClick={() => handleStartRename(session)}
                              className="text-[#A69F91] hover:text-[#C6923A] text-xs transition-colors cursor-pointer shrink-0"
                            >
                              ✎
                            </button>
                          </div>
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              session.status === 'checkmate'
                                ? 'bg-[#C6923A]/20 text-[#C6923A] border border-[#C6923A]/40'
                                : session.status.startsWith('draw')
                                ? 'bg-[#94A3B8]/20 text-[#94A3B8] border border-[#94A3B8]/30'
                                : 'bg-[#22332A] text-[#4ADE80] border border-[#4ADE80]/30'
                            }`}
                          >
                            {session.status === 'checkmate'
                              ? `Checkmate (${session.winner === 'w' ? 'W' : 'B'})`
                              : session.status.startsWith('draw')
                              ? 'Draw'
                              : `Live · Move ${session.fullMoveNumber}`}
                          </span>
                          <span className="text-[10px] font-mono text-[#7A7467] tabular-nums hidden sm:inline">
                            {dateLabel}
                          </span>
                        </div>
                      </div>

                      {/* Middle row: Metadata tags */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#A69F91]">
                        <span>
                          Mode:{' '}
                          <strong className="text-[#D6CFC2]">
                            {session.gameMode === 'ai'
                              ? `AI (${session.engineProfile?.elo ?? 1000} Elo)`
                              : 'Two-Player Local'}
                          </strong>
                        </span>
                        <span>·</span>
                        <span>
                          Side:{' '}
                          <strong className="text-[#D6CFC2]">
                            {session.playerColor === 'w' ? 'White' : 'Black'}
                          </strong>
                        </span>
                        <span>·</span>
                        <span>
                          Plies:{' '}
                          <strong className="text-[#D6CFC2]">
                            {session.plyCount}
                          </strong>
                        </span>
                        {session.lastMoveSan && (
                          <>
                            <span>·</span>
                            <span>
                              Last:{' '}
                              <strong className="text-[#C6923A]">
                                {session.lastMoveSan}
                              </strong>
                            </span>
                          </>
                        )}
                      </div>

                      {/* Bottom action row: Load / Export PGN / Export JSON / Delete */}
                      <div className="flex items-center justify-between pt-1 border-t border-[#1F2C24]">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Copy standard PGN notation"
                            onClick={() => handleCopyPgn(session)}
                            className="px-2.5 py-1 rounded-md bg-[#1C2822] hover:bg-[#25352C] border border-[#304037] text-[11px] font-mono text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer"
                          >
                            PGN
                          </button>
                          <button
                            type="button"
                            title="Copy JSON state"
                            onClick={() => handleCopyJson(session)}
                            className="px-2.5 py-1 rounded-md bg-[#1C2822] hover:bg-[#25352C] border border-[#304037] text-[11px] font-mono text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer"
                          >
                            JSON
                          </button>
                          <button
                            type="button"
                            title="Delete saved session"
                            onClick={() => onDeleteSession(session.id)}
                            className="px-2.5 py-1 rounded-md bg-[#1C2822] hover:bg-[#341F1F] border border-[#304037] hover:border-[#6B2C2C] text-[11px] font-mono text-[#A69F91] hover:text-[#F87171] transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>

                        <button
                          type="button"
                          data-testid={`load-session-${session.id}`}
                          onClick={() => {
                            onLoadSession(session);
                            onClose();
                          }}
                          className="px-4 py-1.5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] active:bg-[#B5822D] text-[#111815] font-bold text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                        >
                          <span>Load Game</span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-[#121A16] border-t border-[#26342C] flex items-center justify-between shrink-0 text-xs text-[#A69F91] font-mono">
          <span>Press [Esc] to return</span>
          <span>FIDE Standard Notation & State</span>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  FileText,
  Search,
  Upload,
  X,
  AlertCircle,
  Play,
  Sparkles,
} from 'lucide-react';
import {
  FAMOUS_GAMES_LIBRARY,
  parseFamousGameEntry,
} from '../chess/famousGames';
import {
  formatPgnGameSummary,
  parsePgnDatabase,
} from '../chess/pgnParser';
import {
  FamousGameEntry,
  FamousGameTheme,
  ParsedPgnGame,
  PgnBatchGameError,
} from '../chess/pgnTypes';

interface MasterGamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGame: (game: ParsedPgnGame) => void;
  importedBatch: ParsedPgnGame[];
  onUpdateImportedBatch: (games: ParsedPgnGame[]) => void;
}

const THEME_FILTERS: readonly ('All' | FamousGameTheme)[] = [
  'All',
  'Sacrifice',
  'Positional',
  'Attack',
  'World Championship',
  'Endgame',
];

export const MasterGamesModal: React.FC<MasterGamesModalProps> = ({
  isOpen,
  onClose,
  onSelectGame,
  importedBatch,
  onUpdateImportedBatch,
}) => {
  const [activeTab, setActiveTab] = useState<'library' | 'import'>('library');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTheme, setSelectedTheme] = useState<'All' | FamousGameTheme>(
    'All'
  );

  // Import PGN tab state
  const [pgnInput, setPgnInput] = useState<string>('');
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<PgnBatchGameError[]>([]);
  const [batchFilter, setBatchFilter] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredFamousGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FAMOUS_GAMES_LIBRARY.filter((g) => {
      if (selectedTheme !== 'All' && g.theme !== selectedTheme) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        g.title,
        g.subtitle,
        g.white,
        g.black,
        g.event,
        String(g.year),
        g.eco,
        g.opening,
        g.theme,
        g.description,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery, selectedTheme]);

  const filteredImportedGames = useMemo(() => {
    const q = batchFilter.trim().toLowerCase();
    if (!q) return importedBatch;
    return importedBatch.filter((g) => {
      const hay = [
        g.headers.White,
        g.headers.Black,
        g.headers.Event,
        g.headers.Date,
        g.headers.ECO ?? '',
        g.headers.Opening ?? '',
        g.result,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [importedBatch, batchFilter]);

  if (!isOpen) return null;

  const handleLoadFamous = (entry: FamousGameEntry) => {
    try {
      const parsed = parseFamousGameEntry(entry);
      onSelectGame(parsed);
      onClose();
    } catch (err) {
      setParseErrors([
        {
          index: 0,
          title: entry.title,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to load famous game.',
        },
      ]);
    }
  };

  const processPgnText = (rawText: string, sourceLabel?: string) => {
    setParseErrors([]);
    const trimmed = rawText.trim();
    if (!trimmed) {
      setParseErrors([
        {
          index: 0,
          title: 'Empty Input',
          error: 'Please paste PGN moves or upload a .pgn file first.',
        },
      ]);
      return;
    }

    const result = parsePgnDatabase(trimmed);
    setParseErrors(result.errors);

    if (result.games.length === 0) {
      onUpdateImportedBatch([]);
      return;
    }

    onUpdateImportedBatch(result.games);
    if (sourceLabel) {
      setUploadedFileName(sourceLabel);
    }

    // If a single clean game was imported with zero errors, jump directly into Replay Mode
    if (result.games.length === 1 && result.errors.length === 0) {
      onSelectGame(result.games[0]);
      onClose();
    }
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      setPgnInput(text);
      setUploadedFileName(file.name);
      processPgnText(text, file.name);
    } catch {
      setParseErrors([
        {
          index: 0,
          title: file.name,
          error: 'Could not read the selected file. Ensure it is a valid text PGN file.',
        },
      ]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file) {
      void handleFileUpload(file);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Master Games Library and PGN Import"
      data-testid="master-games-modal"
      className="fixed inset-0 z-50 bg-[#0B100E]/85 flex items-center justify-center p-3 sm:p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-4xl bg-[#17211C] border border-[#34463C] rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#121A16] border-b border-[#26342C] flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2
              className="text-lg sm:text-xl font-bold text-[#F4EFE6] truncate"
              style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Master Games & PGN Replay
            </h2>
            <p className="text-xs text-[#A69F91] mt-0.5 truncate">
              Study landmark games move-by-move or import custom PGN databases and branch into live AI play
            </p>
          </div>

          <button
            type="button"
            aria-label="Close Master Games modal"
            data-testid="close-master-games-modal"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-[#A69F91] hover:text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Tab Bar */}
        <div className="px-5 pt-3 pb-3 bg-[#151E19] border-b border-[#26342C] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div
            role="tablist"
            aria-label="Master Games sections"
            className="inline-flex items-center gap-1 p-1 bg-[#101714] border border-[#26342C] rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'library'}
              data-testid="tab-famous-library"
              onClick={() => setActiveTab('library')}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'library'
                  ? 'bg-[#C6923A] text-[#111815] font-bold'
                  : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#1B2620]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Famous Games Library ({FAMOUS_GAMES_LIBRARY.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'import'}
              data-testid="tab-import-pgn"
              onClick={() => setActiveTab('import')}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'import'
                  ? 'bg-[#C6923A] text-[#111815] font-bold'
                  : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#1B2620]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                Import PGN
                {importedBatch.length > 0 ? ` (${importedBatch.length})` : ''}
              </span>
            </button>
          </div>

          <span className="text-xs text-[#857F72] hidden sm:inline">
            Supports single games, multi-game .pgn bundles & custom FEN starts
          </span>
        </div>

        {/* Body Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {activeTab === 'library' ? (
            <div className="space-y-4">
              {/* Search & Theme Filter Controls */}
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-[#857F72] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by player, opening, event, or year (e.g. Carlsen, Fischer, Sicilian)..."
                    aria-label="Search famous games"
                    data-testid="famous-games-search"
                    className="w-full h-10 pl-9 pr-8 rounded-lg bg-[#111815] border border-[#2C3C33] focus:border-[#C6923A] focus:outline-none text-sm text-[#F4EFE6] placeholder:text-[#7A7467]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#857F72] hover:text-[#F4EFE6] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Interactive Filter Tabs */}
                <div
                  role="group"
                  aria-label="Filter by game theme"
                  className="flex flex-wrap items-center gap-1 p-1 bg-[#111815] border border-[#26342C] rounded-lg"
                >
                  {THEME_FILTERS.map((theme) => {
                    const isActive = selectedTheme === theme;
                    return (
                      <button
                        key={theme}
                        type="button"
                        data-testid={`theme-filter-${theme.toLowerCase().replace(/\s+/g, '-')}`}
                        onClick={() => setSelectedTheme(theme)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isActive
                            ? 'bg-[#25352C] text-[#F4EFE6] font-semibold'
                            : 'text-[#A69F91] hover:text-[#F4EFE6] hover:bg-[#19241E]'
                        }`}
                      >
                        {theme}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Games Grid */}
              {filteredFamousGames.length === 0 ? (
                <div className="py-12 text-center border border-[#26342C] rounded-xl bg-[#121A16]">
                  <p className="text-sm font-semibold text-[#F4EFE6]">
                    No famous games match your filter
                  </p>
                  <p className="text-xs text-[#A69F91] mt-1">
                    Try clearing the search query or selecting &ldquo;All&rdquo; themes.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedTheme('All');
                    }}
                    className="mt-3 px-4 py-2 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div
                  data-testid="famous-games-list"
                  className="grid grid-cols-1 md:grid-cols-2 gap-3"
                >
                  {filteredFamousGames.map((game) => (
                    <article
                      key={game.id}
                      data-testid={`famous-game-card-${game.id}`}
                      className="p-4 rounded-xl bg-[#121A16] border border-[#26342C] hover:border-[#C6923A]/70 transition-colors flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm sm:text-base font-bold text-[#F4EFE6] leading-snug">
                            {game.title}
                          </h3>
                          <span className="text-xs font-mono font-bold text-[#C6923A] tabular-nums whitespace-nowrap shrink-0">
                            {game.result}
                          </span>
                        </div>

                        {/* Unboxed clean metadata line with typographic separators */}
                        <div className="text-xs text-[#A69F91] flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span>{game.white}</span>
                          <span aria-hidden="true">vs.</span>
                          <span>{game.black}</span>
                        </div>
                        <div className="text-[11px] font-mono text-[#857F72] tabular-nums flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span>{game.event}</span>
                          <span aria-hidden="true">·</span>
                          <span>{game.year}</span>
                          <span aria-hidden="true">·</span>
                          <span>{game.eco}</span>
                          <span aria-hidden="true">·</span>
                          <span>{game.opening}</span>
                        </div>

                        <p className="text-xs text-[#D6CFC2] leading-relaxed pt-1">
                          {game.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[#202C25]">
                        <span className="text-[11px] font-mono text-[#A69F91] tabular-nums truncate">
                          {game.theme}
                          {game.keyMove ? ` · Key: ${game.keyMove}` : ''}
                        </span>
                        <button
                          type="button"
                          data-testid={`load-famous-${game.id}`}
                          onClick={() => handleLoadFamous(game)}
                          className="px-3.5 py-1.5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Replay Game</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Drag-and-Drop / File Picker Area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={handleDrop}
                className={`p-4 rounded-xl border border-dashed transition-colors flex flex-col sm:flex-row items-center justify-between gap-3 ${
                  isDraggingFile
                    ? 'bg-[#1D2D24] border-[#C6923A]'
                    : 'bg-[#121A16] border-[#34463C]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#1D2A23] border border-[#34463C] flex items-center justify-center text-[#C6923A] shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#F4EFE6]">
                      {uploadedFileName
                        ? `Loaded file: ${uploadedFileName}`
                        : 'Upload or drag a .pgn file'}
                    </p>
                    <p className="text-xs text-[#A69F91]">
                      Compatible with 365Chess, Chessgames.com, PGN Mentor, TWIC, Lichess, and Chess.com exports
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pgn,.txt,application/x-chess-pgn,text/plain"
                    aria-label="Upload PGN file"
                    data-testid="pgn-file-input"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void handleFileUpload(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    data-testid="pgn-file-picker-btn"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#C6923A]" />
                    <span>Choose .pgn File</span>
                  </button>
                </div>
              </div>

              {/* Raw PGN Text Paste Area */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="pgn-paste-textarea"
                    className="text-xs font-semibold text-[#D6CFC2]"
                  >
                    Paste Raw PGN Text (Single or Multi-Game Database)
                  </label>
                  {pgnInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setPgnInput('');
                        setUploadedFileName(null);
                        setParseErrors([]);
                      }}
                      className="text-xs text-[#A69F91] hover:text-[#F4EFE6] cursor-pointer"
                    >
                      Clear Text
                    </button>
                  )}
                </div>
                <textarea
                  id="pgn-paste-textarea"
                  data-testid="pgn-paste-textarea"
                  value={pgnInput}
                  onChange={(e) => {
                    setPgnInput(e.target.value);
                    if (parseErrors.length > 0) setParseErrors([]);
                  }}
                  rows={7}
                  placeholder={`[Event "Tournament"]\n[Site "City"]\n[Date "2024.05.01"]\n[White "Player 1"]\n[Black "Player 2"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...`}
                  className="w-full p-3 rounded-xl bg-[#111815] border border-[#2C3C33] focus:border-[#C6923A] focus:outline-none text-xs font-mono text-[#F4EFE6] placeholder:text-[#666055] resize-y"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-[#857F72]">
                    Comments {`{...}`}, NAGs (!, ?, !!), variations (...), and custom [FEN] headers are parsed automatically.
                  </p>
                  <button
                    type="button"
                    data-testid="parse-pgn-submit-btn"
                    onClick={() => processPgnText(pgnInput)}
                    className="px-4 py-2 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Parse & Index PGN</span>
                  </button>
                </div>
              </div>

              {/* Error Diagnostics */}
              {parseErrors.length > 0 && (
                <div
                  role="alert"
                  data-testid="pgn-parse-error"
                  className="p-3.5 rounded-xl bg-[#341616] border border-[#DC2626]/60 text-xs text-[#FECACA] space-y-1.5"
                >
                  <div className="flex items-center gap-2 font-semibold text-[#FCA5A5]">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      {parseErrors.length === 1
                        ? 'PGN Parse Error'
                        : `${parseErrors.length} games could not be parsed`}
                    </span>
                  </div>
                  <ul className="space-y-1 pl-6 list-disc">
                    {parseErrors.slice(0, 5).map((err, i) => (
                      <li key={`${err.index}-${i}`}>
                        <span className="font-semibold">{err.title}:</span>{' '}
                        {err.error}
                      </li>
                    ))}
                    {parseErrors.length > 5 && (
                      <li>…and {parseErrors.length - 5} more errors.</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Indexed Multi-Game Selector List */}
              {importedBatch.length > 0 && (
                <div
                  data-testid="imported-pgn-games-section"
                  className="space-y-2.5 pt-2 border-t border-[#26342C]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-[#F4EFE6]">
                        Indexed Games ({importedBatch.length})
                      </h3>
                      <p className="text-xs text-[#A69F91]">
                        Select any game below to inspect move-by-move in Replay Mode
                      </p>
                    </div>

                    {importedBatch.length > 4 && (
                      <input
                        type="text"
                        value={batchFilter}
                        onChange={(e) => setBatchFilter(e.target.value)}
                        placeholder="Filter imported games..."
                        aria-label="Filter imported games"
                        className="h-8 px-3 rounded-lg bg-[#111815] border border-[#2C3C33] focus:border-[#C6923A] focus:outline-none text-xs text-[#F4EFE6] placeholder:text-[#7A7467]"
                      />
                    )}
                  </div>

                  <div
                    data-testid="imported-pgn-games-list"
                    className="max-h-[260px] overflow-y-auto divide-y divide-[#202C25] rounded-xl border border-[#26342C] bg-[#121A16]"
                  >
                    {filteredImportedGames.map((game, idx) => (
                      <div
                        key={game.id}
                        data-testid={`imported-game-row-${idx}`}
                        className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#18231D] transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-[#F4EFE6] truncate">
                            {formatPgnGameSummary(game)}
                          </div>
                          <div className="text-[11px] font-mono text-[#857F72] tabular-nums flex flex-wrap items-center gap-x-1.5 mt-0.5">
                            <span>{game.timeline.length - 1} plies</span>
                            {game.headers.ECO && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{game.headers.ECO}</span>
                              </>
                            )}
                            {game.isCustomStart && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#C6923A]">Custom FEN Start</span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          data-testid={`select-imported-game-${idx}`}
                          onClick={() => {
                            onSelectGame(game);
                            onClose();
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-[#212E27] hover:bg-[#C6923A] hover:text-[#111815] border border-[#34463C] hover:border-[#C6923A] text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
                        >
                          Open Replay
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

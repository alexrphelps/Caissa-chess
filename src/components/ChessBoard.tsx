import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  canPlanArrow,
  computeSlideOffset,
  coordsToSquare,
  FILES,
  findKingSquare,
  isValidSquare,
  RANKS,
  squareToCoords,
} from '../chess/engine';
import {
  RecommendedMove,
  TacticsAnalysis,
  ThreatenedPieceInfo,
} from '../chess/tacticsHelper';
import {
  GameState,
  Move,
  Piece,
  PlannedArrow,
  PromotionPieceType,
  Square,
} from '../chess/types';
import { ChessPieceSvg, PIECE_NAMES } from './ChessPieceSvg';
import {
  BOARD_THEMES,
  BoardThemeId,
  clampNumber,
  computeScaleFromCornerDrag,
  CoordinateStyle,
  MAX_BOARD_SCALE,
  MIN_BOARD_SCALE,
} from '../utils/layoutMath';

interface ChessBoardProps {
  gameState: GameState;
  legalMoves: Move[];
  selectedSquare: Square | null;
  pendingPromotion: { from: Square; to: Square } | null;
  isFlipped: boolean;
  isInteractionDisabled: boolean;
  helperMode: boolean;
  showBoardSuggestions: boolean;
  isPreviewingHistory?: boolean;
  helperAnalysis: TacticsAnalysis | null;
  highlightedHelperRank: 1 | 2 | 3 | null;
  plannedArrows: PlannedArrow[];
  onSquareClick: (square: Square) => void;
  onMovePiece: (from: Square, to: Square) => void;
  onTogglePlannedArrow: (from: Square, to: Square) => void;
  onClearPlannedArrows: () => void;
  onSelectPromotion: (piece: PromotionPieceType) => void;
  onCancelPromotion: () => void;
  shakeBoard?: boolean;
  incorrectSquare?: Square | null;
  hintPieceSquare?: Square | null;
  hintDestSquare?: Square | null;
  hintArrow?: { from: Square; to: Square } | null;
  hideHelperBox?: boolean;
  boardSizePx?: number;
  maxFitSizePx?: number;
  boardTheme?: BoardThemeId;
  coordinateStyle?: CoordinateStyle;
  boardScale?: number;
  isResizable?: boolean;
  onBoardScaleChange?: (nextScale: number) => void;
  onResetBoardScale?: () => void;
  onDisabledInteractionAttempt?: (square: Square) => void;
}

const RANK_ARROW_STYLES: Record<
  1 | 2 | 3,
  {
    stroke: string;
    badgeBg: string;
    badgeText: string;
    strokeWidth: number;
    opacity: number;
  }
> = {
  1: {
    stroke: '#22C55E', // Vibrant Emerald Green (#1 Best Move)
    badgeBg: '#16A34A',
    badgeText: '#F4EFE6',
    strokeWidth: 2.3,
    opacity: 0.92,
  },
  2: {
    stroke: '#06B6D4', // Cyan / Soft Teal (#2 Best Move)
    badgeBg: '#0891B2',
    badgeText: '#F4EFE6',
    strokeWidth: 1.95,
    opacity: 0.82,
  },
  3: {
    stroke: '#60A5FA', // Light Blue (#3 Best Move)
    badgeBg: '#2563EB',
    badgeText: '#F4EFE6',
    strokeWidth: 1.7,
    opacity: 0.75,
  },
};

interface HeldPieceState {
  from: Square;
  piece: Piece;
  startX: number;
  startY: number;
  wasAlreadySelected: boolean;
}

interface SlidingMoveState {
  moveCount: number;
  from: Square;
  to: Square;
  rookFrom?: Square;
  rookTo?: Square;
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  gameState,
  legalMoves,
  selectedSquare,
  pendingPromotion,
  isFlipped,
  isInteractionDisabled,
  helperMode,
  showBoardSuggestions,
  isPreviewingHistory = false,
  helperAnalysis,
  highlightedHelperRank,
  plannedArrows,
  onSquareClick,
  onMovePiece,
  onTogglePlannedArrow,
  onClearPlannedArrows,
  onSelectPromotion,
  onCancelPromotion,
  shakeBoard = false,
  incorrectSquare = null,
  hintPieceSquare = null,
  hintDestSquare = null,
  hintArrow = null,
  hideHelperBox = false,
  boardSizePx,
  maxFitSizePx,
  boardTheme = 'mahogany',
  coordinateStyle = 'both',
  boardScale = 1.0,
  isResizable = false,
  onBoardScaleChange,
  onResetBoardScale,
  onDisabledInteractionAttempt,
}) => {
  const boardGridRef = useRef<HTMLDivElement | null>(null);
  const ghostPieceRef = useRef<HTMLDivElement | null>(null);
  const suppressNextClickRef = useRef<boolean>(false);
  const resizeDragRef = useRef<{
    startX: number;
    startY: number;
    startBoardPx: number;
    maxFitPx: number;
  } | null>(null);

  const [isDraggingBoardSize, setIsDraggingBoardSize] = useState<boolean>(false);
  const [heldPiece, setHeldPiece] = useState<HeldPieceState | null>(null);
  const [dragOverSquare, setDragOverSquare] = useState<Square | null>(null);
  const [hoveredSquare, setHoveredSquare] = useState<Square | null>(null);

  const activeTheme = BOARD_THEMES[boardTheme] ?? BOARD_THEMES.mahogany;
  const showOutsideCoords =
    coordinateStyle === 'both' || coordinateStyle === 'outside';
  const showInsideCoords =
    coordinateStyle === 'both' || coordinateStyle === 'inside';

  // Global pointer listeners while dragging the board corner resize grip
  useEffect(() => {
    if (!isDraggingBoardSize) return;

    const handlePointerMove = (e: PointerEvent) => {
      const drag = resizeDragRef.current;
      if (!drag || !onBoardScaleChange) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const nextScale = computeScaleFromCornerDrag(
        drag.startBoardPx,
        drag.maxFitPx,
        dx,
        dy
      );
      onBoardScaleChange(nextScale);
    };

    const handlePointerUp = () => {
      resizeDragRef.current = null;
      setIsDraggingBoardSize(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDraggingBoardSize, onBoardScaleChange]);

  // Right-click planning state (supports both right-click drag and two-step right-click)
  const [rightDrag, setRightDrag] = useState<{
    from: Square;
    current: Square;
  } | null>(null);
  const [rightClickOrigin, setRightClickOrigin] = useState<Square | null>(null);
  const [highlightedSquares, setHighlightedSquares] = useState<Set<Square>>(
    new Set()
  );

  // Track forward moves to trigger smooth sliding piece animation
  const [lastSeenMoveCount, setLastSeenMoveCount] = useState<number>(
    gameState.moveHistory.length
  );
  const [slidingMove, setSlidingMove] = useState<SlidingMoveState | null>(null);

  if (gameState.moveHistory.length !== lastSeenMoveCount) {
    const prevCount = lastSeenMoveCount;
    setLastSeenMoveCount(gameState.moveHistory.length);
    setRightClickOrigin(null);
    setRightDrag(null);
    setHeldPiece(null);
    setDragOverSquare(null);

    if (
      !isPreviewingHistory &&
      gameState.moveHistory.length > prevCount &&
      gameState.moveHistory.length > 0
    ) {
      const latestRecord =
        gameState.moveHistory[gameState.moveHistory.length - 1];
      const m = latestRecord.move;
      let rookFrom: Square | undefined;
      let rookTo: Square | undefined;
      if (m.isCastle === 'K') {
        rookFrom = m.piece.color === 'w' ? 'h1' : 'h8';
        rookTo = m.piece.color === 'w' ? 'f1' : 'f8';
      } else if (m.isCastle === 'Q') {
        rookFrom = m.piece.color === 'w' ? 'a1' : 'a8';
        rookTo = m.piece.color === 'w' ? 'd1' : 'd8';
      }
      setSlidingMove({
        moveCount: gameState.moveHistory.length,
        from: m.from,
        to: m.to,
        rookFrom,
        rookTo,
      });
    } else {
      setSlidingMove(null);
    }
  }

  if (isPreviewingHistory && slidingMove !== null) {
    setSlidingMove(null);
  }

  useEffect(() => {
    if (!slidingMove) return;
    const timer = window.setTimeout(() => {
      setSlidingMove(null);
    }, 195);
    return () => window.clearTimeout(timer);
  }, [slidingMove]);

  const rowIndices = isFlipped
    ? [7, 6, 5, 4, 3, 2, 1, 0]
    : [0, 1, 2, 3, 4, 5, 6, 7];
  const colIndices = isFlipped
    ? [7, 6, 5, 4, 3, 2, 1, 0]
    : [0, 1, 2, 3, 4, 5, 6, 7];

  const getBoardPointInfo = useCallback(
    (
      clientX: number,
      clientY: number
    ): {
      square: Square | null;
      relX: number;
      relY: number;
    } => {
      const el = boardGridRef.current;
      if (!el) return { square: null, relX: 0, relY: 0 };
      const rect = el.getBoundingClientRect();
      const relX = clientX - rect.left;
      const relY = clientY - rect.top;
      if (
        relX < 0 ||
        relY < 0 ||
        relX >= rect.width ||
        relY >= rect.height ||
        rect.width === 0 ||
        rect.height === 0
      ) {
        return { square: null, relX, relY };
      }
      const visualCol = Math.min(
        7,
        Math.max(0, Math.floor((relX / rect.width) * 8))
      );
      const visualRow = Math.min(
        7,
        Math.max(0, Math.floor((relY / rect.height) * 8))
      );
      const row = isFlipped ? 7 - visualRow : visualRow;
      const col = isFlipped ? 7 - visualCol : visualCol;
      return {
        square: coordsToSquare(row, col),
        relX,
        relY,
      };
    },
    [isFlipped]
  );

  // Global pointermove/pointerup listeners while left-holding a ghost piece (supports mouse & touch)
  useEffect(() => {
    if (!heldPiece) return;

    const handlePointerMove = (e: PointerEvent) => {
      const info = getBoardPointInfo(e.clientX, e.clientY);
      if (ghostPieceRef.current) {
        ghostPieceRef.current.style.left = `${info.relX}px`;
        ghostPieceRef.current.style.top = `${info.relY}px`;
      }
      setDragOverSquare((prev) =>
        prev === info.square ? prev : info.square
      );
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const info = getBoardPointInfo(e.clientX, e.clientY);
      const fromSq = heldPiece.from;
      const wasSelected = heldPiece.wasAlreadySelected;

      setHeldPiece(null);
      setDragOverSquare(null);
      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);

      if (
        info.square &&
        info.square !== fromSq &&
        !isInteractionDisabled &&
        legalMoves.some((m) => m.from === fromSq && m.to === info.square)
      ) {
        onMovePiece(fromSq, info.square);
      } else if (info.square === fromSq && wasSelected && !isInteractionDisabled) {
        onSquareClick(fromSq);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [
    heldPiece,
    getBoardPointInfo,
    isInteractionDisabled,
    legalMoves,
    onMovePiece,
    onSquareClick,
  ]);

  // Global pointermove/pointerup listeners while right-clicking to plan arrows & highlight squares
  useEffect(() => {
    if (!rightDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      const info = getBoardPointInfo(e.clientX, e.clientY);
      if (info.square && info.square !== rightDrag.current) {
        setRightDrag((prev) =>
          prev ? { ...prev, current: info.square! } : null
        );
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button !== 2) return;
      const info = getBoardPointInfo(e.clientX, e.clientY);
      const endSq = info.square ?? rightDrag.current;
      const startSq = rightDrag.from;
      setRightDrag(null);

      if (endSq && endSq !== startSq) {
        onTogglePlannedArrow(startSq, endSq);
        setRightClickOrigin(null);
        return;
      }

      // Stationary right-click on `startSq`: toggle square tactical highlight ring
      setHighlightedSquares((prev) => {
        const next = new Set(prev);
        if (next.has(startSq)) {
          next.delete(startSq);
        } else {
          next.add(startSq);
        }
        return next;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [
    rightDrag,
    getBoardPointInfo,
    onTogglePlannedArrow,
  ]);

  // Board suggestions are only shown on the board when both Helper Mode and Board Suggestions are ON
  const visibleBoardAnalysis =
    helperMode && showBoardSuggestions ? helperAnalysis : null;

  // Legal destination squares for the currently selected or held piece
  const activeSource = heldPiece?.from ?? selectedSquare;
  const movesForSelected = activeSource
    ? legalMoves.filter((m) => m.from === activeSource)
    : [];
  const legalTargets = new Map<Square, { isCapture: boolean }>();
  for (const m of movesForSelected) {
    legalTargets.set(m.to, { isCapture: Boolean(m.captured) });
  }

  // Locate King in check if applicable
  const checkedKingSquare = gameState.inCheck
    ? findKingSquare(gameState.board, gameState.turn)
    : null;

  // Map destination squares to top recommended moves when Board Suggestions are active
  const recommendedByTo = new Map<Square, RecommendedMove>();
  const recommendedByFrom = new Map<Square, RecommendedMove>();
  if (visibleBoardAnalysis) {
    // Insert in reverse rank order (3, 2, 1) so #1 takes precedence if two moves share a square
    for (const rec of [...visibleBoardAnalysis.topMoves].reverse()) {
      recommendedByTo.set(rec.to, rec);
      recommendedByFrom.set(rec.from, rec);
    }
  }

  // Determine which recommended move's continuation arrows (if any) are currently focused
  const activeFocusedRec: RecommendedMove | undefined = visibleBoardAnalysis
    ? highlightedHelperRank
      ? visibleBoardAnalysis.topMoves.find(
          (m) => m.rank === highlightedHelperRank
        )
      : hoveredSquare
      ? recommendedByTo.get(hoveredSquare)
      : undefined
    : undefined;

  // Convert a board square ('a1'..'h8') to SVG viewBox (0..100) center coordinates
  const squareToSvgCenter = (sq: Square): { x: number; y: number } => {
    const { row, col } = squareToCoords(sq);
    const visualRow = isFlipped ? 7 - row : row;
    const visualCol = isFlipped ? 7 - col : col;
    return {
      x: (visualCol + 0.5) * 12.5,
      y: (visualRow + 0.5) * 12.5,
    };
  };

  // Compute active tooltip text when hovering a recommended move or threatened piece square
  let activeTooltip: {
    badge: string;
    text: string;
    subtext?: string;
    tone: 'rec1' | 'rec2' | 'rec3' | 'threat';
  } | null = null;

  if (visibleBoardAnalysis) {
    if (highlightedHelperRank) {
      const rec = visibleBoardAnalysis.topMoves.find(
        (m) => m.rank === highlightedHelperRank
      );
      if (rec) {
        activeTooltip = {
          badge: `#${rec.rank} (${rec.san})`,
          text: rec.coachWhy,
          subtext: rec.followUpPlan,
          tone:
            rec.rank === 1 ? 'rec1' : rec.rank === 2 ? 'rec2' : 'rec3',
        };
      }
    } else if (hoveredSquare) {
      const recTo = recommendedByTo.get(hoveredSquare);
      const recFrom = recommendedByFrom.get(hoveredSquare);
      const threat = visibleBoardAnalysis.threatenedPieces.get(hoveredSquare);

      if (recTo) {
        activeTooltip = {
          badge: `#${recTo.rank} (${recTo.san})`,
          text: recTo.coachWhy,
          subtext: recTo.followUpPlan,
          tone:
            recTo.rank === 1 ? 'rec1' : recTo.rank === 2 ? 'rec2' : 'rec3',
        };
      } else if (threat) {
        activeTooltip = {
          badge:
            threat.level === 'critical'
              ? 'CRITICAL THREAT'
              : threat.level === 'high'
              ? 'EXCHANGE THREAT'
              : 'CONTESTED PIECE',
          text: threat.label,
          tone: 'threat',
        };
      } else if (recFrom) {
        activeTooltip = {
          badge: `#${recFrom.rank} (${recFrom.san})`,
          text: recFrom.rationale,
          subtext: recFrom.followUpPlan,
          tone:
            recFrom.rank === 1 ? 'rec1' : recFrom.rank === 2 ? 'rec2' : 'rec3',
        };
      }
    }
  }

  const promotionOptions: { type: PromotionPieceType; label: string }[] = [
    { type: 'q', label: 'Queen' },
    { type: 'r', label: 'Rook' },
    { type: 'b', label: 'Bishop' },
    { type: 'n', label: 'Knight' },
  ];

  // Helper to render a shortened SVG line between two squares
  const getShortenedSegment = (
    fromSq: Square,
    toSq: Square,
    startOffset = 2.0,
    endOffset = 4.8
  ) => {
    const start = squareToSvgCenter(fromSq);
    const end = squareToSvgCenter(toSq);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return null;
    return {
      start,
      end,
      x1: start.x + (dx / len) * startOffset,
      y1: start.y + (dy / len) * startOffset,
      x2: end.x - (dx / len) * endOffset,
      y2: end.y - (dy / len) * endOffset,
    };
  };

  // Preview arrow while right-click dragging if the hovered target is legal
  const rightDragPreviewArrow: PlannedArrow | null =
    rightDrag &&
    rightDrag.current !== rightDrag.from &&
    canPlanArrow(gameState, legalMoves, rightDrag.from, rightDrag.current)
      ? { from: rightDrag.from, to: rightDrag.current }
      : null;

  const explicitGridStyle: React.CSSProperties | undefined = boardSizePx
    ? { width: `${boardSizePx}px`, height: `${boardSizePx}px` }
    : undefined;
  const fallbackGridSizeClass = boardSizePx
    ? ''
    : 'w-[min(86vw,calc(100dvh-230px),680px)] h-[min(86vw,calc(100dvh-230px),680px)]';
  const rankColumnStyle: React.CSSProperties | undefined = boardSizePx
    ? { height: `${boardSizePx}px` }
    : undefined;
  const fallbackRankHeightClass = boardSizePx
    ? ''
    : 'h-[min(86vw,calc(100dvh-230px),680px)]';
  const isCompactBoard = (boardSizePx ?? 520) < 380;

  return (
    <div className="relative flex flex-col items-center justify-center select-none shrink-0 max-w-full">
      {/* Outer Tournament Board Frame with Dynamic Viewport-Fitted Geometry */}
      <div
        data-testid="chess-board-frame"
        data-board-theme={activeTheme.id}
        data-board-size={boardSizePx ?? undefined}
        className="relative p-2.5 sm:p-3 rounded-xl border-2 shadow-[0_16px_40px_rgba(0,0,0,0.65)] flex flex-col transition-colors duration-150"
        style={{
          backgroundColor: activeTheme.frameBg,
          borderColor: activeTheme.frameBorder,
        }}
      >
        {/* Top File Coordinates (a-h) */}
        {showOutsideCoords && (
          <div className="grid grid-cols-8 mb-1 px-5 h-4 items-center shrink-0">
            {colIndices.map((c) => (
              <div
                key={`top-file-${FILES[c]}`}
                className="text-center text-[11px] font-mono font-semibold uppercase tracking-wider leading-none"
                style={{ color: activeTheme.coordOuterText }}
                aria-hidden="true"
              >
                {FILES[c]}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-stretch">
          {/* Left Rank Coordinates (1-8) — Always height-synced with 8x8 grid */}
          {showOutsideCoords && (
            <div
              className={`flex flex-col justify-around mr-1.5 w-3.5 shrink-0 ${fallbackRankHeightClass}`}
              style={rankColumnStyle}
            >
              {rowIndices.map((r) => (
                <div
                  key={`left-rank-${RANKS[r]}`}
                  className="text-center text-[11px] font-mono font-semibold leading-none"
                  style={{ color: activeTheme.coordOuterText }}
                  aria-hidden="true"
                >
                  {RANKS[r]}
                </div>
              ))}
            </div>
          )}

          {/* 8x8 Chessboard Grid Container with Isolated SVG Overlays & Ghost Piece */}
          <div
            ref={boardGridRef}
            data-testid="chess-board-grid"
            onContextMenu={(e) => e.preventDefault()}
            style={{
              ...explicitGridStyle,
              borderColor: activeTheme.gridBorder,
            }}
            className={`relative ${fallbackGridSizeClass} border-2 rounded-sm overflow-hidden shrink-0 touch-none transition-shadow ${
              shakeBoard ? 'board-shake-anim ring-4 ring-[#EF4444]' : ''
            }`}
          >
            <div
              role="grid"
              aria-label="Chessboard"
              className="grid grid-cols-8 grid-rows-8 w-full h-full"
            >
              {rowIndices.map((r) =>
                colIndices.map((c) => {
                  const square = coordsToSquare(r, c);
                  const isLight = (r + c) % 2 === 0;
                  const piece = gameState.board[r][c];
                  const isSelected = selectedSquare === square;
                  const isRightOrigin = rightClickOrigin === square;
                  const isLastMove =
                    gameState.lastMove?.from === square ||
                    gameState.lastMove?.to === square;
                  const targetInfo = legalTargets.get(square);
                  const isLegalDestination = Boolean(targetInfo);
                  const isKingCheckedHere = checkedKingSquare === square;
                  const isDragOver = dragOverSquare === square;
                  const isHeldOrigin = heldPiece?.from === square;

                  // Check if the piece on this square is currently sliding from its origin
                  const slideFromSquare: Square | null =
                    slidingMove?.to === square
                      ? slidingMove.from
                      : slidingMove?.rookTo === square
                      ? slidingMove.rookFrom ?? null
                      : null;
                  const slideOffset = slideFromSquare
                    ? computeSlideOffset(slideFromSquare, square, isFlipped)
                    : null;

                  // Helper Mode Threat & Recommendation state for this square (when Board Suggestions ON)
                  const isEnemyAttacked =
                    visibleBoardAnalysis?.attackedSquares.has(square) ?? false;
                  const threatInfo: ThreatenedPieceInfo | undefined =
                    visibleBoardAnalysis?.threatenedPieces.get(square);
                  const recMoveOnTarget = recommendedByTo.get(square);

                  // Determine square background color from active theme
                  let bgColor = isLight
                    ? activeTheme.lightSquare
                    : activeTheme.darkSquare;
                  if (isSelected) {
                    bgColor = activeTheme.selectedSquare;
                  } else if (isLastMove) {
                    bgColor = isLight
                      ? activeTheme.lastMoveLight
                      : activeTheme.lastMoveDark;
                  }

                  // Build accessible label for screen readers & snapshots
                  const pieceLabel = piece
                    ? `${piece.color === 'w' ? 'White' : 'Black'} ${
                        PIECE_NAMES[piece.type]
                      }`
                    : 'Empty';
                  const statusSuffix = [
                    isSelected ? 'selected' : '',
                    isLegalDestination
                      ? targetInfo?.isCapture
                        ? 'legal capture'
                        : 'legal move'
                      : '',
                    isKingCheckedHere ? 'in check' : '',
                    threatInfo
                      ? threatInfo.level === 'critical'
                        ? 'threatened: hanging'
                        : threatInfo.level === 'high'
                        ? 'threatened: losing exchange'
                        : 'threatened: contested'
                      : '',
                    recMoveOnTarget
                      ? `recommended #${recMoveOnTarget.rank}`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(', ');

                  const ariaLabel = `Square ${square}, ${pieceLabel}${
                    statusSuffix ? ` (${statusSuffix})` : ''
                  }`;

                  const canDragPiece =
                    !isInteractionDisabled &&
                    piece &&
                    piece.color === gameState.turn &&
                    gameState.status === 'playing';

                  return (
                    <button
                      key={square}
                      type="button"
                      data-square={square}
                      aria-label={ariaLabel}
                      onContextMenu={(e) => e.preventDefault()}
                      onMouseEnter={() => setHoveredSquare(square)}
                      onMouseLeave={() => {
                        setHoveredSquare((prev) =>
                          prev === square ? null : prev
                        );
                      }}
                      onPointerDown={(e) => {
                        if (e.button === 2) {
                          e.preventDefault();
                          setRightDrag({ from: square, current: square });
                          return;
                        }
                        if (e.button !== 0 && e.pointerType === 'mouse') return;

                        // Left-clicking/tapping clears planned arrows and highlights
                        onClearPlannedArrows();
                        setHighlightedSquares(new Set());
                        setRightClickOrigin(null);

                        if (canDragPiece && piece) {
                          e.preventDefault();
                          const wasAlreadySelected = selectedSquare === square;
                          if (!wasAlreadySelected) {
                            onSquareClick(square);
                          }
                          const info = getBoardPointInfo(e.clientX, e.clientY);
                          setHeldPiece({
                            from: square,
                            piece,
                            startX: info.relX,
                            startY: info.relY,
                            wasAlreadySelected,
                          });
                          setDragOverSquare(square);
                        }
                      }}
                      onClick={() => {
                        if (suppressNextClickRef.current) {
                          suppressNextClickRef.current = false;
                          return;
                        }
                        onClearPlannedArrows();
                        setHighlightedSquares(new Set());
                        setRightClickOrigin(null);
                        if (!isInteractionDisabled) {
                          onSquareClick(square);
                        } else if (onDisabledInteractionAttempt && piece) {
                          onDisabledInteractionAttempt(square);
                        }
                      }}
                      className={`relative w-full h-full flex items-center justify-center p-0 border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#111815] transition-colors duration-100 ${
                        slideFromSquare
                          ? 'z-30 overflow-visible'
                          : 'overflow-hidden'
                      } ${
                        !isInteractionDisabled &&
                        (canDragPiece || isLegalDestination)
                          ? 'cursor-pointer'
                          : 'cursor-default'
                      }`}
                      style={{ backgroundColor: bgColor }}
                    >
                      {/* Helper Mode: Subtle Enemy Attack Control Tint on Attacked Squares */}
                      {isEnemyAttacked && !isSelected && (
                        <div
                          data-testid={`enemy-attacked-${square}`}
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            backgroundColor: isLight
                              ? 'rgba(220, 38, 38, 0.13)'
                              : 'rgba(239, 68, 68, 0.17)',
                          }}
                        >
                          <span className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-[#DC2626]/55" />
                        </div>
                      )}

                      {/* Helper Mode: Threatened Friendly Piece Halo & Ring */}
                      {threatInfo && (
                        <div
                          data-testid={`threatened-piece-${square}`}
                          data-threat-level={threatInfo.level}
                          className="absolute inset-0 pointer-events-none z-10"
                          style={{
                            background:
                              threatInfo.level === 'critical'
                                ? 'radial-gradient(circle, rgba(220,38,38,0.45) 20%, rgba(220,38,38,0.18) 100%)'
                                : threatInfo.level === 'high'
                                ? 'radial-gradient(circle, rgba(234,88,12,0.40) 20%, rgba(234,88,12,0.15) 100%)'
                                : 'radial-gradient(circle, rgba(217,119,6,0.22) 20%, transparent 100%)',
                            boxShadow:
                              threatInfo.level === 'critical'
                                ? 'inset 0 0 0 3px #EF4444'
                                : threatInfo.level === 'high'
                                ? 'inset 0 0 0 2.5px #F97316'
                                : 'inset 0 0 0 2px #F59E0B',
                          }}
                        >
                          {(threatInfo.level === 'critical' ||
                            threatInfo.level === 'high') && (
                            <span
                              className={`absolute top-0.5 right-0.5 px-1 py-0 text-[8px] font-mono font-bold uppercase leading-tight rounded-xs ${
                                threatInfo.level === 'critical'
                                  ? 'bg-[#DC2626] text-white'
                                  : 'bg-[#EA580C] text-white'
                              }`}
                            >
                              {threatInfo.level === 'critical'
                                ? 'HANGING'
                                : 'RISK'}
                            </span>
                          )}
                        </div>
                      )}

                      {/* King in Check Crimson Alert Overlay */}
                      {isKingCheckedHere && (
                        <div
                          data-testid="king-in-check-indicator"
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background:
                              'radial-gradient(circle, rgba(220,38,38,0.85) 0%, rgba(185,28,28,0.55) 60%, rgba(185,28,28,0.15) 100%)',
                            boxShadow: 'inset 0 0 0 3px #EF4444',
                          }}
                        />
                      )}

                      {/* Puzzle Mode: Incorrect Move Origin Square Shake / Red Flash */}
                      {incorrectSquare === square && (
                        <div
                          data-testid="puzzle-incorrect-square"
                          className="absolute inset-0 pointer-events-none ring-4 ring-inset ring-[#EF4444] bg-[#EF4444]/45 z-15 animate-pulse"
                        />
                      )}

                      {/* Puzzle Mode: Hint Tier 1 - Piece To Move Glow */}
                      {hintPieceSquare === square && (
                        <div
                          data-testid="puzzle-hint-piece-square"
                          className="absolute inset-0 pointer-events-none z-15 hint-piece-anim ring-4 ring-[#10B981] bg-[#10B981]/25"
                        />
                      )}

                      {/* Puzzle Mode: Hint Tier 2 - Destination Target Ring */}
                      {hintDestSquare === square && (
                        <div
                          data-testid="puzzle-hint-dest-square"
                          className="absolute inset-0 pointer-events-none z-15 hint-dest-anim ring-4 ring-[#06B6D4] bg-[#06B6D4]/30 flex items-center justify-center"
                        >
                          <div className="w-4 h-4 rounded-full border-2 border-[#06B6D4] bg-[#06B6D4]/50 animate-ping" />
                        </div>
                      )}

                      {/* Selected Square Inner Frame */}
                      {isSelected && (
                        <div className="absolute inset-0 pointer-events-none ring-3 ring-inset ring-[#111815]/60" />
                      )}

                      {/* Right-Click Planning Origin Ring */}
                      {isRightOrigin && (
                        <div
                          data-testid={`right-click-origin-${square}`}
                          className="absolute inset-0 pointer-events-none ring-3 ring-inset ring-[#F59E0B]"
                        />
                      )}

                      {/* Right-Click Tactical Square Highlight Ring */}
                      {highlightedSquares.has(square) && (
                        <div
                          data-testid={`highlighted-square-${square}`}
                          className="absolute inset-0 pointer-events-none ring-4 ring-inset ring-[#F59E0B] bg-[#F59E0B]/20 z-15"
                        />
                      )}

                      {/* Drag Hover Ring */}
                      {isDragOver && isLegalDestination && (
                        <div className="absolute inset-0 pointer-events-none ring-4 ring-inset ring-[#15803D]" />
                      )}

                      {/* Corner Rank/File Micro-notations on edge squares */}
                      {showInsideCoords && c === colIndices[0] && (
                        <span
                          aria-hidden="true"
                          className={`absolute top-0.5 left-1 font-mono font-bold leading-none pointer-events-none ${
                            isCompactBoard ? 'text-[9px]' : 'text-[10px]'
                          }`}
                          style={{
                            color: isLight
                              ? activeTheme.coordOnLight
                              : activeTheme.coordOnDark,
                          }}
                        >
                          {RANKS[r]}
                        </span>
                      )}
                      {showInsideCoords && r === rowIndices[7] && (
                        <span
                          aria-hidden="true"
                          className={`absolute bottom-0.5 right-1 font-mono font-bold leading-none pointer-events-none ${
                            isCompactBoard ? 'text-[9px]' : 'text-[10px]'
                          }`}
                          style={{
                            color: isLight
                              ? activeTheme.coordOnLight
                              : activeTheme.coordOnDark,
                          }}
                        >
                          {FILES[c]}
                        </span>
                      )}

                      {/* Chess Piece SVG with Smooth Slide Animation */}
                      {piece && (
                        <div
                          key={`piece-${square}-${piece.color}-${piece.type}`}
                          data-sliding={slideFromSquare ? 'true' : undefined}
                          data-sliding-from={slideFromSquare ?? undefined}
                          className={`relative z-10 w-[82%] h-[82%] pointer-events-none ${
                            slideFromSquare
                              ? 'piece-slide-anim'
                              : 'transition-transform duration-150'
                          } ${isSelected && !isHeldOrigin ? 'scale-105' : ''} ${
                            isHeldOrigin ? 'opacity-40' : ''
                          }`}
                          style={
                            slideOffset
                              ? ({
                                  '--slide-dx': `${slideOffset.dCol * 100}%`,
                                  '--slide-dy': `${slideOffset.dRow * 100}%`,
                                } as React.CSSProperties)
                              : undefined
                          }
                        >
                          <ChessPieceSvg
                            type={piece.type}
                            color={piece.color}
                          />
                        </div>
                      )}

                      {/* Helper Mode: Destination Rank Badge (#1, #2, #3) */}
                      {recMoveOnTarget && !selectedSquare && (
                        <span
                          data-testid={`helper-badge-rank-${recMoveOnTarget.rank}`}
                          className="absolute top-0.5 right-0.5 z-20 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono font-bold shadow pointer-events-none"
                          style={{
                            backgroundColor:
                              RANK_ARROW_STYLES[recMoveOnTarget.rank].badgeBg,
                            color:
                              RANK_ARROW_STYLES[recMoveOnTarget.rank].badgeText,
                          }}
                        >
                          {recMoveOnTarget.rank}
                        </span>
                      )}

                      {/* Legal Destination Indicator (Absolute so it never shifts flex layout) */}
                      {isLegalDestination && !targetInfo?.isCapture && (
                        <span
                          data-testid={`legal-move-${square}`}
                          className="absolute z-20 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#14532D]/75 ring-2 ring-[#ECFDF5]/60 pointer-events-none"
                        />
                      )}
                      {isLegalDestination && targetInfo?.isCapture && (
                        <span
                          data-testid={`legal-capture-${square}`}
                          className="absolute inset-1 z-20 rounded-full border-4 border-[#14532D]/80 pointer-events-none"
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Independent Non-Blocking SVG Overlay Layer for Helper Mode Move Recommendation & Continuation Arrows */}
            {visibleBoardAnalysis &&
              visibleBoardAnalysis.topMoves.length > 0 &&
              !selectedSquare && (
                <svg
                  data-testid="helper-arrows-overlay"
                  viewBox="0 0 100 100"
                  className="absolute inset-0 w-full h-full pointer-events-none z-20"
                >
                  <defs>
                    {([1, 2, 3] as const).map((rank) => (
                      <marker
                        key={`arrowhead-${rank}`}
                        id={`helper-arrowhead-${rank}`}
                        markerWidth="3.2"
                        markerHeight="3.2"
                        refX="0.6"
                        refY="1.6"
                        orient="auto"
                      >
                        <polygon
                          points="0 0, 3.2 1.6, 0 3.2"
                          fill={RANK_ARROW_STYLES[rank].stroke}
                        />
                      </marker>
                    ))}
                    <marker
                      id="helper-arrowhead-reply"
                      markerWidth="3.0"
                      markerHeight="3.0"
                      refX="0.6"
                      refY="1.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 3.0 1.5, 0 3.0" fill="#F59E0B" />
                    </marker>
                    <marker
                      id="helper-arrowhead-followup"
                      markerWidth="3.0"
                      markerHeight="3.0"
                      refX="0.6"
                      refY="1.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 3.0 1.5, 0 3.0" fill="#A7F3D0" />
                    </marker>
                    <marker
                      id="helper-arrowhead-threat"
                      markerWidth="3.0"
                      markerHeight="3.0"
                      refX="0.6"
                      refY="1.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 3.0 1.5, 0 3.0" fill="#EF4444" />
                    </marker>
                  </defs>

                  {/* Render critical/high Opponent Threat arrow in dashed crimson when not hovering a candidate */}
                  {!activeFocusedRec &&
                    visibleBoardAnalysis.opponentThreat &&
                    (visibleBoardAnalysis.opponentThreat.severity ===
                      'critical' ||
                      visibleBoardAnalysis.opponentThreat.severity ===
                        'high') &&
                    (() => {
                      const threatSeg = getShortenedSegment(
                        visibleBoardAnalysis.opponentThreat.from,
                        visibleBoardAnalysis.opponentThreat.to,
                        2.2,
                        4.8
                      );
                      if (!threatSeg) return null;
                      return (
                        <g data-testid="helper-arrow-threat" opacity="0.78">
                          <line
                            x1={threatSeg.x1}
                            y1={threatSeg.y1}
                            x2={threatSeg.x2}
                            y2={threatSeg.y2}
                            stroke="#EF4444"
                            strokeWidth="1.55"
                            strokeDasharray="2.0 1.5"
                            strokeLinecap="butt"
                            markerEnd="url(#helper-arrowhead-threat)"
                          />
                        </g>
                      );
                    })()}

                  {/* Render candidate arrows in order 3 -> 2 -> 1 so #1 Best Move renders on top */}
                  {[...visibleBoardAnalysis.topMoves].reverse().map((rec) => {
                    const seg = getShortenedSegment(
                      rec.from,
                      rec.to,
                      2.0,
                      4.8
                    );
                    if (!seg) return null;

                    const style = RANK_ARROW_STYLES[rec.rank];
                    const isDimmed =
                      highlightedHelperRank !== null &&
                      highlightedHelperRank !== rec.rank;

                    return (
                      <g
                        key={`arrow-rank-${rec.rank}`}
                        data-testid={`helper-arrow-${rec.rank}`}
                        opacity={isDimmed ? 0.22 : style.opacity}
                      >
                        {/* Subtle dark casing for high contrast over both light and dark squares */}
                        <line
                          x1={seg.x1}
                          y1={seg.y1}
                          x2={seg.x2}
                          y2={seg.y2}
                          stroke="#111815"
                          strokeWidth={style.strokeWidth + 0.8}
                          strokeLinecap="butt"
                          opacity="0.55"
                        />
                        <line
                          x1={seg.x1}
                          y1={seg.y1}
                          x2={seg.x2}
                          y2={seg.y2}
                          stroke={style.stroke}
                          strokeWidth={style.strokeWidth}
                          strokeLinecap="butt"
                          markerEnd={`url(#helper-arrowhead-${rec.rank})`}
                        />
                        {/* Origin Anchor Circle */}
                        <circle
                          cx={seg.start.x}
                          cy={seg.start.y}
                          r="1.65"
                          fill={style.stroke}
                          stroke="#111815"
                          strokeWidth="0.4"
                        />
                      </g>
                    );
                  })}

                  {/* When hovering a move, also preview the 2-ply Coach Continuation arrows (Opponent Reply + Follow-Up) */}
                  {activeFocusedRec?.opponentReply &&
                    (() => {
                      const replySeg = getShortenedSegment(
                        activeFocusedRec.opponentReply.from,
                        activeFocusedRec.opponentReply.to,
                        2.2,
                        4.6
                      );
                      if (!replySeg) return null;
                      return (
                        <g data-testid="helper-arrow-reply" opacity="0.88">
                          <line
                            x1={replySeg.x1}
                            y1={replySeg.y1}
                            x2={replySeg.x2}
                            y2={replySeg.y2}
                            stroke="#F59E0B"
                            strokeWidth="1.5"
                            strokeDasharray="2.2 1.6"
                            strokeLinecap="butt"
                            markerEnd="url(#helper-arrowhead-reply)"
                          />
                        </g>
                      );
                    })()}

                  {activeFocusedRec?.playerFollowUp &&
                    (() => {
                      const followSeg = getShortenedSegment(
                        activeFocusedRec.playerFollowUp.from,
                        activeFocusedRec.playerFollowUp.to,
                        2.2,
                        4.6
                      );
                      if (!followSeg) return null;
                      return (
                        <g data-testid="helper-arrow-followup" opacity="0.85">
                          <line
                            x1={followSeg.x1}
                            y1={followSeg.y1}
                            x2={followSeg.x2}
                            y2={followSeg.y2}
                            stroke="#A7F3D0"
                            strokeWidth="1.4"
                            strokeDasharray="1.8 1.6"
                            strokeLinecap="butt"
                            markerEnd="url(#helper-arrowhead-followup)"
                          />
                        </g>
                      );
                    })()}
                </svg>
              )}

            {/* User-Planned Right-Click Legal Move Arrows Overlay */}
            {(plannedArrows.length > 0 || rightDragPreviewArrow) && (
              <svg
                data-testid="planned-arrows-overlay"
                viewBox="0 0 100 100"
                className="absolute inset-0 w-full h-full pointer-events-none z-25"
              >
                <defs>
                  <marker
                    id="planned-arrowhead"
                    markerWidth="3.2"
                    markerHeight="3.2"
                    refX="0.6"
                    refY="1.6"
                    orient="auto"
                  >
                    <polygon points="0 0, 3.2 1.6, 0 3.2" fill="#F59E0B" />
                  </marker>
                </defs>

                {plannedArrows.map((arrow) => {
                  const seg = getShortenedSegment(
                    arrow.from,
                    arrow.to,
                    2.0,
                    4.8
                  );
                  if (!seg) return null;
                  return (
                    <g
                      key={`planned-${arrow.from}-${arrow.to}`}
                      data-testid={`planned-arrow-${arrow.from}-${arrow.to}`}
                      opacity="0.94"
                    >
                      <line
                        x1={seg.x1}
                        y1={seg.y1}
                        x2={seg.x2}
                        y2={seg.y2}
                        stroke="#111815"
                        strokeWidth="2.9"
                        strokeLinecap="butt"
                        opacity="0.6"
                      />
                      <line
                        x1={seg.x1}
                        y1={seg.y1}
                        x2={seg.x2}
                        y2={seg.y2}
                        stroke="#F59E0B"
                        strokeWidth="2.15"
                        strokeLinecap="butt"
                        markerEnd="url(#planned-arrowhead)"
                      />
                      <circle
                        cx={seg.start.x}
                        cy={seg.start.y}
                        r="1.7"
                        fill="#F59E0B"
                        stroke="#111815"
                        strokeWidth="0.45"
                      />
                    </g>
                  );
                })}

                {rightDragPreviewArrow &&
                  !plannedArrows.some(
                    (a) =>
                      a.from === rightDragPreviewArrow.from &&
                      a.to === rightDragPreviewArrow.to
                  ) &&
                  (() => {
                    const seg = getShortenedSegment(
                      rightDragPreviewArrow.from,
                      rightDragPreviewArrow.to,
                      2.0,
                      4.8
                    );
                    if (!seg) return null;
                    return (
                      <g
                        data-testid="planned-arrow-preview"
                        opacity="0.65"
                      >
                        <line
                          x1={seg.x1}
                          y1={seg.y1}
                          x2={seg.x2}
                          y2={seg.y2}
                          stroke="#F59E0B"
                          strokeWidth="2.0"
                          strokeDasharray="2.2 1.4"
                          strokeLinecap="butt"
                          markerEnd="url(#planned-arrowhead)"
                        />
                      </g>
                    );
                  })()}
              </svg>
            )}

            {/* Puzzle Mode: Hint Tier 3 - Full Move Line Arrow */}
            {hintArrow &&
              (() => {
                const seg = getShortenedSegment(
                  hintArrow.from,
                  hintArrow.to,
                  2.0,
                  4.8
                );
                if (!seg) return null;
                return (
                  <svg
                    data-testid="puzzle-hint-arrow-overlay"
                    viewBox="0 0 100 100"
                    className="absolute inset-0 w-full h-full pointer-events-none z-26"
                  >
                    <defs>
                      <marker
                        id="puzzle-hint-arrowhead"
                        markerWidth="3.2"
                        markerHeight="3.2"
                        refX="0.6"
                        refY="1.6"
                        orient="auto"
                      >
                        <polygon points="0 0, 3.2 1.6, 0 3.2" fill="#10B981" />
                      </marker>
                    </defs>
                    <g opacity="0.95">
                      <line
                        x1={seg.x1}
                        y1={seg.y1}
                        x2={seg.x2}
                        y2={seg.y2}
                        stroke="#111815"
                        strokeWidth="3.2"
                        strokeLinecap="butt"
                        opacity="0.65"
                      />
                      <line
                        x1={seg.x1}
                        y1={seg.y1}
                        x2={seg.x2}
                        y2={seg.y2}
                        stroke="#10B981"
                        strokeWidth="2.4"
                        strokeLinecap="butt"
                        markerEnd="url(#puzzle-hint-arrowhead)"
                      />
                      <circle
                        cx={seg.start.x}
                        cy={seg.start.y}
                        r="1.8"
                        fill="#10B981"
                        stroke="#111815"
                        strokeWidth="0.5"
                      />
                    </g>
                  </svg>
                );
              })()}

            {/* Floating Ghost Piece while Left-Clicking & Holding a Piece */}
            {heldPiece && (
              <div
                ref={ghostPieceRef}
                data-testid="ghost-piece"
                data-ghost-from={heldPiece.from}
                className="absolute z-40 pointer-events-none w-[12.5%] h-[12.5%] flex items-center justify-center opacity-75 scale-110 drop-shadow-[0_10px_18px_rgba(0,0,0,0.65)]"
                style={{
                  left: `${heldPiece.startX}px`,
                  top: `${heldPiece.startY}px`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="w-[86%] h-[86%]">
                  <ChessPieceSvg
                    type={heldPiece.piece.type}
                    color={heldPiece.piece.color}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Rank Coordinates (1-8) — Always height-synced with 8x8 grid */}
          {showOutsideCoords && (
            <div
              className={`flex flex-col justify-around ml-1.5 w-3.5 shrink-0 ${fallbackRankHeightClass}`}
              style={rankColumnStyle}
            >
              {rowIndices.map((r) => (
                <div
                  key={`right-rank-${RANKS[r]}`}
                  className="text-center text-[11px] font-mono font-semibold leading-none"
                  style={{ color: activeTheme.coordOuterText }}
                  aria-hidden="true"
                >
                  {RANKS[r]}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom File Coordinates (a-h) */}
        {showOutsideCoords && (
          <div className="grid grid-cols-8 mt-1 px-5 h-4 items-center shrink-0">
            {colIndices.map((c) => (
              <div
                key={`bottom-file-${FILES[c]}`}
                className="text-center text-[11px] font-mono font-semibold uppercase tracking-wider leading-none"
                style={{ color: activeTheme.coordOuterText }}
                aria-hidden="true"
              >
                {FILES[c]}
              </div>
            ))}
          </div>
        )}

        {/* Width- & Height-Locked Explanatory Helper Box (Strictly 58px tall so the board NEVER jumps or jitters) */}
        {!hideHelperBox && (
          <div
            data-testid="helper-board-tooltip"
            className="mt-2 w-0 min-w-full h-[58px] min-h-[58px] max-h-[58px] shrink-0 px-3.5 py-1.5 rounded-lg bg-[#161F1B] border border-[#2C3A33] flex flex-col justify-center overflow-hidden text-xs"
          >
            {isPreviewingHistory ? (
              <div className="flex flex-col justify-center gap-0.5 min-w-0 w-full leading-tight overflow-hidden">
                <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                  <span className="font-mono font-bold text-[11px] text-[#C6923A] truncate">
                    Move History Preview · Temporary Board View
                  </span>
                  <span className="shrink-0 text-[10px] font-mono text-[#A69F91]">
                    Click Outside to Return
                  </span>
                </div>
                <div className="text-[#857F72] text-[11px] font-mono truncate min-w-0 w-full h-[15px] leading-[15px]">
                  {gameState.moveHistory.length > 0
                    ? `Showing board after ${gameState.moveHistory[gameState.moveHistory.length - 1].color === 'w' ? 'White' : 'Black'} played ${gameState.moveHistory[gameState.moveHistory.length - 1].san}`
                    : 'Showing starting board position'}
                </div>
              </div>
            ) : !helperMode ? (
              <div className="flex items-center justify-between gap-2 w-full min-w-0 text-[11px] font-mono text-[#857F72]">
                <span className="truncate">
                  Helper Mode OFF · Standard Tournament View
                </span>
                <span className="shrink-0 text-[#A69F91]">[H] Enable</span>
              </div>
            ) : !showBoardSuggestions ? (
              <div className="flex flex-col justify-center gap-0.5 min-w-0 w-full leading-tight overflow-hidden">
                <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                  <span className="font-mono font-bold text-[11px] text-[#C6923A] truncate">
                    Board Suggestions Hidden · Clean Board View
                  </span>
                  <span className="shrink-0 text-[10px] font-mono text-[#A69F91]">
                    {plannedArrows.length > 0
                      ? `${plannedArrows.length} Planned Arrow${
                          plannedArrows.length === 1 ? '' : 's'
                        }`
                      : 'Right-Click to Plan'}
                  </span>
                </div>
                <div className="text-[#857F72] text-[11px] font-mono truncate min-w-0 w-full h-[15px] leading-[15px]">
                  Right-click pieces to draw legal planned arrows · Left-click any
                  piece to clear
                </div>
              </div>
            ) : activeTooltip ? (
              <div className="flex flex-col justify-center gap-0.5 min-w-0 w-full leading-tight overflow-hidden">
                <div className="flex items-baseline gap-1.5 min-w-0 w-full overflow-hidden">
                  <span
                    className={`font-mono font-bold text-[11px] shrink-0 ${
                      activeTooltip.tone === 'rec1'
                        ? 'text-[#22C55E]'
                        : activeTooltip.tone === 'rec2'
                        ? 'text-[#06B6D4]'
                        : activeTooltip.tone === 'rec3'
                        ? 'text-[#60A5FA]'
                        : 'text-[#F87171]'
                    }`}
                  >
                    {activeTooltip.badge}
                  </span>
                  <span aria-hidden="true" className="text-[#56635B] shrink-0">
                    ·
                  </span>
                  <span className="text-[#F4EFE6] text-[11px] truncate min-w-0 flex-1">
                    {activeTooltip.text}
                  </span>
                </div>
                <div className="text-[#A69F91] text-[11px] font-mono truncate min-w-0 w-full h-[15px] leading-[15px]">
                  {activeTooltip.subtext
                    ? `Plan: ${activeTooltip.subtext}`
                    : 'Hover or click square to inspect legal moves'}
                </div>
              </div>
            ) : visibleBoardAnalysis?.topMoves[0] ? (
              <div className="flex flex-col justify-center gap-0.5 min-w-0 w-full leading-tight overflow-hidden">
                <div className="flex items-baseline gap-1.5 min-w-0 w-full overflow-hidden">
                  <span className="font-mono font-bold text-[11px] text-[#22C55E] shrink-0">
                    #1 Best ({visibleBoardAnalysis.topMoves[0].san} ·{' '}
                    {visibleBoardAnalysis.topMoves[0].formattedEval})
                  </span>
                  <span aria-hidden="true" className="text-[#56635B] shrink-0">
                    ·
                  </span>
                  <span className="text-[#F4EFE6] text-[11px] font-medium line-clamp-2 min-w-0 flex-1">
                    {visibleBoardAnalysis.topMoves[0].coachWhy}
                  </span>
                </div>
                <div className="text-[#A69F91] text-[11px] font-mono truncate min-w-0 w-full h-[15px] leading-[15px]">
                  Plan: {visibleBoardAnalysis.topMoves[0].followUpPlan}
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-center gap-0.5 min-w-0 w-full leading-tight overflow-hidden">
                <div className="text-[11px] font-mono text-[#F4EFE6] truncate">
                  {gameState.status !== 'playing'
                    ? 'Match concluded · Review board or start a new game'
                    : 'Opponent turn in progress · Calculating response...'}
                </div>
                <div className="text-[11px] font-mono text-[#857F72] truncate h-[15px] leading-[15px]">
                  {gameState.status !== 'playing'
                    ? 'Use Options or Undo in the top bar to continue'
                    : 'Tactical coach recommendations will update on your turn'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pawn Promotion Picker Modal Overlay */}
        {pendingPromotion && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Promote Pawn"
            className="absolute inset-0 z-30 bg-[#111815]/85 flex flex-col items-center justify-center p-6 rounded-xl"
          >
            <div className="bg-[#1C2621] border-2 border-[#C6923A] rounded-xl p-5 shadow-2xl max-w-sm w-full text-center space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#F4EFE6] font-display">
                  Promote Pawn on {pendingPromotion.to}
                </h3>
                <p className="text-xs text-[#A69F91]">
                  Select replacement piece to complete your move
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {promotionOptions.map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    aria-label={`Promote to ${opt.label}`}
                    onClick={() => onSelectPromotion(opt.type)}
                    className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-[#24312B] hover:bg-[#C6923A] text-[#F4EFE6] hover:text-[#111815] border border-[#36483F] transition-colors cursor-pointer group"
                  >
                    <div className="w-12 h-12">
                      <ChessPieceSvg type={opt.type} color={gameState.turn} />
                    </div>
                    <span className="mt-1.5 text-xs font-semibold">
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onCancelPromotion}
                className="text-xs text-[#A69F91] hover:text-[#F4EFE6] underline cursor-pointer pt-1"
              >
                Cancel Move
              </button>
            </div>
          </div>
        )}

        {/* Interactive Bottom-Right Corner Resize Handle */}
        {isResizable && onBoardScaleChange && (
          <button
            type="button"
            role="slider"
            data-testid="board-resize-handle"
            aria-label="Drag to resize chessboard (double-click to reset to auto-fit)"
            aria-valuemin={Math.round(MIN_BOARD_SCALE * 100)}
            aria-valuemax={Math.round(MAX_BOARD_SCALE * 100)}
            aria-valuenow={Math.round(boardScale * 100)}
            title="Drag to resize board · Double-click to Auto-Fit 100%"
            onPointerDown={(e) => {
              if (e.button !== 0 && e.pointerType === 'mouse') return;
              e.preventDefault();
              e.stopPropagation();
              const measuredPx =
                boardSizePx ??
                boardGridRef.current?.getBoundingClientRect().width ??
                480;
              resizeDragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startBoardPx: measuredPx,
                maxFitPx: maxFitSizePx ?? measuredPx,
              };
              setIsDraggingBoardSize(true);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onResetBoardScale) {
                onResetBoardScale();
              } else {
                onBoardScaleChange(1.0);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                onBoardScaleChange(
                  clampNumber(
                    Number((boardScale + 0.05).toFixed(2)),
                    MIN_BOARD_SCALE,
                    MAX_BOARD_SCALE
                  )
                );
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                onBoardScaleChange(
                  clampNumber(
                    Number((boardScale - 0.05).toFixed(2)),
                    MIN_BOARD_SCALE,
                    MAX_BOARD_SCALE
                  )
                );
              } else if (e.key === 'Home') {
                e.preventDefault();
                onBoardScaleChange(MIN_BOARD_SCALE);
              } else if (e.key === 'End' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onBoardScaleChange(MAX_BOARD_SCALE);
              }
            }}
            className={`absolute bottom-1 right-1 z-25 w-6 h-6 rounded-br-lg rounded-tl-md flex items-end justify-end p-1 transition-colors cursor-nwse-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C6923A] ${
              isDraggingBoardSize
                ? 'bg-[#C6923A]/30 text-[#C6923A]'
                : 'text-[#C6B39E]/55 hover:text-[#C6923A] hover:bg-[#111815]/40'
            }`}
          >
            <svg
              viewBox="0 0 12 12"
              className="w-3 h-3 pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <line x1="11" y1="3" x2="3" y2="11" />
              <line x1="11" y1="7" x2="7" y2="11" />
            </svg>
          </button>
        )}

        {/* Live Size Readout Pill Shown Only While Actively Drag-Resizing Board */}
        {isDraggingBoardSize && boardSizePx && (
          <div
            data-testid="board-resize-readout"
            className="absolute bottom-8 right-2 z-40 px-2.5 py-1 rounded-md bg-[#111815]/95 border border-[#C6923A] text-[11px] font-mono font-bold text-[#F4EFE6] shadow-lg pointer-events-none tabular-nums"
          >
            {boardSizePx}×{boardSizePx}px · {Math.round(boardScale * 100)}%
          </div>
        )}
      </div>
    </div>
  );
};

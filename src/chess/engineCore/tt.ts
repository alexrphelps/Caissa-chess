import { INTERNAL_MATE_BOUND } from './types';

/* ============================================================================
 * FIXED-SIZE FLAT TYPEDARRAY TRANSPOSITION TABLE (64 MB DEFAULT)
 *
 * Memory layout per entry (16 bytes × 4,194,304 entries = 64 MB):
 * - keysBuffer (BigUint64Array / dual Uint32Array view): 8 bytes (64-bit Zobrist verification)
 * - scores     (Int32Array):                             4 bytes (mate-normalized centipawns)
 * - moves      (Uint16Array):                            2 bytes (16-bit packed best move)
 * - depths     (Int8Array):                              1 byte  (search depth 0..127)
 * - meta       (Uint8Array):                             1 byte  (bits 0..1: bound flag, bits 2..7: 6-bit generation)
 *
 * Using dual Uint32 views over the 64-bit key ArrayBuffer guarantees full 64-bit
 * collision verification while running 100% in V8 32-bit integer registers with
 * zero BigInt allocations inside the hot search loop.
 * ========================================================================== */

export const TT_NONE = 0;
export const TT_EXACT = 1;
export const TT_ALPHA = 2; // Upperbound (failed low, score <= alpha)
export const TT_BETA = 3;  // Lowerbound (failed high, score >= beta)

export class TranspositionTable {
  public readonly size: number;
  public readonly mask: number;
  public readonly byteLength: number;

  // Backed by a single contiguous ArrayBuffer exposed as both BigUint64Array and Uint32Array
  public readonly keys64: BigUint64Array;
  private readonly keys32: Uint32Array;
  private readonly scores: Int32Array;
  private readonly moves: Uint16Array;
  private readonly depths: Int8Array;
  private readonly meta: Uint8Array;

  public generation = 1;

  // Reusable probe output fields (zero object allocation on hot-path probe!)
  public probedHit = false;
  public probedScore = 0;
  public probedMove = 0;
  public probedDepth = 0;
  public probedFlag = TT_NONE;

  /**
   * @param sizeMB Target size in megabytes (default 64 MB -> 4,194,304 entries).
   *               Rounded down to nearest power of two entries.
   */
  constructor(sizeMB = 64) {
    const bytesPerEntry = 16;
    const rawEntries = Math.max(1024, Math.floor((sizeMB * 1024 * 1024) / bytesPerEntry));
    let pow2 = 1;
    while ((pow2 << 1) <= rawEntries) {
      pow2 <<= 1;
    }

    this.size = pow2;
    this.mask = pow2 - 1;
    this.byteLength = pow2 * bytesPerEntry;

    const keysBuffer = new ArrayBuffer(pow2 * 8);
    this.keys64 = new BigUint64Array(keysBuffer);
    this.keys32 = new Uint32Array(keysBuffer);
    this.scores = new Int32Array(pow2);
    this.moves = new Uint16Array(pow2);
    this.depths = new Int8Array(pow2);
    this.meta = new Uint8Array(pow2);
  }

  public clear(): void {
    this.keys32.fill(0);
    this.scores.fill(0);
    this.moves.fill(0);
    this.depths.fill(0);
    this.meta.fill(0);
    this.generation = 1;
  }

  public nextGeneration(): void {
    this.generation = (this.generation + 1) & 63;
    if (this.generation === 0) this.generation = 1;
  }

  /**
   * Probes the TT with 64-bit key verification and mate-score ply denormalization.
   * Populates `probedHit`, `probedScore`, `probedMove`, `probedDepth`, `probedFlag`
   * without allocating any result object.
   */
  public probe(hashHi: number, hashLo: number, ply: number): boolean {
    const idx = hashLo & this.mask;
    const keyIdx = idx << 1;

    if (
      this.keys32[keyIdx] === hashLo &&
      this.keys32[keyIdx + 1] === hashHi
    ) {
      const m = this.meta[idx];
      const flag = m & 3;
      if (flag !== TT_NONE) {
        let sc = this.scores[idx];
        if (sc >= INTERNAL_MATE_BOUND) sc -= ply;
        else if (sc <= -INTERNAL_MATE_BOUND) sc += ply;

        this.probedHit = true;
        this.probedScore = sc;
        this.probedMove = this.moves[idx];
        this.probedDepth = this.depths[idx];
        this.probedFlag = flag;
        return true;
      }
    }

    this.probedHit = false;
    this.probedMove = 0;
    this.probedFlag = TT_NONE;
    return false;
  }

  /**
   * Stores an entry using age-aware depth-preferred replacement with mate-score ply normalization.
   */
  public store(
    hashHi: number,
    hashLo: number,
    depth: number,
    score: number,
    flag: number,
    move16: number,
    ply: number
  ): void {
    const idx = hashLo & this.mask;
    const keyIdx = idx << 1;

    const existingMeta = this.meta[idx];
    const existingFlag = existingMeta & 3;
    const existingGen = existingMeta >>> 2;
    const sameKey =
      existingFlag !== TT_NONE &&
      this.keys32[keyIdx] === hashLo &&
      this.keys32[keyIdx + 1] === hashHi;

    // Replacement policy:
    // Always replace if empty, older generation, exact bound, or depth >= oldDepth - 1
    if (
      existingFlag !== TT_NONE &&
      existingGen === this.generation &&
      !sameKey &&
      flag !== TT_EXACT &&
      this.depths[idx] > depth + 1
    ) {
      return;
    }

    if (
      sameKey &&
      existingGen === this.generation &&
      flag !== TT_EXACT &&
      this.depths[idx] > depth + 2
    ) {
      // Preserve deeper entry but still update best move if we have one
      if (move16 !== 0 && this.moves[idx] === 0) {
        this.moves[idx] = move16;
      }
      return;
    }

    let normScore = score;
    if (normScore >= INTERNAL_MATE_BOUND) normScore += ply;
    else if (normScore <= -INTERNAL_MATE_BOUND) normScore -= ply;

    this.keys32[keyIdx] = hashLo;
    this.keys32[keyIdx + 1] = hashHi;
    this.scores[idx] = normScore;
    if (move16 !== 0 || !sameKey) {
      this.moves[idx] = move16;
    }
    this.depths[idx] = depth > 127 ? 127 : depth < 0 ? 0 : depth;
    this.meta[idx] = (this.generation << 2) | (flag & 3);
  }
}

let sharedTTInstance: TranspositionTable | null = null;

/**
 * Returns the persistent module-level 64 MB flat TypedArray Transposition Table.
 * Lazily allocated on first search so module imports remain instant.
 */
export function getSharedTT(sizeMB = 64): TranspositionTable {
  if (!sharedTTInstance) {
    sharedTTInstance = new TranspositionTable(sizeMB);
  }
  return sharedTTInstance;
}

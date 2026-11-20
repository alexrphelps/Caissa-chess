import { validatePuzzle } from '../src/chess/puzzles/puzzleExtractor';
import { ChessPuzzle } from '../src/chess/puzzles/types';

export function testPuzzleList(name: string, puzzles: ChessPuzzle[]) {
  console.log(`Checking ${name}...`);
  let errors = 0;
  for (const p of puzzles) {
    const res = validatePuzzle(p);
    if (!res.valid) {
      console.error(`[FAIL] ${p.id} (${name}): ${res.error}`);
      errors++;
    }
  }
  if (errors === 0) {
    console.log(`[PASS] ${name}: All ${puzzles.length} puzzles valid!`);
  }
  return errors;
}

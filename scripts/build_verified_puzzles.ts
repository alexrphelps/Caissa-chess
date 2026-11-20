import { validatePuzzle } from '../src/chess/puzzles/puzzleExtractor';
import { ChessPuzzle } from '../src/chess/puzzles/types';
import fs from 'fs';
import path from 'path';

// Existing datasets
import puz0400 from '../src/chess/puzzles/data/puzzles_0400_0800.json';
import puz0800 from '../src/chess/puzzles/data/puzzles_0800_1200.json';
import puz1200 from '../src/chess/puzzles/data/puzzles_1200_1600.json';
import puz1600 from '../src/chess/puzzles/data/puzzles_1600_2000.json';
import puz2000 from '../src/chess/puzzles/data/puzzles_2000_2400.json';
import puz2400 from '../src/chess/puzzles/data/puzzles_2400_plus.json';

// Function to verify and merge
export function verifyAndSave(bandName: string, existing: ChessPuzzle[], additional: ChessPuzzle[]) {
  const all = [...existing];
  const existingIds = new Set(existing.map(p => p.id));
  
  for (const p of additional) {
    if (existingIds.has(p.id)) {
      continue;
    }
    const res = validatePuzzle(p);
    if (!res.valid) {
      throw new Error(`Invalid puzzle ${p.id} in ${bandName}: ${res.error}`);
    }
    all.push(p);
    existingIds.add(p.id);
  }

  console.log(`Band ${bandName}: Total verified puzzles = ${all.length}`);
  const targetPath = path.resolve(process.cwd(), `src/chess/puzzles/data/puzzles_${bandName}.json`);
  fs.writeFileSync(targetPath, JSON.stringify(all, null, 2), 'utf8');
}

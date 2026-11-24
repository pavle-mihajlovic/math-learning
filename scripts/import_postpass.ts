/**
 * Run after scripts/import_openstax.py. Parses every imported answer with the app's checker and
 * turns any exercise whose answer the checker cannot read (or rejects) into a self-check card.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Unit } from '../src/content/types.ts';
import { selfCheck } from './answers.ts';

let downgraded = 0;
let auto = 0;
let total = 0;
for (const file of process.argv.slice(2)) {
  const unit = JSON.parse(readFileSync(file, 'utf8')) as Unit;
  for (const ex of unit.exercises) {
    total++;
    if (ex.check !== 'auto' || !ex.answer) continue;
    const err = selfCheck(ex.answer);
    if (err) {
      ex.check = 'self';
      ex.notes = `self-check: imported answer ${JSON.stringify(ex.answer)} failed (${err})`;
      delete ex.answer;
      downgraded++;
    } else auto++;
  }
  for (const card of unit.reading) {
    if (card.kind !== 'text' && card.answer && selfCheck(card.answer)) delete card.answer;
  }
  writeFileSync(file, JSON.stringify(unit, null, 1) + '\n');
}
console.log(`post-pass: ${auto} of ${total} exercises auto-checkable, ${downgraded} downgraded to self-check`);

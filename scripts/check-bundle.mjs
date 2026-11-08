#!/usr/bin/env node
/**
 * Bundle-size budget. Fails the build if what a phone must download before it
 * can render (the JS/CSS referenced by index.html), or any lazy chunk, grows
 * past perf-budget.json. Sizes are gzip, which is what actually crosses the wire.
 *
 * The budgets are a ratchet: set just above today's size so nothing grows
 * unnoticed. When you shrink the bundle, lower the numbers to lock in the win.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dist = process.argv[2] ?? 'dist';
const budget = JSON.parse(readFileSync('perf-budget.json', 'utf8'));
const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const gz = (file) => gzipSync(readFileSync(path.join(dist, file))).length;

const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const initialGz = initial.reduce((sum, f) => sum + gz(f), 0);

const lazy = readdirSync(path.join(dist, 'assets'))
  .filter((f) => f.endsWith('.js') && !initial.includes(`assets/${f}`))
  .map((f) => ({ f, size: gz(`assets/${f}`) }))
  .sort((a, b) => b.size - a.size);

const failures = [];
console.log(`Initial load (${initial.length} files): ${kb(initialGz)} KB gzip  [budget ${budget.initialGzipKB} KB]`);
for (const f of initial) console.log(`  ${f}  ${kb(gz(f))} KB`);
if (kb(initialGz) > budget.initialGzipKB) {
  failures.push(`initial load ${kb(initialGz)} KB > ${budget.initialGzipKB} KB`);
}

console.log(`Largest lazy chunks  [budget ${budget.lazyChunkGzipKB} KB each]`);
for (const { f, size } of lazy.slice(0, 5)) console.log(`  assets/${f}  ${kb(size)} KB`);
for (const { f, size } of lazy) {
  if (kb(size) > budget.lazyChunkGzipKB) failures.push(`lazy chunk ${f} ${kb(size)} KB > ${budget.lazyChunkGzipKB} KB`);
}

if (failures.length) {
  console.error(`\n✗ Bundle budget exceeded:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\n✓ Bundle within budget');

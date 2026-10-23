// Copies the MediaPipe wasm files next to the face model in public/proctor/wasm, so camera
// proctoring loads everything from our own site (no third-party request during an exam).
// The files are large and come from node_modules, so they are git-ignored.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const require = createRequire(import.meta.url);
// The package does not export its package.json, so find its folder from its main file.
const source = join(dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm');
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'proctor', 'wasm');

mkdirSync(target, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(source, file), join(target, file));
}

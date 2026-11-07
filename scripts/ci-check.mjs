import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];
let checked = 0;

function run(label, command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  checked += 1;
  if (result.status !== 0) failures.push(label);
}

const jsFiles = [];
for (const folder of ['worker', 'standalone', 'scripts']) {
  for (const name of readdirSync(join(root, folder))) {
    if (name.endsWith('.js') || name.endsWith('.mjs')) jsFiles.push(join(folder, name));
  }
}
for (const file of jsFiles) run(`node --check ${file}`, process.execPath, ['--check', file]);

const python = process.platform === 'win32' ? 'python' : 'python3';
run('python compile', python, ['-m', 'compileall', '-q', 'executor']);

run('deployment preflight', process.execPath, ['scripts/deployment-preflight.mjs']);
for (const script of ['verify-novice-contracts.mjs', 'verify-dialogue-intake.mjs', 'verify-material-integration.mjs', 'verify-stata-logic.mjs', 'failure-injection.mjs']) {
  run(script, process.execPath, [join('scripts', script)]);
}
run('verify-new-methods', python, [join('scripts', 'verify-new-methods.py')]);

console.log('');
if (failures.length) {
  console.error(`CI FAILED (${failures.length}/${checked}): ${failures.join(' | ')}`);
  process.exit(1);
}
console.log(`CI PASSED (${checked} checks)`);

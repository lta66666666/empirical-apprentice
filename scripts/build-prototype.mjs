import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import './build-auth.mjs';
import './build-sample-evidence.mjs';
import './build-course-materials.mjs';
import './build-demo-fixtures.mjs';

const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'dist/server'), { recursive: true });
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
for (const name of await readdir(resolve(root, 'worker'))) {
  if (name.endsWith('.js') && name !== 'assets.js') {
    await copyFile(resolve(root, 'worker', name), resolve(root, 'dist/server', name));
  }
}
const assets = {};
const staticRoot = resolve(root, 'static');
async function visit(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const file = join(folder, item.name);
    if (item.isDirectory()) await visit(file);
    else if (item.isFile()) {
      const key = '/static/' + relative(staticRoot, file).split(sep).join('/');
      assets[key] = (await readFile(file)).toString('base64');
    }
  }
}
await visit(staticRoot);
await writeFile(resolve(root, 'dist/server/assets.js'), 'export const assets = ' + JSON.stringify(assets) + ';\n');
await copyFile(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
console.log(`Built Worker with ${Object.keys(assets).length} copied V9 front-end files.`);

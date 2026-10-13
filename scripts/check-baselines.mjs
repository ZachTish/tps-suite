import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';

const baselines = JSON.parse(await readFile('provenance.json', 'utf8'));
let checked = 0;
const changes = [];
for (const baseline of baselines) {
  const repo = join('..', baseline.sourceFolder);
  const tree = execFileSync('git', ['ls-tree', '-r', '-z', baseline.commit], { cwd: repo, encoding: 'utf8' });
  for (const entry of tree.split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t'), path = entry.slice(tab + 1);
    const [mode, type, expected] = entry.slice(0, tab).split(' ');
    if (type !== 'blob' || !mode.startsWith('100') || ['main.js', 'main.js.map'].includes(basename(path))
      || ['.github', '.obsidian', 'node_modules'].includes(path.split('/')[0])) continue;
    const bytes = await readFile(join('modules', baseline.module, path));
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (actual !== expected) changes.push(`${baseline.module}/${path}`);
    checked++;
  }
}
console.log(JSON.stringify({ baselineFilesChecked: checked, changedPaths: changes }, null, 2));
if (changes.length) process.exitCode = 1;

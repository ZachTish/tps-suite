import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const provenance = JSON.parse(await readFile('provenance.json', 'utf8'));
const inventory = [];
async function walk(path) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(child);
  }
  return files;
}
for (const baseline of provenance) {
  const references = [];
  for (const file of await walk(join('modules', baseline.module, 'src'))) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const categories = [];
      if (/\.setName\(|\.setDesc\(/.test(line)) categories.push('settings-copy');
      if (/addCommand\(|registerObsidianProtocolHandler\(|registerView\(|registerBasesView\(|registerMarkdownCodeBlockProcessor\(/.test(line)) categories.push('registration');
      if (/getPlugin\??\.?(?:\(|\[)|plugins\??\.plugins|plugins\[|getPluginById\(/.test(line)) categories.push('plugin-lookup');
      if (/localStorage|indexedDB|secretStorage|manifest\.dir/.test(line)) categories.push('storage');
      if (categories.length) references.push({ file, line: index + 1, categories });
    }
  }
  inventory.push({ module: baseline.module, commit: baseline.commit, references });
}
await writeFile('source-inventory.json', JSON.stringify(inventory, null, 2) + '\n');
console.log(JSON.stringify(inventory.map(item => ({ module: item.module, referenceCount: item.references.length }))));

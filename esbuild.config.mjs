import { build } from 'esbuild';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeDeployPlugin } from '../deploy-runtime.mjs';

const sourceFolder = basename(dirname(fileURLToPath(import.meta.url)));
// Deliberate release gate: this artifact contains only the host foundation.
// Remove this gate only after all module ports and migration acceptance pass.
const runtimeReady = false;
await build({
  entryPoints: ['src/main.ts'], bundle: true, format: 'cjs', platform: 'browser',
  target: 'es2018', external: ['obsidian'], sourcemap: false,
  outfile: runtimeReady ? 'main.js' : 'build/main.js',
  plugins: runtimeReady ? [runtimeDeployPlugin(sourceFolder)] : []
});
if (!runtimeReady) console.log(`[runtime-deploy] target=none lane=stable source=${sourceFolder} reason=module-ports-incomplete`);

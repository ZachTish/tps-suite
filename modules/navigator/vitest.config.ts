import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTpsRuntimeNamespaceVitePlugin } from './scripts/tps-runtime-namespace.mjs';

// Get current directory path for module resolution
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [createTpsRuntimeNamespaceVitePlugin(dirname)],
    resolve: {
        alias: {
            obsidian: path.resolve(dirname, 'tests/stubs/obsidian.ts')
        }
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        setupFiles: ['tests/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            reportsDirectory: 'coverage'
        }
    }
});

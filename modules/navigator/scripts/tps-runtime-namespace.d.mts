export function applyTpsRuntimeNamespace(source: string): string;

export function createTpsRuntimeNamespaceEsbuildPlugin(projectRoot: string): {
    name: string;
    setup(build: unknown): void;
};

export function createTpsRuntimeNamespaceVitePlugin(projectRoot: string): {
    name: string;
    enforce: 'pre';
    transform(source: string, id: string): null | { code: string; map: null };
};

import { App, type CachedMetadata, type TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { buildVaultFileTypesSnapshot, getTpsNavigatorFileTypeId } from '../../src/services/types/vaultFileTypes';
import { TPS_NAVIGATOR_TYPE_IDS, type TpsNavigatorFileTypeId } from '../../src/types/navigatorTypes';
import { createTestTFile } from '../utils/createTestTFile';

interface TestAppContext {
    app: App;
    getFiles: ReturnType<typeof vi.fn>;
    getFileCache: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    cachedRead: ReturnType<typeof vi.fn>;
    readBinary: ReturnType<typeof vi.fn>;
}

function createApp(files: TFile[], frontmatterByPath: Readonly<Record<string, Record<string, unknown>>> = {}): TestAppContext {
    const app = new App();
    const getFiles = vi.fn(() => files);
    const getFileCache = vi.fn((file: TFile): CachedMetadata | null => {
        const frontmatter = frontmatterByPath[file.path];
        return frontmatter ? { frontmatter } : null;
    });
    const failRead = () => {
        throw new Error('vault file bodies must not be read while building Types');
    };
    const read = vi.fn(failRead);
    const cachedRead = vi.fn(failRead);
    const readBinary = vi.fn(failRead);

    app.vault.getFiles = getFiles;
    app.vault.read = read;
    app.vault.cachedRead = cachedRead;
    app.vault.readBinary = readBinary;
    app.metadataCache.getFileCache = getFileCache;

    return { app, getFiles, getFileCache, read, cachedRead, readBinary };
}

function expectNoFileReads(context: TestAppContext): void {
    expect(context.read).not.toHaveBeenCalled();
    expect(context.cachedRead).not.toHaveBeenCalled();
    expect(context.readBinary).not.toHaveBeenCalled();
}

function snapshotPathsByType(context: TestAppContext): [TpsNavigatorFileTypeId, string[]][] {
    const snapshot = buildVaultFileTypesSnapshot(context.app);
    return snapshot.descriptors.map(descriptor => [
        descriptor.id as TpsNavigatorFileTypeId,
        (snapshot.recordsByType.get(descriptor.id) ?? []).map(record => record.sourcePath)
    ]);
}

describe('vault file Types', () => {
    it('classifies every fixed file bucket case-insensitively', () => {
        const context = createApp([]);
        const cases: [string, TpsNavigatorFileTypeId][] = [
            ['Notes/Overview.MD', TPS_NAVIGATOR_TYPE_IDS.NOTES],
            ['Data/Projects.BASE', TPS_NAVIGATOR_TYPE_IDS.BASES],
            ['Boards/Roadmap.CANVAS', TPS_NAVIGATOR_TYPE_IDS.CANVAS],
            ['Drawings/Architecture.EXCALIDRAW.MD', TPS_NAVIGATOR_TYPE_IDS.DRAWINGS],
            ['Documents/Specification.PDF', TPS_NAVIGATOR_TYPE_IDS.PDFS],
            ['Images/Diagram.SVG', TPS_NAVIGATOR_TYPE_IDS.IMAGES],
            ['Audio/Interview.OPUS', TPS_NAVIGATOR_TYPE_IDS.AUDIO],
            ['Video/Walkthrough.M4V', TPS_NAVIGATOR_TYPE_IDS.VIDEO]
        ];

        for (const [path, expectedTypeId] of cases) {
            expect(getTpsNavigatorFileTypeId(context.app, createTestTFile(path)), path).toBe(expectedTypeId);
        }
        expect(getTpsNavigatorFileTypeId(context.app, createTestTFile('Archives/Backup.ZIP'))).toBeNull();
        expectNoFileReads(context);
    });

    it('builds a deterministic fixed-order snapshot with one read-free vault scan', () => {
        const files = [
            createTestTFile('Notes/Zulu.md'),
            createTestTFile('Video/Demo.mp4'),
            createTestTFile('Images/Hero.png'),
            createTestTFile('Documents/Guide.pdf'),
            createTestTFile('Drawings/Flow.excalidraw.md'),
            createTestTFile('Boards/Plan.canvas'),
            createTestTFile('Data/Projects.base'),
            createTestTFile('Notes/alpha.MD'),
            createTestTFile('Audio/Theme.mp3'),
            createTestTFile('Archives/Ignored.zip')
        ];
        const forward = createApp(files);
        const reverse = createApp([...files].reverse());

        const forwardPaths = snapshotPathsByType(forward);
        const reversePaths = snapshotPathsByType(reverse);

        expect(forwardPaths).toEqual([
            [TPS_NAVIGATOR_TYPE_IDS.NOTES, ['Notes/alpha.MD', 'Notes/Zulu.md']],
            [TPS_NAVIGATOR_TYPE_IDS.BASES, ['Data/Projects.base']],
            [TPS_NAVIGATOR_TYPE_IDS.CANVAS, ['Boards/Plan.canvas']],
            [TPS_NAVIGATOR_TYPE_IDS.DRAWINGS, ['Drawings/Flow.excalidraw.md']],
            [TPS_NAVIGATOR_TYPE_IDS.PDFS, ['Documents/Guide.pdf']],
            [TPS_NAVIGATOR_TYPE_IDS.IMAGES, ['Images/Hero.png']],
            [TPS_NAVIGATOR_TYPE_IDS.AUDIO, ['Audio/Theme.mp3']],
            [TPS_NAVIGATOR_TYPE_IDS.VIDEO, ['Video/Demo.mp4']]
        ]);
        expect(reversePaths).toEqual(forwardPaths);
        expect(forward.getFiles).toHaveBeenCalledTimes(1);
        expect(reverse.getFiles).toHaveBeenCalledTimes(1);
        expectNoFileReads(forward);
        expectNoFileReads(reverse);
    });

    it('classifies Excalidraw frontmatter and filenames exclusively as Drawings', () => {
        const flagged = createTestTFile('Drawings/Flagged.md');
        const named = createTestTFile('Drawings/Named.excalidraw.md');
        const raw = createTestTFile('Drawings/Legacy.excalidraw');
        const plain = createTestTFile('Notes/Plain.md');
        const context = createApp([plain, raw, named, flagged], {
            [flagged.path]: { 'excalidraw-plugin': 'parsed' },
            [plain.path]: { 'excalidraw-plugin': false }
        });

        const snapshot = buildVaultFileTypesSnapshot(context.app);
        const notes = snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.NOTES) ?? [];
        const drawings = snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.DRAWINGS) ?? [];
        const allPaths = snapshot.descriptors.flatMap(descriptor =>
            (snapshot.recordsByType.get(descriptor.id) ?? []).map(record => record.sourcePath)
        );

        expect(notes.map(record => record.sourcePath)).toEqual([plain.path]);
        expect(drawings.map(record => record.sourcePath)).toEqual([flagged.path, raw.path, named.path]);
        expect(allPaths).toHaveLength(new Set(allPaths).size);
        expect(allPaths).toEqual(expect.arrayContaining([flagged.path, named.path, raw.path, plain.path]));
        expect(context.getFileCache).toHaveBeenCalledTimes(2);
        expect(context.getFileCache).toHaveBeenCalledWith(flagged);
        expect(context.getFileCache).toHaveBeenCalledWith(plain);
        expect(context.getFiles).toHaveBeenCalledTimes(1);
        expectNoFileReads(context);
    });
});

it('retains base-sensitive locale ordering and path ties without per-comparison locale setup', () => {
    const files = ['Z/Alpha.md', 'A/alpha.md', 'N/Éclair.md', 'N/eclair.md', 'N/Zulu.md', 'N/file-10.md', 'N/file-2.md'].map(createTestTFile);
    const expected = [...files].sort((a, b) =>
        a.basename.localeCompare(b.basename, undefined, { sensitivity: 'base' }) ||
        a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
    ).map(file => file.path);
    const context = createApp(files);
    const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
        throw new Error('Do not initialize locale comparison for every catalog comparison');
    });
    try {
        const records = buildVaultFileTypesSnapshot(context.app).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.NOTES);
        expect(records?.map(record => record.sourcePath)).toEqual(expected);
        expectNoFileReads(context);
    } finally {
        localeCompare.mockRestore();
    }
});

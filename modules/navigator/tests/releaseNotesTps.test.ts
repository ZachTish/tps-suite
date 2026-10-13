/* TPS Notebook Navigator - release-note version alignment. */

import { describe, expect, it } from 'vitest';
import { getLatestReleaseNotes, getReleaseNotesBetweenVersions } from '../src/releaseNotes';

describe('TPS release notes', () => {
    it('keeps the current plugin release first and available in the 4.1 to current update range', () => {
        expect(getLatestReleaseNotes(1).map(note => note.version)).toEqual(['8.2.0']);
        expect(getReleaseNotesBetweenVersions('8.1.0', '8.2.0').map(note => note.version)).toEqual(['8.2.0', '8.1.0']);
        expect(getReleaseNotesBetweenVersions('4.1.0', '5.25.0').map(note => note.version)).toEqual([
            '5.25.0',
            '5.24.0',
            '5.23.2',
            '5.23.1',
            '5.22.0',
            '5.21.0',
            '5.20.2',
            '5.20.1',
            '5.18.2',
            '5.18.1',
            '5.18.0',
            '5.17.0',
            '5.16.1',
            '5.16.0',
            '5.15.2',
            '5.15.1',
            '5.15.0',
            '5.14.6',
            '5.14.5',
            '5.14.4',
            '5.14.3',
            '5.14.2',
            '5.14.1',
            '5.14.0',
            '5.13.1',
            '5.13.0',
            '5.12.1',
            '5.12.0',
            '5.11.0',
            '5.10.3',
            '5.10.2',
            '5.10.1',
            '5.10.0',
            '5.9.0',
            '5.4.0',
            '5.3.1',
            '5.3.0',
            '5.2.0',
            '5.1.0',
            '5.0.0',
            '4.11.0',
            '4.10.0',
            '4.9.1',
            '4.9.0',
            '4.8.0',
            '4.7.1',
            '4.7.0',
            '4.6.0',
            '4.5.0',
            '4.4.0',
            '4.3.0',
            '4.2.0',
            '4.1.0'
        ]);
    });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
    Uri: {
        parse: (s: string) => {
            const url = new URL(s);
            return {
                scheme: url.protocol.replace(':', ''),
                path: url.pathname,
                query: url.search.slice(1),
            };
        },
    },
    window: {
        createOutputChannel: vi.fn(() => ({ appendLine: vi.fn() })),
    },
    workspace: {
        getConfiguration: vi.fn(() => ({ get: vi.fn((_k: string, fb: unknown) => fb) })),
    },
}));

import { buildDiffUri } from '../diff-provider';

describe('buildDiffUri', () => {
    it('builds correct URI with all params', () => {
        const uri = buildDiffUri('src/main.ts', 'abc123', '/repo');
        expect(uri.scheme).toBe('git-graph-enhanced');
        expect(uri.path).toBe('/src/main.ts');
        expect(uri.query).toContain('commitId=abc123');
        expect(uri.query).toContain('repoPath=%2Frepo');
    });

    it('handles file paths with spaces', () => {
        const uri = buildDiffUri('path with spaces/file.ts', 'abc', '/repo');
        expect(uri.path).toContain('path%20with%20spaces');
    });

    it('encodes special characters in commitId', () => {
        const uri = buildDiffUri('file.ts', 'abc/def', '/repo');
        expect(uri.query).toContain('commitId=abc%2Fdef');
    });
});

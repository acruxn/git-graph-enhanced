import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: vi.fn(() => ({
            get: vi.fn((_key: string, fallback: unknown) => fallback),
        })),
    },
}));

import { getConfig } from '../config';

describe('getConfig', () => {
    it('returns fallback when setting not configured', () => {
        expect(getConfig('maxCommits', 500)).toBe(500);
    });

    it('returns fallback for unknown keys', () => {
        expect(getConfig('nonexistent', 'default')).toBe('default');
    });
});

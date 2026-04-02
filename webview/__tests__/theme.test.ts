import { describe, it, expect } from 'vitest';
import { FALLBACK_COLORS } from '../src/theme';

describe('branch color palette', () => {
    it('has 8 colors', () => {
        expect(FALLBACK_COLORS).toHaveLength(8);
    });

    it('all are valid hex strings', () => {
        for (const c of FALLBACK_COLORS) {
            expect(c).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('has no duplicates', () => {
        expect(new Set(FALLBACK_COLORS).size).toBe(FALLBACK_COLORS.length);
    });
});

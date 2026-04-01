import { describe, it, expect } from 'vitest';
import { BRANCH_COLORS } from '../src/theme';

describe('branch color palette', () => {
    it('has 8 colors', () => {
        expect(BRANCH_COLORS).toHaveLength(8);
    });

    it('all are valid hex strings', () => {
        for (const c of BRANCH_COLORS) {
            expect(c).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('has no duplicates', () => {
        expect(new Set(BRANCH_COLORS).size).toBe(BRANCH_COLORS.length);
    });
});

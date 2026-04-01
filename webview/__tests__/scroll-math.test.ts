import { describe, it, expect } from 'vitest';

const ROW_HEIGHT = 24;

function visibleRange(scrollTop: number, viewportHeight: number, totalCommits: number): [number, number] {
    const start = Math.floor(scrollTop / ROW_HEIGHT);
    const end = Math.min(start + Math.ceil(viewportHeight / ROW_HEIGHT) + 1, totalCommits);
    return [Math.max(0, start), end];
}

function indexFromY(clientY: number, canvasTop: number, scrollTop: number): number {
    const y = clientY - canvasTop + scrollTop;
    return Math.floor(y / ROW_HEIGHT);
}

describe('virtual scroll math', () => {
    it('calculates visible range at top', () => {
        const [start, end] = visibleRange(0, 480, 1000);
        expect(start).toBe(0);
        expect(end).toBe(21);
    });

    it('calculates visible range scrolled down', () => {
        const [start, end] = visibleRange(240, 480, 1000);
        expect(start).toBe(10);
        expect(end).toBe(31);
    });

    it('clamps to total commits', () => {
        const [start, end] = visibleRange(0, 480, 5);
        expect(start).toBe(0);
        expect(end).toBe(5);
    });

    it('handles zero commits', () => {
        const [start, end] = visibleRange(0, 480, 0);
        expect(start).toBe(0);
        expect(end).toBe(0);
    });
});

describe('hit testing', () => {
    it('maps click Y to commit index', () => {
        expect(indexFromY(12, 0, 0)).toBe(0);
        expect(indexFromY(36, 0, 0)).toBe(1);
        expect(indexFromY(100, 0, 0)).toBe(4);
    });

    it('accounts for scroll offset', () => {
        expect(indexFromY(12, 0, 240)).toBe(10);
    });

    it('accounts for canvas position', () => {
        expect(indexFromY(112, 100, 0)).toBe(0);
    });
});

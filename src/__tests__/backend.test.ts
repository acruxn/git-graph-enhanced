import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
    workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn((_k: string, fb: unknown) => fb) })) },
    window: { createOutputChannel: vi.fn(() => ({ appendLine: vi.fn() })) },
}));

vi.mock('../extension', () => ({
    outputChannel: { appendLine: vi.fn() },
}));

import { parseLines } from '../backend';

describe('parseLines', () => {
    it('parses a complete line', () => {
        const result = parseLines('', '{"id":1}\n');
        expect(result.lines).toEqual(['{"id":1}']);
        expect(result.remaining).toBe('');
    });

    it('buffers a partial line', () => {
        const result = parseLines('', '{"id":');
        expect(result.lines).toEqual([]);
        expect(result.remaining).toBe('{"id":');
    });

    it('completes a partial line from buffer', () => {
        const result = parseLines('{"id":', '1}\n');
        expect(result.lines).toEqual(['{"id":1}']);
        expect(result.remaining).toBe('');
    });

    it('parses multiple lines', () => {
        const result = parseLines('', '{"id":1}\n{"id":2}\n');
        expect(result.lines).toHaveLength(2);
    });

    it('filters empty lines', () => {
        const result = parseLines('', '\n\n{"id":1}\n');
        expect(result.lines).toEqual(['{"id":1}']);
    });

    it('returns partial when no newline', () => {
        const result = parseLines('', 'partial');
        expect(result.lines).toEqual([]);
        expect(result.remaining).toBe('partial');
    });
});

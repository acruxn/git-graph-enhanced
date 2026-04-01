import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../src/markdown';

describe('parseMarkdown', () => {
    it('parses plain text', () => {
        expect(parseMarkdown('hello')).toEqual([{ type: 'text', content: 'hello' }]);
    });

    it('parses bold', () => {
        expect(parseMarkdown('**bold**')).toEqual([{ type: 'bold', content: 'bold' }]);
    });

    it('parses italic', () => {
        expect(parseMarkdown('*italic*')).toEqual([{ type: 'italic', content: 'italic' }]);
    });

    it('parses code', () => {
        expect(parseMarkdown('`code`')).toEqual([{ type: 'code', content: 'code' }]);
    });

    it('parses mixed content', () => {
        expect(parseMarkdown('text **bold** more')).toEqual([
            { type: 'text', content: 'text ' },
            { type: 'bold', content: 'bold' },
            { type: 'text', content: ' more' },
        ]);
    });

    it('returns single text segment for no markdown', () => {
        expect(parseMarkdown('plain text here')).toEqual([{ type: 'text', content: 'plain text here' }]);
    });

    it('parses adjacent bold and italic', () => {
        expect(parseMarkdown('**a***b*')).toEqual([
            { type: 'bold', content: 'a' },
            { type: 'italic', content: 'b' },
        ]);
    });

    it('returns empty array for empty string', () => {
        expect(parseMarkdown('')).toEqual([]);
    });
});

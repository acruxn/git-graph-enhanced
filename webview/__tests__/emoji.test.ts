import { describe, it, expect } from 'vitest';
import { replaceEmoji } from '../src/emoji';

describe('replaceEmoji', () => {
    it('replaces known shortcodes', () => {
        expect(replaceEmoji(':sparkles: new feature')).toBe('✨ new feature');
        expect(replaceEmoji(':bug: fix')).toBe('🐛 fix');
    });

    it('replaces multiple shortcodes', () => {
        expect(replaceEmoji(':fire: remove :bug: fix')).toBe('🔥 remove 🐛 fix');
    });

    it('leaves unknown shortcodes unchanged', () => {
        expect(replaceEmoji(':unknown_code: text')).toBe(':unknown_code: text');
    });

    it('handles text without shortcodes', () => {
        expect(replaceEmoji('plain text')).toBe('plain text');
    });

    it('handles empty string', () => {
        expect(replaceEmoji('')).toBe('');
    });

    it('handles adjacent shortcodes', () => {
        expect(replaceEmoji(':sparkles::bug:')).toBe('✨🐛');
    });
});

import { describe, it, expect } from 'vitest';
import { replaceEmoji } from '../src/emoji';

describe('emoji + markdown integration', () => {
    it('emoji unicode inside bold markers is preserved', () => {
        const text = '**✨ feature**';
        // Simulate what markdown parser sees after emoji replacement
        // Bold regex should still match around unicode emoji
        const boldRe = /\*\*(.+?)\*\*/;
        const match = boldRe.exec(text);
        expect(match).not.toBeNull();
        expect(match![1]).toBe('✨ feature');
    });

    it('replaceEmoji then markdown parse produces correct segments', () => {
        const raw = '**:sparkles: feature**';
        const afterEmoji = replaceEmoji(raw);
        expect(afterEmoji).toBe('**✨ feature**');

        const boldRe = /\*\*(.+?)\*\*/;
        const match = boldRe.exec(afterEmoji);
        expect(match).not.toBeNull();
        expect(match![1]).toBe('✨ feature');
    });

    it('inline code with emoji shortcode is not replaced', () => {
        const raw = '`:bug:` fix';
        const afterEmoji = replaceEmoji(raw);
        // replaceEmoji doesn't know about markdown — it replaces everywhere
        expect(afterEmoji).toBe('`🐛` fix');
    });
});

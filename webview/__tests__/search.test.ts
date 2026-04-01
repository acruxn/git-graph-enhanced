import { describe, it, expect } from 'vitest';

function globToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexStr = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regexStr}$`);
}

describe('branch glob matching', () => {
    it('matches wildcard patterns', () => {
        const re = globToRegex('feature/*');
        expect(re.test('feature/login')).toBe(true);
        expect(re.test('feature/signup')).toBe(true);
        expect(re.test('bugfix/login')).toBe(false);
    });

    it('matches exact names', () => {
        const re = globToRegex('main');
        expect(re.test('main')).toBe(true);
        expect(re.test('main2')).toBe(false);
    });

    it('matches question mark', () => {
        const re = globToRegex('release-?.0');
        expect(re.test('release-1.0')).toBe(true);
        expect(re.test('release-12.0')).toBe(false);
    });

    it('matches nested wildcards', () => {
        const re = globToRegex('*/feature/*');
        expect(re.test('origin/feature/login')).toBe(true);
    });
});

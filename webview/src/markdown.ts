export interface MarkdownSegment {
    type: 'text' | 'bold' | 'italic' | 'code';
    content: string;
}

const MD_RE = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;

export function parseMarkdown(line: string): MarkdownSegment[] {
    if (!line) { return []; }
    const segments: MarkdownSegment[] = [];
    let lastIndex = 0;
    MD_RE.lastIndex = 0;
    let match;
    while ((match = MD_RE.exec(line)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', content: line.slice(lastIndex, match.index) });
        }
        if (match[2]) {
            segments.push({ type: 'bold', content: match[2] });
        } else if (match[3]) {
            segments.push({ type: 'italic', content: match[3] });
        } else if (match[4]) {
            segments.push({ type: 'code', content: match[4] });
        }
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
        segments.push({ type: 'text', content: line.slice(lastIndex) });
    }
    return segments;
}

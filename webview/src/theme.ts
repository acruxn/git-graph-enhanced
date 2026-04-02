const LANE_CSS_VARS = [
    '--vscode-gitGraphEnhanced-graphLane1Color',
    '--vscode-gitGraphEnhanced-graphLane2Color',
    '--vscode-gitGraphEnhanced-graphLane3Color',
    '--vscode-gitGraphEnhanced-graphLane4Color',
    '--vscode-gitGraphEnhanced-graphLane5Color',
    '--vscode-gitGraphEnhanced-graphLane6Color',
    '--vscode-gitGraphEnhanced-graphLane7Color',
    '--vscode-gitGraphEnhanced-graphLane8Color',
];

export const FALLBACK_COLORS = [
    '#15a0bf', '#0669f7', '#8e00c2', '#d90171',
    '#cd0101', '#f25d2e', '#7bd938', '#2ece9d',
];

/** Parse "#rrggbb" to [r, g, b]. Returns null on failure. */
function parseHex(hex: string): [number, number, number] | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) { return null; }
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** Blend fg over bg at given opacity (0–1). */
function mixColor(fg: [number, number, number], bg: [number, number, number], opacity: number): string {
    const r = Math.round(fg[0] * opacity + bg[0] * (1 - opacity));
    const g = Math.round(fg[1] * opacity + bg[1] * (1 - opacity));
    const b = Math.round(fg[2] * opacity + bg[2] * (1 - opacity));
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export class ThemeManager {
    private styles: CSSStyleDeclaration;

    constructor() {
        this.styles = getComputedStyle(document.documentElement);
    }

    get foreground(): string {
        return this.css('--vscode-editor-foreground') || this.css('--vscode-foreground') || '#cccccc';
    }

    get background(): string {
        return this.css('--vscode-editor-background') || '#1e1e1e';
    }

    get hoverBackground(): string {
        return this.css('--vscode-list-hoverBackground');
    }

    get focusBorder(): string {
        return this.css('--vscode-focusBorder');
    }

    get selectedBackground(): string {
        return this.css('--vscode-list-activeSelectionBackground');
    }

    /** Text at 65% opacity — for secondary info (SHA, dates). */
    get textSecondary(): string {
        return this.blendFg(0.65);
    }

    /** Text at 20% opacity — for dimmed/disabled content. */
    get textDimmed(): string {
        return this.blendFg(0.20);
    }

    get branchColors(): readonly string[] {
        return LANE_CSS_VARS.map((v, i) => this.css(v) || FALLBACK_COLORS[i]);
    }

    refresh(): void {
        this.styles = getComputedStyle(document.documentElement);
    }

    private css(prop: string): string {
        return this.styles.getPropertyValue(prop).trim();
    }

    private blendFg(opacity: number): string {
        const fg = parseHex(this.foreground);
        const bg = parseHex(this.background);
        if (!fg || !bg) { return this.foreground; }
        return mixColor(fg, bg, opacity);
    }
}

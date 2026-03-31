const BRANCH_COLORS = [
    '#4285f4', '#ea4335', '#34a853', '#fbbc04',
    '#ff6d01', '#46bdc6', '#ab47bc', '#7baaf7',
];

export class ThemeManager {
    private styles: CSSStyleDeclaration;

    constructor() {
        this.styles = getComputedStyle(document.documentElement);
    }

    get foreground(): string {
        return this.styles.getPropertyValue('--vscode-editor-foreground').trim();
    }

    get background(): string {
        return this.styles.getPropertyValue('--vscode-editor-background').trim();
    }

    get hoverBackground(): string {
        return this.styles.getPropertyValue('--vscode-list-hoverBackground').trim();
    }

    get focusBorder(): string {
        return this.styles.getPropertyValue('--vscode-focusBorder').trim();
    }

    get branchColors(): readonly string[] {
        return BRANCH_COLORS;
    }

    refresh(): void {
        this.styles = getComputedStyle(document.documentElement);
    }
}

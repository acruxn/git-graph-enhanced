import { ThemeManager } from './theme';

interface Commit {
    id: string;
    shortId: string;
    message: string;
    author: { name: string };
    timestamp: number;
}

interface Branch {
    name: string;
    isRemote: boolean;
    isHead: boolean;
    commitId: string;
}

interface GraphData {
    commits: Commit[];
    branches?: Branch[];
}

const ROW_HEIGHT = 24;
const COL_WIDTH = 16;
const DOT_RADIUS = 4;
const GRAPH_LEFT = 20;
const TEXT_LEFT = 80;

export class GraphRenderer {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly theme: ThemeManager;
    private commits: Commit[] = [];
    private rafId: number | null = null;

    constructor(canvas: HTMLCanvasElement, theme: ThemeManager) {
        this.ctx = canvas.getContext('2d')!;
        this.theme = theme;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize(): void {
        const canvas = this.ctx.canvas;
        const container = canvas.parentElement!;
        const dpr = window.devicePixelRatio || 1;
        const width = container.clientWidth;
        const height = Math.max(container.clientHeight, this.commits.length * ROW_HEIGHT);

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        this.ctx.scale(dpr, dpr);
        this.scheduleRedraw();
    }

    render(data: GraphData): void {
        this.commits = data.commits;
        this.resize();
    }

    private scheduleRedraw(): void {
        if (this.rafId !== null) { return; }
        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.draw();
        });
    }

    private draw(): void {
        const { ctx, commits, theme } = this;
        const width = ctx.canvas.width / (window.devicePixelRatio || 1);
        const height = commits.length * ROW_HEIGHT;

        ctx.clearRect(0, 0, width, height);

        const colors = theme.branchColors;
        const fg = theme.foreground;
        const secondaryAlpha = 0.7;

        // Draw connecting line
        if (commits.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = colors[0];
            ctx.lineWidth = 2;
            const x = GRAPH_LEFT;
            ctx.moveTo(x, ROW_HEIGHT / 2);
            ctx.lineTo(x, (commits.length - 1) * ROW_HEIGHT + ROW_HEIGHT / 2);
            ctx.stroke();
        }

        // Draw commit dots and text
        for (let i = 0; i < commits.length; i++) {
            const commit = commits[i];
            const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;

            // Dot
            ctx.beginPath();
            ctx.fillStyle = colors[0];
            ctx.arc(GRAPH_LEFT, y, DOT_RADIUS, 0, Math.PI * 2);
            ctx.fill();

            // Short SHA
            ctx.fillStyle = fg;
            ctx.globalAlpha = secondaryAlpha;
            ctx.font = '12px var(--vscode-editor-font-family, monospace)';
            ctx.fillText(commit.shortId, TEXT_LEFT, y + 4);

            // Message
            ctx.globalAlpha = 1;
            ctx.font = '13px var(--vscode-font-family, sans-serif)';
            const shaWidth = ctx.measureText(commit.shortId).width;
            ctx.fillText(commit.message, TEXT_LEFT + shaWidth + 12, y + 4);

            // Author
            ctx.globalAlpha = secondaryAlpha;
            ctx.font = '12px var(--vscode-font-family, sans-serif)';
            const msgWidth = ctx.measureText(commit.message).width;
            const authorX = TEXT_LEFT + shaWidth + 12 + msgWidth + 16;
            if (authorX < width - 100) {
                ctx.fillText(commit.author.name, authorX, y + 4);
            }
            ctx.globalAlpha = 1;
        }
    }
}

import { ThemeManager } from './theme';

interface Commit {
    id: string;
    shortId: string;
    message: string;
    author: { name: string; email: string };
    timestamp: number;
}

interface GraphNode {
    commitId: string;
    column: number;
    color: number;
}

interface GraphEdge {
    fromCommitId: string;
    toCommitId: string;
    fromColumn: number;
    toColumn: number;
    color: number;
}

interface Branch {
    name: string;
    isRemote: boolean;
    isHead: boolean;
    commitId: string;
}

interface Tag {
    name: string;
    commitId: string;
}

interface GraphData {
    commits: Commit[];
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    branches?: Branch[];
    tags?: Tag[];
}

interface SendFn {
    (type: string, payload?: unknown): void;
}

const ROW_HEIGHT = 24;
const COL_WIDTH = 16;
const DOT_RADIUS = 4;
const GRAPH_LEFT = 20;
const BADGE_HEIGHT = 16;
const BADGE_PAD = 6;
const BADGE_GAP = 4;
const BADGE_RADIUS = 3;

export class GraphRenderer {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly container: HTMLElement;
    private readonly theme: ThemeManager;
    private readonly a11yRoot: HTMLElement;
    private send: SendFn = () => {};

    private commits: Commit[] = [];
    private nodeMap = new Map<string, GraphNode>();
    private edges: GraphEdge[] = [];
    private branchMap = new Map<string, Branch[]>();
    private tagMap = new Map<string, Tag[]>();
    private maxColumn = 0;

    private selectedIndex = -1;
    private hoverIndex = -1;
    private rafId: number | null = null;
    private scrollRafId: number | null = null;

    constructor(canvas: HTMLCanvasElement, theme: ThemeManager) {
        this.ctx = canvas.getContext('2d')!;
        this.container = canvas.parentElement!;
        this.theme = theme;

        // Accessibility DOM — visually hidden, screen-reader accessible
        this.a11yRoot = document.createElement('div');
        this.a11yRoot.setAttribute('role', 'grid');
        this.a11yRoot.setAttribute('aria-label', 'Commit list');
        this.a11yRoot.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)';
        this.container.appendChild(this.a11yRoot);

        this.container.addEventListener('scroll', () => this.onScroll());
        canvas.addEventListener('click', (e) => this.onClick(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.container.setAttribute('tabindex', '0');
        this.container.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('resize', () => this.resize());

        this.resize();
    }

    setSend(fn: SendFn): void {
        this.send = fn;
    }

    render(data: GraphData): void {
        this.commits = data.commits;
        this.edges = data.edges ?? [];
        this.nodeMap.clear();
        this.branchMap.clear();
        this.tagMap.clear();
        this.maxColumn = 0;

        if (data.nodes) {
            for (const n of data.nodes) {
                this.nodeMap.set(n.commitId, n);
                if (n.column > this.maxColumn) { this.maxColumn = n.column; }
            }
        }
        if (data.branches) {
            for (const b of data.branches) {
                const arr = this.branchMap.get(b.commitId);
                if (arr) { arr.push(b); } else { this.branchMap.set(b.commitId, [b]); }
            }
        }
        if (data.tags) {
            for (const t of data.tags) {
                const arr = this.tagMap.get(t.commitId);
                if (arr) { arr.push(t); } else { this.tagMap.set(t.commitId, [t]); }
            }
        }

        this.selectedIndex = -1;
        this.hoverIndex = -1;
        this.resize();
    }

    clearSelection(): void {
        this.selectedIndex = -1;
        this.scheduleRedraw();
    }

    private get textLeft(): number {
        return GRAPH_LEFT + (this.maxColumn + 2) * COL_WIDTH;
    }

    private get viewportHeight(): number {
        return this.container.clientHeight;
    }

    private get scrollTop(): number {
        return this.container.scrollTop;
    }

    private visibleRange(): [number, number] {
        const start = Math.floor(this.scrollTop / ROW_HEIGHT);
        const end = Math.min(start + Math.ceil(this.viewportHeight / ROW_HEIGHT) + 1, this.commits.length);
        return [Math.max(0, start), end];
    }

    resize(): void {
        const canvas = this.ctx.canvas;
        const dpr = window.devicePixelRatio || 1;
        const width = this.container.clientWidth;
        const totalHeight = this.commits.length * ROW_HEIGHT;

        canvas.width = width * dpr;
        canvas.height = this.viewportHeight * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${Math.max(totalHeight, this.viewportHeight)}px`;
        this.ctx.scale(dpr, dpr);
        this.scheduleRedraw();
    }

    private scheduleRedraw(): void {
        if (this.rafId !== null) { return; }
        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.draw();
        });
    }

    private onScroll(): void {
        if (this.scrollRafId !== null) { return; }
        this.scrollRafId = requestAnimationFrame(() => {
            this.scrollRafId = null;
            this.draw();
            this.updateA11y();
        });
    }

    // --- Hit testing ---

    private indexFromY(clientY: number): number {
        const rect = this.ctx.canvas.getBoundingClientRect();
        const y = clientY - rect.top + this.scrollTop;
        return Math.floor(y / ROW_HEIGHT);
    }

    private onClick(e: MouseEvent): void {
        const idx = this.indexFromY(e.clientY);
        if (idx < 0 || idx >= this.commits.length) { return; }
        this.selectedIndex = idx;
        this.scheduleRedraw();
        this.send('requestCommitDetail', { commitId: this.commits[idx].id });
    }

    private onMouseMove(e: MouseEvent): void {
        const idx = this.indexFromY(e.clientY);
        if (idx === this.hoverIndex) { return; }
        this.hoverIndex = (idx >= 0 && idx < this.commits.length) ? idx : -1;
        this.scheduleRedraw();
    }

    // --- Keyboard navigation ---

    private onKeyDown(e: KeyboardEvent): void {
        const len = this.commits.length;
        if (len === 0) { return; }

        let idx = this.selectedIndex;
        switch (e.key) {
            case 'ArrowDown': idx = Math.min(idx + 1, len - 1); break;
            case 'ArrowUp': idx = Math.max(idx - 1, 0); break;
            case 'Home': idx = 0; break;
            case 'End': idx = len - 1; break;
            case 'PageDown': idx = Math.min(idx + Math.floor(this.viewportHeight / ROW_HEIGHT), len - 1); break;
            case 'PageUp': idx = Math.max(idx - Math.floor(this.viewportHeight / ROW_HEIGHT), 0); break;
            case 'Enter':
                if (idx >= 0) { this.send('requestCommitDetail', { commitId: this.commits[idx].id }); }
                return;
            case 'Escape':
                this.selectedIndex = -1;
                this.send('closeCommitDetail');
                this.scheduleRedraw();
                return;
            default: return;
        }

        e.preventDefault();
        if (idx < 0) { idx = 0; }
        this.selectedIndex = idx;
        this.scrollIntoView(idx);
        this.scheduleRedraw();
    }

    private scrollIntoView(idx: number): void {
        const rowTop = idx * ROW_HEIGHT;
        const rowBottom = rowTop + ROW_HEIGHT;
        if (rowTop < this.scrollTop) {
            this.container.scrollTop = rowTop;
        } else if (rowBottom > this.scrollTop + this.viewportHeight) {
            this.container.scrollTop = rowBottom - this.viewportHeight;
        }
    }

    // --- Accessibility DOM ---

    private updateA11y(): void {
        const [start, end] = this.visibleRange();
        this.a11yRoot.innerHTML = '';
        for (let i = start; i < end; i++) {
            const c = this.commits[i];
            const row = document.createElement('div');
            row.setAttribute('role', 'row');
            row.setAttribute('aria-label', `${c.shortId} by ${c.author.name}: ${c.message}`);
            if (i === this.selectedIndex) { row.setAttribute('aria-selected', 'true'); }
            this.a11yRoot.appendChild(row);
        }
    }

    // --- Drawing ---

    private draw(): void {
        const { ctx, commits, theme } = this;
        if (commits.length === 0) { return; }

        const dpr = window.devicePixelRatio || 1;
        const width = ctx.canvas.width / dpr;
        const [visStart, visEnd] = this.visibleRange();
        const scrollY = this.scrollTop;
        const colors = theme.branchColors;
        const fg = theme.foreground;
        const hoverBg = theme.hoverBackground;

        ctx.save();
        ctx.clearRect(0, 0, width, this.viewportHeight);

        // Row highlights
        for (let i = visStart; i < visEnd; i++) {
            const y = i * ROW_HEIGHT - scrollY;
            if (i === this.selectedIndex) {
                ctx.fillStyle = theme.focusBorder;
                ctx.globalAlpha = 0.15;
                ctx.fillRect(0, y, width, ROW_HEIGHT);
                ctx.globalAlpha = 1;
            } else if (i === this.hoverIndex) {
                ctx.fillStyle = hoverBg || 'rgba(128,128,128,0.1)';
                ctx.fillRect(0, y, width, ROW_HEIGHT);
            }
        }

        // Edges — batch by color
        this.drawEdges(visStart, visEnd, scrollY, colors);

        // Dots and text
        const textLeft = this.textLeft;
        for (let i = visStart; i < visEnd; i++) {
            const commit = commits[i];
            const y = i * ROW_HEIGHT - scrollY + ROW_HEIGHT / 2;
            const node = this.nodeMap.get(commit.id);
            const col = node ? node.column : 0;
            const colorIdx = node ? node.color % colors.length : 0;

            // Dot
            const dotX = GRAPH_LEFT + col * COL_WIDTH;
            ctx.beginPath();
            ctx.fillStyle = colors[colorIdx];
            ctx.arc(dotX, y, DOT_RADIUS, 0, Math.PI * 2);
            ctx.fill();

            // Badges + text
            let x = textLeft;
            x = this.drawBadges(ctx, commit.id, x, y, colors);

            // Short SHA
            ctx.fillStyle = fg;
            ctx.globalAlpha = 0.7;
            ctx.font = '12px var(--vscode-editor-font-family, monospace)';
            ctx.fillText(commit.shortId, x, y + 4);
            x += ctx.measureText(commit.shortId).width + 10;

            // Message
            ctx.globalAlpha = 1;
            ctx.font = '13px var(--vscode-font-family, sans-serif)';
            ctx.fillText(commit.message, x, y + 4);
            x += ctx.measureText(commit.message).width + 14;

            // Author
            ctx.globalAlpha = 0.7;
            ctx.font = '12px var(--vscode-font-family, sans-serif)';
            if (x < width - 100) {
                ctx.fillText(commit.author.name, x, y + 4);
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    private drawEdges(visStart: number, visEnd: number, scrollY: number, colors: readonly string[]): void {
        const { ctx, edges, nodeMap, commits } = this;
        // Build commit index lookup
        const commitIdx = new Map<string, number>();
        for (let i = 0; i < commits.length; i++) { commitIdx.set(commits[i].id, i); }

        // Expand visible range for edges that cross viewport
        const edgeMargin = 2;
        const rangeStart = Math.max(0, visStart - edgeMargin);
        const rangeEnd = Math.min(commits.length, visEnd + edgeMargin);

        // Group edges by color
        const byColor = new Map<number, GraphEdge[]>();
        for (const edge of edges) {
            const fromIdx = commitIdx.get(edge.fromCommitId);
            const toIdx = commitIdx.get(edge.toCommitId);
            if (fromIdx === undefined || toIdx === undefined) { continue; }
            if (fromIdx > rangeEnd && toIdx > rangeEnd) { continue; }
            if (fromIdx < rangeStart && toIdx < rangeStart) { continue; }
            const arr = byColor.get(edge.color);
            if (arr) { arr.push(edge); } else { byColor.set(edge.color, [edge]); }
        }

        ctx.lineWidth = 2;
        for (const [colorIdx, group] of byColor) {
            ctx.beginPath();
            ctx.strokeStyle = colors[colorIdx % colors.length];
            for (const edge of group) {
                const fromRow = commitIdx.get(edge.fromCommitId)!;
                const toRow = commitIdx.get(edge.toCommitId)!;
                const fromX = GRAPH_LEFT + edge.fromColumn * COL_WIDTH;
                const toX = GRAPH_LEFT + edge.toColumn * COL_WIDTH;
                const fromY = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2 - scrollY;
                const toY = toRow * ROW_HEIGHT + ROW_HEIGHT / 2 - scrollY;

                ctx.moveTo(fromX, fromY);
                if (edge.fromColumn === edge.toColumn) {
                    ctx.lineTo(toX, toY);
                } else {
                    const cpOffsetY = ROW_HEIGHT / 2;
                    ctx.bezierCurveTo(fromX, fromY + cpOffsetY, toX, toY - cpOffsetY, toX, toY);
                }
            }
            ctx.stroke();
        }
    }

    private drawBadges(ctx: CanvasRenderingContext2D, commitId: string, startX: number, cy: number, colors: readonly string[]): number {
        let x = startX;
        const branches = this.branchMap.get(commitId);
        const tags = this.tagMap.get(commitId);
        if (!branches && !tags) { return x; }

        ctx.font = '11px var(--vscode-font-family, sans-serif)';
        const by = cy - BADGE_HEIGHT / 2;

        if (branches) {
            for (const b of branches) {
                const node = this.nodeMap.get(commitId);
                const colorIdx = node ? node.color % colors.length : 0;
                const label = b.name;
                const tw = ctx.measureText(label).width;
                const bw = tw + BADGE_PAD * 2;

                // Filled badge
                ctx.fillStyle = colors[colorIdx];
                this.roundRect(ctx, x, by, bw, BADGE_HEIGHT, BADGE_RADIUS);
                ctx.fill();

                // Label
                ctx.fillStyle = '#fff';
                if (b.isHead) { ctx.font = 'bold 11px var(--vscode-font-family, sans-serif)'; }
                ctx.fillText(label, x + BADGE_PAD, cy + 4);
                if (b.isHead) { ctx.font = '11px var(--vscode-font-family, sans-serif)'; }

                x += bw + BADGE_GAP;
            }
        }

        if (tags) {
            for (const t of tags) {
                const label = t.name;
                const tw = ctx.measureText(label).width;
                const bw = tw + BADGE_PAD * 2;

                // Outlined badge
                ctx.strokeStyle = this.theme.foreground;
                ctx.globalAlpha = 0.6;
                ctx.lineWidth = 1;
                this.roundRect(ctx, x, by, bw, BADGE_HEIGHT, BADGE_RADIUS);
                ctx.stroke();

                ctx.fillStyle = this.theme.foreground;
                ctx.fillText(label, x + BADGE_PAD, cy + 4);
                ctx.globalAlpha = 1;
                ctx.lineWidth = 2;

                x += bw + BADGE_GAP;
            }
        }

        return x + BADGE_GAP;
    }

    private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }
}

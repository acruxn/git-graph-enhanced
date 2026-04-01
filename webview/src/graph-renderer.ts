import { replaceEmoji } from './emoji';
import { ThemeManager } from './theme';

interface Commit {
    id: string;
    shortId: string;
    message: string;
    author: { name: string; email: string };
    parentIds: string[];
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

interface StashEntry {
    index: number;
    message: string;
    commitId: string;
}

interface GraphData {
    commits: Commit[];
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    branches?: Branch[];
    tags?: Tag[];
    stashes?: StashEntry[];
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
const HEADER_HEIGHT = 20;

export class GraphRenderer {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly container: HTMLElement;
    private readonly theme: ThemeManager;
    private readonly a11yRoot: HTMLElement;
    private readonly tooltip: HTMLElement;
    private send: SendFn = () => {};
    private onFocusSearch: (() => void) | null = null;
    private config: { showDate: boolean; showAuthor: boolean; graphStyle: 'curved' | 'angular' | 'straight' } = { showDate: true, showAuthor: true, graphStyle: 'curved' };

    private commits: Commit[] = [];
    private nodeMap = new Map<string, GraphNode>();
    private edges: GraphEdge[] = [];
    private branchMap = new Map<string, Branch[]>();
    private tagMap = new Map<string, Tag[]>();
    private stashMap = new Map<string, StashEntry>();
    private maxColumn = 0;

    private selectedIndex = -1;
    private hoverIndex = -1;
    private compareIndex = -1;
    private highlightedBranch = new Set<string>();
    private filteredIndices: Set<number> | null = null;
    private rafId: number | null = null;
    private scrollRafId: number | null = null;
    private tooltipHideTimer: ReturnType<typeof setTimeout> | undefined;
    private activeContextMenu: HTMLElement | null = null;

    constructor(canvas: HTMLCanvasElement, theme: ThemeManager) {
        this.ctx = canvas.getContext('2d')!;
        this.container = canvas.parentElement!;
        this.theme = theme;

        // Accessibility DOM
        this.a11yRoot = document.createElement('div');
        this.a11yRoot.setAttribute('role', 'grid');
        this.a11yRoot.setAttribute('aria-label', 'Commit list');
        this.a11yRoot.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)';
        this.container.appendChild(this.a11yRoot);

        // Tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.id = 'tooltip';
        this.tooltip.className = 'graph-tooltip';
        document.body.appendChild(this.tooltip);

        this.container.addEventListener('scroll', () => this.onScroll());
        canvas.addEventListener('click', (e) => this.onClick(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseleave', () => this.hideTooltip());
        canvas.addEventListener('contextmenu', (e) => this.onContextMenu(e));
        this.container.setAttribute('tabindex', '0');
        this.container.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('resize', () => this.resize());

        this.resize();
    }

    setSend(fn: SendFn): void {
        this.send = fn;
    }

    setOnFocusSearch(fn: () => void): void {
        this.onFocusSearch = fn;
    }

    exportAsDataUrl(): string {
        return this.ctx.canvas.toDataURL('image/png');
    }

    setConfig(cfg: { showDate: boolean; showAuthor: boolean; graphStyle?: 'curved' | 'angular' | 'straight' }): void {
        this.config = { ...this.config, ...cfg };
        this.scheduleRedraw();
    }

    getCommits(): Commit[] {
        return this.commits;
    }

    setFilteredIndices(indices: number[] | null): void {
        this.filteredIndices = indices ? new Set(indices) : null;
        this.scheduleRedraw();
    }

    render(data: GraphData): void {
        this.commits = data.commits;
        this.edges = data.edges ?? [];
        this.nodeMap.clear();
        this.branchMap.clear();
        this.tagMap.clear();
        this.stashMap.clear();
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
        if (data.stashes) {
            for (const s of data.stashes) {
                this.stashMap.set(s.commitId, s);
            }
        }

        this.selectedIndex = -1;
        this.hoverIndex = -1;
        this.resize();
    }

    clearSelection(): void {
        this.selectedIndex = -1;
        this.highlightedBranch.clear();
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

        if ((e.ctrlKey || e.metaKey) && this.selectedIndex >= 0 && idx !== this.selectedIndex) {
            this.compareIndex = idx;
            this.send('compareCommits', {
                commitId1: this.commits[this.selectedIndex].id,
                commitId2: this.commits[idx].id,
            });
            this.scheduleRedraw();
            return;
        }

        this.compareIndex = -1;
        this.selectedIndex = idx;
        this.updateBranchHighlight();
        this.scheduleRedraw();
        this.send('requestCommitDetail', { commitId: this.commits[idx].id });
    }

    private onMouseMove(e: MouseEvent): void {
        const idx = this.indexFromY(e.clientY);
        if (idx === this.hoverIndex) { return; }
        this.hoverIndex = (idx >= 0 && idx < this.commits.length) ? idx : -1;
        this.scheduleRedraw();
        this.updateTooltip(e, this.hoverIndex);
    }

    // --- Tooltip ---

    private updateTooltip(e: MouseEvent, idx: number): void {
        clearTimeout(this.tooltipHideTimer);
        if (idx < 0 || idx >= this.commits.length) {
            this.hideTooltip();
            return;
        }
        const commit = this.commits[idx];
        const branches = this.branchMap.get(commit.id);
        const tags = this.tagMap.get(commit.id);
        if (!branches && !tags) {
            this.hideTooltip();
            return;
        }
        const parts: string[] = [];
        if (branches) { parts.push(...branches.map(b => (b.isHead ? '\u2022 ' : '') + b.name)); }
        if (tags) { parts.push(...tags.map(t => '\ud83c\udff7 ' + t.name)); }
        this.tooltip.textContent = parts.join('\n');
        this.tooltip.style.whiteSpace = 'pre';
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = `${e.clientX + 12}px`;
        this.tooltip.style.top = `${e.clientY + 12}px`;
    }

    private hideTooltip(): void {
        clearTimeout(this.tooltipHideTimer);
        this.tooltipHideTimer = setTimeout(() => {
            this.tooltip.style.display = 'none';
        }, 150);
    }

    // --- Context menu ---

    private onContextMenu(e: MouseEvent): void {
        e.preventDefault();
        this.closeContextMenu();
        const idx = this.indexFromY(e.clientY);
        if (idx < 0 || idx >= this.commits.length) { return; }
        const commit = this.commits[idx];
        this.selectedIndex = idx;
        this.scheduleRedraw();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;

        const items: [string, () => void][] = [
            ['Copy SHA', () => this.send('copyToClipboard', { text: commit.id })],
            ['Copy Short SHA', () => this.send('copyToClipboard', { text: commit.shortId })],
            ['View Diff', () => this.send('openDiff', { commitId: commit.id })],
            ['Open Terminal', () => this.send('openTerminal')],
        ];

        for (const [label, action] of items) {
            const item = document.createElement('div');
            item.className = 'context-menu-item';
            item.textContent = label;
            item.addEventListener('click', () => { action(); this.closeContextMenu(); });
            menu.appendChild(item);
        }

        const branches = this.branchMap.get(commit.id);
        if (branches) {
            for (const b of branches) {
                if (!b.isRemote) {
                    const item = document.createElement('div');
                    item.className = 'context-menu-item';
                    item.textContent = `Delete branch: ${b.name}`;
                    item.addEventListener('click', () => {
                        this.send('deleteBranches', { branches: [b.name] });
                        this.closeContextMenu();
                    });
                    menu.appendChild(item);
                }
            }
        }

        document.body.appendChild(menu);
        this.activeContextMenu = menu;

        const closeOnOutside = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                this.closeContextMenu();
                document.removeEventListener('click', closeOnOutside);
            }
        };
        // Defer to avoid immediate close from the same click
        requestAnimationFrame(() => document.addEventListener('click', closeOnOutside));
    }

    private closeContextMenu(): void {
        if (this.activeContextMenu) {
            this.activeContextMenu.remove();
            this.activeContextMenu = null;
        }
    }

    // --- Keyboard navigation ---

    private onKeyDown(e: KeyboardEvent): void {
        const len = this.commits.length;
        const mod = e.metaKey || e.ctrlKey;

        // Ctrl+F / Cmd+F → focus search
        if (mod && e.key === 'f') {
            e.preventDefault();
            this.onFocusSearch?.();
            return;
        }

        // Ctrl+C / Cmd+C → copy short SHA of selected commit
        if (mod && e.key === 'c' && this.selectedIndex >= 0) {
            e.preventDefault();
            this.send('copyToClipboard', { text: this.commits[this.selectedIndex].shortId });
            return;
        }

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
                this.closeContextMenu();
                this.selectedIndex = -1;
                this.highlightedBranch.clear();
                this.send('closeCommitDetail');
                this.scheduleRedraw();
                return;
            default: return;
        }

        e.preventDefault();
        if (idx < 0) { idx = 0; }
        this.selectedIndex = idx;
        this.updateBranchHighlight();
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

    // --- Branch highlight ---

    private updateBranchHighlight(): void {
        this.highlightedBranch.clear();
        if (this.selectedIndex < 0) { return; }
        const selected = this.commits[this.selectedIndex];
        const node = this.nodeMap.get(selected.id);
        if (!node) { return; }
        const targetColor = node.color;
        const visited = new Set<string>();
        const queue = [selected.id];
        while (queue.length > 0) {
            const id = queue.pop()!;
            if (visited.has(id)) { continue; }
            visited.add(id);
            const n = this.nodeMap.get(id);
            if (!n || n.color !== targetColor) { continue; }
            this.highlightedBranch.add(id);
            for (const edge of this.edges) {
                if (edge.color !== targetColor) { continue; }
                if (edge.fromCommitId === id) { queue.push(edge.toCommitId); }
                if (edge.toCommitId === id) { queue.push(edge.fromCommitId); }
            }
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
            } else if (i === this.compareIndex) {
                ctx.fillStyle = colors[1];
                ctx.globalAlpha = 0.12;
                ctx.fillRect(0, y, width, ROW_HEIGHT);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = colors[1];
                ctx.setLineDash([4, 3]);
                ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_HEIGHT - 1);
                ctx.setLineDash([]);
            } else if (i === this.hoverIndex) {
                ctx.fillStyle = hoverBg || 'rgba(128,128,128,0.1)';
                ctx.fillRect(0, y, width, ROW_HEIGHT);
            }
        }

        // Edges — batch by color
        this.drawEdges(visStart, visEnd, scrollY, colors);

        // Dots and text
        const textLeft = this.textLeft;
        const hasHighlight = this.highlightedBranch.size > 0;
        const hasFilter = this.filteredIndices !== null;
        for (let i = visStart; i < visEnd; i++) {
            const commit = commits[i];
            const y = i * ROW_HEIGHT - scrollY + ROW_HEIGHT / 2;
            const node = this.nodeMap.get(commit.id);
            const col = node ? node.column : 0;
            const colorIdx = node ? node.color % colors.length : 0;
            const branchDimmed = hasHighlight && !this.highlightedBranch.has(commit.id);
            const filterDimmed = hasFilter && !this.filteredIndices!.has(i);
            const dimAlpha = filterDimmed ? 0.2 : branchDimmed ? 0.3 : 1;

            // Dot
            const dotX = GRAPH_LEFT + col * COL_WIDTH;
            const isMerge = commit.parentIds.length > 1;
            ctx.beginPath();
            ctx.globalAlpha = dimAlpha;
            ctx.arc(dotX, y, DOT_RADIUS, 0, Math.PI * 2);
            if (isMerge) {
                ctx.strokeStyle = colors[colorIdx];
                ctx.lineWidth = 2;
                ctx.stroke();
            } else {
                ctx.fillStyle = colors[colorIdx];
                ctx.fill();
            }
            ctx.globalAlpha = 1;

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
            ctx.globalAlpha = isMerge ? 0.5 : 1;
            ctx.font = '13px var(--vscode-font-family, sans-serif)';
            const displayMsg = replaceEmoji(commit.message);
            ctx.fillText(displayMsg, x, y + 4);
            x += ctx.measureText(displayMsg).width + 14;

            // Date
            if (this.config.showDate) {
                ctx.globalAlpha = 0.7;
                ctx.font = '12px var(--vscode-font-family, sans-serif)';
                const date = new Date(commit.timestamp * 1000).toLocaleDateString();
                ctx.fillText(date, x, y + 4);
                x += ctx.measureText(date).width + 14;
            }

            // Author
            if (this.config.showAuthor) {
                ctx.globalAlpha = isMerge ? 0.4 : 0.7;
                ctx.font = '12px var(--vscode-font-family, sans-serif)';
                if (x < width - 100) {
                    ctx.fillText(commit.author.name, x, y + 4);
                }
            }
            ctx.globalAlpha = 1;
        }

        this.drawHeader(width);
        ctx.restore();
    }

    private drawHeader(width: number): void {
        const { ctx, theme } = this;

        ctx.fillStyle = theme.background || '#1e1e1e';
        ctx.fillRect(0, 0, width, HEADER_HEIGHT);

        ctx.strokeStyle = 'rgba(128,128,128,0.3)';
        ctx.beginPath();
        ctx.moveTo(0, HEADER_HEIGHT);
        ctx.lineTo(width, HEADER_HEIGHT);
        ctx.stroke();

        ctx.fillStyle = theme.foreground;
        ctx.globalAlpha = 0.6;
        ctx.font = 'bold 11px var(--vscode-font-family, sans-serif)';
        ctx.fillText('Graph', GRAPH_LEFT, HEADER_HEIGHT - 6);
        ctx.fillText('SHA', this.textLeft, HEADER_HEIGHT - 6);
        ctx.fillText('Message', this.textLeft + 80, HEADER_HEIGHT - 6);
        if (this.config.showAuthor) {
            ctx.fillText('Author', width - 250, HEADER_HEIGHT - 6);
        }
        if (this.config.showDate) {
            ctx.fillText('Date', width - 120, HEADER_HEIGHT - 6);
        }
        ctx.globalAlpha = 1;
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
        const hasHighlight = this.highlightedBranch.size > 0;
        for (const [colorIdx, group] of byColor) {
            ctx.beginPath();
            ctx.strokeStyle = colors[colorIdx % colors.length];
            // Separate highlighted vs non-highlighted edges for different line widths
            const highlighted: GraphEdge[] = [];
            const dimmed: GraphEdge[] = [];
            for (const edge of group) {
                if (hasHighlight && this.highlightedBranch.has(edge.fromCommitId) && this.highlightedBranch.has(edge.toCommitId)) {
                    highlighted.push(edge);
                } else {
                    dimmed.push(edge);
                }
            }

            // Draw dimmed edges
            if (dimmed.length > 0) {
                ctx.beginPath();
                ctx.globalAlpha = hasHighlight ? 0.3 : 1;
                ctx.lineWidth = 2;
                for (const edge of dimmed) {
                    this.traceEdge(ctx, edge, commitIdx, scrollY);
                }
                ctx.stroke();
            }

            // Draw highlighted edges
            if (highlighted.length > 0) {
                ctx.beginPath();
                ctx.globalAlpha = 1;
                ctx.lineWidth = 3;
                for (const edge of highlighted) {
                    this.traceEdge(ctx, edge, commitIdx, scrollY);
                }
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
        }
    }

    private traceEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge, commitIdx: Map<string, number>, scrollY: number): void {
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
            const style = this.config.graphStyle;
            if (style === 'straight') {
                ctx.lineTo(toX, toY);
            } else if (style === 'angular') {
                const midY = (fromY + toY) / 2;
                ctx.lineTo(fromX, midY);
                ctx.lineTo(toX, midY);
                ctx.lineTo(toX, toY);
            } else {
                const cpOffsetY = ROW_HEIGHT / 2;
                ctx.bezierCurveTo(fromX, fromY + cpOffsetY, toX, toY - cpOffsetY, toX, toY);
            }
        }
    }

    private drawBadges(ctx: CanvasRenderingContext2D, commitId: string, startX: number, cy: number, colors: readonly string[]): number {
        let x = startX;
        const branches = this.branchMap.get(commitId);
        const tags = this.tagMap.get(commitId);
        const stash = this.stashMap.get(commitId);
        if (!branches && !tags && !stash) { return x; }

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

        if (stash) {
            const label = `📦 stash@{${stash.index}}`;
            const tw = ctx.measureText(label).width;
            const bw = tw + BADGE_PAD * 2;

            ctx.strokeStyle = this.theme.foreground;
            ctx.globalAlpha = 0.5;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 2]);
            this.roundRect(ctx, x, by, bw, BADGE_HEIGHT, BADGE_RADIUS);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = this.theme.foreground;
            ctx.fillText(label, x + BADGE_PAD, cy + 4);
            ctx.globalAlpha = 1;
            ctx.lineWidth = 2;

            x += bw + BADGE_GAP;
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

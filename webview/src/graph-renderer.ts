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
    state?: string;
}

interface SendFn {
    (type: string, payload?: unknown): void;
}

export const ROW_HEIGHT = 24;
const COL_WIDTH = 16;
const DOT_RADIUS = 4;
const GRAPH_LEFT = 20;
const BADGE_HEIGHT = 16;
const BADGE_PAD = 6;
const BADGE_GAP = 4;
const BADGE_RADIUS = 3;
const HEADER_HEIGHT = 20;
const AVATAR_RADIUS = 8;

const AVATAR_COLORS = ['#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd', '#56b6c2', '#e5c07b', '#be5046'];

function getAuthorInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) { return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(); }
    return name.slice(0, 2).toUpperCase();
}

function getAuthorColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) { hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0; }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export class GraphRenderer {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly container: HTMLElement;
    private readonly theme: ThemeManager;
    private readonly a11yRoot: HTMLElement;
    private readonly tooltip: HTMLElement;
    private readonly stateBanner: HTMLElement;
    private send: SendFn = () => {};
    private onFocusSearch: (() => void) | null = null;
    private onCloseDetail: (() => void) | null = null;
    private config: { showDate: boolean; showAuthor: boolean; graphStyle: 'curved' | 'angular' | 'straight'; accessibilityMode: boolean } = { showDate: true, showAuthor: true, graphStyle: 'curved', accessibilityMode: false };

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
    private spacer: HTMLElement | null = null;
    private expandedHeight = 0;
    private columnWidths = { graph: 60, sha: 80, author: 160, date: 120 };
    private dragCol: string | null = null;
    private dragStartX = 0;
    private dragStartWidth = 0;

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

        // State banner (merge/rebase/cherry-pick in progress)
        this.stateBanner = document.createElement('div');
        this.stateBanner.className = 'state-banner';
        this.stateBanner.style.display = 'none';
        this.container.parentElement?.insertBefore(this.stateBanner, this.container);

        this.container.addEventListener('scroll', () => this.onScroll());
        canvas.addEventListener('click', (e) => this.onClick(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseleave', () => this.hideTooltip());
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
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

    setOnCloseDetail(fn: () => void): void {
        this.onCloseDetail = fn;
    }

    exportAsDataUrl(): string {
        return this.ctx.canvas.toDataURL('image/png');
    }

    getSelectedRowTop(): number {
        return this.selectedIndex >= 0 ? this.rowY(this.selectedIndex) : 0;
    }

    setExpandedHeight(h: number): void {
        this.expandedHeight = h;
        this.resize();
    }

    private rowY(index: number): number {
        const base = HEADER_HEIGHT + index * ROW_HEIGHT;
        if (this.selectedIndex >= 0 && this.expandedHeight > 0 && index > this.selectedIndex) {
            return base + this.expandedHeight;
        }
        return base;
    }

    private get totalHeight(): number {
        return HEADER_HEIGHT + this.commits.length * ROW_HEIGHT + (this.selectedIndex >= 0 ? this.expandedHeight : 0);
    }

    setConfig(cfg: { showDate: boolean; showAuthor: boolean; graphStyle?: 'curved' | 'angular' | 'straight'; accessibilityMode?: boolean; columnWidths?: Record<string, number> }): void {
        this.config = { ...this.config, ...cfg };
        if (cfg.columnWidths) {
            Object.assign(this.columnWidths, cfg.columnWidths);
        }
        this.scheduleRedraw();
    }

    getCommits(): Commit[] {
        return this.commits;
    }

    getAllBranches(): Branch[] {
        const all: Branch[] = [];
        for (const arr of this.branchMap.values()) {
            all.push(...arr);
        }
        return all;
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

        this.updateStateBanner(data.state);
        this.selectedIndex = -1;
        this.expandedHeight = 0;
        this.hoverIndex = -1;
        this.resize();
    }

    private updateStateBanner(state?: string): void {
        if (state && state !== 'clean') {
            const labels: Record<string, string> = {
                merging: 'Merge in progress',
                rebasing: 'Rebase in progress',
                'cherry-picking': 'Cherry-pick in progress',
            };
            this.stateBanner.textContent = '';
            const text = document.createElement('span');
            text.textContent = labels[state] ?? `${state} in progress`;
            this.stateBanner.appendChild(text);
            const btn = document.createElement('button');
            btn.textContent = 'Abort';
            btn.className = 'state-banner-abort';
            btn.addEventListener('click', () => this.send('abortOperation'));
            this.stateBanner.appendChild(btn);
            this.stateBanner.style.display = 'flex';
        } else {
            this.stateBanner.style.display = 'none';
        }
    }

    clearSelection(): void {
        this.selectedIndex = -1;
        this.expandedHeight = 0;
        this.highlightedBranch.clear();
        this.resize();
    }

    private get textLeft(): number {
        return GRAPH_LEFT + (this.maxColumn + 2) * COL_WIDTH;
    }

    private getColumnPositions(width: number): { sha: number; message: number; author: number; date: number } {
        const sha = this.textLeft;
        const message = sha + this.columnWidths.sha;
        const date = width - this.columnWidths.date;
        const author = date - this.columnWidths.author;
        return { sha, message, author, date };
    }

    private getColumnBorders(width: number): Array<{ x: number; col: string }> {
        const pos = this.getColumnPositions(width);
        const borders: Array<{ x: number; col: string }> = [
            { x: pos.sha, col: 'graph' },
            { x: pos.message, col: 'sha' },
        ];
        if (this.config.showAuthor) { borders.push({ x: pos.author, col: 'author' }); }
        if (this.config.showDate) { borders.push({ x: pos.date, col: 'date' }); }
        return borders;
    }

    private get viewportHeight(): number {
        return this.container.clientHeight;
    }

    private get scrollTop(): number {
        return this.container.scrollTop;
    }

    private visibleRange(): [number, number] {
        const scrollY = this.scrollTop;
        const vpBottom = scrollY + this.viewportHeight;
        // Find start: account for header offset
        let start = Math.floor(Math.max(0, scrollY - HEADER_HEIGHT) / ROW_HEIGHT);
        if (this.selectedIndex >= 0 && this.expandedHeight > 0 && start > this.selectedIndex) {
            start = Math.floor(Math.max(0, scrollY - HEADER_HEIGHT - this.expandedHeight) / ROW_HEIGHT);
        }
        start = Math.max(0, start);
        // Find end
        let end = start;
        while (end < this.commits.length && this.rowY(end) < vpBottom) {
            end++;
        }
        end = Math.min(end + 1, this.commits.length);
        return [start, end];
    }

    resize(): void {
        const canvas = this.ctx.canvas;
        const dpr = window.devicePixelRatio || 1;
        const width = this.container.clientWidth;
        const totalHeight = this.totalHeight;

        // Spacer creates scrollable area
        if (!this.spacer) {
            this.spacer = document.createElement('div');
            this.spacer.style.width = '1px';
            this.spacer.style.pointerEvents = 'none';
            this.container.appendChild(this.spacer);
        }
        this.spacer.style.height = `${totalHeight}px`;

        // Canvas is fixed to viewport size, positioned at top
        canvas.style.position = 'sticky';
        canvas.style.top = '0';
        canvas.style.width = `${width}px`;
        canvas.style.height = `${this.container.clientHeight}px`;

        // Backing store matches CSS size × DPR
        canvas.width = width * dpr;
        canvas.height = this.container.clientHeight * dpr;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
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
        const y = clientY - rect.top + this.scrollTop - HEADER_HEIGHT;
        if (y < 0) { return -1; }
        if (this.selectedIndex >= 0 && this.expandedHeight > 0) {
            const gapStart = (this.selectedIndex + 1) * ROW_HEIGHT;
            const gapEnd = gapStart + this.expandedHeight;
            if (y >= gapStart && y < gapEnd) {
                return this.selectedIndex;
            }
            if (y >= gapEnd) {
                return Math.floor((y - this.expandedHeight) / ROW_HEIGHT);
            }
        }
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
        this.expandedHeight = 0;
        this.updateBranchHighlight();
        this.resize();
        this.send('requestCommitDetail', { commitId: this.commits[idx].id });
    }

    private onMouseMove(e: MouseEvent): void {
        if (this.dragCol) {
            const delta = e.clientX - this.dragStartX;
            const col = this.dragCol as keyof typeof this.columnWidths;
            // For author/date, dragging left increases width
            const newWidth = col === 'author' || col === 'date'
                ? Math.max(40, this.dragStartWidth - delta)
                : Math.max(40, this.dragStartWidth + delta);
            this.columnWidths[col] = newWidth;
            this.scheduleRedraw();
            return;
        }

        const rect = this.ctx.canvas.getBoundingClientRect();
        const localY = e.clientY - rect.top;
        if (localY < HEADER_HEIGHT) {
            const localX = e.clientX - rect.left;
            const dpr = window.devicePixelRatio || 1;
            const width = this.ctx.canvas.width / dpr;
            const borders = this.getColumnBorders(width);
            const near = borders.some(b => Math.abs(localX - b.x) <= 3);
            this.ctx.canvas.style.cursor = near ? 'col-resize' : 'default';
            return;
        }
        this.ctx.canvas.style.cursor = 'default';

        const idx = this.indexFromY(e.clientY);
        if (idx === this.hoverIndex) { return; }
        this.hoverIndex = (idx >= 0 && idx < this.commits.length) ? idx : -1;
        this.scheduleRedraw();
        this.updateTooltip(e, this.hoverIndex);
    }

    private onMouseDown(e: MouseEvent): void {
        const rect = this.ctx.canvas.getBoundingClientRect();
        const localY = e.clientY - rect.top;
        if (localY >= HEADER_HEIGHT) { return; }

        const localX = e.clientX - rect.left;
        const dpr = window.devicePixelRatio || 1;
        const width = this.ctx.canvas.width / dpr;
        const borders = this.getColumnBorders(width);
        for (const b of borders) {
            if (Math.abs(localX - b.x) <= 3) {
                e.preventDefault();
                this.dragCol = b.col;
                this.dragStartX = e.clientX;
                this.dragStartWidth = this.columnWidths[b.col as keyof typeof this.columnWidths];
                const onMove = (ev: MouseEvent) => this.onMouseMove(ev);
                const onUp = () => {
                    this.dragCol = null;
                    this.ctx.canvas.style.cursor = 'default';
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    this.send('saveColumnWidths', { columnWidths: { ...this.columnWidths } });
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
                return;
            }
        }
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
                if (!b.isRemote && !b.isHead) {
                    const prItem = document.createElement('div');
                    prItem.className = 'context-menu-item';
                    prItem.textContent = `Create PR: ${b.name}`;
                    prItem.addEventListener('click', () => {
                        this.send('createPr', { branchName: b.name });
                        this.closeContextMenu();
                    });
                    menu.appendChild(prItem);
                }
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
                this.expandedHeight = 0;
                this.highlightedBranch.clear();
                this.onCloseDetail?.();
                this.resize();
                return;
            case 's':
                if (mod) {
                    e.preventDefault();
                    const dir = e.shiftKey ? -1 : 1;
                    const start = this.selectedIndex + dir;
                    for (let i = start; i >= 0 && i < len; i += dir) {
                        if (this.stashMap.has(this.commits[i].id)) {
                            this.selectedIndex = i;
                            this.scrollIntoView(i);
                            this.scheduleRedraw();
                            break;
                        }
                    }
                }
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
        const rowTop = this.rowY(idx);
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
            const y = this.rowY(i) - scrollY;

            // Branch color tint
            const tintNode = this.nodeMap.get(commits[i].id);
            if (tintNode) {
                ctx.fillStyle = colors[tintNode.color % colors.length];
                ctx.globalAlpha = 0.05;
                ctx.fillRect(0, y, width, ROW_HEIGHT);
                ctx.globalAlpha = 1;
            }

            if (i === this.selectedIndex) {
                if (this.config.accessibilityMode) {
                    ctx.strokeStyle = theme.focusBorder;
                    ctx.lineWidth = 3;
                    ctx.strokeRect(1.5, y + 1.5, width - 3, ROW_HEIGHT - 3);
                    ctx.lineWidth = 2;
                } else {
                    ctx.fillStyle = theme.focusBorder;
                    ctx.globalAlpha = 0.15;
                    ctx.fillRect(0, y, width, ROW_HEIGHT);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = theme.focusBorder;
                    ctx.fillRect(0, y, 3, ROW_HEIGHT);
                }
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
                ctx.globalAlpha = 0.08;
                ctx.fillRect(0, y, width, ROW_HEIGHT);
                ctx.globalAlpha = 1;
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
            const y = this.rowY(i) - scrollY + ROW_HEIGHT / 2;
            const node = this.nodeMap.get(commit.id);
            const col = node ? node.column : 0;
            const colorIdx = node ? node.color % colors.length : 0;
            const branchDimmed = hasHighlight && !this.highlightedBranch.has(commit.id);
            const filterDimmed = hasFilter && !this.filteredIndices!.has(i);
            const dimAlpha = filterDimmed ? 0.2 : branchDimmed ? 0.3 : 1;

            // Dot
            const dotX = GRAPH_LEFT + col * COL_WIDTH;
            const isMerge = commit.parentIds.length > 1;
            const isRoot = commit.parentIds.length === 0;
            ctx.globalAlpha = dimAlpha;
            if (this.config.accessibilityMode) {
                const r = DOT_RADIUS;
                if (isMerge) {
                    // Diamond for merge
                    ctx.beginPath();
                    ctx.moveTo(dotX, y - r);
                    ctx.lineTo(dotX + r, y);
                    ctx.lineTo(dotX, y + r);
                    ctx.lineTo(dotX - r, y);
                    ctx.closePath();
                    ctx.fillStyle = colors[colorIdx];
                    ctx.fill();
                } else if (isRoot) {
                    // Square for root
                    ctx.fillStyle = colors[colorIdx];
                    ctx.fillRect(dotX - r, y - r, r * 2, r * 2);
                } else {
                    // Circle for normal
                    ctx.beginPath();
                    ctx.arc(dotX, y, r, 0, Math.PI * 2);
                    ctx.fillStyle = colors[colorIdx];
                    ctx.fill();
                }
                // Branch label (first 3 chars) next to dot
                const branches = this.branchMap.get(commit.id);
                if (branches && branches.length > 0) {
                    ctx.font = 'bold 8px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = colors[colorIdx];
                    ctx.fillText(branches[0].name.slice(0, 3), dotX + r + 2, y + 3);
                }
            } else {
                ctx.beginPath();
                ctx.arc(dotX, y, DOT_RADIUS, 0, Math.PI * 2);
                if (isMerge) {
                    ctx.strokeStyle = colors[colorIdx];
                    ctx.lineWidth = 2;
                    ctx.stroke();
                } else {
                    ctx.fillStyle = colors[colorIdx];
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;

            // Badges + text
            let x = textLeft;
            x = this.drawBadges(ctx, commit.id, x, y, colors);

            const { sha: shaCol, message: messageCol, author: authorCol, date: dateCol } = this.getColumnPositions(width);

            // Short SHA
            ctx.fillStyle = fg;
            ctx.globalAlpha = 0.7;
            ctx.font = '12px Menlo, Consolas, monospace';
            ctx.fillText(commit.shortId, shaCol, y + 4);

            // Message (truncate with ellipsis if overlapping author/date column)
            ctx.globalAlpha = isMerge ? 0.5 : 1;
            ctx.font = '13px system-ui, -apple-system, sans-serif';
            const displayMsg = replaceEmoji(commit.message);
            const msgMaxWidth = (this.config.showAuthor ? authorCol : this.config.showDate ? dateCol : width) - messageCol - 10;
            if (msgMaxWidth > 0) {
                let msg = displayMsg;
                if (ctx.measureText(msg).width > msgMaxWidth) {
                    while (msg.length > 0 && ctx.measureText(msg + '…').width > msgMaxWidth) { msg = msg.slice(0, -1); }
                    msg += '…';
                }
                ctx.fillText(msg, messageCol, y + 4);
            }

            // Author
            if (this.config.showAuthor) {
                ctx.globalAlpha = isMerge ? 0.4 : 0.7;
                // Avatar circle
                const avatarColor = getAuthorColor(commit.author.name);
                ctx.fillStyle = avatarColor;
                ctx.beginPath();
                ctx.arc(authorCol + AVATAR_RADIUS, y, AVATAR_RADIUS, 0, Math.PI * 2);
                ctx.fill();
                // Initials
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
                const initials = getAuthorInitials(commit.author.name);
                const tw = ctx.measureText(initials).width;
                ctx.fillText(initials, authorCol + AVATAR_RADIUS - tw / 2, y + 3);
                // Name
                ctx.fillStyle = fg;
                ctx.font = '12px system-ui, -apple-system, sans-serif';
                ctx.fillText(commit.author.name, authorCol + AVATAR_RADIUS * 2 + 6, y + 4);
            }

            // Date
            if (this.config.showDate) {
                ctx.globalAlpha = 0.7;
                ctx.font = '12px system-ui, -apple-system, sans-serif';
                ctx.fillText(this.formatDate(commit.timestamp, width - dateCol), dateCol, y + 4);
            }
            ctx.globalAlpha = 1;
        }

        this.drawHeader(width);
        ctx.restore();
    }

    private formatDate(timestamp: number, availableWidth: number): string {
        const d = new Date(timestamp * 1000);
        const diffMs = Date.now() - d.getTime();
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffDays === 0) {
            const hours = Math.floor(diffMs / 3600000);
            if (hours === 0) { return `${Math.max(1, Math.floor(diffMs / 60000))}m ago`; }
            return `${hours}h ago`;
        }
        if (diffDays === 1) { return 'Yesterday'; }
        if (diffDays < 7) { return `${diffDays}d ago`; }

        if (availableWidth > 200) {
            return d.toLocaleString('sv-SE');
        }
        if (availableWidth > 140) {
            return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        }
        return d.toLocaleDateString();
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

        const { sha: shaCol, message: messageCol, author: authorCol, date: dateCol } = this.getColumnPositions(width);

        ctx.fillStyle = theme.foreground;
        ctx.globalAlpha = 0.6;
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.fillText('Graph', GRAPH_LEFT, HEADER_HEIGHT - 6);
        ctx.fillText('SHA', shaCol, HEADER_HEIGHT - 6);
        ctx.fillText('Message', messageCol, HEADER_HEIGHT - 6);
        if (this.config.showAuthor) {
            ctx.fillText('Author', authorCol, HEADER_HEIGHT - 6);
        }
        if (this.config.showDate) {
            ctx.fillText('Date', dateCol, HEADER_HEIGHT - 6);
        }
        ctx.globalAlpha = 1;

        // Column border lines
        ctx.strokeStyle = 'rgba(128,128,128,0.2)';
        for (const b of this.getColumnBorders(width)) {
            ctx.beginPath();
            ctx.moveTo(b.x, 0);
            ctx.lineTo(b.x, HEADER_HEIGHT);
            ctx.stroke();
        }
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
        const fromY = this.rowY(fromRow) + ROW_HEIGHT / 2 - scrollY;
        const toY = this.rowY(toRow) + ROW_HEIGHT / 2 - scrollY;

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
                const dy = Math.abs(toY - fromY);
                const cpOffsetY = Math.min(dy * 0.4, ROW_HEIGHT * 4);
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

        ctx.font = '11px system-ui, -apple-system, sans-serif';
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
                if (b.isHead) { ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'; }
                ctx.fillText(label, x + BADGE_PAD, cy + 4);
                if (b.isHead) { ctx.font = '11px system-ui, -apple-system, sans-serif'; }

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

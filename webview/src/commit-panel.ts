import { replaceEmoji } from './emoji';
import { parseMarkdown } from './markdown';

interface Commit {
    id: string;
    shortId: string;
    message: string;
    body: string;
    author: { name: string; email: string };
    parentIds: string[];
    timestamp: number;
    gpgStatus?: string;
    gpgSigner?: string;
}

interface FileDiff {
    path: string;
    oldPath?: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
}

export interface CommitDetailData {
    commit: Commit;
    files: FileDiff[];
}

interface TreeNode {
    name: string;
    children: Map<string, TreeNode>;
    files: Array<FileDiff & { name: string }>;
}

export class CommitPanel {
    private readonly container: HTMLElement;
    private readonly graphContainer: HTMLElement;
    private visible = false;
    private onFileClick: ((filePath: string, commitId: string) => void) | null = null;

    private issueLinks: Record<string, string> = {};
    private onOpenExternal: ((url: string) => void) | null = null;
    private accessibilityMode = false;
    private avatars = new Map<string, string>();
    private anchorY = 0;
    private onHide: (() => void) | null = null;
    private onResize: ((height: number) => void) | null = null;
    private resizeObserver: ResizeObserver;

    constructor() {
        this.graphContainer = document.getElementById('graph-container')!;
        this.container = document.createElement('div');
        this.container.className = 'inline-detail';
        this.graphContainer.appendChild(this.container);
        this.resizeObserver = new ResizeObserver(() => {
            if (this.visible) {
                this.onResize?.(this.container.offsetHeight);
            }
        });
        this.resizeObserver.observe(this.container);
    }

    show(data: CommitDetailData): void {
        this.showInline(data, this.anchorY);
    }

    showInline(data: CommitDetailData, yPosition: number): void {
        this.anchorY = yPosition;
        this.visible = true;
        this.container.style.display = 'block';
        this.container.style.top = `${yPosition}px`;
        this.container.innerHTML = '';

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '\u00d7';
        closeBtn.className = 'inline-detail-close';
        closeBtn.setAttribute('aria-label', 'Close commit detail');
        closeBtn.onclick = () => this.hide();
        this.container.appendChild(closeBtn);

        // Two-column layout
        const layout = document.createElement('div');
        layout.className = 'inline-detail-layout';

        // Left: commit info
        const left = document.createElement('div');
        left.className = 'inline-detail-info';

        // SHA + parents
        const shaLine = document.createElement('div');
        shaLine.className = 'inline-detail-sha';
        const shaLabel = document.createElement('span');
        shaLabel.textContent = 'SHA: ';
        shaLabel.className = 'inline-detail-label';
        shaLine.appendChild(shaLabel);
        const shaCode = document.createElement('code');
        shaCode.textContent = data.commit.id;
        shaLine.appendChild(shaCode);
        left.appendChild(shaLine);

        if (data.commit.parentIds && data.commit.parentIds.length > 0) {
            const parentLine = document.createElement('div');
            parentLine.className = 'inline-detail-sha';
            const parentLabel = document.createElement('span');
            parentLabel.textContent = data.commit.parentIds.length > 1 ? 'Parents: ' : 'Parent: ';
            parentLabel.className = 'inline-detail-label';
            parentLine.appendChild(parentLabel);
            const parentCode = document.createElement('code');
            parentCode.textContent = data.commit.parentIds.map(p => p.slice(0, 7)).join(', ');
            parentLine.appendChild(parentCode);
            left.appendChild(parentLine);
        }

        // Author
        const authorLine = document.createElement('div');
        authorLine.className = 'inline-detail-author';
        const avatarUri = this.avatars.get(data.commit.author.email);
        if (avatarUri) {
            const img = document.createElement('img');
            img.src = avatarUri;
            img.width = 16;
            img.height = 16;
            img.className = 'commit-panel-avatar';
            img.alt = '';
            authorLine.appendChild(img);
        }
        authorLine.appendChild(document.createTextNode(`${data.commit.author.name} <${data.commit.author.email}>`));
        left.appendChild(authorLine);

        // Date
        const dateLine = document.createElement('div');
        dateLine.className = 'inline-detail-date';
        dateLine.textContent = new Date(data.commit.timestamp * 1000).toLocaleString();
        left.appendChild(dateLine);

        // Message
        const msg = document.createElement('div');
        msg.className = 'inline-detail-message';
        this.renderLinkedText(replaceEmoji(data.commit.message), msg);
        if (data.commit.body) {
            const body = document.createElement('div');
            body.className = 'inline-detail-body';
            this.renderMarkdown(replaceEmoji(data.commit.body), body);
            msg.appendChild(body);
        }
        left.appendChild(msg);

        // GPG
        if (data.commit.gpgStatus && data.commit.gpgStatus !== 'none') {
            const sig = document.createElement('div');
            sig.className = 'commit-panel-signature';
            sig.textContent = `\uD83D\uDD12 Signed${data.commit.gpgSigner ? ` by ${data.commit.gpgSigner}` : ''}`;
            left.appendChild(sig);
        }

        layout.appendChild(left);

        // Right: changed files
        if (data.files && data.files.length > 0) {
            const right = document.createElement('div');
            right.className = 'inline-detail-files';
            const heading = document.createElement('div');
            heading.className = 'inline-detail-label';
            heading.textContent = `Changed files (${data.files.length})`;
            right.appendChild(heading);
            const tree = this.buildFileTree(data.files);
            right.appendChild(this.renderTree(tree, data.commit.id));
            layout.appendChild(right);
        }

        this.container.appendChild(layout);
    }

    hide(): void {
        this.visible = false;
        this.container.style.display = 'none';
        this.onHide?.();
    }

    setOnFileClick(cb: (filePath: string, commitId: string) => void): void {
        this.onFileClick = cb;
    }

    setOnOpenExternal(cb: (url: string) => void): void {
        this.onOpenExternal = cb;
    }

    setOnHide(cb: () => void): void {
        this.onHide = cb;
    }

    setConfig(cfg: { issueLinks?: Record<string, string>; accessibilityMode?: boolean }): void {
        if (cfg.issueLinks) { this.issueLinks = cfg.issueLinks; }
        if (cfg.accessibilityMode !== undefined) { this.accessibilityMode = cfg.accessibilityMode; }
    }

    setAvatars(map: Record<string, string>): void {
        for (const [email, uri] of Object.entries(map)) {
            this.avatars.set(email, uri);
        }
    }

    get isVisible(): boolean {
        return this.visible;
    }

    get height(): number {
        return this.visible ? this.container.offsetHeight : 0;
    }

    setOnResize(cb: (height: number) => void): void {
        this.onResize = cb;
    }

    get anchorTop(): number {
        return this.anchorY;
    }

    private renderLinkedText(text: string, parent: HTMLElement): void {
        const patterns = Object.entries(this.issueLinks);
        if (patterns.length === 0) {
            parent.textContent = text;
            return;
        }

        const combined = patterns.map(([re]) => `(${re})`).join('|');
        let regex: RegExp;
        try {
            regex = new RegExp(combined, 'g');
        } catch {
            parent.textContent = text;
            return;
        }

        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            let url: string | undefined;
            for (const [re, template] of patterns) {
                const sub = new RegExp(re).exec(match[0]);
                if (sub) {
                    url = template.replace(/\$(\d+)/g, (_, n) => sub[Number(n)] ?? '');
                    break;
                }
            }
            const link = document.createElement('a');
            link.textContent = match[0];
            link.href = '#';
            link.className = 'issue-link';
            if (url) {
                const resolvedUrl = url;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.onOpenExternal?.(resolvedUrl);
                });
            }
            parent.appendChild(link);
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < text.length) {
            parent.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
    }

    private renderMarkdown(text: string, container: HTMLElement): void {
        for (const line of text.split('\n')) {
            const p = document.createElement('div');
            for (const seg of parseMarkdown(line)) {
                switch (seg.type) {
                    case 'bold': {
                        const b = document.createElement('strong');
                        b.textContent = seg.content;
                        p.appendChild(b);
                        break;
                    }
                    case 'italic': {
                        const i = document.createElement('em');
                        i.textContent = seg.content;
                        p.appendChild(i);
                        break;
                    }
                    case 'code': {
                        const code = document.createElement('code');
                        code.textContent = seg.content;
                        code.className = 'inline-code';
                        p.appendChild(code);
                        break;
                    }
                    default:
                        p.appendChild(document.createTextNode(seg.content));
                }
            }
            container.appendChild(p);
        }
    }

    private buildFileTree(files: FileDiff[]): TreeNode {
        const root: TreeNode = { name: '', children: new Map(), files: [] };
        for (const file of files) {
            const parts = file.path.split('/');
            let node = root;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!node.children.has(parts[i])) {
                    node.children.set(parts[i], { name: parts[i], children: new Map(), files: [] });
                }
                node = node.children.get(parts[i])!;
            }
            node.files.push({ ...file, name: parts[parts.length - 1] });
        }
        return root;
    }

    private countFiles(node: TreeNode): number {
        let count = node.files.length;
        for (const child of node.children.values()) {
            count += this.countFiles(child);
        }
        return count;
    }

    private renderTree(node: TreeNode, commitId: string): HTMLElement {
        const container = document.createElement('div');
        container.className = 'file-tree';

        for (const [, child] of [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            let collapsed = child;
            let prefix = collapsed.name;
            while (collapsed.children.size === 1 && collapsed.files.length === 0) {
                const only = [...collapsed.children.values()][0];
                prefix += '/' + only.name;
                collapsed = only;
            }

            const item = document.createElement('div');
            item.className = 'file-tree-item';
            const details = document.createElement('details');
            details.open = true;
            const summary = document.createElement('summary');
            summary.className = 'file-tree-folder';
            const count = this.countFiles(collapsed);
            const label = document.createElement('span');
            label.textContent = `${prefix}/`;
            summary.appendChild(label);
            const countSpan = document.createElement('span');
            countSpan.className = 'file-tree-count';
            countSpan.textContent = ` (${count})`;
            summary.appendChild(countSpan);
            details.appendChild(summary);
            details.appendChild(this.renderTree(collapsed, commitId));
            item.appendChild(details);
            container.appendChild(item);
        }

        for (const file of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
            const item = document.createElement('div');
            item.className = 'file-tree-item file-tree-leaf';
            const status = document.createElement('span');
            status.className = `file-status file-status-${file.status}`;
            status.textContent = this.accessibilityMode
                ? ({ added: 'Added', modified: 'Modified', deleted: 'Deleted', renamed: 'Renamed' }[file.status] ?? file.status)
                : file.status[0].toUpperCase();
            item.appendChild(status);
            const icon = document.createTextNode('\uD83D\uDCC4 ');
            item.appendChild(icon);
            const btn = document.createElement('button');
            btn.className = 'file-link';
            btn.textContent = file.name;
            btn.addEventListener('click', () => this.onFileClick?.(file.path, commitId));
            item.appendChild(btn);

            container.appendChild(item);
        }

        return container;
    }
}

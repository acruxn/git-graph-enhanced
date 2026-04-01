import { replaceEmoji } from './emoji';

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

export class CommitPanel {
    private readonly container: HTMLElement;
    private visible = false;
    private onFileClick: ((filePath: string, commitId: string) => void) | null = null;
    private issueLinks: Record<string, string> = {};
    private onOpenExternal: ((url: string) => void) | null = null;
    private accessibilityMode = false;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'commit-panel';
        this.container.className = 'commit-panel';
        document.body.appendChild(this.container);
    }

    show(data: CommitDetailData): void {
        this.visible = true;
        this.container.style.display = 'block';
        this.container.innerHTML = '';

        // Header: close button + SHA
        const header = document.createElement('div');
        header.className = 'commit-panel-header';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '\u00d7';
        closeBtn.className = 'commit-panel-close';
        closeBtn.setAttribute('aria-label', 'Close commit detail');
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);
        const sha = document.createElement('code');
        sha.textContent = data.commit.id;
        header.appendChild(sha);
        if (data.commit.parentIds.length > 1) {
            const mergeLabel = document.createElement('span');
            mergeLabel.className = 'commit-panel-merge-label';
            mergeLabel.textContent = 'Merge commit';
            header.appendChild(mergeLabel);
        }
        this.container.appendChild(header);

        // Message + body
        const msg = document.createElement('div');
        msg.className = 'commit-panel-message';
        this.renderLinkedText(replaceEmoji(data.commit.message), msg);
        if (data.commit.body) {
            const body = document.createElement('pre');
            body.textContent = data.commit.body;
            msg.appendChild(body);
        }
        this.container.appendChild(msg);

        // Author + date
        const meta = document.createElement('div');
        meta.className = 'commit-panel-meta';
        meta.textContent = `${data.commit.author.name} <${data.commit.author.email}> \u00b7 ${new Date(data.commit.timestamp * 1000).toLocaleString()}`;
        this.container.appendChild(meta);

        // GPG signature indicator
        if (data.commit.gpgStatus && data.commit.gpgStatus !== 'none') {
            const sig = document.createElement('div');
            sig.className = 'commit-panel-signature';
            sig.textContent = `\uD83D\uDD12 Signed${data.commit.gpgSigner ? ` by ${data.commit.gpgSigner}` : ''}`;
            this.container.appendChild(sig);
        }

        // Changed files
        if (data.files.length > 0) {
            const fileList = document.createElement('ul');
            fileList.className = 'commit-panel-files';
            for (const file of data.files) {
                const li = document.createElement('li');
                const status = document.createElement('span');
                status.className = `file-status file-status-${file.status}`;
                if (this.accessibilityMode) {
                    const labels: Record<string, string> = { added: 'Added', modified: 'Modified', deleted: 'Deleted', renamed: 'Renamed' };
                    status.textContent = labels[file.status] ?? file.status;
                    status.style.fontWeight = 'bold';
                    status.style.textDecoration = 'underline';
                } else {
                    status.textContent = file.status[0].toUpperCase();
                }
                li.appendChild(status);
                const btn = document.createElement('button');
                btn.className = 'file-link';
                btn.textContent = file.path;
                btn.addEventListener('click', () => this.onFileClick?.(file.path, data.commit.id));
                li.appendChild(btn);
                fileList.appendChild(li);
            }
            this.container.appendChild(fileList);
        }
    }

    hide(): void {
        this.visible = false;
        this.container.style.display = 'none';
    }

    setOnFileClick(cb: (filePath: string, commitId: string) => void): void {
        this.onFileClick = cb;
    }

    setOnOpenExternal(cb: (url: string) => void): void {
        this.onOpenExternal = cb;
    }

    setConfig(cfg: { issueLinks?: Record<string, string>; accessibilityMode?: boolean }): void {
        if (cfg.issueLinks) { this.issueLinks = cfg.issueLinks; }
        if (cfg.accessibilityMode !== undefined) { this.accessibilityMode = cfg.accessibilityMode; }
    }

    get isVisible(): boolean {
        return this.visible;
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
            // Find which pattern matched
            let url: string | undefined;
            let groupOffset = 1;
            for (const [re, template] of patterns) {
                const sub = new RegExp(re).exec(match[0]);
                if (sub) {
                    url = template.replace(/\$(\d+)/g, (_, n) => sub[Number(n)] ?? '');
                    break;
                }
                groupOffset += (new RegExp(re)).exec('')?.length ?? 1;
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
}

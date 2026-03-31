interface Commit {
    id: string;
    shortId: string;
    message: string;
    body: string;
    author: { name: string; email: string };
    timestamp: number;
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
        this.container.appendChild(header);

        // Message + body
        const msg = document.createElement('div');
        msg.className = 'commit-panel-message';
        msg.textContent = data.commit.message;
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

        // Changed files
        if (data.files.length > 0) {
            const fileList = document.createElement('ul');
            fileList.className = 'commit-panel-files';
            for (const file of data.files) {
                const li = document.createElement('li');
                const status = document.createElement('span');
                status.className = `file-status file-status-${file.status}`;
                status.textContent = file.status[0].toUpperCase();
                li.appendChild(status);
                const path = document.createElement('span');
                path.textContent = file.path;
                li.appendChild(path);
                fileList.appendChild(li);
            }
            this.container.appendChild(fileList);
        }
    }

    hide(): void {
        this.visible = false;
        this.container.style.display = 'none';
    }

    get isVisible(): boolean {
        return this.visible;
    }
}

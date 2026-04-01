import * as vscode from 'vscode';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Backend } from './backend';
import type { WebviewMessage } from './types';
import { buildDiffUri } from './diff-provider';
import { getConfig, CONFIG_MAX_COMMITS } from './config';
import { outputChannel } from './extension';
import { fetchAvatars, fetchAvatarDataUri } from './avatar';
import { detectProvider, buildPrUrl } from './pr-provider';

export class GraphPanel implements vscode.Disposable {
    private static panels = new Map<string, GraphPanel>();
    private readonly panel: vscode.WebviewPanel;
    private readonly backend: Backend;
    private readonly context: vscode.ExtensionContext;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly repoPath: string;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        backend: Backend,
        context: vscode.ExtensionContext,
        repoPath: string,
    ) {
        this.panel = panel;
        this.backend = backend;
        this.context = context;
        this.repoPath = repoPath;

        this.panel.webview.html = this.getWebviewContent(this.panel.webview, extensionUri);
        this.setupMessageHandler();
        this.setupFileWatcher();

        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('gitGraphEnhanced')) {
                this.postMessage('updateConfig', {
                    showDate: getConfig('showDateColumn', true),
                    showAuthor: getConfig('showAuthorColumn', true),
                    graphStyle: getConfig('graphStyle', 'curved'),
                    issueLinks: getConfig('issueLinking', {}),
                    accessibilityMode: getConfig('accessibilityMode', false),
                    branchGroups: getConfig('branchGroups', []),
                });
            }
        }, null, this.disposables);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    static createOrShow(extensionUri: vscode.Uri, backend: Backend, context: vscode.ExtensionContext, repoPath: string): void {
        const existing = GraphPanel.panels.get(repoPath);
        if (existing) {
            existing.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const repoName = path.basename(repoPath);
        const panel = vscode.window.createWebviewPanel(
            'gitGraphEnhanced',
            `Git Graph — ${repoName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri],
            }
        );

        GraphPanel.panels.set(repoPath, new GraphPanel(panel, extensionUri, backend, context, repoPath));
    }

    private getRepoPath(): string {
        return this.repoPath;
    }

    private setupFileWatcher(): void {
        const watcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,refs/**,index}');
        let debounceTimer: ReturnType<typeof setTimeout> | undefined;
        const refresh = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => this.handleReady(), 500);
        };
        watcher.onDidChange(refresh, null, this.disposables);
        watcher.onDidCreate(refresh, null, this.disposables);
        watcher.onDidDelete(refresh, null, this.disposables);
        this.disposables.push(watcher);
    }

    private getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
        const nonce = randomBytes(16).toString('hex');
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
        );
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'webview', 'styles', 'main.css')
        );
        const csp = [
            `default-src 'none'`,
            `script-src 'nonce-${nonce}'`,
            `style-src ${webview.cspSource} 'nonce-${nonce}'`,
            `font-src ${webview.cspSource}`,
            `img-src ${webview.cspSource} data:`,
        ].join('; ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${stylesUri}">
    <title>Git Graph</title>
</head>
<body>
    <div id="error-banner" role="alert"></div>
    <div id="graph-container">
        <canvas id="graph-canvas" aria-label="Git commit graph"></canvas>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private setupMessageHandler(): void {
        this.panel.webview.onDidReceiveMessage(
            async (msg: WebviewMessage) => {
                try {
                    switch (msg.type) {
                        case 'ready':
                            await this.handleReady();
                            break;
                        case 'requestCommits': {
                            const p = msg.payload as Record<string, unknown> | undefined;
                            if (p?.order) {
                                await this.handleReady();
                            } else {
                                await this.handleRequestCommits(msg.payload);
                            }
                            break;
                        }
                        case 'requestCommitDetail':
                            await this.handleRequestCommitDetail(msg.payload);
                            break;
                        case 'requestDiff':
                            await this.handleRequestDiff(msg.payload);
                            break;
                        case 'search':
                            await this.handleSearch(msg.payload);
                            break;
                        case 'copyToClipboard':
                            await vscode.env.clipboard.writeText((msg.payload as { text: string }).text);
                            break;
                        case 'openExternal': {
                            const url = (msg.payload as { url: string }).url;
                            await vscode.env.openExternal(vscode.Uri.parse(url));
                            break;
                        }
                        case 'requestAvatar': {
                            const { email } = msg.payload as { email: string };
                            try {
                                const dataUri = await fetchAvatarDataUri(email);
                                this.postMessage('updateAvatars', { [email]: dataUri });
                            } catch { /* best-effort */ }
                            break;
                        }
                        case 'openDiff':
                            await this.handleOpenDiff(msg.payload);
                            break;
                        case 'openFile': {
                            const p = msg.payload as { filePath: string; commitId?: string };
                            const repoPath = this.getRepoPath();
                            if (p.commitId) {
                                const uri = buildDiffUri(p.filePath, p.commitId, repoPath);
                                await vscode.commands.executeCommand('vscode.open', uri);
                            } else {
                                const fileUri = vscode.Uri.file(path.join(repoPath, p.filePath));
                                await vscode.commands.executeCommand('vscode.open', fileUri);
                            }
                            break;
                        }
                        case 'saveScrollPosition':
                            this.context.workspaceState.update('graphScrollTop', (msg.payload as { scrollTop: number }).scrollTop);
                            break;
                        case 'exportGraph': {
                            const { dataUrl } = msg.payload as { dataUrl: string };
                            const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
                            const uri = await vscode.window.showSaveDialog({
                                defaultUri: vscode.Uri.file('git-graph.png'),
                                filters: { 'PNG Image': ['png'] },
                            });
                            if (uri) {
                                await vscode.workspace.fs.writeFile(uri, buffer);
                                vscode.window.showInformationMessage(`Graph exported to ${uri.fsPath}`);
                            }
                            break;
                        }
                        case 'compareCommits': {
                            const p = msg.payload as { commitId1: string; commitId2: string; filePath?: string };
                            const repoPath = this.getRepoPath();
                            if (!p.filePath) { break; }
                            const left = buildDiffUri(p.filePath, p.commitId1, repoPath);
                            const right = buildDiffUri(p.filePath, p.commitId2, repoPath);
                            await vscode.commands.executeCommand('vscode.diff', left, right,
                                `${p.filePath} (${p.commitId1.slice(0, 7)} ↔ ${p.commitId2.slice(0, 7)})`);
                            break;
                        }
                        case 'filterByAuthor': {
                            const p = msg.payload as { author: string };
                            const repoPath = this.getRepoPath();
                            const result = await this.backend.request('search', { repoPath, query: p.author, type: 'author' });
                            this.postMessage('filterResults', result);
                            break;
                        }
                        case 'filterByTag': {
                            const { tagName } = msg.payload as { tagName: string };
                            const repoPath = this.getRepoPath();
                            const maxCount = getConfig(CONFIG_MAX_COMMITS, 500);
                            const commitsResult = await this.backend.request('getCommits', { repoPath, maxCount, branch: tagName });
                            const commits = commitsResult as { commits: Array<{ id: string; parentIds: string[] }>; hasMore: boolean };
                            const graphResult = await this.backend.request('getGraph', {
                                commits: commits.commits.map(c => ({ id: c.id, parentIds: c.parentIds })),
                            });
                            const [branchesResult, tagsResult] = await Promise.all([
                                this.backend.request('getBranches', { repoPath }),
                                this.backend.request('getTags', { repoPath }),
                            ]);
                            this.postMessage('updateGraph', {
                                ...commits,
                                ...(graphResult as object),
                                ...(branchesResult as object),
                                ...(tagsResult as object),
                            });
                            break;
                        }
                        case 'deleteBranches': {
                            const p = msg.payload as { branches: string[] };
                            const repoPath = this.getRepoPath();
                            const confirm = await vscode.window.showWarningMessage(
                                `Delete ${p.branches.length} branch(es): ${p.branches.join(', ')}?`,
                                { modal: true }, 'Delete'
                            );
                            if (confirm !== 'Delete') { break; }
                            const delResult = await this.backend.request('deleteBranches', { repoPath, branches: p.branches });
                            this.postMessage('branchesDeleted', delResult);
                            await this.handleReady();
                            break;
                        }
                        case 'openTerminal': {
                            const repoPath = this.getRepoPath();
                            vscode.window.createTerminal({ name: 'Git Graph', cwd: repoPath }).show();
                            break;
                        }
                        case 'createPr': {
                            const { branchName } = msg.payload as { branchName: string };
                            const repoPath = this.getRepoPath();
                            if (!repoPath) { break; }
                            const result = await this.backend.request('getRemoteUrl', { repoPath }) as { url: string };
                            const configProvider = getConfig('prProvider', 'auto');
                            const provider = configProvider === 'auto'
                                ? detectProvider(result.url)
                                : configProvider;
                            if (!provider) {
                                vscode.window.showWarningMessage('Could not detect PR provider from remote URL');
                                break;
                            }
                            const prUrl = buildPrUrl(result.url, branchName, provider);
                            if (prUrl) {
                                await vscode.env.openExternal(vscode.Uri.parse(prUrl));
                            }
                            break;
                        }                        case 'abortOperation': {
                            const repoPath = this.getRepoPath();
                            await this.backend.request('abortOperation', { repoPath });
                            await this.handleReady();
                            break;
                        }
                    }
                } catch (err) {
                    outputChannel.appendLine(`[webview] error handling "${msg.type}": ${err}`);
                    this.postMessage('error', { message: String(err) });
                }
            },
            null,
            this.disposables
        );
    }

    private async handleReady(): Promise<void> {
        const repoPath = this.getRepoPath();

        const maxCount = getConfig(CONFIG_MAX_COMMITS, 500);
        const showReflog = getConfig('showReflog', false);

        const [commitsResult, branchesResult, tagsResult, stashesResult, stateResult] = await Promise.all([
            this.backend.request('getCommits', { repoPath, maxCount }),
            this.backend.request('getBranches', { repoPath }),
            this.backend.request('getTags', { repoPath }),
            this.backend.request('getStashes', { repoPath }),
            this.backend.request('getRepoState', { repoPath }),
        ]);

        const commits = commitsResult as { commits: Array<{ id: string; parentIds: string[] }>; hasMore: boolean };

        if (showReflog) {
            const reflogResult = await this.backend.request('getReflog', { repoPath, maxCount });
            const reflogCommits = (reflogResult as { commits: Array<{ id: string; parentIds: string[] }> }).commits;
            const seen = new Set(commits.commits.map(c => c.id));
            for (const c of reflogCommits) {
                if (!seen.has(c.id)) {
                    seen.add(c.id);
                    commits.commits.push(c);
                }
            }
        }

        const branches = (branchesResult as { branches: Array<{ name: string; commitId: string; isHead: boolean }> }).branches;
        const mainBranch = branches.find(b => b.name === 'main' || b.name === 'master');
        const pinnedCommitIds = mainBranch ? [{ id: mainBranch.commitId, column: 0 }] : [];

        const graphResult = await this.backend.request('getGraph', {
            commits: commits.commits.map(c => ({ id: c.id, parentIds: c.parentIds })),
            pinnedCommitIds,
        });

        this.postMessage('updateGraph', {
            ...commits,
            ...(graphResult as object),
            ...(branchesResult as object),
            ...(tagsResult as object),
            ...(stashesResult as object),
            ...(stateResult as object),
        });

        this.postMessage('updateConfig', {
            showDate: getConfig('showDateColumn', true),
            showAuthor: getConfig('showAuthorColumn', true),
            issueLinks: getConfig('issueLinking', {}),
            accessibilityMode: getConfig('accessibilityMode', false),
            branchGroups: getConfig('branchGroups', []),
        });

        const savedScroll = this.context.workspaceState.get<number>('graphScrollTop', 0);
        if (savedScroll) {
            this.postMessage('restoreScroll', { scrollTop: savedScroll });
        }

        // Fetch avatars in background (non-blocking)
        const emails = [...new Set(commits.commits.map(c => (c as unknown as { author: { email: string } }).author?.email).filter(Boolean))];
        fetchAvatars(emails as string[]).then(avatarMap => {
            if (Object.keys(avatarMap).length > 0) {
                this.postMessage('updateAvatars', avatarMap);
            }
        }).catch(() => { /* avatar fetch is best-effort */ });
    }

    private async handleRequestCommits(payload: unknown): Promise<void> {
        const repoPath = this.getRepoPath();
        const p = payload as Record<string, unknown> | undefined;
        const sort = p?.order === 'topo' ? 'topo' : 'date';
        const result = await this.backend.request('getCommits', { repoPath, sort, ...p });
        const commits = result as { commits: Array<{ id: string; parentIds: string[] }>; hasMore: boolean };
        if (p?.sortDirection === 'asc') {
            commits.commits.reverse();
        }
        const graphResult = await this.backend.request('getGraph', {
            commits: commits.commits.map(c => ({ id: c.id, parentIds: c.parentIds })),
        });
        this.postMessage('appendCommits', { ...commits, ...(graphResult as object) });
    }

    private async handleRequestCommitDetail(payload: unknown): Promise<void> {
        const repoPath = this.getRepoPath();
        const result = await this.backend.request('getCommitDetail', { repoPath, ...(payload as object) });
        this.postMessage('updateCommitDetail', result);
    }

    private async handleRequestDiff(payload: unknown): Promise<void> {
        const repoPath = this.getRepoPath();
        const result = await this.backend.request('getDiff', { repoPath, ...(payload as object) });
        this.postMessage('updateDiff', result);
    }

    private async handleSearch(payload: unknown): Promise<void> {
        const repoPath = this.getRepoPath();
        const result = await this.backend.request('search', { repoPath, ...(payload as object) });
        this.postMessage('searchResults', result);
    }

    private async handleOpenDiff(payload: unknown): Promise<void> {
        const { filePath, commitId } = payload as { filePath: string; commitId: string };
        const repoPath = this.getRepoPath();

        const commitResult = await this.backend.request('getCommitDetail', {
            repoPath, commitId,
        }) as { commit: { parentIds: string[] } };

        const parentId = commitResult.commit.parentIds[0];
        if (!parentId) { return; }

        const left = buildDiffUri(filePath, parentId, repoPath);
        const right = buildDiffUri(filePath, commitId, repoPath);
        await vscode.commands.executeCommand('vscode.diff', left, right, `${filePath} (${commitId.slice(0, 7)})`);
    }

    static triggerExport(): void {
        for (const panel of GraphPanel.panels.values()) {
            panel.postMessage('triggerExport');
        }
    }

    private postMessage(type: string, payload?: unknown): void {
        this.panel.webview.postMessage({ type, payload });
    }

    dispose(): void {
        GraphPanel.panels.delete(this.repoPath);
        for (const d of this.disposables) {
            d.dispose();
        }
        this.panel.dispose();
    }

    static disposeAll(): void {
        for (const panel of GraphPanel.panels.values()) {
            panel.dispose();
        }
        GraphPanel.panels.clear();
    }
}

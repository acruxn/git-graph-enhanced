import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { Backend } from './backend';
import type { WebviewMessage } from './types';
import { buildDiffUri } from './diff-provider';
import { getConfig, CONFIG_MAX_COMMITS } from './config';
import { outputChannel } from './extension';

export class GraphPanel implements vscode.Disposable {
    private static currentPanel: GraphPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly backend: Backend;
    private readonly context: vscode.ExtensionContext;
    private readonly disposables: vscode.Disposable[] = [];
    private repoPath: string | undefined;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        backend: Backend,
        context: vscode.ExtensionContext,
    ) {
        this.panel = panel;
        this.backend = backend;
        this.context = context;

        this.panel.webview.html = this.getWebviewContent(this.panel.webview, extensionUri);
        this.setupMessageHandler();
        this.setupFileWatcher();

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    static createOrShow(extensionUri: vscode.Uri, backend: Backend, context: vscode.ExtensionContext): void {
        if (GraphPanel.currentPanel) {
            GraphPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'gitGraphEnhanced',
            'Git Graph',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri],
            }
        );

        GraphPanel.currentPanel = new GraphPanel(panel, extensionUri, backend, context);
    }

    private async discoverRepoPath(): Promise<string | undefined> {
        if (this.repoPath) { return this.repoPath; }

        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) { return undefined; }

        const repoPaths: string[] = [];
        for (const folder of folders) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, '.git'));
                repoPaths.push(folder.uri.fsPath);
            } catch {
                // No .git in this folder
            }
        }

        if (repoPaths.length === 0) { return undefined; }
        if (repoPaths.length === 1) {
            this.repoPath = repoPaths[0];
            return this.repoPath;
        }

        const picked = await vscode.window.showQuickPick(
            repoPaths.map(p => ({ label: p.split('/').pop() || p, description: p, path: p })),
            { placeHolder: 'Select a repository' }
        );
        this.repoPath = picked?.path;
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
                        case 'requestCommits':
                            await this.handleRequestCommits(msg.payload);
                            break;
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
                        case 'openDiff':
                            await this.handleOpenDiff(msg.payload);
                            break;
                        case 'saveScrollPosition':
                            this.context.workspaceState.update('graphScrollTop', (msg.payload as { scrollTop: number }).scrollTop);
                            break;
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
        const repoPath = await this.discoverRepoPath();
        if (!repoPath) {
            this.postMessage('error', { message: 'No git repository found in workspace' });
            return;
        }

        const maxCount = getConfig(CONFIG_MAX_COMMITS, 500);

        const [commitsResult, branchesResult, tagsResult] = await Promise.all([
            this.backend.request('getCommits', { repoPath, maxCount }),
            this.backend.request('getBranches', { repoPath }),
            this.backend.request('getTags', { repoPath }),
        ]);

        const commits = commitsResult as { commits: Array<{ id: string; parentIds: string[] }>; hasMore: boolean };

        const graphResult = await this.backend.request('getGraph', {
            commits: commits.commits.map(c => ({ id: c.id, parentIds: c.parentIds })),
        });

        this.postMessage('updateGraph', {
            ...commits,
            ...(graphResult as object),
            ...(branchesResult as object),
            ...(tagsResult as object),
        });

        const savedScroll = this.context.workspaceState.get<number>('graphScrollTop', 0);
        if (savedScroll) {
            this.postMessage('restoreScroll', { scrollTop: savedScroll });
        }
    }

    private async handleRequestCommits(payload: unknown): Promise<void> {
        const repoPath = await this.discoverRepoPath();
        if (!repoPath) { return; }
        const result = await this.backend.request('getCommits', { repoPath, ...(payload as object) });
        const commits = result as { commits: Array<{ id: string; parentIds: string[] }>; hasMore: boolean };
        const graphResult = await this.backend.request('getGraph', {
            commits: commits.commits.map(c => ({ id: c.id, parentIds: c.parentIds })),
        });
        this.postMessage('appendCommits', { ...commits, ...(graphResult as object) });
    }

    private async handleRequestCommitDetail(payload: unknown): Promise<void> {
        const repoPath = await this.discoverRepoPath();
        if (!repoPath) { return; }
        const result = await this.backend.request('getCommitDetail', { repoPath, ...(payload as object) });
        this.postMessage('updateCommitDetail', result);
    }

    private async handleRequestDiff(payload: unknown): Promise<void> {
        const repoPath = await this.discoverRepoPath();
        if (!repoPath) { return; }
        const result = await this.backend.request('getDiff', { repoPath, ...(payload as object) });
        this.postMessage('updateDiff', result);
    }

    private async handleSearch(payload: unknown): Promise<void> {
        const repoPath = await this.discoverRepoPath();
        if (!repoPath) { return; }
        const result = await this.backend.request('search', { repoPath, ...(payload as object) });
        this.postMessage('searchResults', result);
    }

    private async handleOpenDiff(payload: unknown): Promise<void> {
        const { filePath, commitId } = payload as { filePath: string; commitId: string };
        const repoPath = await this.discoverRepoPath();
        if (!repoPath) { return; }

        const commitResult = await this.backend.request('getCommitDetail', {
            repoPath, commitId,
        }) as { commit: { parentIds: string[] } };

        const parentId = commitResult.commit.parentIds[0];
        if (!parentId) { return; }

        const left = buildDiffUri(filePath, parentId, repoPath);
        const right = buildDiffUri(filePath, commitId, repoPath);
        await vscode.commands.executeCommand('vscode.diff', left, right, `${filePath} (${commitId.slice(0, 7)})`);
    }

    private postMessage(type: string, payload?: unknown): void {
        this.panel.webview.postMessage({ type, payload });
    }

    dispose(): void {
        GraphPanel.currentPanel = undefined;
        for (const d of this.disposables) {
            d.dispose();
        }
        this.panel.dispose();
    }
}

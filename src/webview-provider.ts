import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { Backend } from './backend';
import type { WebviewMessage } from './types';
import { outputChannel } from './extension';

export class GraphPanel implements vscode.Disposable {
    private static currentPanel: GraphPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly backend: Backend;
    private readonly disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, backend: Backend) {
        this.panel = panel;
        this.backend = backend;

        this.panel.webview.html = this.getWebviewContent(this.panel.webview, extensionUri);
        this.setupMessageHandler();

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    static createOrShow(extensionUri: vscode.Uri, backend: Backend): void {
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

        GraphPanel.currentPanel = new GraphPanel(panel, extensionUri, backend);
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
        const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoPath) {
            this.postMessage('error', { message: 'No workspace folder open' });
            return;
        }

        const [commitsResult, branchesResult, tagsResult] = await Promise.all([
            this.backend.request('getCommits', { repoPath }),
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
    }

    private async handleRequestCommits(payload: unknown): Promise<void> {
        const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoPath) { return; }
        const result = await this.backend.request('getCommits', { repoPath, ...(payload as object) });
        const commits = result as { commits: Array<{ id: string; parentIds: string[] }>; hasMore: boolean };
        const graphResult = await this.backend.request('getGraph', {
            commits: commits.commits.map(c => ({ id: c.id, parentIds: c.parentIds })),
        });
        this.postMessage('appendCommits', { ...commits, ...(graphResult as object) });
    }

    private async handleRequestCommitDetail(payload: unknown): Promise<void> {
        const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoPath) { return; }
        const result = await this.backend.request('getCommitDetail', { repoPath, ...(payload as object) });
        this.postMessage('updateCommitDetail', result);
    }

    private async handleRequestDiff(payload: unknown): Promise<void> {
        const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoPath) { return; }
        const result = await this.backend.request('getDiff', { repoPath, ...(payload as object) });
        this.postMessage('updateDiff', result);
    }

    private async handleSearch(payload: unknown): Promise<void> {
        const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoPath) { return; }
        const result = await this.backend.request('search', { repoPath, ...(payload as object) });
        this.postMessage('searchResults', result);
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

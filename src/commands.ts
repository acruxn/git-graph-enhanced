import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Backend } from './backend';
import { GraphPanel } from './webview-provider';
import { getConfig } from './config';

async function discoverRepoPaths(): Promise<string[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return []; }
    const paths: string[] = [];
    const seen = new Set<string>();
    const maxDepth = getConfig('maxDepthOfRepoSearch', 2);

    async function scan(dirPath: string, depth: number): Promise<void> {
        if (seen.has(dirPath)) { return; }
        seen.add(dirPath);
        try {
            await fs.promises.stat(path.join(dirPath, '.git'));
            paths.push(dirPath);
        } catch { /* no .git here */ }
        if (depth <= 0) { return; }
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'target') {
                    await scan(path.join(dirPath, entry.name), depth - 1);
                }
            }
        } catch { /* can't read directory */ }
    }

    for (const folder of folders) {
        await scan(folder.uri.fsPath, maxDepth);
    }

    return paths;
}

async function pickRepoPath(): Promise<string | undefined> {
    const paths = await discoverRepoPaths();
    if (paths.length === 0) { return undefined; }
    if (paths.length === 1) { return paths[0]; }
    const picked = await vscode.window.showQuickPick(
        paths.map(p => ({ label: p.split('/').pop() || p, description: p, path: p })),
        { placeHolder: 'Select a repository' }
    );
    return picked?.path;
}

export function registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('gitGraphEnhanced.show', async () => {
            try {
                const repoPath = await pickRepoPath();
                if (!repoPath) { return; }
                const backend = await Backend.create(context.extensionPath);
                GraphPanel.createOrShow(context.extensionUri, backend, context, repoPath);
            } catch (err) {
                vscode.window.showErrorMessage(`Git Graph Enhanced: ${err}`);
            }
        }),
        vscode.commands.registerCommand('gitGraphEnhanced.showAll', async () => {
            try {
                const paths = await discoverRepoPaths();
                if (paths.length === 0) { return; }
                const backend = await Backend.create(context.extensionPath);
                for (const repoPath of paths) {
                    GraphPanel.createOrShow(context.extensionUri, backend, context, repoPath);
                }
            } catch (err) {
                vscode.window.showErrorMessage(`Git Graph Enhanced: ${err}`);
            }
        }),
        vscode.commands.registerCommand('gitGraphEnhanced.openTerminal', () => {
            const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!repoPath) { return; }
            vscode.window.createTerminal({ name: 'Git Graph', cwd: repoPath }).show();
        }),
        vscode.commands.registerCommand('gitGraphEnhanced.export', () => {
            GraphPanel.triggerExport();
        }),
        vscode.commands.registerCommand('gitGraphEnhanced.exportConfig', async () => {
            const config = vscode.workspace.getConfiguration('gitGraphEnhanced');
            const exportable: Record<string, unknown> = {};
            for (const key of ['maxCommits', 'graphStyle', 'showDateColumn', 'showAuthorColumn', 'issueLinking', 'branchGroups']) {
                const val = config.get(key);
                if (val !== undefined) { exportable[key] = val; }
            }
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('.vscode/git-graph-enhanced.json'),
                filters: { 'JSON': ['json'] },
            });
            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(exportable, null, 2)));
            }
        }),
        vscode.commands.registerCommand('gitGraphEnhanced.importConfig', async () => {
            const uris = await vscode.window.showOpenDialog({ filters: { 'JSON': ['json'] } });
            if (!uris?.[0]) { return; }
            const data = await vscode.workspace.fs.readFile(uris[0]);
            const parsed = JSON.parse(Buffer.from(data).toString()) as Record<string, unknown>;
            const target = vscode.workspace.getConfiguration('gitGraphEnhanced');
            for (const [key, value] of Object.entries(parsed)) {
                await target.update(key, value, vscode.ConfigurationTarget.Workspace);
            }
            vscode.window.showInformationMessage('Git Graph config imported');
        })
    );
}

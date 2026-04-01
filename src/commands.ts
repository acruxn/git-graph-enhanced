import * as vscode from 'vscode';
import { Backend } from './backend';
import { GraphPanel } from './webview-provider';

export function registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('gitGraphEnhanced.show', async () => {
            try {
                const backend = await Backend.create(context.extensionPath);
                GraphPanel.createOrShow(context.extensionUri, backend, context);
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

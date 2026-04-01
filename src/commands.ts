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
        })
    );
}

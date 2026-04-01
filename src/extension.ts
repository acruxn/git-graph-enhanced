import * as vscode from 'vscode';
import { Backend } from './backend';
import { registerCommands } from './commands';
import { getConfig } from './config';
import { GitContentProvider } from './diff-provider';
import { GraphPanel } from './webview-provider';

export const outputChannel = vscode.window.createOutputChannel('Git Graph Enhanced');

export function activate(context: vscode.ExtensionContext): void {
    registerCommands(context);

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('git-graph-enhanced', new GitContentProvider())
    );

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.text = '$(git-branch) Git Graph';
    statusBarItem.command = 'gitGraphEnhanced.show';
    statusBarItem.show();

    context.subscriptions.push(statusBarItem, outputChannel);

    if (getConfig('openOnStartup', false)) {
        vscode.commands.executeCommand('gitGraphEnhanced.show');
    }
}

export function deactivate(): void {
    GraphPanel.disposeAll();
    Backend.dispose();
}

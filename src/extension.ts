import * as vscode from 'vscode';
import { Backend } from './backend';
import { registerCommands } from './commands';
import { GitContentProvider } from './diff-provider';

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
}

export function deactivate(): void {
    Backend.dispose();
}

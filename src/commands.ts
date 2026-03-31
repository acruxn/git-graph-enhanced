import * as vscode from 'vscode';
import { Backend } from './backend';
import { GraphPanel } from './webview-provider';

export function registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('gitGraphEnhanced.show', async () => {
            try {
                const backend = await Backend.create(context.extensionPath);
                GraphPanel.createOrShow(context.extensionUri, backend);
            } catch (err) {
                vscode.window.showErrorMessage(`Git Graph Enhanced: ${err}`);
            }
        })
    );
}

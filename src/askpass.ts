import * as vscode from 'vscode';
import { getConfig } from './config';

/**
 * Returns environment variables for git processes that enable credential prompting.
 * When the Rust backend spawns git commands that need SSH auth, GIT_ASKPASS
 * points to a helper script. For now, this sets up the env plumbing —
 * the actual credential flow is wired when write operations are added.
 */
export function getGitEnv(extensionPath: string): Record<string, string> {
    if (!getConfig('promptForSshPassphrase', true)) {
        return {};
    }
    return {
        GIT_TERMINAL_PROMPT: '0',
        // Placeholder: will point to a bundled askpass script once write ops land
        // GIT_ASKPASS: path.join(extensionPath, 'scripts', 'askpass.sh'),
    };
}

/**
 * Handle a credential request notification from the backend.
 * Called when the backend sends a JSON-RPC notification (no id) with
 * method "credentialRequest" and params { prompt: string }.
 * Returns the user's input or undefined if cancelled.
 */
export async function handleCredentialRequest(prompt: string): Promise<string | undefined> {
    if (!getConfig('promptForSshPassphrase', true)) {
        return undefined;
    }
    return vscode.window.showInputBox({
        prompt,
        password: true,
        ignoreFocusOut: true,
    });
}

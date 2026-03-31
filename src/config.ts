import * as vscode from 'vscode';

export const CONFIG_MAX_COMMITS = 'maxCommits';
export const CONFIG_REQUEST_TIMEOUT = 'requestTimeout';

export function getConfig<T>(key: string, fallback: T): T {
    return vscode.workspace.getConfiguration('gitGraphEnhanced').get(key, fallback);
}

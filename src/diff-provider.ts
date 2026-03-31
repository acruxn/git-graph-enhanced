import * as vscode from 'vscode';
import { Backend } from './backend';

export class GitContentProvider implements vscode.TextDocumentContentProvider {
    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const backend = Backend.instance;
        if (!backend) { return '// Backend not running'; }

        const params = new URLSearchParams(uri.query);
        const commitId = params.get('commitId');
        const repoPath = params.get('repoPath');
        const filePath = uri.path.slice(1);

        if (!commitId || !repoPath) { return ''; }

        const result = await backend.request('getFileContent', {
            repoPath, commitId, filePath,
        }) as { content: string };
        return result.content;
    }
}

export function buildDiffUri(filePath: string, commitId: string, repoPath: string): vscode.Uri {
    return vscode.Uri.parse(
        `git-graph-enhanced://show/${filePath}?commitId=${encodeURIComponent(commitId)}&repoPath=${encodeURIComponent(repoPath)}`
    );
}

import { spawn } from 'node:child_process';

export interface GitResult {
    success: boolean;
    stdout: string;
    stderr: string;
}

export function execGit(repoPath: string, args: string[]): Promise<GitResult> {
    return new Promise((resolve) => {
        const proc = spawn('git', args, { cwd: repoPath });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            resolve({ success: code === 0, stdout: stdout.trimEnd(), stderr: stderr.trimEnd() });
        });
    });
}

export function checkoutBranch(repoPath: string, branchName: string): Promise<GitResult> {
    return execGit(repoPath, ['checkout', branchName]);
}

const COMMIT_HASH_RE = /^[0-9a-f]{4,40}$/;

export function checkoutCommit(repoPath: string, commitId: string): Promise<GitResult> {
    if (!COMMIT_HASH_RE.test(commitId)) {
        return Promise.resolve({ success: false, stdout: '', stderr: `Invalid commit hash: ${commitId}` });
    }
    return execGit(repoPath, ['checkout', '--detach', commitId]);
}

export function createBranch(repoPath: string, name: string, startPoint: string): Promise<GitResult> {
    return execGit(repoPath, ['branch', name, startPoint]);
}

export function createTag(repoPath: string, name: string, commitId: string, message?: string): Promise<GitResult> {
    if (message) {
        return execGit(repoPath, ['tag', '-a', '-m', message, name, commitId]);
    }
    return execGit(repoPath, ['tag', name, commitId]);
}

export function fetchRemote(repoPath: string, remote?: string): Promise<GitResult> {
    const args = ['fetch', '--prune'];
    if (remote) { args.push(remote); }
    return execGit(repoPath, args);
}

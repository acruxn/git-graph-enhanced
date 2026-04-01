type Provider = 'github' | 'gitlab' | 'bitbucket';

interface RepoInfo {
    owner: string;
    repo: string;
}

function parseRepoInfo(remoteUrl: string): RepoInfo | null {
    // SSH: git@github.com:owner/repo.git
    const sshMatch = remoteUrl.match(/:([^/]+)\/([^/.]+?)(?:\.git)?$/);
    if (sshMatch) {
        return { owner: sshMatch[1], repo: sshMatch[2] };
    }
    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = remoteUrl.match(/\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
    if (httpsMatch) {
        return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }
    return null;
}

export function detectProvider(remoteUrl: string): Provider | null {
    if (remoteUrl.includes('github.com')) { return 'github'; }
    if (remoteUrl.includes('gitlab.com') || remoteUrl.includes('gitlab')) { return 'gitlab'; }
    if (remoteUrl.includes('bitbucket.org') || remoteUrl.includes('bitbucket')) { return 'bitbucket'; }
    return null;
}

export function buildPrUrl(remoteUrl: string, branchName: string, provider: string): string | null {
    const info = parseRepoInfo(remoteUrl);
    if (!info) { return null; }
    const branch = encodeURIComponent(branchName);

    switch (provider) {
        case 'github':
            return `https://github.com/${info.owner}/${info.repo}/compare/${branch}?expand=1`;
        case 'gitlab':
            return `https://gitlab.com/${info.owner}/${info.repo}/-/merge_requests/new?merge_request[source_branch]=${branch}`;
        case 'bitbucket':
            return `https://bitbucket.org/${info.owner}/${info.repo}/pull-requests/new?source=${branch}`;
        default:
            return null;
    }
}

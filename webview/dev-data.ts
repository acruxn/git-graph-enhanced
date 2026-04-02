// Mock data for standalone webview dev server
// Generates realistic git graph data matching the interfaces in graph-renderer.ts

declare global {
    interface Window {
        __MOCK_INIT__: { type: string; payload: unknown };
        __MOCK_DETAIL__: { type: string; payload: unknown };
    }
}

const AUTHORS = [
    { name: 'Alice Chen', email: 'alice@example.com' },
    { name: 'Bob Martinez', email: 'bob@example.com' },
    { name: 'Carol Wu', email: 'carol@example.com' },
    { name: 'Dave Singh', email: 'dave@example.com' },
];

const MESSAGES = [
    'feat(graph): add branch color coding',
    'fix(backend): handle detached HEAD state',
    'refactor(webview): extract theme manager',
    'feat(ui): add commit detail panel',
    'fix(graph): correct edge routing for merges',
    'feat(search): add author filter',
    'chore(deps): update gitoxide to 0.38',
    'fix(renderer): prevent canvas flicker on scroll',
    'feat(toolbar): add repository picker',
    'refactor(backend): simplify JSON-RPC handler',
    'feat(graph): implement virtual scrolling',
    'fix(theme): respect high contrast mode',
    'feat(diff): add inline diff viewer',
    'perf(graph): batch canvas draw calls',
    'fix(search): debounce input correctly',
    'feat(ui): add context menu on right-click',
    'docs(readme): add installation instructions',
    'feat(graph): add stash visualization',
    'fix(backend): handle empty repositories',
    'refactor(types): unify commit interfaces',
];

function sha(i: number): string {
    return (0x1000 + i).toString(16).padStart(40, '0');
}

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

// Column assignments: main=0, feature branches on 1-2, fix on 3
const COLUMN_MAP: Record<number, number> = {};
const COLOR_MAP: Record<number, number> = {};

// Branch layout: commits 0-7 on col 0, 8-15 on col 1, 16-23 on col 2, 24-31 on col 3, rest on col 0
function getColumn(i: number): number {
    if (i <= 7) { return 0; }
    if (i >= 8 && i <= 15) { return 1; }
    if (i >= 16 && i <= 23) { return 2; }
    if (i >= 24 && i <= 31) { return 3; }
    return 0;
}

function getColor(i: number): number {
    if (i <= 7) { return 0; }
    if (i >= 8 && i <= 15) { return 1; }
    if (i >= 16 && i <= 23) { return 2; }
    if (i >= 24 && i <= 31) { return 3; }
    return 0;
}

interface MockCommit {
    id: string;
    shortId: string;
    message: string;
    body: string;
    author: { name: string; email: string };
    committer: { name: string; email: string };
    parentIds: string[];
    timestamp: number;
}

// Generate 50 commits
const commits: MockCommit[] = [];
for (let i = 0; i < 50; i++) {
    const isMerge = i > 0 && i % 8 === 0;
    const parentIds: string[] = [];
    if (i > 0) {
        parentIds.push(sha(i - 1));
        if (isMerge && i > 8) {
            // Merge from a different branch
            parentIds.push(sha(i - 5));
        }
    }
    const author = AUTHORS[i % AUTHORS.length];
    commits.push({
        id: sha(i),
        shortId: sha(i).slice(0, 7),
        message: MESSAGES[i % MESSAGES.length],
        body: i % 10 === 0 ? 'This is a longer commit body with additional details.\n\nFixes #' + (i + 1) : '',
        author,
        committer: author,
        parentIds,
        timestamp: NOW - (50 - i) * DAY / 2,
    });

    COLUMN_MAP[i] = getColumn(i);
    COLOR_MAP[i] = getColor(i);
}

// Graph nodes
const nodes = commits.map((_, i) => ({
    commitId: sha(i),
    column: COLUMN_MAP[i],
    color: COLOR_MAP[i],
}));

// Graph edges — connect each commit to its parents
interface MockEdge {
    fromCommitId: string;
    toCommitId: string;
    fromColumn: number;
    toColumn: number;
    color: number;
}

const edges: MockEdge[] = [];
const idxMap = new Map<string, number>();
commits.forEach((c, i) => idxMap.set(c.id, i));

for (let i = 0; i < commits.length; i++) {
    for (const pid of commits[i].parentIds) {
        const pi = idxMap.get(pid);
        if (pi === undefined) { continue; }
        edges.push({
            fromCommitId: commits[i].id,
            toCommitId: pid,
            fromColumn: COLUMN_MAP[i],
            toColumn: COLUMN_MAP[pi],
            color: COLOR_MAP[i],
        });
    }
}

// Branches
const branches = [
    { name: 'main', isRemote: false, isHead: true, commitId: sha(0), upstream: 'origin/main' },
    { name: 'origin/main', isRemote: true, isHead: false, commitId: sha(0) },
    { name: 'develop', isRemote: false, isHead: false, commitId: sha(3) },
    { name: 'feature/auth', isRemote: false, isHead: false, commitId: sha(10) },
    { name: 'feature/ui', isRemote: false, isHead: false, commitId: sha(18) },
    { name: 'fix/crash', isRemote: false, isHead: false, commitId: sha(26) },
];

// Tags
const tags = [
    { name: 'v0.1.0', commitId: sha(0), isAnnotated: true, message: 'Release 0.1.0' },
    { name: 'v0.0.2', commitId: sha(15), isAnnotated: true, message: 'Release 0.0.2' },
    { name: 'v0.0.1', commitId: sha(35), isAnnotated: false },
];

// Stash
const stashes = [
    { index: 0, message: 'WIP on feature/auth: half-done login form', commitId: sha(12) },
];

// Set up mock messages for the shim
window.__MOCK_INIT__ = {
    type: 'init',
    payload: { repoName: 'my-project' },
};

window.__MOCK_DETAIL__ = {
    type: 'updateCommitDetail',
    payload: {
        commit: {
            ...commits[0],
            gpgStatus: 'good',
            gpgSigner: 'alice@example.com',
        },
        files: [
            { path: 'src/main.ts', status: 'modified', additions: 12, deletions: 3 },
            { path: 'src/utils/helpers.ts', status: 'added', additions: 45, deletions: 0 },
            { path: 'tests/old-test.ts', status: 'deleted', additions: 0, deletions: 28 },
            { path: 'src/config.ts', oldPath: 'src/settings.ts', status: 'renamed', additions: 2, deletions: 2 },
        ],
    },
};

// Dispatch mock graph data after webview initializes
setTimeout(() => {
    window.dispatchEvent(new MessageEvent('message', {
        data: {
            type: 'updateGraph',
            payload: { commits, nodes, edges, branches, tags, stashes },
        },
    }));
}, 100);

import { ThemeManager } from './theme';
import { GraphRenderer } from './graph-renderer';
import { CommitPanel } from './commit-panel';
import { SearchBar } from './search';
import { MessageHandler } from './message-handler';

declare function acquireVsCodeApi(): { postMessage(msg: { type: string; payload?: unknown }): void };

const vscode = acquireVsCodeApi();
const theme = new ThemeManager();
const canvas = document.getElementById('graph-canvas') as HTMLCanvasElement;
const renderer = new GraphRenderer(canvas, theme);
const commitPanel = new CommitPanel();
const searchBar = new SearchBar();
const messageHandler = new MessageHandler(vscode, renderer, commitPanel, searchBar);

renderer.setSend((type, payload) => messageHandler.send(type, payload));
renderer.setOnFocusSearch(() => searchBar.focus());
renderer.setOnCloseDetail(() => commitPanel.hide());
searchBar.setOnSearch((query, type) => messageHandler.send('search', { query, type }));
searchBar.setOnOrderChange((order) => messageHandler.send('requestCommits', { order }));
searchBar.setOnAuthorFilter((author) => {
    if (author.length < 2) {
        renderer.setFilteredIndices(null);
        return;
    }
    messageHandler.send('filterByAuthor', { author });
});

searchBar.setOnTagFilter((tagName) => {
    if (!tagName) {
        renderer.setFilteredIndices(null);
        return;
    }
    messageHandler.send('filterByTag', { tagName });
});

searchBar.setOnBranchGroupFilter((pattern) => {
    if (!pattern) {
        renderer.setFilteredIndices(null);
        return;
    }
    const branches = renderer.getAllBranches();
    let matching: Set<string>;
    if (pattern === '__local__') {
        matching = new Set(branches.filter(b => !b.isRemote).map(b => b.commitId));
    } else if (pattern === '__remote__') {
        matching = new Set(branches.filter(b => b.isRemote).map(b => b.commitId));
    } else {
        const re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        matching = new Set(branches.filter(b => re.test(b.name)).map(b => b.commitId));
    }
    const commits = renderer.getCommits();
    const indices: number[] = [];
    for (let i = 0; i < commits.length; i++) {
        if (matching.has(commits[i].id)) { indices.push(i); }
    }
    renderer.setFilteredIndices(indices.length > 0 ? indices : null);
});

commitPanel.setOnFileClick((filePath, commitId) => messageHandler.send('openFile', { filePath, commitId }));
commitPanel.setOnOpenExternal((url) => messageHandler.send('openExternal', { url }));

window.addEventListener('message', (e: MessageEvent<{ type: string; payload?: unknown }>) => {
    if (e.data.type === 'themeChanged') {
        theme.refresh();
    }
    messageHandler.onMessage(e.data);
});

messageHandler.send('ready');

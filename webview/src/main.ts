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
searchBar.setOnSearch((query, type) => messageHandler.send('search', { query, type }));

window.addEventListener('message', (e: MessageEvent<{ type: string; payload?: unknown }>) => {
    if (e.data.type === 'themeChanged') {
        theme.refresh();
    }
    messageHandler.onMessage(e.data);
});

messageHandler.send('ready');

import { ThemeManager } from './theme';
import { GraphRenderer } from './graph-renderer';
import { CommitPanel } from './commit-panel';
import { MessageHandler } from './message-handler';

declare function acquireVsCodeApi(): { postMessage(msg: { type: string; payload?: unknown }): void };

const vscode = acquireVsCodeApi();
const theme = new ThemeManager();
const canvas = document.getElementById('graph-canvas') as HTMLCanvasElement;
const renderer = new GraphRenderer(canvas, theme);
const commitPanel = new CommitPanel();
const messageHandler = new MessageHandler(vscode, renderer, commitPanel);

renderer.setSend((type, payload) => messageHandler.send(type, payload));

window.addEventListener('message', (e: MessageEvent<{ type: string; payload?: unknown }>) => {
    if (e.data.type === 'themeChanged') {
        theme.refresh();
    }
    messageHandler.onMessage(e.data);
});

messageHandler.send('ready');

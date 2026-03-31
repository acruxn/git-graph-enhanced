import { GraphRenderer } from './graph-renderer';

interface VsCodeApi {
    postMessage(msg: { type: string; payload?: unknown }): void;
}

interface ErrorPayload {
    message: string;
    code?: number;
}

export class MessageHandler {
    private readonly vscode: VsCodeApi;
    private readonly renderer: GraphRenderer;
    private errorBanner: HTMLElement | null = null;

    constructor(vscode: VsCodeApi, renderer: GraphRenderer) {
        this.vscode = vscode;
        this.renderer = renderer;
    }

    onMessage(msg: { type: string; payload?: unknown }): void {
        switch (msg.type) {
            case 'updateGraph':
                this.renderer.render(msg.payload as Parameters<GraphRenderer['render']>[0]);
                break;
            case 'error':
                this.showError(msg.payload as ErrorPayload);
                break;
            case 'themeChanged':
                break;
        }
    }

    send(type: string, payload?: unknown): void {
        this.vscode.postMessage({ type, payload });
    }

    requestCommits(params?: { maxCount?: number; skip?: number }): void {
        this.send('requestCommits', params);
    }

    private showError(payload: ErrorPayload): void {
        if (!this.errorBanner) {
            this.errorBanner = document.getElementById('error-banner');
        }
        if (this.errorBanner) {
            this.errorBanner.textContent = payload.message;
            this.errorBanner.style.display = 'block';
        }
    }
}

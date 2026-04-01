import { GraphRenderer } from './graph-renderer';
import { CommitPanel } from './commit-panel';
import { SearchBar } from './search';
import type { CommitDetailData } from './commit-panel';

interface VsCodeApi {
    postMessage(msg: { type: string; payload?: unknown }): void;
}

interface ErrorPayload {
    message: string;
    code?: number;
}

interface SearchResultsPayload {
    results: unknown[];
    query: string;
}

export class MessageHandler {
    private readonly vscode: VsCodeApi;
    private readonly renderer: GraphRenderer;
    private readonly commitPanel: CommitPanel;
    private readonly searchBar: SearchBar;
    private errorBanner: HTMLElement | null = null;

    constructor(vscode: VsCodeApi, renderer: GraphRenderer, commitPanel: CommitPanel, searchBar: SearchBar) {
        this.vscode = vscode;
        this.renderer = renderer;
        this.commitPanel = commitPanel;
        this.searchBar = searchBar;
    }

    onMessage(msg: { type: string; payload?: unknown }): void {
        switch (msg.type) {
            case 'updateGraph': {
                const payload = msg.payload as Parameters<GraphRenderer['render']>[0] & { tags?: Array<{ name: string }> };
                this.renderer.render(payload);
                if (payload.tags) { this.searchBar.setTags(payload.tags); }
                break;
            }
            case 'updateCommitDetail': {
                const y = this.renderer.getSelectedRowTop() + 24;
                this.commitPanel.showInline(msg.payload as CommitDetailData, y);
                break;
            }
            case 'searchResults':
                this.searchBar.showResultsCount((msg.payload as SearchResultsPayload).results.length);
                break;
            case 'filterResults': {
                const p = msg.payload as { matchingIndices: number[] };
                this.renderer.setFilteredIndices(p.matchingIndices);
                break;
            }
            case 'restoreScroll': {
                const container = document.getElementById('graph-container');
                if (container) { container.scrollTop = (msg.payload as { scrollTop: number }).scrollTop; }
                break;
            }
            case 'error':
                this.showError(msg.payload as ErrorPayload);
                break;
            case 'updateConfig': {
                const cfg = msg.payload as Record<string, unknown>;
                this.renderer.setConfig(cfg as { showDate: boolean; showAuthor: boolean; graphStyle?: 'curved' | 'angular' | 'straight' });
                this.commitPanel.setConfig(cfg as { issueLinks?: Record<string, string> });
                if (Array.isArray(cfg.branchGroups)) {
                    this.searchBar.setBranchGroups(cfg.branchGroups as Array<{ label: string; pattern: string }>);
                }
                break;
            }
            case 'triggerExport': {
                const dataUrl = this.renderer.exportAsDataUrl();
                this.vscode.postMessage({ type: 'exportGraph', payload: { dataUrl } });
                break;
            }
            case 'updateAvatars':
                this.commitPanel.setAvatars(msg.payload as Record<string, string>);
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

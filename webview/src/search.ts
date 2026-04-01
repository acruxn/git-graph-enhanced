export class SearchBar {
    private readonly container: HTMLElement;
    private readonly input: HTMLInputElement;
    private readonly typeSelect: HTMLSelectElement;
    private readonly resultsCount: HTMLElement;
    private readonly orderSelect: HTMLSelectElement;
    private readonly authorInput: HTMLInputElement;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private authorDebounce: ReturnType<typeof setTimeout> | undefined;
    private onSearch: ((query: string, type: string) => void) | null = null;
    private onOrderChange: ((order: string) => void) | null = null;
    private onAuthorFilter: ((author: string) => void) | null = null;
    private onTagFilter: ((tagName: string) => void) | null = null;
    private onBranchGroupFilter: ((pattern: string) => void) | null = null;
    private readonly tagSelect: HTMLSelectElement;
    private readonly branchGroupSelect: HTMLSelectElement;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'search-bar';
        this.container.className = 'search-bar';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.placeholder = 'Search commits...';
        this.input.className = 'search-input';
        this.input.setAttribute('aria-label', 'Search commits');

        this.typeSelect = document.createElement('select');
        this.typeSelect.className = 'search-type';
        this.typeSelect.setAttribute('aria-label', 'Search type');
        for (const [value, label] of [['all', 'All'], ['message', 'Message'], ['author', 'Author'], ['hash', 'SHA']]) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            this.typeSelect.appendChild(opt);
        }

        this.resultsCount = document.createElement('span');
        this.resultsCount.className = 'search-results-count';

        this.orderSelect = document.createElement('select');
        this.orderSelect.className = 'search-type';
        this.orderSelect.setAttribute('aria-label', 'Commit order');
        for (const [value, label] of [['date', 'Date'], ['topo', 'Topological']]) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            this.orderSelect.appendChild(opt);
        }

        this.container.appendChild(this.input);
        this.container.appendChild(this.typeSelect);
        this.container.appendChild(this.orderSelect);
        this.container.appendChild(this.resultsCount);

        this.authorInput = document.createElement('input');
        this.authorInput.type = 'text';
        this.authorInput.placeholder = 'Filter by author...';
        this.authorInput.className = 'search-input author-filter';
        this.authorInput.setAttribute('aria-label', 'Filter by author');
        this.container.appendChild(this.authorInput);

        this.tagSelect = document.createElement('select');
        this.tagSelect.className = 'search-type';
        this.tagSelect.setAttribute('aria-label', 'Filter by tag');
        const allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = 'All tags';
        this.tagSelect.appendChild(allOpt);
        this.container.appendChild(this.tagSelect);

        this.branchGroupSelect = document.createElement('select');
        this.branchGroupSelect.className = 'search-type';
        this.branchGroupSelect.setAttribute('aria-label', 'Filter by branch group');
        for (const [value, label] of [['', 'All branches'], ['__local__', 'Local only'], ['__remote__', 'Remote only']]) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            this.branchGroupSelect.appendChild(opt);
        }
        this.container.appendChild(this.branchGroupSelect);

        const graphContainer = document.getElementById('graph-container');
        graphContainer?.parentElement?.insertBefore(this.container, graphContainer);

        this.input.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.emitSearch(), 300);
        });
        this.typeSelect.addEventListener('change', () => this.emitSearch());
        this.orderSelect.addEventListener('change', () => {
            this.onOrderChange?.(this.orderSelect.value);
        });
        this.authorInput.addEventListener('input', () => {
            clearTimeout(this.authorDebounce);
            this.authorDebounce = setTimeout(() => {
                this.onAuthorFilter?.(this.authorInput.value.trim());
            }, 300);
        });
        this.tagSelect.addEventListener('change', () => {
            this.onTagFilter?.(this.tagSelect.value);
        });
        this.branchGroupSelect.addEventListener('change', () => {
            this.onBranchGroupFilter?.(this.branchGroupSelect.value);
        });
    }

    setOnSearch(cb: (query: string, type: string) => void): void {
        this.onSearch = cb;
    }

    setOnOrderChange(cb: (order: string) => void): void {
        this.onOrderChange = cb;
    }

    setOnAuthorFilter(cb: (author: string) => void): void {
        this.onAuthorFilter = cb;
    }

    setOnTagFilter(cb: (tagName: string) => void): void {
        this.onTagFilter = cb;
    }

    setOnBranchGroupFilter(cb: (pattern: string) => void): void {
        this.onBranchGroupFilter = cb;
    }

    setBranchGroups(groups: Array<{ label: string; pattern: string }>): void {
        // Remove custom options (keep first 3: All, Local, Remote)
        while (this.branchGroupSelect.options.length > 3) {
            this.branchGroupSelect.remove(3);
        }
        for (const g of groups) {
            const opt = document.createElement('option');
            opt.value = g.pattern;
            opt.textContent = g.label;
            this.branchGroupSelect.appendChild(opt);
        }
    }

    setTags(tags: Array<{ name: string }>): void {
        const current = this.tagSelect.value;
        while (this.tagSelect.options.length > 1) {
            this.tagSelect.remove(1);
        }
        for (const tag of tags) {
            const opt = document.createElement('option');
            opt.value = tag.name;
            opt.textContent = tag.name;
            this.tagSelect.appendChild(opt);
        }
        this.tagSelect.value = current;
    }

    showResultsCount(count: number): void {
        this.resultsCount.textContent = count > 0 ? `${count} results` : '';
    }

    focus(): void {
        this.input.focus();
    }

    get query(): string {
        return this.input.value;
    }

    clear(): void {
        this.input.value = '';
        this.resultsCount.textContent = '';
    }

    private emitSearch(): void {
        const q = this.input.value.trim();
        if (q.length < 2) { return; }
        this.onSearch?.(q, this.typeSelect.value);
    }
}

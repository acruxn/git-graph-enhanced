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

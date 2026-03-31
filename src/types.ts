// IPC protocol types — must match Rust serde definitions exactly

export interface Author {
    name: string;
    email: string;
}

export interface Commit {
    id: string;
    shortId: string;
    message: string;
    body: string;
    author: Author;
    committer: Author;
    parentIds: string[];
    timestamp: number;
}

export interface Branch {
    name: string;
    isRemote: boolean;
    isHead: boolean;
    commitId: string;
    upstream?: string;
}

export interface Tag {
    name: string;
    commitId: string;
    isAnnotated: boolean;
    message?: string;
}

export interface GraphNode {
    commitId: string;
    column: number;
    color: number;
}

export interface GraphEdge {
    fromCommitId: string;
    toCommitId: string;
    fromColumn: number;
    toColumn: number;
    color: number;
}

export interface FileDiff {
    path: string;
    oldPath?: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
}

// Extension ↔ Webview messaging

export interface WebviewMessage {
    type: string;
    payload?: unknown;
}

// Extension ↔ Rust backend JSON-RPC

export interface JsonRpcRequest {
    jsonrpc: string;
    id: number;
    method: string;
    params?: unknown;
}

export interface JsonRpcResponse {
    jsonrpc: string;
    id: number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}

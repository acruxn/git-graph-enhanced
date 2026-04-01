import { describe, it, expect } from 'vitest';
import type { Commit, Branch, JsonRpcRequest, JsonRpcResponse } from '../types';

describe('type contracts', () => {
    it('Commit has required fields', () => {
        const commit: Commit = {
            id: 'abc123', shortId: 'abc123', message: 'test', body: '',
            author: { name: 'Test', email: 'test@test.com' },
            committer: { name: 'Test', email: 'test@test.com' },
            parentIds: [], timestamp: 1234567890,
        };
        expect(commit.id).toBe('abc123');
    });

    it('JsonRpcRequest has correct shape', () => {
        const req: JsonRpcRequest = { jsonrpc: '2.0', id: 1, method: 'getCommits', params: {} };
        expect(req.jsonrpc).toBe('2.0');
    });

    it('JsonRpcResponse error shape', () => {
        const resp: JsonRpcResponse = {
            jsonrpc: '2.0', id: 1,
            error: { code: -32601, message: 'not found' },
        };
        expect(resp.error?.code).toBe(-32601);
    });
});

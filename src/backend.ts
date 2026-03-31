import { ChildProcess, spawn } from 'node:child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse } from './types';
import { getConfig, CONFIG_REQUEST_TIMEOUT } from './config';
import { outputChannel } from './extension';

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 60_000;

export class Backend {
    private static _instance: Backend | null = null;
    private static _shuttingDown = false;
    private static restartCount = 0;
    private static lastRestartTime = 0;

    private process: ChildProcess | null = null;
    private nextId = 1;
    private pending = new Map<number, PendingRequest>();
    private stdoutBuffer = '';
    private readonly extensionPath: string;

    private constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    static get instance(): Backend | null {
        return Backend._instance;
    }

    static async create(extensionPath: string): Promise<Backend> {
        if (Backend._instance) {
            return Backend._instance;
        }

        const backend = new Backend(extensionPath);
        const binaryPath = path.join(extensionPath, 'dist', 'git-graph-server');

        backend.process = spawn(binaryPath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        backend.process.stdout!.on('data', (chunk: Buffer) => {
            backend.stdoutBuffer += chunk.toString();
            const lines = backend.stdoutBuffer.split('\n');
            backend.stdoutBuffer = lines.pop()!;
            for (const line of lines) {
                if (!line.trim()) {
                    continue;
                }
                backend.handleResponse(line);
            }
        });

        backend.process.stderr!.on('data', (chunk: Buffer) => {
            outputChannel.appendLine(`[backend] ${chunk.toString().trimEnd()}`);
        });

        backend.process.on('exit', (code) => {
            outputChannel.appendLine(`[backend] exited with code ${code}`);
            for (const [, pending] of backend.pending) {
                clearTimeout(pending.timer);
                pending.reject(new Error(`Backend exited with code ${code}`));
            }
            backend.pending.clear();
            backend.process = null;

            if (Backend._instance === backend) {
                Backend._instance = null;
            }

            // Crash recovery — only if not intentional shutdown
            if (!Backend._shuttingDown && code !== 0) {
                const now = Date.now();
                if (now - Backend.lastRestartTime > RESTART_WINDOW_MS) {
                    Backend.restartCount = 0;
                }

                if (Backend.restartCount < MAX_RESTARTS) {
                    Backend.restartCount++;
                    Backend.lastRestartTime = now;
                    outputChannel.appendLine(`[backend] crash recovery: restart ${Backend.restartCount}/${MAX_RESTARTS}`);
                    vscode.window.showWarningMessage('Git Graph Enhanced: backend crashed, restarting…');
                    Backend.create(backend.extensionPath).catch((err) => {
                        outputChannel.appendLine(`[backend] restart failed: ${err}`);
                    });
                } else {
                    vscode.window.showErrorMessage(
                        'Git Graph Enhanced: backend crashed repeatedly',
                        'Open Output'
                    ).then((action) => {
                        if (action === 'Open Output') { outputChannel.show(); }
                    });
                }
            }
        });

        // Protocol handshake — verify version compatibility
        try {
            const initResult = await backend.request('initialize', { protocolVersion: 1 }) as {
                protocolVersion: number;
                serverVersion: string;
            };
            outputChannel.appendLine(`[backend] server v${initResult.serverVersion}, protocol v${initResult.protocolVersion}`);
        } catch (err) {
            backend.process.kill();
            backend.process = null;
            throw new Error('Backend version mismatch. Please reinstall the extension.');
        }

        Backend._instance = backend;
        return backend;
    }

    private handleResponse(line: string): void {
        let response: JsonRpcResponse;
        try {
            response = JSON.parse(line) as JsonRpcResponse;
        } catch {
            outputChannel.appendLine(`[backend] malformed response: ${line}`);
            return;
        }

        const pending = this.pending.get(response.id);
        if (!pending) {
            return;
        }
        this.pending.delete(response.id);
        clearTimeout(pending.timer);

        if (response.error) {
            pending.reject(new Error(response.error.message));
        } else {
            pending.resolve(response.result);
        }
    }

    async request(method: string, params: unknown): Promise<unknown> {
        if (!this.process?.stdin?.writable) {
            throw new Error('Backend process not running');
        }

        const id = this.nextId++;
        const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
        const timeoutMs = getConfig(CONFIG_REQUEST_TIMEOUT, 30) * 1000;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Request ${method} timed out`));
            }, timeoutMs);

            this.pending.set(id, { resolve, reject, timer });
            this.process!.stdin!.write(JSON.stringify(req) + '\n');
        });
    }

    static dispose(): void {
        Backend._shuttingDown = true;
        const instance = Backend._instance;
        if (!instance?.process) {
            return;
        }

        try {
            instance.process.stdin!.write(
                JSON.stringify({ jsonrpc: '2.0', method: 'shutdown' }) + '\n'
            );
        } catch {
            // stdin may already be closed
        }

        const killTimer = setTimeout(() => {
            instance.process?.kill('SIGKILL');
        }, 2000);

        instance.process.on('exit', () => {
            clearTimeout(killTimer);
        });

        for (const [, pending] of instance.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Backend shutting down'));
        }
        instance.pending.clear();
        Backend._instance = null;
    }
}

import { createHash } from 'node:crypto';
import * as https from 'node:https';

const cache = new Map<string, string>();

export function getAvatarUrl(email: string): string {
    const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
    return `https://www.gravatar.com/avatar/${hash}?s=32&d=retro`;
}

export async function fetchAvatarDataUri(email: string): Promise<string> {
    const cached = cache.get(email);
    if (cached) { return cached; }

    const url = getAvatarUrl(email);
    const dataUri = await new Promise<string>((resolve, reject) => {
        https.get(url, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const contentType = res.headers['content-type'] ?? 'image/png';
                resolve(`data:${contentType};base64,${buf.toString('base64')}`);
            });
            res.on('error', reject);
        }).on('error', reject);
    });

    cache.set(email, dataUri);
    return dataUri;
}

export async function fetchAvatars(emails: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const unique = [...new Set(emails)].slice(0, 50);
    await Promise.allSettled(unique.map(async (email) => {
        try {
            result[email] = await fetchAvatarDataUri(email);
        } catch {
            // Skip failed fetches
        }
    }));
    return result;
}

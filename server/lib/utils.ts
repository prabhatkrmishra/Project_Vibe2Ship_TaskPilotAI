import * as crypto from 'crypto';

// ─── Token encryption at rest ──────────────────────────────────────────────────
// AES-256-GCM for encrypting sensitive fields (e.g. googleRefreshToken) in DB.
// Key derived from JWT_SECRET via PBKDF2 so no extra env var needed.
const ENCRYPTION_KEY = crypto.pbkdf2Sync(process.env.JWT_SECRET || '', 'taskpilot-token-encryption', 100_000, 32, 'sha512');

export function encryptToken(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(cipherText: string): string {
    if (!cipherText || !cipherText.startsWith('enc:')) return cipherText;
    const [, ivHex, tagHex, dataHex] = cipherText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
}

// Input sanitization
export function sanitizeHtml(input: string | null | undefined): string {
    if (!input) return '';
    return input.replace(/<[^>]*>/g, '').trim();
}

// Escape </script> sequences for safe embedding in <script> blocks via JSON.stringify
export function safeJsonForScript(obj: any): string {
    return JSON.stringify(obj).replace(/<\//g, '<\\/');
}

// Strip HTML/script tags from user-provided strings to prevent stored XSS
// when values are rendered in server-generated HTML (e.g. OAuth callback pages).
export function stripMongoMeta(doc: any) {
    const obj = typeof doc.toObject === "function" ? doc.toObject() : {...doc};
    obj.id = obj._id ? obj._id.toString() : obj.id;
    delete obj._id;
    delete obj.__v;
    return obj;
}

// Sanitize error messages to avoid leaking DB internals to clients
export function safeError(err: any): string {
    const msg = String(err?.message || err || 'Internal server error');
    if (msg.includes('Mongo') || msg.includes('E11000') || msg.includes('buffering') ||
        msg.includes('CastError') || msg.includes('ValidationError') || msg.includes('connection')) {
        return 'An internal error occurred. Please try again.';
    }
    return msg.slice(0, 200);
}
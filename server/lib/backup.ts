import crypto from "crypto";

// ─── Data Backup / Restore (Google Drive) ─────────────────────────────────
// Signing key used to HMAC-sign backup archives so tampered/foreign backups
// can be detected before restore. This key never leaves the server.
if (!process.env.BACKUP_SIGNING_KEY || process.env.BACKUP_SIGNING_KEY.trim().length === 0) {
    throw new Error(
        "BACKUP_SIGNING_KEY environment variable is not set. Refusing to start with an insecure default key. " +
        "Set BACKUP_SIGNING_KEY to a long, random value (e.g. `openssl rand -hex 32`)."
    );
}
const BACKUP_SIGNING_KEY = process.env.BACKUP_SIGNING_KEY;
const BACKUP_FORMAT_VERSION = 1;

export function signBackupPayload(canonicalJson: string): string {
    return crypto.createHmac("sha256", BACKUP_SIGNING_KEY).update(canonicalJson).digest("hex");
}

export function verifyBackupSignature(canonicalJson: string, signature: string): boolean {
    const expected = signBackupPayload(canonicalJson);
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(signature || ""), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// Strips fields that must never leave the server in a backup: password
// hashes, mongo internals, and anything auth/credential related.
export function sanitizeUserProfile(user: any) {
    if (!user) return null;
    return {
        email: user.email,
        name: user.name,
        picture: user.picture,
        address: user.address || "",
        gamification: user.gamification || null,
    };
}
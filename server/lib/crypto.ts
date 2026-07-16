import * as crypto from 'crypto';
import {TOTP_ENCRYPTION_KEY} from "../config/env";

let _encryptionKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
    if (!_encryptionKey) {
        if (!TOTP_ENCRYPTION_KEY) throw new Error("TOTP_ENCRYPTION_KEY is required for TOTP secret encryption");
        _encryptionKey = crypto.pbkdf2Sync(TOTP_ENCRYPTION_KEY, 'taskpilot-token-encryption', 100_000, 32, 'sha512');
    }
    return _encryptionKey;
}

export function encryptToken(plain: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(cipherText: string): string {
    if (!cipherText || !cipherText.startsWith('enc:')) return cipherText;
    const key = getEncryptionKey();
    const [, ivHex, tagHex, dataHex] = cipherText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
}

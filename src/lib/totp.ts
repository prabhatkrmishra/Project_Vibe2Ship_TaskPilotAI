import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

const APP_NAME = 'TaskPilot AI';

export function generateTotpSecret(email: string): { secret: string; otpauthUrl: string } {
  const secret = speakeasy.generateSecret({ name: `${APP_NAME}:${email}`, length: 20 });
  return { secret: secret.base32, otpauthUrl: secret.otpauth_url! };
}

export async function generateQrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, { width: 256, margin: 2, color: { dark: '#f0f6fc', light: '#0d1117' } });
}

export function verifyTotpCode(secret: string, code: string): boolean {
  return speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 });
}

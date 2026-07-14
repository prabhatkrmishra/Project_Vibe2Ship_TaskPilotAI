import nodemailer from 'nodemailer';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_USERNAME = process.env.SMTP_USERNAME || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USERNAME;

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_USERNAME || !SMTP_PASSWORD) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: 587,
      secure: false,
      auth: {
        user: SMTP_USERNAME,
        pass: SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

// ─── Email Templates ────────────────────────────────────────────────────────

function baseLayout(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#030712;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#0d1117;border:1px solid #21262d;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px;">
              <div style="text-align:center;margin-bottom:24px;">
                <div style="width:48px;height:48px;background:#4f46e5;border-radius:12px;margin:0 auto 16px;line-height:48px;font-size:20px;color:#fff;">TP</div>
                <h1 style="color:#f0f6fc;font-size:20px;font-weight:600;margin:0 0 4px;">${escHtml(title)}</h1>
              </div>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;border-top:1px solid #21262d;">
              <p style="color:#484f58;font-size:11px;text-align:center;margin:0;">
                TaskPilot AI &mdash; Autonomous Productivity
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function passwordResetBody(name: string, resetUrl: string): string {
  return baseLayout('Reset Your Password', `
    <p style="color:#c9d1d9;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Hi ${escHtml(name)},
    </p>
    <p style="color:#c9d1d9;font-size:14px;line-height:1.6;margin:0 0 24px;">
      We received a request to reset your password. Click the button below to set a new one. This link expires in <strong style="color:#f0f6fc;">15 minutes</strong>.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${escHtml(resetUrl)}" style="display:inline-block;padding:12px 32px;background:#4f46e5;color:#fff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.5px;">
        Reset Password
      </a>
    </div>
    <p style="color:#8b949e;font-size:12px;line-height:1.5;margin:0;">
      If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
    </p>
  `);
}

function loginWarningBody(name: string, ip: string, device: string, timestamp: string): string {
  return baseLayout('New Login Detected', `
    <p style="color:#c9d1d9;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Hi ${escHtml(name)},
    </p>
    <p style="color:#c9d1d9;font-size:14px;line-height:1.6;margin:0 0 20px;">
      A new login was detected on your TaskPilot AI account:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #21262d;border-radius:10px;margin:0 0 20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="color:#8b949e;font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">IP Address</p>
          <p style="color:#f0f6fc;font-size:13px;margin:0 0 12px;font-family:monospace;">${escHtml(ip)}</p>
          <p style="color:#8b949e;font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">Device / Browser</p>
          <p style="color:#f0f6fc;font-size:13px;margin:0 0 12px;font-family:monospace;word-break:break-all;">${escHtml(device)}</p>
          <p style="color:#8b949e;font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">Time</p>
          <p style="color:#f0f6fc;font-size:13px;margin:0;font-family:monospace;">${escHtml(timestamp)}</p>
        </td>
      </tr>
    </table>
    <p style="color:#f85149;font-size:13px;line-height:1.5;margin:0;">
      If this wasn't you, change your password immediately and review your account security.
    </p>
  `);
}

// ─── Send Functions ──────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) return false;

  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
  try {
    await transport.sendMail({
      from: EMAIL_FROM,
      to,
      subject: 'TaskPilot AI — Reset Your Password',
      html: passwordResetBody(name, resetUrl),
    });
    return true;
  } catch (err) {
    console.error('Failed to send password reset email:', err);
    return false;
  }
}

export async function sendLoginWarningEmail(to: string, name: string, ip: string, device: string): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) return false;

  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
  try {
    await transport.sendMail({
      from: EMAIL_FROM,
      to,
      subject: 'TaskPilot AI — New Login Detected',
      html: loginWarningBody(name, ip, device, timestamp),
    });
    return true;
  } catch (err) {
    console.error('Failed to send login warning email:', err);
    return false;
  }
}

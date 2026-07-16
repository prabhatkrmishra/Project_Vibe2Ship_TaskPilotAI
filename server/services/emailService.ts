import nodemailer from 'nodemailer';

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── Simple tagged logger ───────────────────────────────────────────────────
// info-level logs (one per send attempt) are silenced by default — set
// MAILER_VERBOSE=true in .env to see them again while debugging. warn/error
// always print, since those indicate something actually went wrong.
const LOG_TAG = '[mailer]';
const MAILER_VERBOSE = process.env.MAILER_VERBOSE === 'true';
const log = {
    info: (...args: unknown[]) => {
        if (MAILER_VERBOSE) console.log(LOG_TAG, new Date().toISOString(), ...args);
    },
    warn: (...args: unknown[]) => console.warn(LOG_TAG, new Date().toISOString(), ...args),
    error: (...args: unknown[]) => console.error(LOG_TAG, new Date().toISOString(), ...args),
};

// ─── Transporter (singleton, pooled) ────────────────────────────────────────

let transporter: nodemailer.Transporter | null = null;
let transporterInitPromise: Promise<nodemailer.Transporter | null> | null = null;
let lastInitFailureAt = 0;
const INIT_RETRY_COOLDOWN_MS = 30_000; // don't hammer SMTP if it's down

// Verbose SMTP transcript logging (includes base64-encoded AUTH exchanges) is
// opt-in only. Set SMTP_DEBUG=true in .env when you need to diagnose a send
// failure; leave it unset in normal operation so credentials and per-message
// transcripts don't get written to logs.
const SMTP_DEBUG = process.env.SMTP_DEBUG === 'true';

function buildTransporter(smtpUser: string, smtpPass: string): nodemailer.Transporter {
    log.info(`Building transporter for user "${smtpUser}" @ smtp.gmail.com:587${SMTP_DEBUG ? ' (SMTP_DEBUG on)' : ''}`);
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // STARTTLS on 587
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
        logger: SMTP_DEBUG, // connection lifecycle events
        debug: SMTP_DEBUG,  // full SMTP command/response traffic — verbose, and logs base64 AUTH credentials, so keep opt-in
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        connectionTimeout: 20_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
    });
}

async function getTransporter(): Promise<nodemailer.Transporter | null> {
    const smtpUser = process.env.SMTP_USERNAME || '';
    const smtpPass = process.env.SMTP_PASSWORD || '';

    if (!smtpUser || !smtpPass) {
        log.error('SMTP_USERNAME or SMTP_PASSWORD env vars are missing/empty. Cannot build transporter.');
        return null;
    }

    if (transporter) {
        log.info('Reusing existing pooled transporter.');
        return transporter;
    }

    if (Date.now() - lastInitFailureAt < INIT_RETRY_COOLDOWN_MS) {
        const msLeft = INIT_RETRY_COOLDOWN_MS - (Date.now() - lastInitFailureAt);
        log.warn(`SMTP init on cooldown after a recent failure. Skipping retry for another ${msLeft}ms.`);
        return null;
    }

    if (!transporterInitPromise) {
        log.info('No transporter exists yet — initializing and verifying.');
        transporterInitPromise = (async () => {
            const t = buildTransporter(smtpUser, smtpPass);
            try {
                await t.verify();
                log.info('SMTP connection verified successfully. Transporter ready.');
                transporter = t;
                return t;
            } catch (err) {
                log.error('SMTP connection verification FAILED:', err);
                lastInitFailureAt = Date.now();
                try {
                    t.close();
                } catch (closeErr) {
                    log.warn('Error closing failed transporter:', closeErr);
                }
                return null;
            } finally {
                transporterInitPromise = null;
            }
        })();
    } else {
        log.info('Transporter initialization already in-flight — awaiting existing promise.');
    }

    return transporterInitPromise;
}

/** Call during graceful shutdown to close pooled connections cleanly. */
export function closeMailTransporter(): void {
    if (transporter) {
        log.info('Closing pooled SMTP transporter.');
        transporter.close();
        transporter = null;
    } else {
        log.info('closeMailTransporter called but no active transporter exists.');
    }
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

function passwordResetText(name: string, resetUrl: string): string {
    return `Hi ${name},

We received a request to reset your password. Click the link below to set a new one. This link expires in 15 minutes.

${resetUrl}

If you didn't request this, you can safely ignore this email. Your password will remain unchanged.

TaskPilot AI — Autonomous Productivity`;
}

function passwordResetHtml(name: string, resetUrl: string): string {
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

function loginWarningText(name: string, ip: string, device: string, timestamp: string): string {
    return `Hi ${name},

A new login was detected on your TaskPilot AI account:

IP Address: ${ip}
Device / Browser: ${device}
Time: ${timestamp}

If this wasn't you, change your password immediately and review your account security.

TaskPilot AI — Autonomous Productivity`;
}

function loginWarningHtml(name: string, ip: string, device: string, timestamp: string): string {
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

function verificationText(name: string, verifyUrl: string): string {
    return `Hi ${name},

Please verify your email address by clicking the link below. This link expires in 24 hours.

${verifyUrl}

If you didn't create a TaskPilot AI account, you can safely ignore this email.

TaskPilot AI — Autonomous Productivity`;
}

function verificationHtml(name: string, verifyUrl: string): string {
    return baseLayout('Verify Your Email', `
    <p style="color:#c9d1d9;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Hi ${escHtml(name)},
    </p>
    <p style="color:#c9d1d9;font-size:14px;line-height:1.6;margin:0 0 24px;">
      Please verify your email address by clicking the button below. This link expires in <strong style="color:#f0f6fc;">24 hours</strong>.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${escHtml(verifyUrl)}" style="display:inline-block;padding:12px 32px;background:#4f46e5;color:#fff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.5px;">
        Verify Email
      </a>
    </div>
    <p style="color:#8b949e;font-size:12px;line-height:1.5;margin:0;">
      If you didn't create a TaskPilot AI account, you can safely ignore this email.
    </p>
  `);
}

export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<boolean> {
    log.info(`sendPasswordResetEmail() called for "${to}"`);
    const transport = await getTransporter();
    if (!transport) {
        log.error(`Cannot send password reset email to "${to}": SMTP credentials not configured or transporter unavailable`);
        return false;
    }

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
    const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USERNAME || '';
    log.info(`Attempting to send password reset email: from="${emailFrom}" to="${to}" resetUrl="${resetUrl}"`);
    try {
        const info = await transport.sendMail({
            from: emailFrom,
            to,
            subject: 'TaskPilot AI — Reset Your Password',
            text: passwordResetText(name, resetUrl),
            html: passwordResetHtml(name, resetUrl),
        });
        log.info(`Password reset email sent to "${to}". messageId=${info.messageId} response="${info.response}" accepted=${JSON.stringify(info.accepted)} rejected=${JSON.stringify(info.rejected)}`);
        return true;
    } catch (err) {
        log.error(`Failed to send password reset email to "${to}":`, err);
        return false;
    }
}

export async function sendLoginWarningEmail(to: string, name: string, ip: string, device: string): Promise<boolean> {
    log.info(`sendLoginWarningEmail() called for "${to}" ip="${ip}" device="${device}"`);
    const transport = await getTransporter();
    if (!transport) {
        log.error(`Cannot send login warning email to "${to}": SMTP credentials not configured or transporter unavailable`);
        return false;
    }

    const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'UTC',
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });
    const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USERNAME || '';
    log.info(`Attempting to send login warning email: from="${emailFrom}" to="${to}" timestamp="${timestamp}"`);
    try {
        const info = await transport.sendMail({
            from: emailFrom,
            to,
            subject: 'TaskPilot AI — New Login Detected',
            text: loginWarningText(name, ip, device, timestamp),
            html: loginWarningHtml(name, ip, device, timestamp),
        });
        log.info(`Login warning email sent to "${to}". messageId=${info.messageId} response="${info.response}" accepted=${JSON.stringify(info.accepted)} rejected=${JSON.stringify(info.rejected)}`);
        return true;
    } catch (err) {
        log.error(`Failed to send login warning email to "${to}":`, err);
        return false;
    }
}

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    log.info(`sendEmail() called: to="${to}" subject="${subject}"`);
    const transport = await getTransporter();
    if (!transport) {
        log.error(`Cannot send email to "${to}": SMTP credentials not configured or transporter unavailable`);
        return false;
    }

    const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USERNAME || '';
    log.info(`Attempting to send email: from="${emailFrom}" to="${to}" subject="${subject}"`);
    try {
        const info = await transport.sendMail({
            from: emailFrom,
            to,
            subject,
            text,
            html,
        });
        log.info(`Email sent to "${to}". messageId=${info.messageId} response="${info.response}" accepted=${JSON.stringify(info.accepted)} rejected=${JSON.stringify(info.rejected)}`);
        return true;
    } catch (err) {
        log.error(`Failed to send email to "${to}":`, err);
        return false;
    }
}

export async function sendVerificationEmail(to: string, name: string, token: string): Promise<boolean> {
    const transport = await getTransporter();
    if (!transport) {
        log.error('Cannot send verification email: SMTP credentials not configured or transporter unavailable');
        return false;
    }

    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`;
    try {
        const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USERNAME || '';
        await transport.sendMail({
            from: emailFrom,
            to,
            subject: 'TaskPilot AI — Verify Your Email',
            text: verificationText(name, verifyUrl),
            html: verificationHtml(name, verifyUrl),
        });
        log.info(`Verification email sent to ${to}`);
        return true;
    } catch (err) {
        log.error('Failed to send verification email:', err);
        return false;
    }
}
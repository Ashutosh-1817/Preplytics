import nodemailer from 'nodemailer';
import config from '../config/env.js';

// Port 465 is implicit TLS; 587 (Gmail's default for apps) upgrades with STARTTLS
export const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

// Called once at startup so a wrong SMTP password shows up in the console immediately,
// not days later as a silent failure.
export const verifyEmailSetup = async () => {
  try {
    await transporter.verify();
    console.log(`[EMAIL] SMTP ready (${config.smtp.host}:${config.smtp.port} as ${config.smtp.user})`);
    return true;
  } catch (err) {
    console.error(`[EMAIL] SMTP is NOT working: ${err.message}\n        Check SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS in server/.env`);
    return false;
  }
};

// Never let an email failure break the caller. Returns true when the mail was accepted.
export const sendEmail = async ({ to, subject, text, html }) => {
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, text, ...(html && { html }) });
    return true;
  } catch (err) {
    console.error(`[EMAIL FAILED] to=${to} subject="${subject}"`, err.message);
    return false;
  }
};

const PURPOSES = {
  verify: {
    subject: 'Your Preplytics verification code',
    intro: 'Use this code to verify your email and finish creating your account.',
  },
  reset: {
    subject: 'Your Preplytics password reset code',
    intro: 'Use this code to reset your password. If you did not ask for this, you can ignore this email.',
  },
};

export const sendCodeEmail = async ({ to, name, code, purpose }) => {
  const p = PURPOSES[purpose];
  const first = String(name || '').split(' ')[0] || 'there';

  const text = `Hi ${first},\n\n${p.intro}\n\nYour code: ${code}\n\nIt expires in 10 minutes.\n\n- Preplytics`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1e293b">
      <h2 style="margin:0 0 8px;color:#6c5ce7">Preplytics</h2>
      <p>Hi ${first},</p>
      <p>${p.intro}</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;background:#f1f5f9;border-radius:10px;padding:14px;text-align:center;margin:20px 0">${code}</p>
      <p style="color:#64748b;font-size:13px">This code expires in 10 minutes.</p>
    </div>`;

  return sendEmail({ to, subject: p.subject, text, html });
};
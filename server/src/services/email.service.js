import nodemailer from 'nodemailer';
import config from '../config/env.js';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false, // true only for port 465; 587 uses STARTTLS
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

// Never let an email failure break the caller — reminders are a nice-to-have,
// not a critical path. Logged, not thrown.
export const sendEmail = async ({ to, subject, text }) => {
  try {
    await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject,
      text,
    });
  } catch (err) {
    console.error(`[EMAIL FAILED] to=${to} subject="${subject}"`, err.message);
  }
};
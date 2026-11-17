import nodemailer from 'nodemailer';

/** Sends mail through SMTP_URL when configured; otherwise logs the message so local development still works. */
export async function sendMail(to: string, subject: string, text: string) {
  const url = process.env.SMTP_URL;
  if (!url) { console.log(`\n[mail] SMTP_URL not set — message not sent.\n  To: ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, '\n  ')}\n`); return false; }
  await nodemailer.createTransport(url).sendMail({ from: process.env.MAIL_FROM || 'Tabiya <no-reply@localhost>', to, subject, text });
  return true;
}

export async function sendVerification(req: Request, u: { username: string; email: string }, token: string) {
  const link = `${process.env.APP_URL || new URL(req.url).origin}/verify?token=${token}`;
  return sendMail(u.email, 'Confirm your Tabiya account', `Hi ${u.username},\n\nConfirm your email address to start playing:\n\n${link}\n\nThe link expires in 24 hours. If you didn't sign up, ignore this email.`);
}

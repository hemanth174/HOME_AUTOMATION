import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request) {
  try {
    const { email, subject, text, html } = await request.json();

    if (!email || !subject) {
      return NextResponse.json({ error: 'Missing recipient email or subject' }, { status: 400 });
    }

    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587');
    const secure = process.env.SMTP_SECURE === 'true'; // true for port 465, false for port 587
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      return NextResponse.json({ error: 'SMTP credentials are not configured on the server' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || `"Smart Home Secure" <${user}>`,
      to: email,
      subject: subject,
      text: text,
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    return NextResponse.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Nodemailer API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

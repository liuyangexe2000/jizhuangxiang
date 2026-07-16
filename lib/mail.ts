import "server-only"
import nodemailer from "nodemailer"

export type SendMailInput = {
  to: string
  subject: string
  text: string
  html?: string
}

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM)
}

function createTransport() {
  const host = process.env.SMTP_HOST
  const from = process.env.SMTP_FROM
  if (!host || !from) {
    throw new Error("未配置 SMTP：请设置 SMTP_HOST 与 SMTP_FROM")
  }
  const port = Number(process.env.SMTP_PORT || 587)
  const secure = process.env.SMTP_SECURE === "true" || port === 465
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass: pass ?? "" } : undefined,
  })
}

/** 真实 SMTP 发送；未配置时抛错，由调用方决定是否降级为仅站内通知 */
export async function sendMail(input: SendMailInput) {
  const from = process.env.SMTP_FROM!
  const transporter = createTransport()
  const info = await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(input.text)}</pre>`,
  })
  return { messageId: info.messageId, accepted: info.accepted }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

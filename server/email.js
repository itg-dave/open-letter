import nodemailer from "nodemailer";
import juice from "juice";
import { getEmailTemplateBySlug, getNewsletterStats } from "./db.js";

const smtpHost = process.env.SMTP_HOST || "smtp.mailbox.org";
const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const hasSmtpAuth = Boolean(smtpUser);

if (!Number.isInteger(smtpPort)) {
  throw new Error(`Invalid SMTP_PORT: ${process.env.SMTP_PORT}`);
}

if (smtpUser && !smtpPass) {
  throw new Error("SMTP_PASS must be set when SMTP_USER is set");
}

if (process.env.NODE_ENV === "production" && (!smtpUser || !smtpPass)) {
  throw new Error("Production email requires SMTP_USER and SMTP_PASS");
}

const transportSummary = `${smtpHost}:${smtpPort} auth=${hasSmtpAuth ? "yes" : "no"}`;

export const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: false,
  ...(hasSmtpAuth ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
});

const from = '"Gehaltsdeckel Initiative" <noreply@gehaltsdeckel.jetzt>';

const fallbackTemplates = {
  verification: {
    subject: "Bitte bestätige deine Unterschrift — Gehaltsdeckel jetzt",
    html_body: `
      <p>Hallo {{name}},</p>
      <p>Danke für deine Unterschrift unter den offenen Brief „Gehaltsdeckel jetzt".</p>
      <p><a href="{{confirmUrl}}">Klicke hier, um deine E-Mail zu bestätigen</a></p>
      <p>Der Link ist 24 Stunden gültig.</p>
      <p>Mit solidarischen Grüßen<br>Initiative Gehaltsdeckel</p>
    `,
  },
  already_signed: {
    subject: "Du hast bereits unterschrieben — Gehaltsdeckel jetzt",
    html_body: `
      <p>Hallo {{name}},</p>
      <p>deine Unterschrift unter den offenen Brief „Gehaltsdeckel jetzt" ist bereits bestätigt und wird gezählt.</p>
      <p>Du musst nichts weiter tun – danke für deine Solidarität!</p>
      <p>Mit solidarischen Grüßen<br>Initiative Gehaltsdeckel</p>
    `,
  },
  deletion: {
    subject: "Deine Unterschrift löschen — Gehaltsdeckel jetzt",
    html_body: `
      <p>Hallo,</p>
      <p>du hast die Löschung deiner Unterschrift und aller gespeicherten Daten angefordert.</p>
      <p><a href="{{deleteUrl}}">Klicke hier, um deine Daten unwiderruflich zu löschen</a></p>
      <p>Der Link ist 24 Stunden gültig. Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.</p>
      <p>Mit solidarischen Grüßen<br>Initiative Gehaltsdeckel</p>
    `,
  },
};

const emailCss = `
  body { margin: 0; padding: 24px; background: #ffffff; color: #6f003c; font-family: Inter, Arial, sans-serif; }
  .email-shell { max-width: 600px; margin: 0 auto; background: #f4f1ec; border: 1px solid #6f003c; padding: 36px; }
  h1, h2, h3 { font-family: "Work Sans", Arial, sans-serif; color: #6f003c; line-height: 1.08; margin: 0 0 16px; }
  h1 { font-size: 34px; font-weight: 900; }
  h2 { font-size: 28px; font-weight: 900; }
  h3 { font-size: 22px; font-weight: 700; }
  p { font-size: 16px; line-height: 1.6; margin: 0 0 16px; color: #6f003c; }
  a { color: #ff0000; font-weight: 700; }
  blockquote, .pullquote { border-left: 5px solid #ff0000; margin: 28px 0; padding: 8px 0 8px 18px; font-family: "Work Sans", Arial, sans-serif; font-size: 22px; line-height: 1.25; }
  .anrede { font-family: "Work Sans", Arial, sans-serif; font-size: 22px; font-weight: 300; }
  .gruss { font-family: "Work Sans", Arial, sans-serif; font-weight: 700; margin-top: 28px; }
  .signers-line { color: #6b6b6b; font-family: "Work Sans", Arial, sans-serif; }
  footer { border-top: 1px solid #6f003c; color: #6b6b6b; font-size: 13px; line-height: 1.5; margin-top: 28px; padding-top: 16px; }
`;

export function interpolateTemplate(value, variables = {}) {
  return String(value || "").replace(
    /\{\{\s*(name|confirmUrl|deleteUrl|signerCount|unsubscribeUrl)\s*\}\}/g,
    (_, key) => String(variables[key] ?? ""),
  );
}

export function renderEmailHtml(htmlBody, variables = {}) {
  const body = interpolateTemplate(htmlBody, variables);
  const document = `<!doctype html><html><head><meta charset="utf-8"><style>${emailCss}</style></head><body>${body}</body></html>`;
  return juice(document);
}

export async function renderTemplateBySlug(slug, variables = {}) {
  const stats = await getNewsletterStats();
  const template =
    (await getEmailTemplateBySlug(slug)) || fallbackTemplates[slug] || null;
  if (!template) return null;

  const allVariables = {
    signerCount: stats.signerCount?.toLocaleString("de-DE") || "0",
    ...variables,
  };

  return {
    subject: interpolateTemplate(template.subject, allVariables),
    html: renderEmailHtml(template.html_body, allVariables),
  };
}

export function htmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getEmailDomain(email) {
  return String(email || "").split("@").pop() || "unknown";
}

export async function sendRenderedEmail({ to, subject, html }) {
  const toDomain = getEmailDomain(to);
  console.log(
    `[email] sending via=${transportSummary} toDomain=${toDomain} subject="${subject}"`,
  );
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text: htmlToText(html),
  });
  console.log(
    `[email] sent via=${transportSummary} toDomain=${toDomain} messageId=${info.messageId} response="${info.response || ""}"`,
  );
}

export async function sendDeletionEmail({ to, token, baseUrl }) {
  console.log(`[email] deletion request toDomain=${getEmailDomain(to)}`);
  const deleteUrl = `${baseUrl}/api/delete/${token}`;
  const rendered = await renderTemplateBySlug("deletion", { deleteUrl });

  await sendRenderedEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
  });
}

export async function sendAlreadySignedEmail({ to, name }) {
  console.log(
    `[email] already-signed notification toDomain=${getEmailDomain(to)}`,
  );
  const rendered = await renderTemplateBySlug("already_signed", { name });

  await sendRenderedEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
  });
}

export async function sendVerificationEmail({ to, name, token, baseUrl }) {
  console.log(`[email] verification toDomain=${getEmailDomain(to)}`);
  const confirmUrl = `${baseUrl}/api/confirm/${token}`;
  const rendered = await renderTemplateBySlug("verification", {
    name,
    confirmUrl,
  });

  await sendRenderedEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
  });
}

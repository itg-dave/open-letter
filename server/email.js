import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendDeletionEmail({ to, token, baseUrl }) {
  const deleteUrl = `${baseUrl}/api/delete/${token}`;

  await transporter.sendMail({
    from: '"Gehaltsdeckel Initiative" <noreply@gehaltsdeckel.jetzt>',
    to,
    subject: "Deine Unterschrift löschen — Gehaltsdeckel jetzt",
    html: `
      <p>Hallo,</p>
      <p>du hast die Löschung deiner Unterschrift und aller gespeicherten Daten angefordert.</p>
      <p><a href="${deleteUrl}">Klicke hier, um deine Daten unwiderruflich zu löschen</a></p>
      <p>Der Link ist 24 Stunden gültig. Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.</p>
      <p>Mit solidarischen Grüßen<br>Initiative Gehaltsdeckel</p>
    `,
    text: `Hallo,\n\ndu hast die Löschung deiner Unterschrift angefordert.\n\nKlicke hier zum Löschen:\n${deleteUrl}\n\nDer Link ist 24 Stunden gültig. Wenn du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.\n\nMit solidarischen Grüßen\nInitiative Gehaltsdeckel`,
  });
}

export async function sendVerificationEmail({ to, name, token, baseUrl }) {
  const confirmUrl = `${baseUrl}/api/confirm/${token}`;

  await transporter.sendMail({
    from: '"Gehaltsdeckel Initiative" <noreply@gehaltsdeckel.jetzt>',
    to,
    subject: "Bitte bestätige deine Unterschrift — Gehaltsdeckel jetzt",
    html: `
      <p>Hallo ${name},</p>
      <p>Danke für deine Unterschrift unter den offenen Brief „Gehaltsdeckel jetzt".</p>
      <p><a href="${confirmUrl}">Klicke hier, um deine E-Mail zu bestätigen</a></p>
      <p>Der Link ist 24 Stunden gültig.</p>
      <p>Mit solidarischen Grüßen<br>Initiative Gehaltsdeckel</p>
    `,
    text: `Hallo ${name},\n\nDanke für deine Unterschrift.\n\nBitte bestätige deine E-Mail-Adresse:\n${confirmUrl}\n\nDer Link ist 24 Stunden gültig.\n\nMit solidarischen Grüßen\nInitiative Gehaltsdeckel`,
  });
}

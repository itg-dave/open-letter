// To use Resend, install it (`bun add resend`) and uncomment:
// import { Resend } from "resend";
// const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail({ to, name, token, baseUrl }) {
  const confirmUrl = `${baseUrl}/api/confirm/${token}`;

  // Default: log to console (swap this block for a real provider)
  console.log(`\n--- Verification Email ---`);
  console.log(`To: ${to}`);
  console.log(`Name: ${name}`);
  console.log(`Confirm: ${confirmUrl}`);
  console.log(`-------------------------\n`);

  // Resend example:
  // await resend.emails.send({
  //   from: "Diätendeckel Initiative <noreply@diaetendeckel-initiative.de>",
  //   to,
  //   subject: "Bitte bestätige deine Unterschrift — Diätendeckel jetzt",
  //   html: `
  //     <p>Hallo ${name},</p>
  //     <p>Danke für deine Unterschrift unter den offenen Brief „Diätendeckel jetzt".</p>
  //     <p><a href="${confirmUrl}">Klicke hier, um deine E-Mail zu bestätigen</a></p>
  //     <p>Der Link ist 24 Stunden gültig.</p>
  //     <p>Mit solidarischen Grüßen,<br>Initiative Diätendeckel</p>
  //   `,
  // });
}

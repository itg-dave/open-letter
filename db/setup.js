import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "./connection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const templates = [
  {
    slug: "verification",
    name: "Bestatigung der Unterschrift",
    subject: "Bitte bestätige deine Unterschrift — Gehaltsdeckel jetzt",
    htmlBody: `
      <p>Hallo {{name}},</p>
      <p>Danke für deine Unterschrift unter den offenen Brief „Gehaltsdeckel jetzt".</p>
      <p><a href="{{confirmUrl}}">Klicke hier, um deine E-Mail zu bestätigen</a></p>
      <p>Der Link ist 24 Stunden gültig.</p>
      <p>Mit solidarischen Grüßen<br>Initiative Gehaltsdeckel</p>
    `,
  },
  {
    slug: "deletion",
    name: "Loschung der Unterschrift",
    subject: "Deine Unterschrift löschen — Gehaltsdeckel jetzt",
    htmlBody: `
      <p>Hallo,</p>
      <p>du hast die Löschung deiner Unterschrift und aller gespeicherten Daten angefordert.</p>
      <p><a href="{{deleteUrl}}">Klicke hier, um deine Daten unwiderruflich zu löschen</a></p>
      <p>Der Link ist 24 Stunden gültig. Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.</p>
      <p>Mit solidarischen Grüßen<br>Initiative Gehaltsdeckel</p>
    `,
  },
  {
    slug: "zoom_confirmation",
    name: "Zoom-Anmeldung Bestatigung",
    subject: "Du bist dabei — Zoom am {{eventLabel}} — Gehaltsdeckel jetzt",
    htmlBody: `
      <p>Hallo {{firstName}},</p>
      <p>danke für deine Anmeldung zum Zoom-Treffen der Unterzeichner*innen am <strong>{{eventLabel}}</strong>.</p>
      <p>Wir sprechen gemeinsam über die öffentliche Übergabe und eine Choreografie auf dem Parteitag und planen die nächsten Schritte.</p>
      {{linkInfo}}
      <p>Bis dann und mit solidarischen Grüßen<br>Initiative Gehaltsdeckel</p>
    `,
  },
  {
    slug: "zoom_link",
    name: "Zoom-Link (1 Tag vorher)",
    subject: "Dein Zoom-Link für das Treffen am {{eventLabel}}",
    htmlBody: `
      <p>Hallo {{firstName}},</p>
      <p>morgen ist es so weit — unser Zoom-Treffen am <strong>{{eventLabel}}</strong>. Hier ist dein Einwahllink:</p>
      {{linkInfo}}
      <p>Den passenden Kalendereintrag findest du im Anhang (.ics) oder über den Button oben.</p>
      <p>Bis morgen und mit solidarischen Grüßen<br>Initiative Gehaltsdeckel</p>
    `,
  },
  {
    slug: "zoom_reminder",
    name: "Zoom-Erinnerung (2 Std. vorher)",
    subject: "Gleich geht's los — Zoom-Treffen in 2 Stunden",
    htmlBody: `
      <p>Hallo {{firstName}},</p>
      <p>kleine Erinnerung: In rund 2 Stunden startet unser Zoom-Treffen am <strong>{{eventLabel}}</strong>.</p>
      {{linkInfo}}
      <p>Wir freuen uns auf dich!<br>Initiative Gehaltsdeckel</p>
    `,
  },
  {
    slug: "zoom_newsletter_invite",
    name: "Newsletter → Zoom-Einladung",
    subject:
      "Bist du dabei? Zoom-Treffen am {{eventLabel}} — Gehaltsdeckel jetzt",
    htmlBody: `
      <div class="email-shell">
        <p class="anrede">Hallo {{firstName}},</p>
        <p>wir planen unser erstes gemeinsames Zoom-Treffen am <strong>{{eventLabel}}</strong> und würden uns freuen, wenn du dabei bist.</p>
        <p>In dem Treffen wollen wir gemeinsam die nächsten Schritte besprechen — die öffentliche Übergabe des Briefes, eine Choreografie auf dem Parteitag und mehr.</p>
        <p><strong>Melde dich jetzt mit einem Klick an:</strong></p>
        <p>
          <a href="{{zoomJaUrl}}" style="display:inline-block;background:#ff0000;color:#ffffff;font-family:'Work Sans',Arial,sans-serif;font-weight:700;font-size:15px;text-decoration:none;padding:13px 22px;border:2px solid #6f003c;">Ja, ich bin dabei</a>
        </p>
        <p>
          <a href="{{zoomJaDelegiertUrl}}" style="display:inline-block;background:#6f003c;color:#ffffff;font-family:'Work Sans',Arial,sans-serif;font-weight:700;font-size:15px;text-decoration:none;padding:13px 22px;border:2px solid #6f003c;">Ja, ich bin dabei und bin Delegierte*r</a>
        </p>
        <p>Deine Angaben (Name, Kreisverband) werden automatisch aus deiner Unterschrift übernommen — du musst nichts weiter ausfüllen.</p>
        <p class="gruss">Mit solidarischen Grüßen<br>Initiative Gehaltsdeckel</p>
        <footer>Du erhältst diese E-Mail, weil du Updates abonniert hast. <a href="{{unsubscribeUrl}}">E-Mails abbestellen</a>.</footer>
      </div>
    `,
  },
  {
    slug: "open-letter-update",
    name: "Open Letter Update",
    subject: "Update: Gehaltsdeckel jetzt — {{signerCount}} Mitzeichner*innen",
    htmlBody: `
      <div class="email-shell">
        <h1>Ein Brief von Genoss*innen</h1>
        <p class="anrede">Liebe Genoss*innen,</p>
        <p>in diesem Brief melden wir uns als aktive Mitglieder der Linken - mit und ohne Funktion - zu Wort. Wir wollen uns konstruktiv in die Debatte um den Gehaltsdeckel für Mandatsträger*innen einbringen, die in den vergangenen Wochen von Abgeordneten teils unschön über die Medien geführt wurde. Denn es ist uns wichtig, dass unsere Perspektive gehört wird.</p>
        <p>Der Parteivorstand hat dem nächsten Bundesparteitag in Potsdam einen Antrag zur Begrenzung der Diäten von Mandatsträger*innen vorgelegt. Für uns ist dieser Antrag absolut richtig und längst überfällig. Denn natürlich ist in einer Partei wie der Linken die Rolle von Mandatsträger*innen und ihr Verhältnis zur Partei eine zentrale politische Frage. Wir wollen über den Diätendeckel demokratisch diskutieren, und zwar auf dem Parteitag. Genau dort gehört diese Auseinandersetzung hin.</p>
        <p>Das Comeback 2025 wurde nicht von Mandatsträger*innen allein ermöglicht. Es wurde von tausenden Mitgliedern getragen, die ihre Feierabende, ihre Wochenenden und ihre Energie mit Wahlkampf verbracht haben.</p>
        <blockquote class="pullquote">„Die Linke wurde von uns allen gerettet."</blockquote>
        <p>Wir erwarten, dass Mandate in der Linken anders verstanden werden als in anderen Parteien: als politische Verantwortung gegenüber der Partei und den Menschen, die sie tragen. Und nicht als persönliche Karrieremöglichkeit. Ein wirksamer Gehaltsdeckel ist es für uns nur, wenn wir uns an den Durchschnittslöhnen in diesem Land orientieren.</p>
        <p>Wir alle teilen eine Vision. Das Comeback 2025 war nur der erste Schritt. Wir wollen die Linke weiter aufbauen, Menschen organisieren und so eine nachhaltige sozialistische Politik schaffen.</p>
        <p class="gruss">Mit solidarischen Grüßen</p>
        <p class="signers-line">{{signerCount}} Mitglieder und Sympathisant*innen der Partei Die Linke</p>
        <footer>Du erhältst diese E-Mail, weil du Updates abonniert hast. <a href="{{unsubscribeUrl}}">E-Mails abbestellen oder Unterschrift löschen</a>.</footer>
      </div>
    `,
  },
];

try {
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  db.run(schema);
  const insert = db.query(
    `INSERT INTO email_templates (slug, name, subject, html_body)
     VALUES (?, ?, ?, ?) ON CONFLICT (slug) DO NOTHING`,
  );
  for (const template of templates) {
    insert.run(
      template.slug,
      template.name,
      template.subject,
      template.htmlBody,
    );
  }
  console.log("Database schema applied successfully.");
} catch (err) {
  console.error("Failed to apply database schema:", err.message);
  process.exit(1);
} finally {
  db.close();
}

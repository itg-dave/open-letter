import { useCallback, useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import { format, parse, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import {
  Mark,
  mergeAttributes,
  markInputRule,
  markPasteRule,
} from "@tiptap/core";

const TOKEN_KEY = "gehaltsdeckel_admin_token";
const AUDIENCE_LABELS = {
  newsletter: "Newsletter-Unterschreiber",
  newsletter_zoom_invite: "Newsletter → Zoom-Einladung",
  zoom: "Zoom-Anmelder",
  zoom_delegates: "Delegierte (Zoom)",
};

function zoomMailingStatus(mailings, kind) {
  const m = (mailings || []).find((x) => x.kind === kind);
  if (!m) return "ausstehend";
  if (m.status === "sent") {
    const count = m.recipient_count != null ? ` (${m.recipient_count})` : "";
    const when = m.sent_at
      ? " am " + new Date(m.sent_at).toLocaleString("de-DE")
      : "";
    return `gesendet${count}${when}`;
  }
  if (m.status === "sending") return "läuft …";
  if (m.status === "failed") return "fehlgeschlagen — wird erneut versucht";
  return m.status;
}
const GERMAN_STATES = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
];
const variables = [
  "name",
  "firstName",
  "confirmUrl",
  "deleteUrl",
  "signerCount",
  "unsubscribeUrl",
  "eventLabel",
  "zoomJaUrl",
  "zoomJaDelegiertUrl",
];

const TemplateVariable = Mark.create({
  name: "templateVariable",

  parseHTML() {
    return [{ tag: "span[data-template-variable]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-template-variable": "" }),
      0,
    ];
  },

  addInputRules() {
    return [
      markInputRule({
        find: /(\{\{\s*(?:name|confirmUrl|deleteUrl|signerCount|unsubscribeUrl)\s*\}\})$/,
        type: this.type,
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: /\{\{\s*(?:name|confirmUrl|deleteUrl|signerCount|unsubscribeUrl)\s*\}\}/g,
        type: this.type,
      }),
    ];
  },
});

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ISO timestamp -> value for <input type="datetime-local"> in browser-local time.
function isoToLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function StatusBadge({ status }) {
  return <span className={`admin-status status-${status}`}>{status}</span>;
}

function ToolbarButton({ active, children, onClick, title }) {
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

function TemplateEditor({ token, template, onSaved, onDeleted }) {
  const [subject, setSubject] = useState(template?.subject || "");
  const [htmlBody, setHtmlBody] = useState(template?.html_body || "");
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [linkInput, setLinkInput] = useState(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "E-Mail-Text schreiben ..." }),
      CharacterCount.configure({ limit: 20000 }),
      TemplateVariable,
    ],
    content: htmlBody,
    immediatelyRender: false,
    onUpdate({ editor }) {
      setHtmlBody(editor.getHTML());
    },
  });

  useEffect(() => {
    setSubject(template?.subject || "");
    setHtmlBody(template?.html_body || "");
    setMessage("");
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(template?.html_body || "", false);
    }
  }, [template, editor]);

  useEffect(() => {
    if (!htmlBody) {
      setPreview("");
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch("/api/admin/preview", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ html_body: htmlBody }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreview(data.html);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [htmlBody, token]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href || "";
    setLinkInput(previous);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor || linkInput === null) return;
    const href = linkInput.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkInput(null);
  }, [editor, linkInput]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setMessage("");
    const start = Date.now();
    const res = await fetch(`/api/admin/templates/${template.id}`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ subject, html_body: htmlBody }),
    });
    const elapsed = Date.now() - start;
    if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
    setSaving(false);
    if (!res.ok) {
      setMessage("Speichern fehlgeschlagen.");
      return;
    }
    const updated = await res.json();
    setSaved(true);
    onSaved(updated);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!template) return <div className="admin-empty">Vorlage auswählen.</div>;

  return (
    <div className="admin-editor-grid">
      <div className="admin-card editor-card">
        <div className="field">
          <label>Betreff</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div className="editor-toolbar" aria-label="Editor-Werkzeuge">
          <ToolbarButton
            title="Fett"
            active={editor?.isActive("bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            B
          </ToolbarButton>
          <ToolbarButton
            title="Kursiv"
            active={editor?.isActive("italic")}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            I
          </ToolbarButton>
          <ToolbarButton
            title="Unterstrichen"
            active={editor?.isActive("underline")}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            U
          </ToolbarButton>
          <ToolbarButton
            title="Durchgestrichen"
            active={editor?.isActive("strike")}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            S
          </ToolbarButton>
          <ToolbarButton
            title="H2"
            active={editor?.isActive("heading", { level: 2 })}
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            title="H3"
            active={editor?.isActive("heading", { level: 3 })}
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            H3
          </ToolbarButton>
          <ToolbarButton
            title="Liste"
            active={editor?.isActive("bulletList")}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            •
          </ToolbarButton>
          <ToolbarButton
            title="Nummerierte Liste"
            active={editor?.isActive("orderedList")}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            1.
          </ToolbarButton>
          <ToolbarButton
            title="Zitat"
            active={editor?.isActive("blockquote")}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            ”
          </ToolbarButton>
          <ToolbarButton
            title="Link"
            active={editor?.isActive("link")}
            onClick={setLink}
          >
            ↗
          </ToolbarButton>
          <ToolbarButton
            title="Trennlinie"
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          >
            —
          </ToolbarButton>
          <ToolbarButton
            title="Rückgängig"
            onClick={() => editor?.chain().focus().undo().run()}
          >
            ↶
          </ToolbarButton>
          <ToolbarButton
            title="Wiederholen"
            onClick={() => editor?.chain().focus().redo().run()}
          >
            ↷
          </ToolbarButton>
        </div>

        {linkInput !== null && (
          <div
            className="link-input-row"
            role="dialog"
            aria-modal="false"
            aria-label="Link einfügen"
          >
            <input
              autoFocus
              type="url"
              placeholder="https://..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyLink();
                if (e.key === "Escape") setLinkInput(null);
              }}
            />
            <button type="button" onClick={applyLink}>
              OK
            </button>
            <button
              type="button"
              aria-label="Abbrechen"
              onClick={() => setLinkInput(null)}
            >
              ✕
            </button>
          </div>
        )}

        <div className="admin-editor-surface">
          <EditorContent editor={editor} />
        </div>

        <div className="admin-variable-row">
          {variables.map((variable) => (
            <button
              type="button"
              key={variable}
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .insertContent(
                    `<span data-template-variable>{{${variable}}}</span>`,
                  )
                  .run()
              }
            >
              {`{{${variable}}}`}
            </button>
          ))}
        </div>

        <div className="admin-actions">
          <button
            type="button"
            className={"cta" + (saved ? " cta--saved" : "")}
            onClick={save}
            disabled={saving || saved}
          >
            {saving ? "Speichert …" : saved ? "Gespeichert ✓" : "Speichern"}
          </button>
          {!template.system && (
            <button
              type="button"
              className="admin-danger"
              onClick={() => onDeleted(template.id)}
            >
              Löschen
            </button>
          )}
          <span>{message}</span>
        </div>
      </div>

      <aside className="admin-card preview-card">
        <div className="admin-card-title">Vorschau</div>
        <iframe title="E-Mail Vorschau" sandbox="" srcDoc={preview} />
      </aside>
    </div>
  );
}

export default function AdminApp() {
  const [token, setToken] = useState(
    () => localStorage.getItem(TOKEN_KEY) || "",
  );
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState("templates");
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState({
    signerCount: 0,
    subscriberCount: 0,
    zoomCount: 0,
    zoomDelegateCount: 0,
  });
  const [newName, setNewName] = useState("");
  const [scheduleTemplate, setScheduleTemplate] = useState("");
  const [scheduleSubject, setScheduleSubject] = useState("");
  const [audience, setAudience] = useState("newsletter");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState("10:00");
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState(null);
  const [dateInput, setDateInput] = useState(() =>
    format(new Date(), "dd.MM.yyyy"),
  );
  const [stateResolution, setStateResolution] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolveMessage, setResolveMessage] = useState("");
  const [outlierGroups, setOutlierGroups] = useState([]);
  const [merging, setMerging] = useState(null);
  const [unresolvedKvs, setUnresolvedKvs] = useState([]);
  const [kvStateSelections, setKvStateSelections] = useState({});
  const [assigningKv, setAssigningKv] = useState(null);
  const [occOutlierGroups, setOccOutlierGroups] = useState([]);
  const [occMerging, setOccMerging] = useState(null);
  const [zoomRegs, setZoomRegs] = useState([]);
  const [zoomMailings, setZoomMailings] = useState(null);
  const [zoomTestEmail, setZoomTestEmail] = useState("");
  const [zoomTestStatus, setZoomTestStatus] = useState(null);
  const [zoomEventAtInput, setZoomEventAtInput] = useState("");
  const [zoomLinkInput, setZoomLinkInput] = useState("");
  const [zoomLinkOffset, setZoomLinkOffset] = useState(24);
  const [zoomReminderOffset, setZoomReminderOffset] = useState(2);
  const [zoomSettingsStatus, setZoomSettingsStatus] = useState(null);

  function handleDateInput(e) {
    const raw = e.target.value;
    setDateInput(raw);
    if (raw.length === 10) {
      const parsed = parse(raw, "dd.MM.yyyy", new Date());
      if (isValid(parsed)) setSelectedDate(parsed);
    }
  }

  const api = useCallback(
    async (path, options = {}) => {
      const res = await fetch(path, {
        ...options,
        headers: {
          ...authHeaders(token),
          ...(options.headers || {}),
        },
      });
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
      }
      return res;
    },
    [token],
  );

  const loadAll = useCallback(async () => {
    if (!token) return;
    const [
      templateRes,
      campaignRes,
      statsRes,
      stateRes,
      outlierRes,
      unresolvedRes,
      occOutlierRes,
    ] = await Promise.all([
      api("/api/admin/templates"),
      api("/api/admin/campaigns"),
      api("/api/admin/stats"),
      api("/api/admin/state-resolution-status"),
      api("/api/admin/kv-outliers"),
      api("/api/admin/unresolved-kvs"),
      api("/api/admin/occupation-outliers"),
    ]);
    if (templateRes.ok) {
      const data = await templateRes.json();
      setTemplates(data);
      setSelectedId((current) => current || data[0]?.id || null);
      setScheduleTemplate((t) => t || (data[0] ? String(data[0].id) : ""));
      setScheduleSubject((s) => s || (data[0] ? data[0].subject : ""));
    }
    if (campaignRes.ok) setCampaigns(await campaignRes.json());
    if (statsRes.ok) setStats(await statsRes.json());
    if (stateRes.ok) setStateResolution(await stateRes.json());
    if (outlierRes.ok) setOutlierGroups(await outlierRes.json());
    if (unresolvedRes.ok) setUnresolvedKvs(await unresolvedRes.json());
    if (occOutlierRes.ok) setOccOutlierGroups(await occOutlierRes.json());
  }, [api, token]);

  const reloadCampaigns = useCallback(async () => {
    const [campaignRes, statsRes] = await Promise.all([
      api("/api/admin/campaigns"),
      api("/api/admin/stats"),
    ]);
    if (campaignRes.ok) setCampaigns(await campaignRes.json());
    if (statsRes.ok) setStats(await statsRes.json());
  }, [api]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedId || !token) return;
    api(`/api/admin/templates/${selectedId}`).then(async (res) => {
      if (res.ok) setSelectedTemplate(await res.json());
    });
  }, [api, selectedId, token]);

  useEffect(() => {
    if (tab !== "zoom" || !token) return;
    api("/api/admin/zoom-registrations").then(async (res) => {
      if (res.ok) setZoomRegs(await res.json());
    });
    api("/api/admin/zoom-mailings").then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setZoomMailings(data);
        setZoomEventAtInput(isoToLocalInput(data.eventAt));
        setZoomLinkInput(data.link || "");
        setZoomLinkOffset(data.linkOffsetHours ?? 24);
        setZoomReminderOffset(data.reminderOffsetHours ?? 2);
      }
    });
  }, [api, tab, token]);

  async function login(e) {
    e.preventDefault();
    setLoginError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setLoginError("Anmeldung fehlgeschlagen.");
      return;
    }
    const { token: newToken } = await res.json();
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setPassword("");
    // Bootstrap data immediately with the fresh token — don't wait for the hook chain
    const h = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${newToken}`,
    };
    const [tRes, cRes, sRes] = await Promise.all([
      fetch("/api/admin/templates", { headers: h }),
      fetch("/api/admin/campaigns", { headers: h }),
      fetch("/api/admin/stats", { headers: h }),
    ]);
    if (tRes.ok) {
      const data = await tRes.json();
      setTemplates(data);
      setSelectedId(data[0]?.id || null);
      if (data[0]) {
        setScheduleTemplate(String(data[0].id));
        setScheduleSubject(data[0].subject);
      }
    }
    if (cRes.ok) setCampaigns(await cRes.json());
    if (sRes.ok) setStats(await sRes.json());
  }

  async function createTemplate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const res = await api("/api/admin/templates", {
      method: "POST",
      body: JSON.stringify({
        name: newName,
        subject: "Neuer Newsletter",
        html_body: "<h2>Neue Nachricht</h2><p>Hallo {{name}},</p><p>...</p>",
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setNewName("");
      setTemplates((prev) => [created, ...prev]);
      setSelectedId(created.id);
    }
  }

  async function deleteTemplate(id) {
    if (!window.confirm("Diese Vorlage löschen?")) return;
    const res = await api(`/api/admin/templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTemplates((prev) => prev.filter((template) => template.id !== id));
      setSelectedId(
        templates.find((template) => template.id !== id)?.id || null,
      );
    }
  }

  async function scheduleCampaign(e) {
    e.preventDefault();
    if (!scheduleTemplate || !selectedDate) return;
    const [hour, minute] = selectedTime.split(":").map(Number);
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(hour || 0, minute || 0, 0, 0);

    const res = await api("/api/admin/campaigns", {
      method: "POST",
      body: JSON.stringify({
        template_id: scheduleTemplate,
        subject: scheduleSubject,
        scheduled_at: scheduledAt.toISOString(),
        audience,
      }),
    });
    if (res.ok) reloadCampaigns();
  }

  async function sendNow(e) {
    e.preventDefault();
    if (!scheduleTemplate) return;
    if (
      !window.confirm(
        `Jetzt an „${AUDIENCE_LABELS[audience]}" (${audienceCount.toLocaleString(
          "de-DE",
        )} Empfänger*innen) senden?`,
      )
    )
      return;
    const res = await api("/api/admin/campaigns", {
      method: "POST",
      body: JSON.stringify({
        template_id: scheduleTemplate,
        subject: scheduleSubject,
        scheduled_at: new Date().toISOString(),
        audience,
      }),
    });
    if (res.ok) reloadCampaigns();
  }

  async function sendTest(e) {
    e.preventDefault();
    if (!scheduleTemplate || !testEmail) return;
    setTestStatus("sending");
    const res = await api("/api/admin/test-send", {
      method: "POST",
      body: JSON.stringify({
        template_id: scheduleTemplate,
        subject: scheduleSubject,
        to: testEmail,
        audience,
      }),
    });
    if (res.ok) {
      setTestStatus("ok");
      setTimeout(() => setTestStatus(null), 4000);
    } else {
      const data = await res.json().catch(() => ({}));
      setTestStatus(data.error || "Fehler beim Senden");
    }
  }

  async function cancel(id) {
    const res = await api(`/api/admin/campaigns/${id}`, { method: "DELETE" });
    if (res.ok) reloadCampaigns();
  }

  async function saveZoomSettings(e) {
    e.preventDefault();
    if (!zoomEventAtInput) return;
    setZoomSettingsStatus("saving");
    const res = await api("/api/admin/zoom-settings", {
      method: "POST",
      body: JSON.stringify({
        eventAt: new Date(zoomEventAtInput).toISOString(),
        zoomLink: zoomLinkInput,
        linkOffsetHours: Number(zoomLinkOffset),
        reminderOffsetHours: Number(zoomReminderOffset),
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setZoomSettingsStatus(data.mailingsReset ? "ok-reset" : "ok");
      // reload status panel
      api("/api/admin/zoom-mailings").then(async (r) => {
        if (r.ok) setZoomMailings(await r.json());
      });
      setTimeout(() => setZoomSettingsStatus(null), 5000);
    } else {
      const data = await res.json().catch(() => ({}));
      setZoomSettingsStatus(data.error || "Fehler beim Speichern");
    }
  }

  async function sendZoomTest(kind) {
    if (!zoomTestEmail) return;
    setZoomTestStatus("sending");
    const res = await api("/api/admin/zoom-test-send", {
      method: "POST",
      body: JSON.stringify({ to: zoomTestEmail, kind }),
    });
    if (res.ok) {
      setZoomTestStatus("ok");
      setTimeout(() => setZoomTestStatus(null), 4000);
    } else {
      const data = await res.json().catch(() => ({}));
      setZoomTestStatus(data.error || "Fehler beim Senden");
    }
  }

  function logout() {
    if (!confirm("Wirklich abmelden?")) return;
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
  }

  const audienceCount =
    audience === "zoom"
      ? stats.zoomCount
      : audience === "zoom_delegates"
        ? stats.zoomDelegateCount
        : stats.subscriberCount;

  if (!token) {
    return (
      <main className="admin-shell login-shell">
        <form className="form-card admin-login" onSubmit={login}>
          <span className="badge">Admin</span>
          <h1>Verwaltung</h1>
          <p className="sub2">
            Passwort eingeben, Sitzung bleibt nur in diesem Tab aktiv.
          </p>
          <div className="field">
            <label>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {loginError && <p className="error">{loginError}</p>}
          <button className="cta" type="submit">
            Anmelden
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="topbar admin-topbar">
        <div className="wordmark">
          <span className="dot" />
          Verwaltung
        </div>
        <nav aria-label="Admin Bereiche">
          <button
            className={tab === "templates" ? "active" : ""}
            aria-current={tab === "templates" ? "page" : undefined}
            onClick={() => setTab("templates")}
          >
            Vorlagen
          </button>
          <button
            className={tab === "campaigns" ? "active" : ""}
            aria-current={tab === "campaigns" ? "page" : undefined}
            onClick={() => setTab("campaigns")}
          >
            Versand
          </button>
          <button
            className={tab === "zoom" ? "active" : ""}
            aria-current={tab === "zoom" ? "page" : undefined}
            onClick={() => setTab("zoom")}
          >
            Zoom
          </button>
          <button
            className={tab === "settings" ? "active" : ""}
            aria-current={tab === "settings" ? "page" : undefined}
            onClick={() => setTab("settings")}
          >
            Einstellungen
          </button>
        </nav>
      </header>

      {tab === "templates" && (
        <section className="section">
          <div className="section-inner admin-layout">
            <aside className="admin-sidebar">
              <form className="admin-card" onSubmit={createTemplate}>
                <label>Neue Newsletter-Vorlage</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                />
                <button className="cta" type="submit">
                  Anlegen
                </button>
              </form>

              <div className="admin-list">
                {templates.map((template) => (
                  <button
                    type="button"
                    key={template.id}
                    className={template.id === selectedId ? "active" : ""}
                    onClick={() => setSelectedId(template.id)}
                  >
                    <strong>{template.name}</strong>
                    <span>{template.system ? "System" : template.slug}</span>
                  </button>
                ))}
              </div>
            </aside>

            <TemplateEditor
              token={token}
              template={selectedTemplate}
              onSaved={(updated) => {
                setSelectedTemplate(updated);
                setTemplates((prev) =>
                  prev.map((template) =>
                    template.id === updated.id
                      ? { ...template, ...updated }
                      : template,
                  ),
                );
              }}
              onDeleted={deleteTemplate}
            />
          </div>
        </section>
      )}

      {tab === "campaigns" && (
        <section className="section">
          <div className="section-inner admin-campaigns">
            <form
              className="admin-card campaign-form"
              onSubmit={scheduleCampaign}
            >
              <div className="admin-card-title">Versand planen</div>
              <div className="field">
                <label>Empfängergruppe</label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                >
                  <option value="newsletter">Newsletter-Unterschreiber</option>
                  <option value="newsletter_zoom_invite">
                    Newsletter → Zoom-Einladung
                  </option>
                  <option value="zoom">Zoom-Anmelder (alle)</option>
                  <option value="zoom_delegates">Nur Delegierte (Zoom)</option>
                </select>
              </div>
              <div className="field">
                <label>Vorlage</label>
                <select
                  value={scheduleTemplate}
                  onChange={(e) => {
                    setScheduleTemplate(e.target.value);
                    const template = templates.find(
                      (item) => String(item.id) === e.target.value,
                    );
                    if (template) setScheduleSubject(template.subject);
                  }}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Betreff</label>
                <input
                  value={scheduleSubject}
                  onChange={(e) => setScheduleSubject(e.target.value)}
                />
              </div>
              <div className="admin-picker-wrapper">
                <div className="admin-date-row">
                  <div className="field">
                    <label>Datum</label>
                    <input
                      type="text"
                      value={dateInput}
                      onChange={handleDateInput}
                      placeholder="TT.MM.JJJJ"
                      maxLength={10}
                    />
                  </div>
                  <div className="field">
                    <label>Uhrzeit</label>
                    <input
                      type="time"
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      lang="de"
                    />
                  </div>
                </div>
                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setDateInput(format(date, "dd.MM.yyyy"));
                    }
                  }}
                  locale={de}
                />
                <p className="admin-muted">
                  {selectedDate
                    ? format(selectedDate, "PPPP", { locale: de })
                    : ""}
                </p>
              </div>
              <div className="admin-actions">
                <button className="cta" type="submit">
                  Termin speichern
                </button>
                <button className="cta" type="button" onClick={sendNow}>
                  Jetzt senden
                </button>
              </div>
              <p className="admin-muted">
                Empfänger*innen ({AUDIENCE_LABELS[audience]}):{" "}
                {audienceCount.toLocaleString("de-DE")}
              </p>

              <div className="admin-test-send">
                <div className="field">
                  <label>Testversand an</label>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="test@beispiel.de"
                  />
                </div>
                <button
                  className="cta cta--outline"
                  type="button"
                  onClick={sendTest}
                  disabled={!testEmail || testStatus === "sending"}
                >
                  {testStatus === "sending"
                    ? "Wird gesendet\u2026"
                    : "Test senden"}
                </button>
                {testStatus === "ok" && (
                  <p className="admin-test-feedback admin-test-ok">
                    E-Mail gesendet
                  </p>
                )}
                {testStatus &&
                  testStatus !== "ok" &&
                  testStatus !== "sending" && (
                    <p className="admin-test-feedback admin-test-error">
                      {testStatus}
                    </p>
                  )}
              </div>
            </form>

            <div className="admin-card campaign-list">
              <div className="admin-card-title">Kampagnen</div>
              {campaigns.length === 0 && (
                <p className="admin-muted">Noch keine Kampagnen geplant.</p>
              )}
              {campaigns.map((campaign) => (
                <div className="campaign-row" key={campaign.id}>
                  <div>
                    <strong>{campaign.subject}</strong>
                    <span>
                      {campaign.template_name || "Vorlage gelöscht"} ·{" "}
                      {AUDIENCE_LABELS[campaign.audience] || "Newsletter"}
                    </span>
                    <small>
                      {new Date(campaign.scheduled_at).toLocaleString("de-DE", {
                        hour12: false,
                      })}
                    </small>
                  </div>
                  <StatusBadge status={campaign.status} />
                  {campaign.status === "failed" && campaign.sent_offset > 0 && (
                    <small style={{ color: "#b45309" }}>
                      {campaign.sent_offset} gesendet — wird fortgesetzt
                    </small>
                  )}
                  {campaign.status === "scheduled" && (
                    <button type="button" onClick={() => cancel(campaign.id)}>
                      Absagen
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === "zoom" && (
        <section className="section">
          <div className="section-inner">
            <form
              className="admin-card"
              style={{ marginBottom: 20 }}
              onSubmit={saveZoomSettings}
            >
              <div className="admin-card-title">Termin & Versand-Timing</div>
              <div className="field">
                <label>Termin (Datum & Uhrzeit)</label>
                <input
                  type="datetime-local"
                  value={zoomEventAtInput}
                  onChange={(e) => setZoomEventAtInput(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Zoom-Link</label>
                <input
                  type="url"
                  value={zoomLinkInput}
                  onChange={(e) => setZoomLinkInput(e.target.value)}
                  placeholder="https://zoom.us/j/..."
                />
              </div>
              <div className="admin-date-row">
                <div className="field">
                  <label>Link-Mail: Stunden vor dem Termin</label>
                  <input
                    type="number"
                    min="0"
                    value={zoomLinkOffset}
                    onChange={(e) => setZoomLinkOffset(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Erinnerung: Stunden vor dem Termin</label>
                  <input
                    type="number"
                    min="0"
                    value={zoomReminderOffset}
                    onChange={(e) => setZoomReminderOffset(e.target.value)}
                  />
                </div>
              </div>
              <p className="admin-muted">
                Bei Änderung des Termins wird der Versand-Status zurückgesetzt,
                sodass Link-Mail und Erinnerung neu ausgelöst werden.
              </p>
              <div className="admin-actions">
                <button
                  className="cta"
                  type="submit"
                  disabled={
                    !zoomEventAtInput || zoomSettingsStatus === "saving"
                  }
                >
                  {zoomSettingsStatus === "saving"
                    ? "Wird gespeichert…"
                    : "Speichern"}
                </button>
              </div>
              {zoomSettingsStatus === "ok" && (
                <p className="admin-test-feedback admin-test-ok">Gespeichert</p>
              )}
              {zoomSettingsStatus === "ok-reset" && (
                <p className="admin-test-feedback admin-test-ok">
                  Gespeichert · Versand-Status zurückgesetzt
                </p>
              )}
              {zoomSettingsStatus &&
                !["ok", "ok-reset", "saving"].includes(zoomSettingsStatus) && (
                  <p className="admin-test-feedback admin-test-error">
                    {zoomSettingsStatus}
                  </p>
                )}
            </form>

            {zoomMailings && (
              <div className="admin-card" style={{ marginBottom: 20 }}>
                <div className="admin-card-title">Automatische E-Mails</div>
                <p className="admin-muted">
                  Termin: {zoomMailings.eventLabel} (
                  {new Date(zoomMailings.eventAt).toLocaleString("de-DE")}) ·
                  Zoom-Link{" "}
                  {zoomMailings.hasLink ? "gesetzt" : "fehlt noch (ZOOM_LINK)"}
                </p>
                <p>
                  <strong>Link-Mail (1 Tag vorher, mit .ics):</strong>{" "}
                  {zoomMailingStatus(zoomMailings.mailings, "link")}
                </p>
                <p>
                  <strong>Erinnerung (2 Std. vorher):</strong>{" "}
                  {zoomMailingStatus(zoomMailings.mailings, "reminder")}
                </p>
              </div>
            )}

            <div className="admin-card" style={{ marginBottom: 20 }}>
              <div className="admin-card-title">Test-Mails</div>
              <p className="admin-muted">
                Schickt die jeweilige Zoom-Mail an eine einzelne Adresse (ohne
                die echten Anmeldungen anzurühren).
              </p>
              <div className="field">
                <label>Test-Adresse</label>
                <input
                  type="email"
                  value={zoomTestEmail}
                  onChange={(e) => setZoomTestEmail(e.target.value)}
                  placeholder="test@beispiel.de"
                />
              </div>
              <div className="admin-actions">
                <button
                  type="button"
                  className="cta cta--outline"
                  onClick={() => sendZoomTest("confirmation")}
                  disabled={!zoomTestEmail || zoomTestStatus === "sending"}
                >
                  Bestätigung testen
                </button>
                <button
                  type="button"
                  className="cta cta--outline"
                  onClick={() => sendZoomTest("link")}
                  disabled={!zoomTestEmail || zoomTestStatus === "sending"}
                >
                  Link-Mail (.ics) testen
                </button>
                <button
                  type="button"
                  className="cta cta--outline"
                  onClick={() => sendZoomTest("reminder")}
                  disabled={!zoomTestEmail || zoomTestStatus === "sending"}
                >
                  Erinnerung testen
                </button>
              </div>
              {zoomTestStatus === "ok" && (
                <p className="admin-test-feedback admin-test-ok">
                  Test-Mail gesendet
                </p>
              )}
              {zoomTestStatus === "sending" && (
                <p className="admin-test-feedback">Wird gesendet…</p>
              )}
              {zoomTestStatus &&
                zoomTestStatus !== "ok" &&
                zoomTestStatus !== "sending" && (
                  <p className="admin-test-feedback admin-test-error">
                    {zoomTestStatus}
                  </p>
                )}
            </div>

            <div className="admin-card-title" style={{ marginBottom: 8 }}>
              Zoom-Anmeldungen · {zoomRegs.length} gesamt ·{" "}
              {zoomRegs.filter((r) => r.delegierter).length} Delegierte
            </div>
            {zoomRegs.length === 0 ? (
              <p>Noch keine Anmeldungen.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Kreisverband</th>
                      <th>Delegierte*r</th>
                      <th>E-Mail</th>
                      <th>Angemeldet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zoomRegs.map((r) => (
                      <tr key={r.email}>
                        <td>{r.name}</td>
                        <td>{r.kreisverband || "—"}</td>
                        <td>{r.delegierter ? "Ja" : "—"}</td>
                        <td>{r.email}</td>
                        <td>
                          {new Date(r.created_at).toLocaleString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "settings" && (
        <section className="section">
          <div className="section-inner settings-grid">
            <div className="admin-card stat-card">
              <span>Mitzeichner*innen</span>
              <strong>{stats.signerCount.toLocaleString("de-DE")}</strong>
            </div>
            <div className="admin-card stat-card">
              <span>Newsletter</span>
              <strong>{stats.subscriberCount.toLocaleString("de-DE")}</strong>
            </div>
            <div className="admin-card" style={{ gridColumn: "1 / -1" }}>
              <div className="admin-card-title">Bundesland-Zuordnung</div>
              {stateResolution && (
                <div className="state-resolution-stats">
                  <p>
                    <strong>{stateResolution.resolvedKvs}</strong> Kreisverbände
                    zugeordnet, <strong>{stateResolution.unresolvedKvs}</strong>{" "}
                    offen
                  </p>
                  <p>
                    <strong>{stateResolution.resolvedSigners}</strong>{" "}
                    Mitzeichner*innen mit Bundesland,{" "}
                    <strong>{stateResolution.unresolvedSigners}</strong> ohne
                  </p>
                  {stateResolution.queueLength > 0 && (
                    <p className="admin-muted">
                      Warteschlange: {stateResolution.queueLength} ausstehend
                    </p>
                  )}
                </div>
              )}
              {unresolvedKvs.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p className="admin-muted" style={{ marginBottom: 8 }}>
                    Offene Kreisverbände:
                  </p>
                  <div
                    style={{
                      maxHeight: 300,
                      overflowY: "auto",
                      fontSize: 13,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {unresolvedKvs.map((kv) => (
                      <div
                        key={kv.kreisverband}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ minWidth: 180 }}>
                          {kv.kreisverband}{" "}
                          <span className="admin-muted">({kv.count})</span>
                        </span>
                        <select
                          value={kvStateSelections[kv.kreisverband] || ""}
                          onChange={(e) =>
                            setKvStateSelections((prev) => ({
                              ...prev,
                              [kv.kreisverband]: e.target.value,
                            }))
                          }
                          className="admin-compact-select"
                        >
                          <option value="">– Bundesland –</option>
                          {GERMAN_STATES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="cta cta--outline admin-compact-btn"
                          disabled={
                            !kvStateSelections[kv.kreisverband] ||
                            assigningKv === kv.kreisverband
                          }
                          onClick={async () => {
                            setAssigningKv(kv.kreisverband);
                            try {
                              const res = await api(
                                "/api/admin/assign-kv-state",
                                {
                                  method: "POST",
                                  body: JSON.stringify({
                                    kreisverband: kv.kreisverband,
                                    state: kvStateSelections[kv.kreisverband],
                                  }),
                                },
                              );
                              if (res.ok) {
                                setUnresolvedKvs((prev) =>
                                  prev.filter(
                                    (u) => u.kreisverband !== kv.kreisverband,
                                  ),
                                );
                                setKvStateSelections((prev) => {
                                  const next = { ...prev };
                                  delete next[kv.kreisverband];
                                  return next;
                                });
                                const statusRes = await api(
                                  "/api/admin/state-resolution-status",
                                );
                                if (statusRes.ok)
                                  setStateResolution(await statusRes.json());
                              }
                            } catch {
                              /* ignore */
                            }
                            setAssigningKv(null);
                          }}
                        >
                          {assigningKv === kv.kreisverband ? "…" : "Zuordnen"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="admin-actions">
                <button
                  type="button"
                  className="cta"
                  disabled={resolving}
                  onClick={async () => {
                    setResolving(true);
                    setResolveMessage("");
                    try {
                      const res = await api("/api/admin/resolve-states", {
                        method: "POST",
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setResolveMessage(
                          data.enqueued > 0
                            ? `${data.enqueued} Mitzeichner*innen zur Zuordnung eingereiht.`
                            : "Keine unzugeordneten Mitzeichner*innen gefunden.",
                        );
                        const [statusRes, unresRes] = await Promise.all([
                          api("/api/admin/state-resolution-status"),
                          api("/api/admin/unresolved-kvs"),
                        ]);
                        if (statusRes.ok)
                          setStateResolution(await statusRes.json());
                        if (unresRes.ok)
                          setUnresolvedKvs(await unresRes.json());
                      } else {
                        setResolveMessage("Fehler bei der Zuordnung.");
                      }
                    } catch {
                      setResolveMessage("Fehler bei der Zuordnung.");
                    }
                    setResolving(false);
                  }}
                >
                  {resolving ? "Wird gestartet…" : "Zuordnung starten"}
                </button>
                <button
                  type="button"
                  className="cta cta--outline"
                  disabled={resolving}
                  onClick={async () => {
                    setResolving(true);
                    setResolveMessage("");
                    try {
                      const res = await api("/api/admin/re-enqueue-all", {
                        method: "POST",
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setResolveMessage(
                          `Cache geleert (${data.cacheCleared}), ${data.enqueued} zur Zuordnung eingereiht.`,
                        );
                        const [statusRes, unresRes] = await Promise.all([
                          api("/api/admin/state-resolution-status"),
                          api("/api/admin/unresolved-kvs"),
                        ]);
                        if (statusRes.ok)
                          setStateResolution(await statusRes.json());
                        if (unresRes.ok)
                          setUnresolvedKvs(await unresRes.json());
                      } else {
                        setResolveMessage("Fehler bei der erneuten Zuordnung.");
                      }
                    } catch {
                      setResolveMessage("Fehler bei der erneuten Zuordnung.");
                    }
                    setResolving(false);
                  }}
                >
                  {resolving ? "Wird gestartet…" : "Alle erneut prüfen"}
                </button>
              </div>
              {resolveMessage && (
                <p className="admin-muted">{resolveMessage}</p>
              )}
            </div>
            {outlierGroups.length > 0 && (
              <div className="admin-card" style={{ gridColumn: "1 / -1" }}>
                <div className="admin-card-title">
                  KV-Tippfehler (
                  {outlierGroups.reduce((n, g) => n + g.outliers.length, 0)})
                </div>
                <div className="outlier-groups">
                  {outlierGroups.map((group) => (
                    <div className="outlier-group" key={group.canonical.name}>
                      <div className="outlier-canonical">
                        <strong>{group.canonical.name}</strong>
                        <span className="admin-muted">
                          {" "}
                          ({group.canonical.count})
                        </span>
                      </div>
                      {group.outliers.map((outlier) => (
                        <div className="outlier-row" key={outlier.name}>
                          <span className="outlier-name">
                            {outlier.name}
                            <span className="admin-muted">
                              {" "}
                              ({outlier.count})
                            </span>
                          </span>
                          <span className="outlier-actions">
                            <button
                              type="button"
                              className="cta cta--outline outlier-merge-btn"
                              disabled={merging === outlier.name}
                              onClick={async () => {
                                setMerging(outlier.name);
                                try {
                                  const res = await api("/api/admin/merge-kv", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      from: outlier.name,
                                      to: group.canonical.name,
                                    }),
                                  });
                                  if (res.ok) {
                                    setOutlierGroups((prev) =>
                                      prev
                                        .map((g) =>
                                          g.canonical.name ===
                                          group.canonical.name
                                            ? {
                                                ...g,
                                                canonical: {
                                                  ...g.canonical,
                                                  count:
                                                    g.canonical.count +
                                                    outlier.count,
                                                },
                                                outliers: g.outliers.filter(
                                                  (o) =>
                                                    o.name !== outlier.name,
                                                ),
                                              }
                                            : g,
                                        )
                                        .filter((g) => g.outliers.length > 0),
                                    );
                                    const statusRes = await api(
                                      "/api/admin/state-resolution-status",
                                    );
                                    if (statusRes.ok)
                                      setStateResolution(
                                        await statusRes.json(),
                                      );
                                  }
                                } catch {
                                  /* ignore */
                                }
                                setMerging(null);
                              }}
                            >
                              {merging === outlier.name
                                ? "…"
                                : `→ ${group.canonical.name}`}
                            </button>
                            <button
                              type="button"
                              className="cta cta--outline outlier-merge-btn"
                              disabled={merging === outlier.name}
                              onClick={async () => {
                                setMerging(outlier.name);
                                try {
                                  const res = await api("/api/admin/merge-kv", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      from: group.canonical.name,
                                      to: outlier.name,
                                    }),
                                  });
                                  if (res.ok) {
                                    setOutlierGroups((prev) =>
                                      prev
                                        .map((g) =>
                                          g.canonical.name ===
                                          group.canonical.name
                                            ? {
                                                ...g,
                                                canonical: {
                                                  name: outlier.name,
                                                  count:
                                                    g.canonical.count +
                                                    outlier.count,
                                                },
                                                outliers: g.outliers.filter(
                                                  (o) =>
                                                    o.name !== outlier.name,
                                                ),
                                              }
                                            : g,
                                        )
                                        .filter((g) => g.outliers.length > 0),
                                    );
                                    const statusRes = await api(
                                      "/api/admin/state-resolution-status",
                                    );
                                    if (statusRes.ok)
                                      setStateResolution(
                                        await statusRes.json(),
                                      );
                                  }
                                } catch {
                                  /* ignore */
                                }
                                setMerging(null);
                              }}
                            >
                              {merging === outlier.name
                                ? "…"
                                : `→ ${outlier.name}`}
                            </button>
                            <button
                              type="button"
                              className="outlier-dismiss"
                              disabled={merging === outlier.name}
                              onClick={async () => {
                                setMerging(outlier.name);
                                try {
                                  const res = await api(
                                    "/api/admin/dismiss-outlier",
                                    {
                                      method: "POST",
                                      body: JSON.stringify({
                                        canonical: group.canonical.name,
                                        outlier: outlier.name,
                                      }),
                                    },
                                  );
                                  if (res.ok) {
                                    setOutlierGroups((prev) =>
                                      prev
                                        .map((g) =>
                                          g.canonical.name ===
                                          group.canonical.name
                                            ? {
                                                ...g,
                                                outliers: g.outliers.filter(
                                                  (o) =>
                                                    o.name !== outlier.name,
                                                ),
                                              }
                                            : g,
                                        )
                                        .filter((g) => g.outliers.length > 0),
                                    );
                                  }
                                } catch {
                                  /* ignore */
                                }
                                setMerging(null);
                              }}
                            >
                              Stimmt so
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {occOutlierGroups.length > 0 && (
              <div className="admin-card" style={{ gridColumn: "1 / -1" }}>
                <div className="admin-card-title">
                  Berufs-Tippfehler (
                  {occOutlierGroups.reduce((n, g) => n + g.outliers.length, 0)})
                </div>
                <div className="outlier-groups">
                  {occOutlierGroups.map((group) => (
                    <div className="outlier-group" key={group.canonical.name}>
                      <div className="outlier-canonical">
                        <strong>{group.canonical.name}</strong>
                        <span className="admin-muted">
                          {" "}
                          ({group.canonical.count})
                        </span>
                      </div>
                      {group.outliers.map((outlier) => (
                        <div className="outlier-row" key={outlier.name}>
                          <span className="outlier-name">
                            {outlier.name}
                            <span className="admin-muted">
                              {" "}
                              ({outlier.count})
                            </span>
                          </span>
                          <span className="outlier-actions">
                            <button
                              type="button"
                              className="cta cta--outline outlier-merge-btn"
                              disabled={occMerging === outlier.name}
                              onClick={async () => {
                                setOccMerging(outlier.name);
                                try {
                                  const res = await api(
                                    "/api/admin/merge-occupation",
                                    {
                                      method: "POST",
                                      body: JSON.stringify({
                                        from: outlier.name,
                                        to: group.canonical.name,
                                      }),
                                    },
                                  );
                                  if (res.ok) {
                                    setOccOutlierGroups((prev) =>
                                      prev
                                        .map((g) =>
                                          g.canonical.name ===
                                          group.canonical.name
                                            ? {
                                                ...g,
                                                canonical: {
                                                  ...g.canonical,
                                                  count:
                                                    g.canonical.count +
                                                    outlier.count,
                                                },
                                                outliers: g.outliers.filter(
                                                  (o) =>
                                                    o.name !== outlier.name,
                                                ),
                                              }
                                            : g,
                                        )
                                        .filter((g) => g.outliers.length > 0),
                                    );
                                  }
                                } catch {
                                  /* ignore */
                                }
                                setOccMerging(null);
                              }}
                            >
                              {occMerging === outlier.name
                                ? "…"
                                : `→ ${group.canonical.name}`}
                            </button>
                            <button
                              type="button"
                              className="cta cta--outline outlier-merge-btn"
                              disabled={occMerging === outlier.name}
                              onClick={async () => {
                                setOccMerging(outlier.name);
                                try {
                                  const res = await api(
                                    "/api/admin/merge-occupation",
                                    {
                                      method: "POST",
                                      body: JSON.stringify({
                                        from: group.canonical.name,
                                        to: outlier.name,
                                      }),
                                    },
                                  );
                                  if (res.ok) {
                                    setOccOutlierGroups((prev) =>
                                      prev
                                        .map((g) =>
                                          g.canonical.name ===
                                          group.canonical.name
                                            ? {
                                                ...g,
                                                canonical: {
                                                  name: outlier.name,
                                                  count:
                                                    g.canonical.count +
                                                    outlier.count,
                                                },
                                                outliers: g.outliers.filter(
                                                  (o) =>
                                                    o.name !== outlier.name,
                                                ),
                                              }
                                            : g,
                                        )
                                        .filter((g) => g.outliers.length > 0),
                                    );
                                  }
                                } catch {
                                  /* ignore */
                                }
                                setOccMerging(null);
                              }}
                            >
                              {occMerging === outlier.name
                                ? "…"
                                : `→ ${outlier.name}`}
                            </button>
                            <button
                              type="button"
                              className="outlier-dismiss"
                              disabled={occMerging === outlier.name}
                              onClick={async () => {
                                setOccMerging(outlier.name);
                                try {
                                  const res = await api(
                                    "/api/admin/dismiss-occupation-outlier",
                                    {
                                      method: "POST",
                                      body: JSON.stringify({
                                        canonical: group.canonical.name,
                                        outlier: outlier.name,
                                      }),
                                    },
                                  );
                                  if (res.ok) {
                                    setOccOutlierGroups((prev) =>
                                      prev
                                        .map((g) =>
                                          g.canonical.name ===
                                          group.canonical.name
                                            ? {
                                                ...g,
                                                outliers: g.outliers.filter(
                                                  (o) =>
                                                    o.name !== outlier.name,
                                                ),
                                              }
                                            : g,
                                        )
                                        .filter((g) => g.outliers.length > 0),
                                    );
                                  }
                                } catch {
                                  /* ignore */
                                }
                                setOccMerging(null);
                              }}
                            >
                              Stimmt so
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="admin-card">
              <div className="admin-card-title">Sitzung</div>
              <button className="admin-danger" type="button" onClick={logout}>
                Abmelden
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

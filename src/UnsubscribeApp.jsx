import { useEffect, useMemo, useState } from "react";

function getToken() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[1] || "";
}

function getSource() {
  const params = new URLSearchParams(window.location.search);
  return params.get("from") === "zoom" ? "zoom" : "newsletter";
}

export default function UnsubscribeApp() {
  const token = useMemo(getToken, []);
  const source = useMemo(getSource, []);
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/unsubscribe/${token}?from=${source}`,
        );
        if (!res.ok) {
          setState({
            loading: false,
            data: null,
            error: "Dieser Link ist nicht mehr gültig.",
          });
          return;
        }
        setState({ loading: false, data: await res.json(), error: "" });
      } catch {
        setState({
          loading: false,
          data: null,
          error: "Die Verbindung ist fehlgeschlagen.",
        });
      }
    }
    load();
  }, [token, source]);

  async function submit(action) {
    setBusy(action);
    setResult("");
    try {
      const res = await fetch(`/api/unsubscribe/${token}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        setState({
          loading: false,
          data: null,
          error: "Dieser Link wurde bereits verwendet.",
        });
        return;
      }
      const messages = {
        "newsletter-opt-out":
          "Du erhältst keine Newsletter-Updates mehr. Deine Unterschrift bleibt bestehen.",
        "zoom-opt-out":
          "Du erhältst keine Zoom-Mails mehr. Deine Anmeldung wurde entfernt.",
        all: "Du bist von allem abgemeldet.",
        delete:
          "Deine Unterschrift und die damit verbundenen Daten wurden gelöscht.",
      };
      setResult(messages[action] || "Erledigt.");
      setState((current) => ({ ...current, data: null }));
    } catch {
      setResult("Die Aktion konnte nicht abgeschlossen werden.");
    } finally {
      setBusy("");
    }
  }

  const d = state.data;
  const hasOptions = d && (d.newsletter || d.hasZoom);
  const hasBoth = d && d.newsletter && d.hasZoom;

  return (
    <main className="unsubscribe-shell">
      <section className="section">
        <div className="section-inner unsubscribe-inner">
          <article className="brief-paper unsubscribe-card">
            <h1>E-Mail-Einstellungen</h1>

            {state.loading && <p>Link wird geprüft ...</p>}

            {state.error && (
              <>
                <p className="lead">{state.error}</p>
                <p>Bitte nutze den neuesten Link aus einer unserer E-Mails.</p>
              </>
            )}

            {result && (
              <>
                <p className="lead">{result}</p>
                <p>Danke für deine Rückmeldung.</p>
              </>
            )}

            {d && (
              <>
                <p className="anrede">{d.emailMasked}</p>
                <p>Wähle, wovon du dich abmelden möchtest:</p>

                <div className="unsubscribe-actions">
                  {hasBoth && (
                    <button
                      type="button"
                      className="cta"
                      disabled={Boolean(busy)}
                      onClick={() => submit("all")}
                    >
                      {busy === "all"
                        ? "Wird abgemeldet …"
                        : "Von allem abmelden"}
                    </button>
                  )}

                  {d.newsletter && (
                    <button
                      type="button"
                      className={
                        "cta" +
                        (source === "newsletter" && !hasBoth
                          ? ""
                          : " cta--outline")
                      }
                      disabled={Boolean(busy)}
                      onClick={() => submit("newsletter-opt-out")}
                    >
                      {busy === "newsletter-opt-out"
                        ? "Wird abbestellt …"
                        : "Keine Newsletter-Updates mehr"}
                    </button>
                  )}

                  {d.hasZoom && (
                    <button
                      type="button"
                      className={
                        "cta" +
                        (source === "zoom" && !hasBoth ? "" : " cta--outline")
                      }
                      disabled={Boolean(busy)}
                      onClick={() => submit("zoom-opt-out")}
                    >
                      {busy === "zoom-opt-out"
                        ? "Wird abgemeldet …"
                        : "Keine Zoom-Mails mehr"}
                    </button>
                  )}

                  {!hasOptions && d.hasSigner && (
                    <p>
                      Du bist bereits von allen E-Mails abgemeldet. Deine
                      Unterschrift ist weiterhin sichtbar.
                    </p>
                  )}
                </div>

                {d.canDeleteSigner && (
                  <div style={{ marginTop: 24, borderTop: "1px solid var(--akzent)", paddingTop: 20 }}>
                    <p style={{ fontSize: 14, color: "var(--grau)" }}>
                      Du kannst auch deine Unterschrift und alle damit
                      verbundenen Daten unwiderruflich löschen:
                    </p>
                    <button
                      type="button"
                      className="admin-danger"
                      disabled={Boolean(busy)}
                      onClick={() => submit("delete")}
                    >
                      {busy === "delete"
                        ? "Wird gelöscht …"
                        : "Unterschrift vollständig löschen"}
                    </button>
                  </div>
                )}
              </>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}

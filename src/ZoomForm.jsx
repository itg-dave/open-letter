// ZOOM-DISABLED: This component is intentionally NOT imported anywhere, so the
// bundler excludes it from the production build (its markup must not ship to the
// live site). It is kept here, intact, for easy re-enabling.
//
// To re-enable the Zoom meeting signup:
//   1. In App.jsx, `import { ZoomForm } from "./ZoomForm";`
//   2. Uncomment the <ZoomForm/> usage in the #zoom section.
//   3. Flip each `false &&` guard marked "ZOOM-DISABLED" back to `true &&`
//      (the original event-time conditions are preserved after it).
//   4. Re-enable the /api/zoom-count poll in the mount effect.

import { useState, useMemo, useRef, memo } from "react";

export const ZoomForm = memo(function ZoomForm({
  onSubmit,
  serverError,
  kvNames,
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [kv, setKv] = useState("");
  const [delegierter, setDelegierter] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [kvActiveIndex, setKvActiveIndex] = useState(-1);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const kvInputRef = useRef(null);

  const kvMatches = useMemo(() => {
    if (!kv) return [];
    const q = kv.toLowerCase();
    return kvNames.filter((k) => k.toLowerCase().includes(q)).slice(0, 6);
  }, [kv, kvNames]);

  function validate() {
    const e = {};
    if (name.trim().length < 2)
      e.name = "Bitte gib deinen vollständigen Namen an.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = "Bitte gib eine gültige E-Mail-Adresse an.";
    setErrors(e);
    if (e.name) nameRef.current?.focus();
    else if (e.email) emailRef.current?.focus();
    return Object.keys(e).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const ok = await onSubmit({
      name: name.trim(),
      email: email.trim(),
      kv: kv.trim().replace(/^KV\s*/i, ""),
      delegierter,
    });
    setSubmitting(false);
    if (ok) {
      setDone(true);
      setName("");
      setEmail("");
      setKv("");
      setDelegierter(false);
      setErrors({});
    }
  }

  if (done) {
    return (
      <div className="form-card zoom-done" role="status">
        <span className="badge">Angemeldet</span>
        <div className="check-anim">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h3>Du bist dabei.</h3>
        <p className="sub2">
          Wir haben dir eine Bestätigung per E-Mail geschickt. Den Einwahllink
          bekommst du rechtzeitig vor dem Termin am 9. Juni, 20 Uhr.
        </p>
      </div>
    );
  }

  return (
    <form className="form-card" onSubmit={submit} noValidate>
      <span className="badge">Zoom-Anmeldung</span>
      <h3>Anmelden in 30 Sekunden</h3>
      <div className="sub2">Den Link schicken wir dir per E-Mail.</div>

      {serverError && (
        <div className="err" role="alert">
          {serverError}
        </div>
      )}

      <div className="field">
        <label htmlFor="zoom-name">Name</label>
        <input
          id="zoom-name"
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Anna Berger"
          className={errors.name ? "invalid" : ""}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "zoom-err-name" : undefined}
          autoComplete="name"
        />
        {errors.name && (
          <div className="err" id="zoom-err-name">
            {errors.name}
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="zoom-email">
          E-Mail{" "}
          <span className="opt"> für die Bestätigung und den Zoom-Link</span>
        </label>
        <input
          id="zoom-email"
          ref={emailRef}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="anna@example.org"
          className={errors.email ? "invalid" : ""}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "zoom-err-email" : undefined}
          autoComplete="email"
        />
        {errors.email && (
          <div className="err" id="zoom-err-email">
            {errors.email}
          </div>
        )}
      </div>

      <div className="field" style={{ position: "relative" }}>
        <label htmlFor="zoom-kv">
          Kreisverband <span className="opt"> optional</span>
        </label>
        <input
          id="zoom-kv"
          ref={kvInputRef}
          type="text"
          value={kv}
          onChange={(e) => {
            setKv(e.target.value);
            setShowSuggest(true);
            setKvActiveIndex(-1);
          }}
          onFocus={() => setShowSuggest(true)}
          onBlur={() => {
            setTimeout(() => {
              setShowSuggest(false);
              setKvActiveIndex(-1);
            }, 150);
            setKv((v) => v.replace(/^KV\s*/i, ""));
          }}
          onKeyDown={(e) => {
            if (!showSuggest || !kvMatches.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setKvActiveIndex((i) => Math.min(i + 1, kvMatches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setKvActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && kvActiveIndex >= 0) {
              e.preventDefault();
              setKv(kvMatches[kvActiveIndex]);
              setShowSuggest(false);
              setKvActiveIndex(-1);
            } else if (e.key === "Escape") {
              setShowSuggest(false);
              setKvActiveIndex(-1);
              kvInputRef.current?.focus();
            }
          }}
          placeholder="z. B. Berlin-Neukölln"
          autoComplete="off"
          role="combobox"
          aria-expanded={showSuggest && kv && kvMatches.length > 0}
          aria-autocomplete="list"
          aria-controls="zoom-kv-listbox"
          aria-activedescendant={
            kvActiveIndex >= 0 ? `zoom-kv-option-${kvActiveIndex}` : undefined
          }
        />
        {showSuggest && kv && kvMatches.length > 0 && (
          <div
            id="zoom-kv-listbox"
            role="listbox"
            className="autocomplete-dropdown"
          >
            {kvMatches.map((k, i) => (
              <div
                key={k}
                id={`zoom-kv-option-${i}`}
                role="option"
                aria-selected={i === kvActiveIndex}
                onMouseDown={() => {
                  setKv(k);
                  setShowSuggest(false);
                  setKvActiveIndex(-1);
                }}
                className={
                  "autocomplete-option" + (i === kvActiveIndex ? " active" : "")
                }
              >
                {k}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="checks">
        <label className="check">
          <input
            type="checkbox"
            checked={delegierter}
            onChange={(e) => setDelegierter(e.target.checked)}
          />
          <span>
            Ich bin <strong>Delegierte*r zum Parteitag.</strong>{" "}
            <span className="opt">(optional)</span>
          </span>
        </label>
      </div>

      <button type="submit" className="submit" disabled={submitting}>
        {submitting ? "Wird gesendet…" : "Zum Zoom anmelden"}{" "}
        <span className="arrow" aria-hidden="true">
          →
        </span>
      </button>
      <p className="form-legal">
        Wir nutzen deine Angaben nur zur Organisation des Treffens und schicken
        dir den Einwahllink rechtzeitig per E-Mail.
      </p>
    </form>
  );
});

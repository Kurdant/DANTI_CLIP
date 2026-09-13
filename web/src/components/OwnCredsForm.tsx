import { useState } from "react";
import { api } from "../api";

/** Identifiants Google personnels (BYOK) : enregistrement / suppression, chiffres en base. */
export function OwnCredsForm({ onSaved, hasOwn }: { onSaved: () => void; hasOwn?: boolean }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/youtube/credentials", {
        method: "POST",
        body: { clientId, clientSecret },
      });
      setMsg({ ok: true, text: "Credentials saved (encrypted). You can now connect." });
      setClientId("");
      setClientSecret("");
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/youtube/credentials", { method: "DELETE" });
      setMsg({ ok: true, text: "Personal credentials deleted." });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 10, padding: 14 }}>
      <div className="sub" style={{ fontWeight: 700, marginBottom: 6 }}>Your own Google credentials (optional)</div>
      <div className="sub" style={{ fontSize: 12.5, marginBottom: 10 }}>
        Create a Google Cloud project → enable "YouTube Data API v3" → OAuth client (Web application) with the redirect URI{" "}
        <span className="mono">https://danticlip.kurdant.fr/api/youtube/callback</span>. Your credentials are encrypted in the database.
      </div>
      {msg && (
        <div
          className="alert"
          style={msg.ok ? { background: "rgba(111,217,168,.1)", borderColor: "rgba(111,217,168,.35)", color: "var(--green)" } : undefined}
        >
          {msg.text}
        </div>
      )}
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Client ID</label>
        <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxx.apps.googleusercontent.com" />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Client secret</label>
        <input className="input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="GOCSPX-…" />
      </div>
      <div className="row">
        <button className="btn sm" disabled={busy || !clientId || !clientSecret} onClick={save}>
          {busy ? "…" : "Save my credentials"}
        </button>
        {hasOwn && (
          <button className="btn danger sm" disabled={busy} onClick={remove}>
            Delete my credentials
          </button>
        )}
      </div>
    </div>
  );
}

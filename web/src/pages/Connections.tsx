import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import type { YouTubeStatus } from "../types";
import { TopBar } from "../components/TopBar";
import { ProfileTabs } from "../components/ProfileTabs";
import { OwnCredsForm } from "../components/OwnCredsForm";

export function ConnectionsPage() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    api<YouTubeStatus>("/api/youtube/status")
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false, hasOwnCredentials: false }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function disconnect() {
    setBusy("yt");
    setError("");
    try {
      await api("/api/youtube/disconnect", { method: "POST", body: {} });
      setMsg("YouTube account disconnected.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy("");
    }
  }

  async function deleteAccount() {
    if (!confirm("Permanently delete your account, your projects and all your files?")) return;
    setBusy("del");
    setError("");
    try {
      await api("/api/auth/account", { method: "DELETE" });
      await logout().catch(() => undefined);
      location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setBusy("");
    }
  }

  async function logoutAccount() {
    await logout().catch(() => undefined);
    location.href = "/";
  }

  return (
    <div>
      <TopBar />
      <main className="container">
        <ProfileTabs />
        <div className="head" style={{ marginTop: 26 }}>
          <div>
            <span className="kicker" style={{ marginBottom: 10 }}>Account</span>
            <h1>Connections</h1>
            <div className="sub">Account, linked services, privacy — everything is here.</div>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}
        {msg && (
          <div className="alert" style={{ background: "rgba(111,217,168,.1)", borderColor: "rgba(111,217,168,.35)", color: "var(--green)" }}>
            {msg}
          </div>
        )}

        {/* ---------- COMPTE ---------- */}
        <div className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>My account</h2>
            <button className="btn secondary sm" onClick={logoutAccount}>Log out</button>
          </div>
          <div className="row" style={{ gap: 12, marginTop: 14 }}>
            <span className="avatar" style={{ width: 44, height: 44, fontSize: 19, borderRadius: "50%", background: "var(--grad-soft)", border: "1px solid var(--border-strong)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--rose)", fontWeight: 700 }}>
              {user ? user.charAt(0).toUpperCase() : "?"}
            </span>
            <div>
              <div style={{ fontWeight: 700 }}>{user}</div>
              <div className="sub" style={{ fontSize: 13 }}>Secure session · strictly necessary cookie · 30 days</div>
            </div>
          </div>
        </div>

        {/* ---------- YOUTUBE ---------- */}
        <div className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>YouTube</h2>
            {status && (
              <span className={"badge " + (status.connected ? "done" : "")}>
                {status.connected ? "Account linked" : "Not linked"}
              </span>
            )}
          </div>
          <p className="sub" style={{ margin: "8px 0 14px" }}>
            Publish your generated videos directly to your YouTube account. Authorization is
            done once — after that, each video can be published in one click.
          </p>

          {!status ? (
            <div className="sub">…</div>
          ) : status.connected ? (
            <div className="row">
              <button className="btn secondary sm" disabled={busy === "yt"} onClick={disconnect}>
                {busy === "yt" ? "…" : "Disconnect YouTube"}
              </button>
              <span className="sub" style={{ fontSize: 12.5 }}>
                OAuth credentials are stored on your account until you disconnect.
              </span>
            </div>
          ) : status.configured ? (
            <div className="row">
              <a className="btn" href="/api/youtube/auth">Connect my YouTube account</a>
              <span className="sub" style={{ fontSize: 12.5 }}>Google authorization — only once.</span>
            </div>
          ) : (
            <div className="sub" style={{ fontSize: 13.5 }}>
              YouTube is not configured yet. Set up the credentials below (your own
              Google credentials) or contact the administrator.
            </div>
          )}

          {/* Identifiants avancés (BYOK) */}
          <details style={{ marginTop: 16 }}>
            <summary className="sub" style={{ fontWeight: 700, cursor: "pointer" }}>
              Advanced Google credentials (optional)
            </summary>
            <OwnCredsForm onSaved={load} hasOwn={status?.hasOwnCredentials} />
          </details>
        </div>

        {/* ---------- CONFIDENTIALITÉ ---------- */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Privacy</h2>
          <ul style={{ margin: "0 0 8px", paddingLeft: 20, color: "var(--muted)", fontSize: 14 }}>
            <li>A single session cookie, strictly necessary (no tracking, no ads).</li>
            <li>YouTube token stored on your account until you disconnect; BYOK credentials encrypted.</li>
            <li>Account deletion = deletion of all your projects and files.</li>
          </ul>
          <Link to="/privacy" className="btn secondary sm">View the privacy policy →</Link>
        </div>

        {/* ---------- ZONE DE DANGER ---------- */}
        <div className="card" style={{ borderColor: "rgba(242,109,141,.35)" }}>
          <h2 style={{ marginTop: 0, color: "var(--red)" }}>Danger zone</h2>
          <p className="sub" style={{ margin: "0 0 14px" }}>
            Permanent deletion: account, projects, ideas, scripts, voices, saved videos and uploaded
            backgrounds. Irreversible.
          </p>
          <button className="btn danger" disabled={busy === "del"} onClick={deleteAccount}>
            {busy === "del" ? "Deleting…" : "Delete my account"}
            {busy === "del" && <span className="spinner" />}
          </button>
        </div>
      </main>
    </div>
  );
}

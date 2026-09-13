import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import { Brand } from "../components/TopBar";
import { CookieNote } from "../components/CookieNote";

export function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState<null | boolean>(null);
  const [checking, setChecking] = useState(false);

  // Vérification en direct du pseudo (débounce 400 ms).
  useEffect(() => {
    const name = username.trim();
    if (name.length < 3) {
      setTaken(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const t = setTimeout(() => {
      api<{ available: boolean }>(`/api/auth/check-username?username=${encodeURIComponent(name)}`)
        .then((r) => setTaken(!r.available))
        .catch(() => setTaken(null))
        .finally(() => setChecking(false));
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  const nameOk = username.trim().length >= 3;
  const canSubmit = nameOk && username.trim().length <= 30 && password.length >= 8 && confirm.length > 0 && password === confirm && taken === false && !checking;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await register(username.trim(), password);
      nav("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form onSubmit={submit} className="auth-card">
        <div className="auth-head">
          <Brand />
          <h1>Create an account</h1>
          <p className="sub" style={{ margin: "0 0 22px" }}>
            Each account has its own projects and video backgrounds.
          </p>
        </div>
        {error && <div className="alert">{error}</div>}
        <div className="field">
          <label>Username (3 to 30 characters — anything you like)</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            maxLength={30}
          />
          {username.trim().length >= 3 && (
            checking ? (
              <div className="sub" style={{ marginTop: 5, fontSize: 12.5 }}>Checking…</div>
            ) : taken === false ? (
              <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--green)" }}>Username available</div>
            ) : taken === true ? (
              <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--red)" }}>This username is already taken</div>
            ) : (
              <div className="sub" style={{ marginTop: 5, fontSize: 12.5 }}>Check failed, try again</div>
            )
          )}
        </div>
        <div className="field">
          <label>Password (min 8 characters)</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>Confirm password</label>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button className="btn block" disabled={!canSubmit || busy}>
          {busy ? "Creating…" : "Create my account"}
        </button>
        <p className="sub" style={{ marginTop: 18, textAlign: "center" }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
        <p className="sub" style={{ marginTop: 8, textAlign: "center" }}>
          <Link to="/">← Back to home</Link>
        </p>
        <p className="sub" style={{ marginTop: 8, textAlign: "center" }}>
          <Link to="/privacy">Privacy policy</Link>
        </p>
      </form>
      <CookieNote />
    </div>
  );
}

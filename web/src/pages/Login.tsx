import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Brand } from "../components/TopBar";
import { CookieNote } from "../components/CookieNote";

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
      nav("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form onSubmit={submit} className="auth-card">
        <div className="auth-head">
          <Brand />
          <h1>Log in</h1>
          <p className="sub" style={{ margin: "0 0 22px" }}>Find your shorts projects again.</p>
        </div>
        {error && <div className="alert">{error}</div>}
        <div className="field">
          <label>Username</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn block" disabled={busy || !username || !password}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="sub" style={{ marginTop: 18, textAlign: "center" }}>
          No account yet? <Link to="/register">Create an account</Link>
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

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

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
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center" style={{ minHeight: "100vh" }}>
      <form onSubmit={submit} className="card" style={{ width: 360, padding: 26 }}>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Connexion</h1>
        <p className="sub">DANTI CLIPER — interface sécurisée</p>
        {error && <div className="alert">{error}</div>}
        <div className="field">
          <label>Nom d'utilisateur</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn block" disabled={busy || !username || !password}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
        <p className="sub" style={{ marginTop: 14, textAlign: "center" }}>
          Pas de compte ? <Link to="/register">Créer un compte</Link>
        </p>
      </form>
    </div>
  );
}

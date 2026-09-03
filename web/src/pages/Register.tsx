import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    setBusy(true);
    try {
      await register(username, password);
      nav("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center" style={{ minHeight: "100vh" }}>
      <form onSubmit={submit} className="card" style={{ width: 380, padding: 26 }}>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Créer un compte</h1>
        <p className="sub">Rejoins DANTI CLIPER — chaque compte a ses propres projets.</p>
        {error && <div className="alert">{error}</div>}
        <div className="field">
          <label>Nom d'utilisateur (3-30, lettres/chiffres/_.-)</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Mot de passe (min 8 caractères)</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>Confirmer le mot de passe</label>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button className="btn block" disabled={busy || !username || !password || !confirm}>
          {busy ? "Création…" : "Créer mon compte"}
        </button>
        <p className="sub" style={{ marginTop: 14, textAlign: "center" }}>
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </p>
      </form>
    </div>
  );
}

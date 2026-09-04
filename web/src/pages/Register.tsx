import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Brand } from "../components/TopBar";

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
    <div className="auth-page">
      <form onSubmit={submit} className="auth-card">
        <div className="auth-head">
          <Brand />
          <h1>Créer un compte</h1>
          <p className="sub" style={{ margin: "0 0 22px" }}>
            Chaque compte a ses propres projets et ses fonds vidéo.
          </p>
        </div>
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
        <p className="sub" style={{ marginTop: 18, textAlign: "center" }}>
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </p>
        <p className="sub" style={{ marginTop: 8, textAlign: "center" }}>
          <Link to="/">← Retour à l'accueil</Link>
        </p>
      </form>
    </div>
  );
}

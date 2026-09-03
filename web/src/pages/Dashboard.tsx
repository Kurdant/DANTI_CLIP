import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import type { Project } from "../types";

function statusLabel(s: string): string {
  const m: Record<string, string> = {
    draft: "Brouillon",
    ideas: "Idées générées",
    script: "Script prêt",
    voice: "Voix générée",
    done: "Terminé",
  };
  return m[s] ?? s;
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const r = await api<{ projects: Project[] }>("/api/projects");
    setProjects(r.projects);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    setError("");
    setBusy(true);
    try {
      const r = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        body: { topic, mode, title: title || undefined },
      });
      setShowForm(false);
      setTopic("");
      setTitle("");
      nav(`/project/${r.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Supprimer ce projet ?")) return;
    await api(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="container">
      <div className="head">
        <div>
          <h1>Mes projets</h1>
          <div className="sub">Connecté en tant que {user}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setShowForm((s) => !s)}>+ Nouveau projet</button>
          <button className="btn secondary" onClick={logout}>Déconnexion</button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Créer un projet</h2>
          {error && <div className="alert">{error}</div>}
          <div className="field">
            <label>Mode de création</label>
            <div className="row">
              <button
                className={"btn sm " + (mode === "auto" ? "" : "secondary")}
                onClick={() => setMode("auto")}
              >
                L'IA propose 3 sujets
              </button>
              <button
                className={"btn sm " + (mode === "manual" ? "" : "secondary")}
                onClick={() => setMode("manual")}
              >
                Je donne mon idée
              </button>
            </div>
          </div>
          <div className="field">
            <label>{mode === "auto" ? "Direction / thème (optionnel)" : "Thème / sujet *"}</label>
            <textarea
              className="input"
              rows={mode === "manual" ? 3 : 2}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={mode === "auto" ? "Laisse vide pour que l'IA invente 3 sujets, ou donne une direction" : "Décris ton thème de vidéo…"}
            />
          </div>
          <div className="field">
            <label>{mode === "manual" ? "Titre de la vidéo" : "Titre du projet (optionnel)"}</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn" disabled={busy || (mode === "manual" && !topic.trim())} onClick={create}>
              {busy ? "Création…" : "Créer le projet"}
            </button>
            <button className="btn secondary" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      {projects.length === 0 && !showForm && (
        <div className="empty">Aucun projet pour l'instant. Crée-en un pour commencer.</div>
      )}

      <div className="grid">
        {projects.map((p) => (
          <div key={p.id} className="card clickable" onClick={() => nav(`/project/${p.id}`)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{p.title}</h3>
              <button className="btn danger sm" onClick={(e) => del(p.id, e)}>✕</button>
            </div>
            <p className="sub" style={{ margin: "8px 0" }}>{p.topic}</p>
            <div className="row">
              <span className={"badge " + p.mode}>{p.mode === "auto" ? "IA" : "Manuel"}</span>
              <span className={"badge " + p.status}>{statusLabel(p.status)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

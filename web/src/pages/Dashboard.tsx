import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import type { Project } from "../types";
import { TopBar } from "../components/TopBar";

function statusLabel(s: string): string {
  const m: Record<string, string> = {
    draft: "Brouillon",
    ideas: "Idées",
    script: "Script",
    voice: "Voix",
    done: "Terminé",
  };
  return m[s] ?? s;
}

const ORDER: Project["status"][] = ["draft", "ideas", "script", "voice", "done"];

export function DashboardPage() {
  const { logout } = useAuth();
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

  const done = projects.filter((p) => p.status === "done").length;
  const enCours = projects.filter((p) => p.status !== "done").length;

  return (
    <div>
      <TopBar />
      <main className="container">
        <div className="head">
          <div>
            <span className="kicker" style={{ marginBottom: 10 }}>Dashboard</span>
            <h1>Mes projets</h1>
            <div className="sub">Connecté — chaque projet va de l'idée à la vidéo.</div>
          </div>
          <button className="btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Fermer" : "＋ Nouveau projet"}
          </button>
        </div>

        <div className="kpis">
          <div className="kpi">
            <div className="kpi-num">{projects.length}</div>
            <div className="kpi-label">Projets au total</div>
          </div>
          <div className="kpi">
            <div className="kpi-num">{enCours}</div>
            <div className="kpi-label">En cours</div>
          </div>
          <div className="kpi">
            <div className="kpi-num">{done}</div>
            <div className="kpi-label">Vidéos terminées</div>
          </div>
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: 22 }}>
            <h2 style={{ marginTop: 0 }}>Créer un projet</h2>
            {error && <div className="alert">{error}</div>}
            <div className="field">
              <label>Mode de création</label>
              <div className="row">
                <button
                  className={"chip" + (mode === "auto" ? " on" : "")}
                  onClick={() => setMode("auto")}
                >
                  L'IA propose 3 sujets
                </button>
                <button
                  className={"chip" + (mode === "manual" ? " on" : "")}
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
          <div className="empty">
            <div className="empty-icon">◈</div>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Aucun projet pour l'instant</div>
            <div style={{ marginBottom: 18, fontSize: 14 }}>Crée-en un et laisse l'IA te proposer 3 sujets.</div>
            <button className="btn" onClick={() => setShowForm(true)}>＋ Créer mon premier projet</button>
          </div>
        )}

        <div className="grid">
          {projects.map((p) => {
            const idx = ORDER.indexOf(p.status);
            return (
              <div key={p.id} className="card clickable project-card" onClick={() => nav(`/project/${p.id}`)}>
                <div className="project-cover" />
                <div className="project-body">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 17 }}>{p.title}</h3>
                    <button className="btn danger sm" style={{ padding: "4px 9px" }} onClick={(e) => del(p.id, e)} title="Supprimer">✕</button>
                  </div>
                  <p className="sub" style={{ margin: "8px 0 0", fontSize: 13, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {p.topic}
                  </p>
                  <div className="row" style={{ marginTop: 12 }}>
                    <span className={"badge " + p.mode}>{p.mode === "auto" ? "IA" : "Manuel"}</span>
                    <span className={"badge " + p.status}>{statusLabel(p.status)}</span>
                  </div>
                  <div className="progress-track">
                    {ORDER.map((s, i) => (
                      <i key={s} className={i <= idx ? "on" : ""} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

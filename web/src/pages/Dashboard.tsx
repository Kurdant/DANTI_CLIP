import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiUpload } from "../api";
import type { MusicTrack, Project, SfxFile } from "../types";
import { TopBar } from "../components/TopBar";
import { TabBar } from "../components/TabBar";

function statusLabel(s: string): string {
  const m: Record<string, string> = {
    draft: "Draft",
    ideas: "Ideas",
    script: "Script",
    voice: "Voice",
    done: "Done",
  };
  return m[s] ?? s;
}

const ORDER: Project["status"][] = ["draft", "ideas", "script", "voice", "done"];

export function DashboardPage() {
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [hasMascot, setHasMascot] = useState(false);
  const [mascotBusy, setMascotBusy] = useState(false);
  const [mascotError, setMascotError] = useState("");
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicError, setMusicError] = useState("");
  const [effects, setEffects] = useState<SfxFile[]>([]);
  const [sfxBusy, setSfxBusy] = useState(false);
  const [sfxError, setSfxError] = useState("");

  async function load() {
    const r = await api<{ projects: Project[] }>("/api/projects");
    setProjects(r.projects);
  }

  async function checkMascot() {
    try {
      const res = await fetch("/api/mascot", { credentials: "include" });
      setHasMascot(res.ok);
    } catch {
      setHasMascot(false);
    }
  }

  async function loadMusic() {
    try {
      const r = await api<{ tracks: MusicTrack[] }>("/api/music");
      setTracks(r.tracks);
    } catch {
      /* ignore */
    }
  }

  async function loadSfx() {
    try {
      const r = await api<{ effects: SfxFile[] }>("/api/sfx");
      setEffects(r.effects);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    checkMascot();
    loadMusic();
    loadSfx();
  }, []);

  async function onMascotUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMascotBusy(true);
    setMascotError("");
    try {
      await apiUpload("/api/mascot", file);
      await checkMascot();
    } catch (err) {
      setMascotError(err instanceof Error ? err.message : "Error");
    } finally {
      setMascotBusy(false);
    }
  }

  async function removeMascot() {
    if (!confirm("Remove the account mascot?")) return;
    setMascotBusy(true);
    setMascotError("");
    try {
      await api("/api/mascot", { method: "DELETE" });
      await checkMascot();
    } catch (err) {
      setMascotError(err instanceof Error ? err.message : "Error");
    } finally {
      setMascotBusy(false);
    }
  }

  async function onMusicUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMusicBusy(true);
    setMusicError("");
    try {
      await apiUpload("/api/music/upload", file);
      await loadMusic();
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : "Error");
    } finally {
      setMusicBusy(false);
    }
  }

  async function removeMusic(fileName: string) {
    if (!confirm(`Delete the track "${fileName}"?`)) return;
    setMusicBusy(true);
    setMusicError("");
    try {
      await api(`/api/music/${encodeURIComponent(fileName)}`, { method: "DELETE" });
      await loadMusic();
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : "Error");
    } finally {
      setMusicBusy(false);
    }
  }

  async function onSfxUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSfxBusy(true);
    setSfxError("");
    try {
      await apiUpload("/api/sfx/upload", file);
      await loadSfx();
    } catch (err) {
      setSfxError(err instanceof Error ? err.message : "Error");
    } finally {
      setSfxBusy(false);
    }
  }

  async function removeSfx(fileName: string) {
    if (!confirm(`Delete the sound effect "${fileName}"?`)) return;
    setSfxBusy(true);
    setSfxError("");
    try {
      await api(`/api/sfx/${encodeURIComponent(fileName)}`, { method: "DELETE" });
      await loadSfx();
    } catch (err) {
      setSfxError(err instanceof Error ? err.message : "Error");
    } finally {
      setSfxBusy(false);
    }
  }

  async function del(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this project?")) return;
    await api(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((p) => p.filter((x) => x.id !== id));
  }

  const done = projects.filter((p) => p.status === "done").length;
  const enCours = projects.filter((p) => p.status !== "done").length;

  return (
    <div>
      <TopBar />
      <main className="container">
        <TabBar />
        <div className="head" style={{ marginTop: 26 }}>
          <div>
            <span className="kicker" style={{ marginBottom: 10 }}>Dashboard</span>
            <h1>My projects</h1>
            <div className="sub">Each project goes from idea to finished video.</div>
          </div>
          <button className="btn" onClick={() => nav("/newproject")}>
            ＋ New project
          </button>
        </div>

        <div className="kpis">
          <div className="kpi">
            <div className="kpi-num">{projects.length}</div>
            <div className="kpi-label">Total projects</div>
          </div>
          <div className="kpi">
            <div className="kpi-num">{enCours}</div>
            <div className="kpi-label">In progress</div>
          </div>
          <div className="kpi">
            <div className="kpi-num">{done}</div>
            <div className="kpi-label">Finished videos</div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ margin: 0 }}>Account mascot</h3>
          <p className="sub" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Character overlaid at the bottom of every video. If none, videos render without it.
          </p>
          <div className="row" style={{ alignItems: "center", gap: 12, marginTop: 12 }}>
            {hasMascot ? (
              <img
                src="/api/mascot"
                alt="mascot"
                style={{ height: 80, borderRadius: 8, background: "rgba(0,0,0,.3)", objectFit: "contain" }}
              />
            ) : (
              <span className="muted">No mascot</span>
            )}
            <label className="btn secondary sm" style={{ cursor: "pointer", margin: 0 }}>
              {hasMascot ? "Replace" : "Import a PNG"}
              <input
                type="file"
                accept="image/png"
                onChange={onMascotUpload}
                style={{ display: "none" }}
                disabled={mascotBusy}
              />
            </label>
            {hasMascot && (
              <button className="btn secondary sm" disabled={mascotBusy} onClick={removeMascot}>
                Remove
              </button>
            )}
            {mascotBusy && <span className="spinner" />}
          </div>
          {mascotError && <div className="alert" style={{ marginTop: 10 }}>{mascotError}</div>}
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ margin: 0 }}>Background music</h3>
          <p className="sub" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Tracks used as background sound — automatically ducked under the voiceover.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <label className="btn secondary sm" style={{ cursor: "pointer", margin: 0 }}>
              ＋ Import a track
              <input
                type="file"
                accept=".mp3,.m4a,.wav,.ogg,.aac,.flac,audio/*"
                onChange={onMusicUpload}
                style={{ display: "none" }}
                disabled={musicBusy}
              />
            </label>
            {musicBusy && <span className="spinner" />}
          </div>
          {musicError && <div className="alert" style={{ marginTop: 10 }}>{musicError}</div>}
          {tracks.length === 0 ? (
            <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>No music yet. Upload royalty-free tracks.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {tracks.map((t) => (
                <div key={t.fileName} className="row between" style={{ marginBottom: 8, gap: 10 }}>
                  <span style={{ fontSize: 13.5 }}>{t.title}</span>
                  <div className="row" style={{ gap: 8, flex: 1, justifyContent: "flex-end" }}>
                    <audio controls src={t.url} style={{ height: 32, maxWidth: 260 }} />
                    <button className="btn danger sm" onClick={() => removeMusic(t.fileName)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ margin: 0 }}>Sound effects</h3>
          <p className="sub" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Impact at the start + "ding" on key numbers. Name files like "whoosh_impact.mp3" or "ding_pop.mp3" to guide the match.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <label className="btn secondary sm" style={{ cursor: "pointer", margin: 0 }}>
              ＋ Import an effect
              <input
                type="file"
                accept=".mp3,.m4a,.wav,.ogg,.aac,.flac,audio/*"
                onChange={onSfxUpload}
                style={{ display: "none" }}
                disabled={sfxBusy}
              />
            </label>
            {sfxBusy && <span className="spinner" />}
          </div>
          {sfxError && <div className="alert" style={{ marginTop: 10 }}>{sfxError}</div>}
          {effects.length === 0 ? (
            <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>No effects yet.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {effects.map((s) => (
                <div key={s.fileName} className="row between" style={{ marginBottom: 8, gap: 10 }}>
                  <span style={{ fontSize: 13.5 }}>{s.title}</span>
                  <div className="row" style={{ gap: 8, flex: 1, justifyContent: "flex-end" }}>
                    <audio controls src={s.url} style={{ height: 32, maxWidth: 260 }} />
                    <button className="btn danger sm" onClick={() => removeSfx(s.fileName)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {projects.length === 0 && (
          <div className="empty">
            <div className="empty-icon">◈</div>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>No projects yet</div>
            <div style={{ marginBottom: 18, fontSize: 14 }}>Create one and let the AI suggest topics.</div>
            <button className="btn" onClick={() => nav("/newproject")}>＋ Create my first project</button>
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
                    <button className="btn danger sm" style={{ padding: "4px 9px" }} onClick={(e) => del(p.id, e)} title="Delete">✕</button>
                  </div>
                  <p className="sub" style={{ margin: "8px 0 0", fontSize: 13, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {p.topic}
                  </p>
                  <div className="row" style={{ marginTop: 12 }}>
                    <span className={"badge " + p.mode}>{p.mode === "auto" ? "AI" : "Manual"}</span>
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
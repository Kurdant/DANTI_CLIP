import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { Background, BackgroundList, Project, VideoDto, VoiceOption } from "../types";
import { BackgroundPicker } from "../components/BackgroundPicker";
import { TopBar } from "../components/TopBar";

const STYLES = [
  { id: "classic", label: "Classique" },
  { id: "neon", label: "Néon" },
  { id: "bold", label: "Gras" },
  { id: "minimal", label: "Minimal" },
  { id: "boxed", label: "Encadré" },
];

const STEPS = ["Idée", "Script", "Voix", "Vidéo"];

export function ProjectPage() {
  const { id } = useParams();
  const pid = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [bgList, setBgList] = useState<Background[]>([]);
  const [maxUpload, setMaxUpload] = useState<number>(200 * 1024 * 1024);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [voiceChoice, setVoiceChoice] = useState("");
  const [renderJob, setRenderJob] = useState<{ step: string; progress: number; running: boolean; error?: string } | null>(null);
  const [styleChoice, setStyleChoice] = useState("classic");
  const [bgChoice, setBgChoice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ project: Project }>(`/api/projects/${pid}`);
    setProject(r.project);
  }, [pid]);

  const loadBackgrounds = useCallback(() => {
    api<BackgroundList>("/api/backgrounds")
      .then((r) => {
        setBgList(r.backgrounds);
        setMaxUpload(r.maxUploadBytes);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    loadBackgrounds();
    api<{ voices: VoiceOption[] }>("/api/voices").then((r) => setVoices(r.voices)).catch(() => undefined);
  }, [load, loadBackgrounds]);

  function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    fn()
      .then(() => load())
      .catch((e) => {
        console.error("[act]", label, e);
        setError(e instanceof Error ? e.message : "Erreur");
      })
      .finally(() => setBusy(""));
  }

  // Lance un rendu/full-creation (retour 202 immediat) puis poll la progression.
  function runRender(kind: "video" | "full", path: string) {
    setBusy(kind);
    setError("");
    setRenderJob({ step: kind === "full" ? "preparation" : "image", progress: 0, running: true });
    api(path, { method: "POST", body: {} }).catch((e) => {
      setError(e instanceof Error ? e.message : "Erreur");
      setBusy("");
      setRenderJob(null);
    });
  }

  // Poll de la progression tant qu'un rendu tourne.
  useEffect(() => {
    if (busy !== "video" && busy !== "full") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await api<{ step: string; progress: number; running: boolean; error?: string }>(`/api/projects/${pid}/video/status`);
        if (cancelled) return;
        setRenderJob(s);
        if (s.running) {
          setTimeout(tick, 700);
        } else {
          if (s.error) setError(s.error);
          await load();
          setBusy("");
          setRenderJob(null);
        }
      } catch {
        if (!cancelled) setTimeout(tick, 1000);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [busy, pid]);

  const selectedIdea = project?.ideas?.find((i) => i.id === project.selectedIdeaId);
  const selectedScript = project?.scripts?.find((s) => s.id === project.selectedScriptId);
  const selectedVoice = project?.voices?.find((v) => v.id === project.selectedVoiceId);
  const selectedVideo = project?.videos?.[0];

  // Resynchronise le choix de voix sur la voix actuellement selectionnee.
  useEffect(() => {
    if (selectedVoice) setVoiceChoice(selectedVoice.voiceName);
  }, [selectedVoice?.voiceName]);

  // Defaults des choix "full creation" sur l'etat du projet.
  useEffect(() => {
    if (project?.textStyle) setStyleChoice(project.textStyle);
    setBgChoice(project?.selectedBackground ?? null);
  }, [project?.textStyle, project?.selectedBackground]);

  // Full creation : persiste style + fond puis lance la chaine avec la voix choisie.
  async function doFull() {
    setError("");
    try {
      await api(`/api/projects/${pid}/style`, { method: "POST", body: { style: styleChoice } });
      if (bgChoice) await api(`/api/projects/${pid}/background`, { method: "POST", body: { fileName: bgChoice } });
      await api(`/api/projects/${pid}/full`, { method: "POST", body: { voiceName: voiceChoice } });
      setBusy("full");
      setRenderJob({ step: "preparation", progress: 0, running: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setBusy("");
      setRenderJob(null);
    }
  }

  const statusIdx: Record<string, number> = { draft: 0, ideas: 1, script: 2, voice: 3, done: 4 };
  const cur = statusIdx[project?.status ?? "draft"] ?? 0;

  return (
    <div>
      <TopBar />
      <main className="container">
        <div className="head">
          <div>
            <Link className="back" to="/dashboard">← Mes projets</Link>
            <h1 style={{ margin: "6px 0 4px" }}>{project?.title ?? "…"}</h1>
            <div className="sub">
              {project?.topic} · <span className={"badge " + (project?.status ?? "")}>{project?.status}</span>
            </div>
          </div>
          {project && (
            <button
              className="btn danger"
              onClick={() => {
                if (confirm("Supprimer ce projet ?")) {
                  api(`/api/projects/${pid}`, { method: "DELETE" }).then(() => (location.href = "/dashboard"));
                }
              }}
            >
              Supprimer
            </button>
          )}
        </div>

        {error && <div className="alert">{error}</div>}

        {/* Stepper */}
        <div className="stepper">
          {STEPS.map((s, i) => (
            <div key={s} className={"st " + (i < cur ? "done" : i === cur ? "on" : "")}>
              <i>{i < cur ? "✓" : i + 1}</i> {s}
            </div>
          ))}
        </div>

        {/* FULL CREATION - configuration + tout-en-un */}
        <section className="panel-hero">
          <h2>Création complète</h2>
          <p style={{ color: "rgba(245,237,247,.75)", fontSize: 14.5, margin: "0 0 18px" }}>
            Choisis ta voix, ton style de texte et ton fond — l'IA enchaîne idées, script, voix et vidéo.
          </p>

          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", marginBottom: 7 }}>
            Voix AI
          </label>
          <select className="input" value={voiceChoice || voices[0]?.name || ""} onChange={(e) => setVoiceChoice(e.target.value)}>
            {(voices.length ? voices : []).map((v) => (
              <option key={v.name} value={v.name}>{v.name} · {v.gender} {v.personalities.slice(0, 2).join(", ")}</option>
            ))}
          </select>

          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", margin: "14px 0 7px" }}>
            Style de texte
          </label>
          <div className="row">
            {STYLES.map((s) => (
              <button key={s.id} className={"chip" + (styleChoice === s.id ? " on" : "")} onClick={() => setStyleChoice(s.id)}>
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <BackgroundPicker
              backgrounds={bgList}
              selected={bgChoice}
              onSelect={(f) => setBgChoice(f)}
              accent
              maxBytes={maxUpload}
              onChanged={loadBackgrounds}
            />
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn lg" disabled={busy === "full" || busy === "video"} onClick={doFull}>
              {busy === "full" ? "Création en cours…" : "Tout générer"}
              {busy === "full" && <span className="spinner" />}
            </button>
          </div>

          {renderJob && renderJob.running && (
            <div style={{ marginTop: 16 }}>
              <div className="row between">
                <span style={{ color: "rgba(245,237,247,.85)", fontSize: 13 }}>{renderJob.step}</span>
                <span style={{ color: "rgba(245,237,247,.85)", fontSize: 13 }}>{Math.round(renderJob.progress * 100)}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.16)", overflow: "hidden", marginTop: 6 }}>
                <div style={{ height: "100%", width: `${Math.round(renderJob.progress * 100)}%`, background: "linear-gradient(90deg,#f3a7c9,#d28cd8)", transition: "width .3s" }} />
              </div>
            </div>
          )}
        </section>

        {/* ============ ÉTAPE 1 : IDÉES ============ */}
        <div className="step-title"><span className="step-num">1</span> Idée</div>
        <div className="card">
          {project?.mode === "manual" ? (
            <>
              <p className="sub">Ton idée (mode manuel) :</p>
              {project.title && project.title !== project.topic && (
                <p className="info"><strong>Titre :</strong> {project.title}</p>
              )}
              <p style={{ marginTop: 0 }}><strong>Sujet :</strong> {project.topic}</p>
              <button className="btn" disabled={!!busy} onClick={() => act("script", () => api(`/api/projects/${pid}/script`, { method: "POST", body: {} }))}>
                Générer le script{busy === "script" && <span className="spinner" />}
              </button>
            </>
          ) : (
            <>
              {(project?.ideas?.length ?? 0) === 0 ? (
                <>
                  <p className="sub">L'IA va te proposer 3 sujets différents de vidéo. Choisis ensuite celui qui te plaît.</p>
                  <button className="btn" disabled={busy === "ideas"} onClick={() => act("ideas", () => api(`/api/projects/${pid}/ideas`, { method: "POST", body: {} }))}>
                    {busy === "ideas" ? "Génération en cours…" : "Générer 3 idées"}
                    {busy === "ideas" && <span className="spinner" />}
                  </button>
                </>
              ) : (
                <>
                  <div className="row between" style={{ marginBottom: 12 }}>
                    <span className="sub">Choisis un sujet :</span>
                    <button className="btn secondary sm" disabled={!!busy} onClick={() => act("ideas", () => api(`/api/projects/${pid}/ideas`, { method: "POST", body: {} }))}>
                      Regénérer{busy === "ideas" && <span className="spinner" />}
                    </button>
                  </div>
                  {project!.ideas!.map((i) => (
                    <div
                      key={i.id}
                      className={"idea" + (i.id === project?.selectedIdeaId ? " selected" : "")}
                      style={{ cursor: "pointer" }}
                      onClick={() => act("sel", () => api(`/api/projects/${pid}/select-idea`, { method: "POST", body: { ideaId: i.id } }))}
                    >
                      <strong>{i.position}. {i.titre || i.ideaText}</strong>
                      <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Sujet : {i.ideaText}</div>
                      <div className="hook">HOOK : {i.hook}</div>
                      {i.fond && <div className="muted">Fond : {i.fond}</div>}
                    </div>
                  ))}
                  <button
                    className="btn"
                    style={{ marginTop: 8 }}
                    disabled={!selectedIdea || !!busy}
                    onClick={() => act("script", () => api(`/api/projects/${pid}/script`, { method: "POST", body: {} }))}
                  >
                    ✓ Utiliser cette idée et générer le script{busy === "script" && <span className="spinner" />}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* ============ ÉTAPE 2 : SCRIPT ============ */}
        {(project?.scripts?.length ?? 0) > 0 && (
          <>
            <div className="step-title"><span className="step-num">2</span> Script</div>
            <div className="card">
              <div className="row between">
                <h3 style={{ marginTop: 0 }}>{selectedScript?.script.titre}</h3>
                <span className="muted">{selectedScript?.script.duree}</span>
              </div>
              <p className="info">Hook : <strong>{selectedScript?.script.hook}</strong></p>
              {selectedScript?.script.structure?.map((p, idx) => (
                <div key={idx} style={{ marginBottom: 8 }}>
                  <span className="badge">{p.partie}</span> <span className="muted">({p.duree})</span>
                  <div>{p.texte}</div>
                </div>
              ))}
              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />
              <p className="muted">Narration complète (voix off) :</p>
              <p className="mono" style={{ whiteSpace: "pre-wrap" }}>{selectedScript?.script.texte_continu}</p>

              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn"
                  disabled={!selectedScript || !!busy}
                  onClick={() =>
                    act("voice", async () => {
                      await api(`/api/projects/${pid}/validate-script`, { method: "POST", body: { scriptId: selectedScript!.id } });
                      await api(`/api/projects/${pid}/voice`, { method: "POST", body: {} });
                    })
                  }
                >
                  ✓ Valider et générer la voix{busy === "voice" && <span className="spinner" />}
                </button>
                <button className="btn secondary" disabled={!!busy} onClick={() => act("script", () => api(`/api/projects/${pid}/script`, { method: "POST", body: {} }))}>
                  Regénérer le script{busy === "script" && <span className="spinner" />}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ============ ÉTAPE 3 : VOIX ============ */}
        {(project?.voices?.length ?? 0) > 0 && selectedVoice && (
          <>
            <div className="step-title"><span className="step-num">3</span> Voix</div>
            <div className="card">
              <div className="row between">
                <span className="sub">Voix : {selectedVoice.voiceName} · {selectedVoice.duration ? Math.round(selectedVoice.duration) + "s" : "…"}</span>
                <div className="row">
                  <button
                    className="btn secondary sm"
                    disabled={!!busy || !voiceChoice}
                    onClick={() => act("voice", () => api(`/api/projects/${pid}/voice`, { method: "POST", body: { voiceName: voiceChoice } }))}
                  >
                    Générer avec cette voix{busy === "voice" && <span className="spinner" />}
                  </button>
                  <a className="btn secondary sm" href={selectedVoice.downloadUrl} download>⇩ Télécharger MP3</a>
                </div>
              </div>

              {voices.length > 0 && (
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Voix AI — choisis puis clique « Générer avec cette voix »</label>
                  <select className="input" value={voiceChoice} onChange={(e) => setVoiceChoice(e.target.value)}>
                    {voices.map((v) => (
                      <option key={v.name} value={v.name}>{v.name} · {v.gender} {v.personalities.slice(0, 2).join(", ")}</option>
                    ))}
                  </select>
                </div>
              )}

              <audio controls src={selectedVoice.url} style={{ marginTop: 10 }} />
            </div>
          </>
        )}

        {/* ============ ÉTAPE 4 : FOND VIDEO & STYLE ============ */}
        {selectedVoice && (
          <>
            <div className="step-title"><span className="step-num">4</span> Fond vidéo & style</div>
            <div className="card">
              <div className="field">
                <label>Style du texte (sous-titres)</label>
                <div className="row">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      className={"chip" + (project?.textStyle === s.id ? " on" : "")}
                      disabled={!!busy}
                      onClick={() => act("style", () => api(`/api/projects/${pid}/style`, { method: "POST", body: { style: s.id } }))}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <BackgroundPicker
                backgrounds={bgList}
                selected={project?.selectedBackground ?? null}
                onSelect={(f) => {
                  if (f) act("bg", () => api(`/api/projects/${pid}/background`, { method: "POST", body: { fileName: f } }));
                }}
                maxBytes={maxUpload}
                onChanged={loadBackgrounds}
              />

              <p className="sub" style={{ margin: "14px 0 8px" }}>Génère ta vidéo (fond uni si aucun fond choisi) :</p>
              <button className="btn" disabled={busy === "video" || busy === "full"} onClick={() => runRender("video", `/api/projects/${pid}/video`)}>
                {busy === "video" ? "Rendu en cours…" : "Générer la vidéo"}
                {busy === "video" && <span className="spinner" />}
              </button>

              {renderJob && (busy === "video" || busy === "full") && renderJob.running && (
                <div style={{ marginTop: 12 }}>
                  <div className="row between">
                    <span className="sub">{renderJob.step}</span>
                    <span className="sub">{Math.round(renderJob.progress * 100)}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden", marginTop: 6 }}>
                    <div style={{ height: "100%", width: `${Math.round(renderJob.progress * 100)}%`, background: "var(--grad)", transition: "width .3s" }} />
                  </div>
                </div>
              )}

              {selectedVideo && (
                <div style={{ marginTop: 14 }}>
                  <div className="row between">
                    <span className="sub">Vidéo générée {selectedVideo.duration ? `(${Math.round(selectedVideo.duration)}s)` : ""}</span>
                    <a className="btn secondary sm" href={selectedVideo.downloadUrl} download>⇩ Télécharger MP4</a>
                  </div>
                  <video controls src={selectedVideo.url} style={{ width: "100%", marginTop: 8, borderRadius: 12 }} />
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

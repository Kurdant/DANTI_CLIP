import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { Background, Project, VideoDto, VoiceOption } from "../types";

const STYLES = [
  { id: "classic", label: "Classique" },
  { id: "neon", label: "Néon" },
  { id: "bold", label: "Gras" },
  { id: "minimal", label: "Minimal" },
  { id: "boxed", label: "Encadré" },
];

export function ProjectPage() {
  const { id } = useParams();
  const pid = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [bgList, setBgList] = useState<Background[]>([]);
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

  useEffect(() => {
    load().catch((e) => setError(e.message));
    api<{ backgrounds: Background[] }>("/api/backgrounds").then((r) => setBgList(r.backgrounds)).catch(() => undefined);
    api<{ voices: VoiceOption[] }>("/api/voices").then((r) => setVoices(r.voices)).catch(() => undefined);
  }, [load]);

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

  return (
    <div className="container">
      <div className="head">
        <div>
          <Link className="back" to="/dashboard">← Retour</Link>
          <h1 style={{ margin: "6px 0 0" }}>{project?.title ?? "…"}</h1>
          <div className="sub">
            {project?.topic} ·{" "}
            <span className={"badge " + (project?.status ?? "")}>{project?.status}</span>
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

      {/* FULL CREATION - configuration + tout-en-un */}
      <div className="card" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", border: "none", color: "#fff" }}>
        <h2 style={{ margin: 0 }}>⚡ Création complète</h2>
        <div style={{ color: "rgba(255,255,255,.85)", fontSize: 14, marginBottom: 12 }}>
          Choisis ta voix, ton style de texte et ton fond, puis laisse l'IA tout faire.
        </div>

        <div className="field">
          <label style={{ color: "rgba(255,255,255,.85)" }}>Voix AI</label>
          <select className="input" value={voiceChoice || voices[0]?.name || ""} onChange={(e) => setVoiceChoice(e.target.value)}>
            {(voices.length ? voices : []).map((v) => (
              <option key={v.name} value={v.name}>{v.name} · {v.gender} {v.personalities.slice(0, 2).join(", ")}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label style={{ color: "rgba(255,255,255,.85)" }}>Style de texte</label>
          <div className="row">
            {STYLES.map((s) => (
              <button
                key={s.id}
                className={"btn sm " + (styleChoice === s.id ? "" : "secondary")}
                style={styleChoice === s.id ? { background: "#fff", color: "var(--accent-2)" } : { background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}
                onClick={() => setStyleChoice(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label style={{ color: "rgba(255,255,255,.85)" }}>Fond vidéo {bgChoice ? "" : "(fond uni si aucun)"}</label>
          {bgList.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.85)" }}>Aucune vidéo de fond dans <span className="mono">assets/backgrounds/</span>.</div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))" }}>
              {bgList.map((b) => (
                <div
                  key={b.fileName}
                  style={{
                    borderRadius: 8, overflow: "hidden", cursor: "pointer",
                    border: bgChoice === b.fileName ? "2px solid #fff" : "2px solid transparent",
                    background: "#000",
                  }}
                  onClick={() => setBgChoice(bgChoice === b.fileName ? null : b.fileName)}
                  title={b.fileName}
                >
                  {b.thumbUrl && <img src={b.thumbUrl} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "9/16", objectFit: "cover", display: "block" }} />}
                </div>
              ))}
            </div>
          )}
          {bgChoice && <div style={{ fontSize: 12, marginTop: 4, color: "rgba(255,255,255,.85)" }}>✓ {bgChoice}</div>}
        </div>

        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" style={{ background: "#fff", color: "var(--accent-2)" }} disabled={busy === "full" || busy === "video"} onClick={doFull}>
            {busy === "full" ? "Création en cours…" : "🚀 Tout générer"}
            {busy === "full" && <span className="spinner" />}
          </button>
        </div>

        {renderJob && renderJob.running && (
          <div style={{ marginTop: 14 }}>
            <div className="row between">
              <span style={{ color: "#fff", fontSize: 13 }}>{renderJob.step}</span>
              <span style={{ color: "#fff", fontSize: 13 }}>{Math.round(renderJob.progress * 100)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.3)", overflow: "hidden", marginTop: 6 }}>
              <div style={{ height: "100%", width: `${Math.round(renderJob.progress * 100)}%`, background: "#fff", transition: "width .3s" }} />
            </div>
          </div>
        )}
      </div>

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
                    className={"idea" + (i.id === project.selectedIdeaId ? " selected" : "")}
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
                    className={"btn sm " + (project?.textStyle === s.id ? "" : "secondary")}
                    disabled={!!busy}
                    onClick={() => act("style", () => api(`/api/projects/${pid}/style`, { method: "POST", body: { style: s.id } }))}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {bgList.length === 0 ? (
              <div className="empty">Aucune vidéo de fond dans <span className="mono">assets/backgrounds/</span>. Dépose tes vidéos (.mp4, .webm, .mov) là-bas et recharges.</div>
            ) : (
              <div className="grid">
                {bgList.map((b) => (
                  <div
                    key={b.fileName}
                    className="card clickable"
                    style={{ padding: 8, margin: 0 }}
                    onClick={() => act("bg", () => api(`/api/projects/${pid}/background`, { method: "POST", body: { fileName: b.fileName } }))}
                  >
                    {b.thumbUrl && (
                      <img src={b.thumbUrl} alt="" loading="lazy" style={{ width: "100%", borderRadius: 8, aspectRatio: "9/16", objectFit: "cover", display: "block" }} />
                    )}
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, wordBreak: "break-all" }}>{b.fileName}</div>
                    <div className="row" style={{ marginTop: 6 }}>
                      {project?.selectedBackground === b.fileName && <span className="badge">✓ choisi</span>}
                      <a className="btn secondary sm" href={b.downloadUrl} download>⇩</a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="sub" style={{ margin: "14px 0 8px" }}>Génère ta vidéo (fond uni si aucun fond choisi) :</p>
            <button className="btn" disabled={busy === "video" || busy === "full"} onClick={() => runRender("video", `/api/projects/${pid}/video`)}>
              {busy === "video" ? "Rendu en cours…" : "🎬 Générer la vidéo"}
              {busy === "video" && <span className="spinner" />}
            </button>

            {renderJob && (busy === "video" || busy === "full") && renderJob.running && (
              <div style={{ marginTop: 12 }}>
                <div className="row between">
                  <span className="sub">{renderJob.step}</span>
                  <span className="sub">{Math.round(renderJob.progress * 100)}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden", marginTop: 6 }}>
                  <div style={{ height: "100%", width: `${Math.round(renderJob.progress * 100)}%`, background: "var(--accent)", transition: "width .3s" }} />
                </div>
              </div>
            )}

            {selectedVideo && (
              <div style={{ marginTop: 14 }}>
                <div className="row between">
                  <span className="sub">Vidéo générée {selectedVideo.duration ? `(${Math.round(selectedVideo.duration)}s)` : ""}</span>
                  <a className="btn secondary sm" href={selectedVideo.downloadUrl} download>⇩ Télécharger MP4</a>
                </div>
                <video controls src={selectedVideo.url} style={{ width: "100%", marginTop: 8, borderRadius: 10 }} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

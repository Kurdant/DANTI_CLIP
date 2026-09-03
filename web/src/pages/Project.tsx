import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { Background, Project, VoiceOption } from "../types";

export function ProjectPage() {
  const { id } = useParams();
  const pid = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [bgList, setBgList] = useState<Background[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

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

  const selectedIdea = project?.ideas?.find((i) => i.id === project.selectedIdeaId);
  const selectedScript = project?.scripts?.find((s) => s.id === project.selectedScriptId);
  const selectedVoice = project?.voices?.find((v) => v.id === project.selectedVoiceId);

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

      {/* ============ ÉTAPE 1 : IDÉES ============ */}
      <div className="step-title"><span className="step-num">1</span> Idée</div>
      <div className="card">
        {project?.mode === "manual" ? (
          <>
            <p className="sub">Ton idée (mode manuel) :</p>
            <p style={{ marginTop: 0 }}>{project.topic}</p>
            <button className="btn" disabled={!!busy} onClick={() => act("script", () => api(`/api/projects/${pid}/script`, { method: "POST", body: {} }))}>
              Générer le script{busy === "script" && <span className="spinner" />}
            </button>
          </>
        ) : (
          <>
            {(project?.ideas?.length ?? 0) === 0 ? (
              <>
                <p className="sub">Laisse l'IA générer plusieurs idées de vidéo pour ce sujet.</p>
                <button className="btn" disabled={busy === "ideas"} onClick={() => act("ideas", () => api(`/api/projects/${pid}/ideas`, { method: "POST", body: {} }))}>
                  {busy === "ideas" ? "Génération en cours…" : "Générer des idées"}
                  {busy === "ideas" && <span className="spinner" />}
                </button>
              </>
            ) : (
              <>
                <div className="row between" style={{ marginBottom: 12 }}>
                  <span className="sub">Choisis une idée :</span>
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
                    <strong>{i.position}. {i.ideaText}</strong>
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
                <button className="btn secondary sm" disabled={!!busy} onClick={() => act("voice", () => api(`/api/projects/${pid}/voice`, { method: "POST", body: {} }))}>
                  Autre voix{busy === "voice" && <span className="spinner" />}
                </button>
                <a className="btn secondary sm" href={selectedVoice.downloadUrl} download>⇩ Télécharger MP3</a>
              </div>
            </div>

            {voices.length > 0 && (
              <div className="field" style={{ marginTop: 12 }}>
                <label>Choisir la voix (le bouton "Autre voix" régénère avec celle-ci)</label>
                <select
                  className="input"
                  defaultValue={selectedVoice.voiceName}
                  onChange={(e) => {
                    console.log("voix choisie pour regen:", e.target.value);
                    // stocke pour la prochaine regeneration
                    (window as unknown as { __voice?: string }).__voice = e.target.value;
                  }}
                >
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

      {/* ============ ÉTAPE 4 : FOND VIDEO ============ */}
      <div className="step-title"><span className="step-num">4</span> Fond vidéo</div>
      <div className="card">
        {bgList.length === 0 ? (
          <div className="empty">Aucune vidéo de fond dans <span className="mono">assets/backgrounds/</span>. Dépose tes vidéos (.mp4, .webm, .mov) là-bas et recharges.</div>
        ) : (
          <div className="files">
            {bgList.map((b) => (
              <div key={b.fileName} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span>
                  {project?.selectedBackground === b.fileName ? "✓ " : ""}
                  {b.fileName}
                </span>
                <div className="row">
                  <button
                    className={"btn sm " + (project?.selectedBackground === b.fileName ? "" : "secondary")}
                    disabled={!!busy}
                    onClick={() => act("bg", () => api(`/api/projects/${pid}/background`, { method: "POST", body: { fileName: b.fileName } }))}
                  >
                    Choisir
                  </button>
                  <a className="btn secondary sm" href={b.downloadUrl} download>⇩ Télécharger</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

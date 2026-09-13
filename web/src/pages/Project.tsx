import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { Background, BackgroundList, MusicTrack, Project, SfxFile, VideoDto, VoiceOption } from "../types";
import { BackgroundPicker } from "../components/BackgroundPicker";
import { RangeField } from "../components/RangeField";
import { TopBar } from "../components/TopBar";
import { YouTubeUpload } from "../components/YouTubeUpload";

const STYLES = [
  { id: "classic", label: "Classic" },
  { id: "neon", label: "Neon" },
  { id: "bold", label: "Bold" },
  { id: "minimal", label: "Minimal" },
  { id: "boxed", label: "Boxed" },
  { id: "pop", label: "Pop" },
  { id: "karaoke", label: "Karaoke" },
];

const STEPS = ["Idea", "Script", "Voice", "Video"];

const compactNum = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
function fmtCount(n: number | null): string {
  return n == null ? "—" : compactNum.format(n);
}

export function ProjectPage() {
  const { id } = useParams();
  const pid = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [bgList, setBgList] = useState<Background[]>([]);
  const [maxUpload, setMaxUpload] = useState<number>(200 * 1024 * 1024);
  const [usedBytes, setUsedBytes] = useState(0);
  const [quotaBytes, setQuotaBytes] = useState(1024 * 1024 * 1024);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [voiceChoice, setVoiceChoice] = useState("");
  const [renderJob, setRenderJob] = useState<{ step: string; progress: number; running: boolean; error?: string } | null>(null);
  const [styleChoice, setStyleChoice] = useState("classic");
  const [bgChoice, setBgChoice] = useState<string | null>(null);
  const [ideaMode, setIdeaMode] = useState<"ia" | "theme">("ia");
  const [themeText, setThemeText] = useState("");
  const [themeSeeded, setThemeSeeded] = useState(false);
  const [creationOpen, setCreationOpen] = useState(false);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicTrack, setMusicTrack] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [sfxOn, setSfxOn] = useState(true);
  const [sfxFiles, setSfxFiles] = useState<SfxFile[]>([]);
  const [sfxIntro, setSfxIntro] = useState<string | null>(null);
  const [sfxVolume, setSfxVolume] = useState(1);
  const [effectsOn, setEffectsOn] = useState(true);
  const [brollOn, setBrollOn] = useState(true);
  const [voiceRate, setVoiceRate] = useState(8);
  const [voicePitch, setVoicePitch] = useState(0);

  // Pre-remplit le theme (anciens projets) et positionne le mode "theme" si le projet est manuel.
  useEffect(() => {
    if (!themeSeeded && project) {
      setThemeText(project.topic ?? "");
      if (project.mode === "manual") setIdeaMode("theme");
      setThemeSeeded(true);
    }
  }, [project, themeSeeded]);

  const load = useCallback(async () => {
    const r = await api<{ project: Project }>(`/api/projects/${pid}`);
    setProject(r.project);
  }, [pid]);

  const loadBackgrounds = useCallback(() => {
    api<BackgroundList>("/api/backgrounds")
      .then((r) => {
        setBgList(r.backgrounds);
        setMaxUpload(r.maxUploadBytes);
        setUsedBytes(r.usedBytes ?? 0);
        setQuotaBytes(r.quotaBytes ?? 1024 * 1024 * 1024);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    loadBackgrounds();
    api<{ voices: VoiceOption[] }>("/api/voices").then((r) => setVoices(r.voices)).catch(() => undefined);
    api<{ tracks: MusicTrack[] }>("/api/music").then((r) => setMusicTracks(r.tracks)).catch(() => undefined);
    api<{ effects: SfxFile[] }>("/api/sfx").then((r) => setSfxFiles(r.effects)).catch(() => undefined);
  }, [load, loadBackgrounds]);

  function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    fn()
      .then(() => load())
      .catch((e) => {
        console.error("[act]", label, e);
        setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => setBusy(""));
  }

  // Lance un rendu/full-creation (retour 202 immediat) puis poll la progression.
  function runRender(kind: "video" | "full", path: string) {
    setBusy(kind);
    setError("");
    setRenderJob({ step: kind === "full" ? "preparation" : "image", progress: 0, running: true });
    const opts = { textStyle: styleChoice, musicEnabled, musicTrack, musicVolume, sfxEnabled: sfxOn, sfxIntro, sfxVolume, effectsEnabled: effectsOn, brollEnabled: brollOn, voiceRate, voicePitch };
    api(`/api/projects/${pid}/render-options`, { method: "PATCH", body: opts })
      .then(() => api(path, { method: "POST", body: kind === "full" ? { voiceName: voiceChoice, voiceRate, voicePitch } : {} }))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error");
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

  // Publication YouTube : titre de la video + description (hashtags en fin), pret a copier-coller.
  const pubTitle = selectedVideo?.title?.trim()
    || selectedScript?.script.titre_youtube?.trim()
    || selectedScript?.script.titre?.trim()
    || project?.title
    || "";
  const pubBody = selectedVideo?.description?.trim()
    || selectedScript?.script.description?.trim()
    || project?.topic
    || "";
  const pubTags = selectedVideo?.tags?.length
    ? selectedVideo.tags
    : (selectedScript?.script.hashtags ?? []);

  // Resynchronise le choix de voix sur la voix actuellement selectionnee.
  useEffect(() => {
    if (selectedVoice) setVoiceChoice(selectedVoice.voiceName);
  }, [selectedVoice?.voiceName]);

  // Defaults des choix "full creation" sur l'etat du projet.
  useEffect(() => {
    if (project?.textStyle) setStyleChoice(project.textStyle);
    setBgChoice(project?.selectedBackground ?? null);
    setMusicEnabled(project?.musicEnabled ?? false);
    setMusicTrack(project?.musicTrack ?? null);
    if (project?.musicVolume != null) setMusicVolume(project.musicVolume);
    setSfxOn(project?.sfxEnabled ?? true);
    setSfxIntro(project?.sfxIntro ?? null);
    if (project?.sfxVolume != null) setSfxVolume(project.sfxVolume);
    setEffectsOn(project?.effectsEnabled ?? true);
    setBrollOn(project?.brollEnabled ?? true);
    if (project?.voiceRate != null) setVoiceRate(project.voiceRate);
    if (project?.voicePitch != null) setVoicePitch(project.voicePitch);
  }, [project?.textStyle, project?.selectedBackground, project?.musicEnabled, project?.musicTrack, project?.musicVolume, project?.sfxEnabled, project?.sfxIntro, project?.sfxVolume, project?.effectsEnabled, project?.brollEnabled, project?.voiceRate, project?.voicePitch]);

  // Full creation : persiste style + fond + options de rendu puis lance la chaine avec la voix choisie.
  async function doFull() {
    setError("");
    setCreationOpen(true);
    try {
      await api(`/api/projects/${pid}/render-options`, { method: "PATCH", body: { textStyle: styleChoice, musicEnabled, musicTrack, musicVolume, sfxEnabled: sfxOn, sfxIntro, sfxVolume, effectsEnabled: effectsOn, brollEnabled: brollOn, voiceRate, voicePitch } });
      if (bgChoice) await api(`/api/projects/${pid}/background`, { method: "POST", body: { fileName: bgChoice } });
      await api(`/api/projects/${pid}/full`, { method: "POST", body: { voiceName: voiceChoice, voiceRate, voicePitch } });
      setBusy("full");
      setRenderJob({ step: "preparation", progress: 0, running: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
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
            <Link className="back" to="/dashboard">← My projects</Link>
            <h1 style={{ margin: "6px 0 4px" }}>{project?.title ?? "…"}</h1>
            <div className="sub">
              {project?.topic} · <span className={"badge " + (project?.status ?? "")}>{project?.status}</span>
            </div>
          </div>
          {project && (
            <button
              className="btn danger"
              onClick={() => {
                if (confirm("Delete this project?")) {
                  api(`/api/projects/${pid}`, { method: "DELETE" }).then(() => (location.href = "/dashboard"));
                }
              }}
            >
              Delete
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
          <button
            className="panel-hero-head"
            onClick={() => setCreationOpen((o) => !o)}
            aria-expanded={creationOpen}
          >
            <h2>Full creation</h2>
            <span className="chev">{creationOpen ? "▾" : "▸"}</span>
          </button>

          {creationOpen && (
            <>
              <p style={{ color: "rgba(245,237,247,.75)", fontSize: 14.5, margin: "0 0 18px" }}>
                Choose your voice, text style and background — the AI chains ideas, script, voice and video.
              </p>

              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", marginBottom: 7 }}>
                AI Voice
              </label>
              <select className="input" value={voiceChoice || voices[0]?.name || ""} onChange={(e) => setVoiceChoice(e.target.value)}>
                {(voices.length ? voices : []).map((v) => (
                  <option key={v.name} value={v.name}>{v.name} · {v.gender} {v.personalities.slice(0, 2).join(", ")}</option>
                ))}
              </select>

              <div className="row" style={{ gap: 20, marginTop: 10, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", display: "flex", alignItems: "center", gap: 8 }}>
                  Speed
                  <input type="range" min={-10} max={25} value={voiceRate} onChange={(e) => setVoiceRate(Number(e.target.value))} />
                  {voiceRate > 0 ? "+" : ""}{voiceRate}%
                </label>
                <label style={{ fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", display: "flex", alignItems: "center", gap: 8 }}>
                  Pitch
                  <input type="range" min={-20} max={20} value={voicePitch} onChange={(e) => setVoicePitch(Number(e.target.value))} />
                  {voicePitch > 0 ? "+" : ""}{voicePitch}Hz
                </label>
              </div>

              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", margin: "14px 0 7px" }}>
                Text style
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
                  usedBytes={usedBytes}
                  quotaBytes={quotaBytes}
                  onChanged={loadBackgrounds}
                />
              </div>

              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", margin: "16px 0 7px" }}>
                Background music
              </label>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button className={"chip" + (!musicEnabled ? " on" : "")} onClick={() => setMusicEnabled(false)}>None</button>
                <button className={"chip" + (musicEnabled ? " on" : "")} onClick={() => setMusicEnabled(true)}>Music</button>
                {musicEnabled && musicTracks.length > 0 && (
                  <select className="input" style={{ maxWidth: 260 }} value={musicTrack ?? ""} onChange={(e) => setMusicTrack(e.target.value || null)}>
                    <option value="">Random</option>
                    {musicTracks.map((t) => (
                      <option key={t.fileName} value={t.fileName}>{t.title}</option>
                    ))}
                  </select>
                )}
              </div>
              {musicEnabled && musicTracks.length === 0 && (
                <p className="sub" style={{ fontSize: 12.5, marginTop: 6 }}>
                  No music available: add royalty-free files to assets/music.
                </p>
              )}

              <div className="row" style={{ marginTop: 10 }}>
                <RangeField
                  label="Music volume"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(musicVolume * 100)}
                  suffix="%"
                  disabled={!musicEnabled}
                  title={musicEnabled ? undefined : "Enable music to adjust the volume"}
                  onChange={(v) => setMusicVolume(v / 100)}
                />
              </div>

              <div className="row" style={{ marginTop: 14 }}>
                <button className={"chip" + (sfxOn ? " on" : "")} onClick={() => setSfxOn(!sfxOn)}>
                  Sound effects {sfxOn ? "✓" : "✗"}
                </button>
                <button className={"chip" + (effectsOn ? " on" : "")} onClick={() => setEffectsOn(!effectsOn)}>
                  Dynamic effects {effectsOn ? "✓" : "✗"}
                </button>
                <button className={"chip" + (brollOn ? " on" : "")} onClick={() => setBrollOn(!brollOn)}>
                  B-roll video {brollOn ? "✓" : "✗"}
                </button>
              </div>

              {sfxOn && sfxFiles.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <select className="input" style={{ maxWidth: 300 }} value={sfxIntro ?? ""} onChange={(e) => setSfxIntro(e.target.value || null)}>
                    <option value="">Intro sound: auto</option>
                    {sfxFiles.map((s) => (
                      <option key={s.fileName} value={s.fileName}>{s.title}</option>
                    ))}
                  </select>
                </div>
              )}
              {sfxOn && (
                <div className="row" style={{ marginTop: 10 }}>
                  <RangeField label="SFX volume" min={0} max={100} step={5} value={Math.round(sfxVolume * 100)} suffix="%" onChange={(v) => setSfxVolume(v / 100)} />
                </div>
              )}

              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn lg" disabled={busy === "full" || busy === "video"} onClick={doFull}>
                  {busy === "full" ? "Creating…" : "Generate all"}
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
            </>
          )}
        </section>

        {/* ============ ÉTAPE 1 : IDÉES ============ */}
        <div className="step-title"><span className="step-num">1</span> Idea</div>
        <div className="card">
          <div className="row" style={{ marginBottom: 14 }}>
            <button className={"chip" + (ideaMode === "ia" ? " on" : "")} onClick={() => setIdeaMode("ia")}>
              Generate with AI
            </button>
            <button className={"chip" + (ideaMode === "theme" ? " on" : "")} onClick={() => setIdeaMode("theme")}>
              I'll write the topic
            </button>
          </div>

          {ideaMode === "ia" ? (
            <>
              {(project?.ideas?.length ?? 0) === 0 ? (
                <>
                  <p className="sub">The AI will suggest 3 different video topics. Then pick the one you like.</p>
                  <button className="btn" disabled={busy === "ideas"} onClick={() => act("ideas", () => api(`/api/projects/${pid}/ideas`, { method: "POST", body: {} }))}>
                    {busy === "ideas" ? "Generating…" : "Generate 3 ideas"}
                    {busy === "ideas" && <span className="spinner" />}
                  </button>
                </>
              ) : (
                <>
                  <div className="row between" style={{ marginBottom: 12 }}>
                    <span className="sub">Choose a topic:</span>
                    <button className="btn secondary sm" disabled={!!busy} onClick={() => act("ideas", () => api(`/api/projects/${pid}/ideas`, { method: "POST", body: {} }))}>
                      Regenerate{busy === "ideas" && <span className="spinner" />}
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
                      <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Topic: {i.ideaText}</div>
                      <div className="hook">HOOK : {i.hook}</div>
                      {i.fond && <div className="muted">Background: {i.fond}</div>}
                    </div>
                  ))}
                  <button
                    className="btn"
                    style={{ marginTop: 8 }}
                    disabled={!selectedIdea || !!busy}
                    onClick={() => act("script", () => api(`/api/projects/${pid}/script`, { method: "POST", body: {} }))}
                  >
                    ✓ Use this idea and generate the script{busy === "script" && <span className="spinner" />}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <p className="sub">Write your topic, then generate the script directly.</p>
              <textarea
                className="input"
                rows={3}
                value={themeText}
                onChange={(e) => setThemeText(e.target.value)}
                placeholder="Describe your video topic…"
                style={{ marginBottom: 12 }}
              />
              <button
                className="btn"
                disabled={!themeText.trim() || !!busy}
                onClick={() =>
                  act("script", async () => {
                    await api(`/api/projects/${pid}`, { method: "PATCH", body: { topic: themeText.trim() } });
                    await api(`/api/projects/${pid}/script`, { method: "POST", body: {} });
                  })
                }
              >
                Generate script{busy === "script" && <span className="spinner" />}
              </button>
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
              <p className="muted">Full narration (voice-over):</p>
              <p className="mono" style={{ whiteSpace: "pre-wrap" }}>{selectedScript?.script.texte_continu}</p>

              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn"
                  disabled={!selectedScript || !!busy}
                  onClick={() =>
                    act("voice", async () => {
                      await api(`/api/projects/${pid}/validate-script`, { method: "POST", body: { scriptId: selectedScript!.id } });
                      await api(`/api/projects/${pid}/voice`, { method: "POST", body: { rate: voiceRate, pitch: voicePitch } });
                    })
                  }
                >
                  ✓ Validate and generate voice{busy === "voice" && <span className="spinner" />}
                </button>
                <button className="btn secondary" disabled={!!busy} onClick={() => act("script", () => api(`/api/projects/${pid}/script`, { method: "POST", body: {} }))}>
                  Regenerate script{busy === "script" && <span className="spinner" />}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ============ ÉTAPE 3 : VOIX ============ */}
        {(project?.voices?.length ?? 0) > 0 && selectedVoice && (
          <>
            <div className="step-title"><span className="step-num">3</span> Voice</div>
            <div className="card">
              <div className="row between">
                <span className="sub">Voice: {selectedVoice.voiceName} · {selectedVoice.duration ? Math.round(selectedVoice.duration) + "s" : "…"}</span>
                <div className="row">
                  <button
                    className="btn secondary sm"
                    disabled={!!busy || !voiceChoice}
                    onClick={() => act("voice", () => api(`/api/projects/${pid}/voice`, { method: "POST", body: { voiceName: voiceChoice, rate: voiceRate, pitch: voicePitch } }))}
                  >
                    Generate with this voice{busy === "voice" && <span className="spinner" />}
                  </button>
                  <a className="btn secondary sm" href={selectedVoice.downloadUrl} download>⇩ Download MP3</a>
                </div>
              </div>

              {voices.length > 0 && (
                <div className="field" style={{ marginTop: 12 }}>
                  <label>AI Voice — choose then click "Generate with this voice"</label>
                  <select className="input" value={voiceChoice} onChange={(e) => setVoiceChoice(e.target.value)}>
                    {voices.map((v) => (
                      <option key={v.name} value={v.name}>{v.name} · {v.gender} {v.personalities.slice(0, 2).join(", ")}</option>
                    ))}
                  </select>
                  <div className="row" style={{ gap: 20, marginTop: 10, flexWrap: "wrap" }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", display: "flex", alignItems: "center", gap: 8 }}>
                      Speed
                      <input type="range" min={-10} max={25} value={voiceRate} onChange={(e) => setVoiceRate(Number(e.target.value))} />
                      {voiceRate > 0 ? "+" : ""}{voiceRate}%
                    </label>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", display: "flex", alignItems: "center", gap: 8 }}>
                      Pitch
                      <input type="range" min={-20} max={20} value={voicePitch} onChange={(e) => setVoicePitch(Number(e.target.value))} />
                      {voicePitch > 0 ? "+" : ""}{voicePitch}Hz
                    </label>
                  </div>
                </div>
              )}

              <audio controls src={selectedVoice.url} style={{ marginTop: 10 }} />
            </div>
          </>
        )}

        {/* ============ ÉTAPE 4 : FOND VIDEO & STYLE ============ */}
        {selectedVoice && (
          <>
            <div className="step-title"><span className="step-num">4</span> Video background & style</div>
            <div className="card">
              <div className="field">
                <label>Text style (subtitles)</label>
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
                usedBytes={usedBytes}
                quotaBytes={quotaBytes}
                onChanged={loadBackgrounds}
              />

              <div className="field" style={{ marginTop: 14 }}>
                <label>Background music</label>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button className={"chip" + (!musicEnabled ? " on" : "")} disabled={!!busy} onClick={() => setMusicEnabled(false)}>None</button>
                  <button className={"chip" + (musicEnabled ? " on" : "")} disabled={!!busy} onClick={() => setMusicEnabled(true)}>Music</button>
                  {musicEnabled && musicTracks.length > 0 && (
                    <select className="input" style={{ maxWidth: 260 }} value={musicTrack ?? ""} onChange={(e) => setMusicTrack(e.target.value || null)}>
                      <option value="">Random</option>
                      {musicTracks.map((t) => (
                        <option key={t.fileName} value={t.fileName}>{t.title}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <RangeField
                    label="Music volume"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(musicVolume * 100)}
                    suffix="%"
                    disabled={!musicEnabled || !!busy}
                    title={musicEnabled ? undefined : "Enable music to adjust the volume"}
                    onChange={(v) => setMusicVolume(v / 100)}
                  />
                </div>
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                <button className={"chip" + (sfxOn ? " on" : "")} disabled={!!busy} onClick={() => setSfxOn(!sfxOn)}>
                  Sound effects {sfxOn ? "✓" : "✗"}
                </button>
                <button className={"chip" + (effectsOn ? " on" : "")} disabled={!!busy} onClick={() => setEffectsOn(!effectsOn)}>
                  Dynamic effects {effectsOn ? "✓" : "✗"}
                </button>
                <button className={"chip" + (brollOn ? " on" : "")} disabled={!!busy} onClick={() => setBrollOn(!brollOn)}>
                  B-roll video {brollOn ? "✓" : "✗"}
                </button>
              </div>

              {sfxOn && sfxFiles.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <select className="input" style={{ maxWidth: 300 }} value={sfxIntro ?? ""} onChange={(e) => setSfxIntro(e.target.value || null)}>
                    <option value="">Intro sound: auto</option>
                    {sfxFiles.map((s) => (
                      <option key={s.fileName} value={s.fileName}>{s.title}</option>
                    ))}
                  </select>
                </div>
              )}
              {sfxOn && (
                <div className="row" style={{ marginTop: 10 }}>
                  <RangeField label="SFX volume" min={0} max={100} step={5} value={Math.round(sfxVolume * 100)} suffix="%" onChange={(v) => setSfxVolume(v / 100)} />
                </div>
              )}

              <p className="sub" style={{ margin: "14px 0 8px" }}>Generate your video (solid background if none selected):</p>
              <button className="btn" disabled={busy === "video" || busy === "full"} onClick={() => runRender("video", `/api/projects/${pid}/video`)}>
                {busy === "video" ? "Rendering…" : "Generate video"}
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
                    <span className="sub">
                      Video generated {selectedVideo.duration ? `(${Math.round(selectedVideo.duration)}s)` : ""}
                      {selectedVideo.kept && <span className="badge done" style={{ marginLeft: 8 }}>In library</span>}
                    </span>
                    <div className="row">
                      {!selectedVideo.kept && (
                        <button
                          className="btn sm"
                          disabled={!!busy}
                          onClick={() =>
                            act("keep", async () => {
                              await api(`/api/videos/${selectedVideo.id}/keep`, { method: "POST", body: {} });
                            })
                          }
                        >
                          Keep in library
                        </button>
                      )}
                      <a className="btn secondary sm" href={selectedVideo.downloadUrl} download>⇩ Download MP4</a>
                    </div>
                  </div>
                  <video controls src={selectedVideo.url} style={{ width: "100%", marginTop: 8, borderRadius: 12 }} />
                  {!selectedVideo.kept && (
                    <p className="sub" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
                      Not kept = automatically deleted after 24 h (or on the project's next generation).
                    </p>
                  )}
                  <YouTubeUpload key={selectedVideo.id} videoId={selectedVideo.id} defaultTitle={pubTitle} defaultDescription={pubBody} defaultTags={pubTags} />
                  {selectedVideo.youtubeId && (
                    <div className="sub" style={{ fontSize: 12.5, marginTop: 8 }}>
                      YouTube stats: {fmtCount(selectedVideo.views)} views · {fmtCount(selectedVideo.likes)} likes · {fmtCount(selectedVideo.comments)} comments
                      {selectedVideo.statsStatus === "missing" && " — video missing on YouTube"}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

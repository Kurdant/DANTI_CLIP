import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type {
  Automation,
  AutomationSchedule,
  AutomationStatus,
  Background,
  BackgroundList,
  MusicTrack,
  SfxFile,
  VideoTypeDef,
  VoiceOption,
} from "../types";
import { TopBar } from "../components/TopBar";
import { TabBar } from "../components/TabBar";
import { BackgroundPicker } from "../components/BackgroundPicker";
import { RangeField } from "../components/RangeField";

const STYLES = [
  { id: "classic", label: "Classic" },
  { id: "neon", label: "Neon" },
  { id: "bold", label: "Bold" },
  { id: "minimal", label: "Minimal" },
  { id: "boxed", label: "Boxed" },
  { id: "pop", label: "Pop" },
  { id: "karaoke", label: "Karaoke" },
];

const PRIVACY: { id: "private" | "unlisted" | "public"; label: string }[] = [
  { id: "private", label: "Private" },
  { id: "unlisted", label: "Unlisted" },
  { id: "public", label: "Public" },
];

interface FormState {
  name: string;
  videoTypes: string[];
  perDay: number;
  scheduleMode: "interval" | "times";
  start: string;
  end: string;
  timesText: string;
  voiceName: string;
  background: string | null;
  textStyle: string;
  topic: string;
  privacy: "private" | "unlisted" | "public";
  musicEnabled: boolean;
  musicTrack: string | null;
  musicVolume: number;
  sfxEnabled: boolean;
  sfxIntro: string | null;
  sfxVolume: number;
  effectsEnabled: boolean;
  brollEnabled: boolean;
  voiceRate: number;
  voicePitch: number;
}

function emptyForm(): FormState {
  return {
    name: "",
    videoTypes: [],
    perDay: 1,
    scheduleMode: "interval",
    start: "08:00",
    end: "20:00",
    timesText: "09:00, 17:30",
    voiceName: "",
    background: null,
    textStyle: "classic",
    topic: "",
    privacy: "unlisted",
    musicEnabled: false,
    musicTrack: null,
    musicVolume: 0.35,
    sfxEnabled: true,
    sfxIntro: null,
    sfxVolume: 1,
    effectsEnabled: true,
    brollEnabled: true,
    voiceRate: 8,
    voicePitch: 0,
  };
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
  } catch {
    return "Europe/Paris";
  }
}

function ruleToForm(r: Automation): FormState {
  const schedule = r.schedule as AutomationSchedule;
  return {
    name: r.name,
    videoTypes: r.videoTypes,
    perDay: r.perDay,
    scheduleMode: schedule.mode,
    start: schedule.mode === "interval" ? schedule.start : "08:00",
    end: schedule.mode === "interval" ? schedule.end : "20:00",
    timesText: schedule.mode === "times" ? schedule.times.join(", ") : "",
    voiceName: r.voiceName ?? "",
    background: r.background,
    textStyle: r.textStyle,
    topic: r.topic,
    privacy: r.privacy,
    musicEnabled: r.musicEnabled ?? false,
    musicTrack: r.musicTrack ?? null,
    musicVolume: r.musicVolume ?? 0.35,
    sfxEnabled: r.sfxEnabled ?? true,
    sfxIntro: r.sfxIntro ?? null,
    sfxVolume: r.sfxVolume ?? 1,
    effectsEnabled: r.effectsEnabled ?? true,
    brollEnabled: r.brollEnabled ?? true,
    voiceRate: r.voiceRate ?? 8,
    voicePitch: r.voicePitch ?? 0,
  };
}

function formToSchedule(f: FormState): AutomationSchedule {
  if (f.scheduleMode === "times") {
    const times = f.timesText.split(",").map((t) => t.trim()).filter(Boolean);
    return { mode: "times", times };
  }
  return { mode: "interval", start: f.start || "08:00", end: f.end || "20:00" };
}

function scheduleLabel(a: Automation): string {
  const s = a.schedule as AutomationSchedule;
  if (s.mode === "times") return `${s.times.length} per day · ${s.times.join(", ")}`;
  return `${a.perDay} per day · ${s.start}–${s.end}`;
}

function resultBadge(a: Automation): { text: string; cls: string } {
  const r = a.lastResult;
  if (!r) return { text: "Never run", cls: "muted" };
  if (r.status === "published") return { text: "Published", cls: "done" };
  if (r.status === "blocked") return { text: "Blocked (YouTube not connected)", cls: "ideas" };
  if (r.status === "error") return { text: "Error", cls: "draft" };
  return { text: r.status, cls: "muted" };
}

function fmtRun(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AutomationPage() {
  const [rules, setRules] = useState<Automation[]>([]);
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [videoTypes, setVideoTypes] = useState<VideoTypeDef[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [bgList, setBgList] = useState<Background[]>([]);
  const [maxUpload, setMaxUpload] = useState(200 * 1024 * 1024);
  const [usedBytes, setUsedBytes] = useState(0);
  const [quotaBytes, setQuotaBytes] = useState(1024 * 1024 * 1024);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [sfxEffects, setSfxEffects] = useState<SfxFile[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ rules: Automation[] }>("/api/automation/rules");
    setRules(r.rules);
    const s = await api<AutomationStatus>("/api/automation/status");
    setStatus(s);
  }, []);

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
    load().catch((e) => setError(e instanceof Error ? e.message : "Error"));
    loadBackgrounds();
    api<{ videoTypes: VideoTypeDef[] }>("/api/video-types").then((r) => setVideoTypes(r.videoTypes)).catch(() => undefined);
    api<{ voices: VoiceOption[] }>("/api/voices").then((r) => setVoices(r.voices)).catch(() => undefined);
    api<{ tracks: MusicTrack[] }>("/api/music").then((r) => setMusicTracks(r.tracks)).catch(() => undefined);
    api<{ effects: SfxFile[] }>("/api/sfx").then((r) => setSfxEffects(r.effects)).catch(() => undefined);
  }, [load, loadBackgrounds]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(a: Automation) {
    setEditingId(a.id);
    setForm(ruleToForm(a));
    setFormOpen(true);
  }

  async function save() {
    setError("");
    if (!form.name.trim()) return setError("Name required");
    if (form.videoTypes.length === 0) return setError("Choose at least one content type");
    const schedule = formToSchedule(form);
    if (schedule.mode === "times" && schedule.times.length === 0) return setError("Add at least one time");
    const payload = {
      name: form.name.trim(),
      videoTypes: form.videoTypes,
      perDay: schedule.mode === "times" ? schedule.times.length : form.perDay,
      schedule,
      voiceName: form.voiceName || undefined,
      background: form.background,
      textStyle: form.textStyle,
      topic: form.topic.trim(),
      privacy: form.privacy,
      timezone: browserTimezone(),
      musicEnabled: form.musicEnabled,
      musicTrack: form.musicTrack,
      musicVolume: form.musicVolume,
      sfxEnabled: form.sfxEnabled,
      sfxIntro: form.sfxIntro,
      sfxVolume: form.sfxVolume,
      effectsEnabled: form.effectsEnabled,
      brollEnabled: form.brollEnabled,
      voiceRate: form.voiceRate,
      voicePitch: form.voicePitch,
    };
    setBusy("save");
    try {
      if (editingId) {
        await api(`/api/automation/rules/${editingId}`, { method: "PATCH", body: payload });
      } else {
        await api("/api/automation/rules", { method: "POST", body: payload });
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy("");
    }
  }

  async function toggle(a: Automation) {
    setBusy(`toggle-${a.id}`);
    setError("");
    try {
      await api(`/api/automation/rules/${a.id}/toggle`, { method: "POST", body: { enabled: !a.enabled } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy("");
    }
  }

  async function del(a: Automation) {
    if (!confirm(`Delete the rule "${a.name}"?`)) return;
    setBusy(`del-${a.id}`);
    setError("");
    try {
      await api(`/api/automation/rules/${a.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy("");
    }
  }

  const typeLabel = (id: string) => videoTypes.find((t) => t.id === id)?.label ?? id;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <TopBar />
      <main className="container">
        <TabBar />
        <div className="head" style={{ marginTop: 26 }}>
          <div>
            <span className="kicker" style={{ marginBottom: 10 }}>Automation</span>
            <h1>Automatic publishing</h1>
            <div className="sub">Choose your types, frequency and schedule — the AI creates, generates and publishes on its own.</div>
          </div>
          <button className="btn" onClick={openCreate}>＋ New rule</button>
        </div>

        {error && <div className="alert">{error}</div>}

        {status && !status.youtubeConnected && (
          <div className="alert" style={{ marginBottom: 16 }}>
            Automation requires a connected YouTube account.{" "}
            <Link to="/connexions" style={{ fontWeight: 700 }}>Connect →</Link>
          </div>
        )}

        {status && (
          <div className="kpis">
            <div className="kpi"><div className="kpi-num">{status.rules}</div><div className="kpi-label">Rules</div></div>
            <div className="kpi"><div className="kpi-num">{status.active}</div><div className="kpi-label">Active</div></div>
            <div className="kpi">
              <div className="kpi-num" style={{ color: status.youtubeConnected ? "var(--green)" : "var(--red)" }}>
                {status.youtubeConnected ? "Yes" : "No"}
              </div>
              <div className="kpi-label">YouTube connected</div>
            </div>
          </div>
        )}

        {/* Formulaire de creation / edition */}
        {formOpen && (
          <div className="card" style={{ marginBottom: 18 }}>
            <h3 style={{ marginTop: 0 }}>{editingId ? "Edit rule" : "New rule"}</h3>

            <div className="field">
              <label>Rule name</label>
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="E.g. Daily general knowledge" maxLength={200} />
            </div>

            <div className="field">
              <label>Content types</label>
              <div className="row">
                {videoTypes.map((t) => (
                  <button
                    key={t.id}
                    className={"chip" + (form.videoTypes.includes(t.id) ? " on" : "")}
                    onClick={() => set("videoTypes", form.videoTypes.includes(t.id) ? form.videoTypes.filter((x) => x !== t.id) : [...form.videoTypes, t.id])}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="sub" style={{ fontSize: 12, marginTop: 6 }}>Multiple types possible — automation alternates between them.</div>
            </div>

            <div className="field">
              <label>Frequency and schedule</label>
              <div className="row" style={{ marginBottom: 10 }}>
                <button className={"chip" + (form.scheduleMode === "interval" ? " on" : "")} onClick={() => set("scheduleMode", "interval")}>
                  Interval (X per day)
                </button>
                <button className={"chip" + (form.scheduleMode === "times" ? " on" : "")} onClick={() => set("scheduleMode", "times")}>
                  Specific times
                </button>
              </div>
              {form.scheduleMode === "interval" ? (
                <div className="row">
                  <label style={{ fontSize: 13 }}>Per day</label>
                  <input className="input" type="number" min={1} max={24} style={{ width: 80 }} value={form.perDay} onChange={(e) => set("perDay", Math.max(1, Number(e.target.value) || 1))} />
                  <label style={{ fontSize: 13 }}>from</label>
                  <input className="input" type="time" value={form.start} onChange={(e) => set("start", e.target.value)} style={{ width: 120 }} />
                  <label style={{ fontSize: 13 }}>to</label>
                  <input className="input" type="time" value={form.end} onChange={(e) => set("end", e.target.value)} style={{ width: 120 }} />
                </div>
              ) : (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Times (comma-separated)</label>
                  <input className="input" value={form.timesText} onChange={(e) => set("timesText", e.target.value)} placeholder="09:00, 13:30, 18:00" />
                </div>
              )}
            </div>

            <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
                <label>AI Voice</label>
                <select className="input" value={form.voiceName || voices[0]?.name || ""} onChange={(e) => set("voiceName", e.target.value)}>
                  {(voices.length ? voices : []).map((v) => (
                    <option key={v.name} value={v.name}>{v.name} · {v.gender} {v.personalities.slice(0, 2).join(", ")}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                <label>Text style</label>
                <div className="row">
                  {STYLES.map((s) => (
                    <button key={s.id} className={"chip" + (form.textStyle === s.id ? " on" : "")} onClick={() => set("textStyle", s.id)}>{s.label}</button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                <label>YouTube visibility</label>
                <select className="input" value={form.privacy} onChange={(e) => set("privacy", e.target.value as FormState["privacy"])}>
                  {PRIVACY.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <BackgroundPicker
                backgrounds={bgList}
                selected={form.background}
                onSelect={(f) => set("background", f)}
                accent
                maxBytes={maxUpload}
                usedBytes={usedBytes}
                quotaBytes={quotaBytes}
                onChanged={loadBackgrounds}
              />
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label>Background music</label>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button className={"chip" + (!form.musicEnabled ? " on" : "")} onClick={() => set("musicEnabled", false)}>None</button>
                <button className={"chip" + (form.musicEnabled ? " on" : "")} onClick={() => set("musicEnabled", true)}>Music</button>
                {form.musicEnabled && musicTracks.length > 0 && (
                  <select className="input" style={{ maxWidth: 260 }} value={form.musicTrack ?? ""} onChange={(e) => set("musicTrack", e.target.value || null)}>
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
                  value={Math.round(form.musicVolume * 100)}
                  suffix="%"
                  disabled={!form.musicEnabled}
                  title={form.musicEnabled ? undefined : "Enable music to adjust the volume"}
                  onChange={(v) => set("musicVolume", v / 100)}
                />
              </div>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button className={"chip" + (form.sfxEnabled ? " on" : "")} onClick={() => set("sfxEnabled", !form.sfxEnabled)}>
                Sound effects {form.sfxEnabled ? "✓" : "✗"}
              </button>
              <button className={"chip" + (form.effectsEnabled ? " on" : "")} onClick={() => set("effectsEnabled", !form.effectsEnabled)}>
                Dynamic effects {form.effectsEnabled ? "✓" : "✗"}
              </button>
              <button className={"chip" + (form.brollEnabled ? " on" : "")} onClick={() => set("brollEnabled", !form.brollEnabled)}>
                B-roll video {form.brollEnabled ? "✓" : "✗"}
              </button>
            </div>

            {form.sfxEnabled && sfxEffects.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <select className="input" style={{ maxWidth: 300 }} value={form.sfxIntro ?? ""} onChange={(e) => set("sfxIntro", e.target.value || null)}>
                  <option value="">Intro sound: auto</option>
                  {sfxEffects.map((s) => (
                    <option key={s.fileName} value={s.fileName}>{s.title}</option>
                  ))}
                </select>
              </div>
            )}

            {form.sfxEnabled && (
              <div className="row" style={{ marginTop: 10 }}>
                <RangeField label="SFX volume" min={0} max={100} step={5} value={Math.round(form.sfxVolume * 100)} suffix="%" onChange={(v) => set("sfxVolume", v / 100)} />
              </div>
            )}

            <div className="row" style={{ gap: 20, marginTop: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", display: "flex", alignItems: "center", gap: 8 }}>
                Speed
                <input type="range" min={-10} max={25} value={form.voiceRate} onChange={(e) => set("voiceRate", Number(e.target.value))} />
                {form.voiceRate > 0 ? "+" : ""}{form.voiceRate}%
              </label>
              <label style={{ fontSize: 13, fontWeight: 600, color: "rgba(245,237,247,.7)", display: "flex", alignItems: "center", gap: 8 }}>
                Pitch
                <input type="range" min={-20} max={20} value={form.voicePitch} onChange={(e) => set("voicePitch", Number(e.target.value))} />
                {form.voicePitch > 0 ? "+" : ""}{form.voicePitch}Hz
              </label>
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label>Direction (optional — empty = AI invents the topic)</label>
              <textarea className="input" rows={2} value={form.topic} onChange={(e) => set("topic", e.target.value)} placeholder="E.g. little-known historical anecdotes" />
            </div>

            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" disabled={!!busy} onClick={save}>
                {busy === "save" ? "Saving…" : editingId ? "Save" : "Create rule"}
                {busy === "save" && <span className="spinner" />}
              </button>
              <button className="btn secondary" disabled={!!busy} onClick={() => setFormOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Liste des regles */}
        {rules.length === 0 && !formOpen && (
          <div className="empty">
            <div className="empty-icon">⚙</div>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>No automation rules</div>
            <div style={{ marginBottom: 18, fontSize: 14 }}>Create a rule to publish automatically to YouTube.</div>
            <button className="btn" onClick={openCreate}>＋ Create my first rule</button>
          </div>
        )}

        <div className="grid">
          {rules.map((a) => {
            const badge = resultBadge(a);
            return (
              <div key={a.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 17 }}>{a.name}</h3>
                  <span className={"badge " + (a.enabled ? "done" : "muted")}>{a.enabled ? "Active" : "Paused"}</span>
                </div>
                <div className="row" style={{ marginTop: 8, flexWrap: "wrap", gap: 6 }}>
                  {a.videoTypes.map((t) => <span key={t} className="badge">{typeLabel(t)}</span>)}
                </div>
                <div className="sub" style={{ marginTop: 8, fontSize: 13 }}>
                  {scheduleLabel(a)} · {a.privacy === "public" ? "Public" : a.privacy === "unlisted" ? "Unlisted" : "Private"}
                </div>
                <div className="sub" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Next run: <strong>{fmtRun(a.nextRunAt)}</strong>
                </div>
                <div className="sub" style={{ fontSize: 12.5, marginTop: 4 }}>
                  <span className={"badge " + badge.cls}>{badge.text}</span>
                  {a.lastResult?.url && (
                    <a href={a.lastResult.url} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>View →</a>
                  )}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn secondary sm" disabled={!!busy} onClick={() => openEdit(a)}>Edit</button>
                  <button className={"btn sm " + (a.enabled ? "danger" : "")} disabled={!!busy} onClick={() => toggle(a)}>
                    {busy === `toggle-${a.id}` ? "…" : a.enabled ? "Disable" : "Enable"}
                  </button>
                  <button className="btn danger sm" disabled={!!busy} onClick={() => del(a)}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

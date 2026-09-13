import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { LibraryVideo } from "../types";
import { TopBar } from "../components/TopBar";
import { TabBar } from "../components/TabBar";
import { YouTubeUpload } from "../components/YouTubeUpload";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
function fmtCount(n: number | null): string {
  return n == null ? "—" : compact.format(n);
}

export function LibraryPage() {
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [error, setError] = useState("");
  const [statsBusy, setStatsBusy] = useState(false);

  async function load() {
    const r = await api<{ videos: LibraryVideo[] }>("/api/videos/library");
    setVideos(r.videos);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  async function refreshStats() {
    setStatsBusy(true);
    setError("");
    try {
      await api("/api/youtube/stats/refresh", { method: "POST", body: {} });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setStatsBusy(false);
    }
  }

  async function remove(v: LibraryVideo) {
    if (!confirm(`Remove "${v.projectTitle}" from the library (file deleted)?`)) return;
    setError("");
    try {
      await api(`/api/videos/${v.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div>
      <TopBar />
      <main className="container">
        <TabBar />
        <div className="head" style={{ marginTop: 26 }}>
          <div>
            <span className="kicker" style={{ marginBottom: 10 }}>Library</span>
            <h1>Saved videos</h1>
            <div className="sub">
              Only videos you keep stay on the server — the others are purged automatically.
            </div>
          </div>
          <button className="btn secondary sm" disabled={statsBusy} onClick={refreshStats}>
            {statsBusy ? "Refreshing…" : "Refresh stats"}
            {statsBusy && <span className="spinner" />}
          </button>
        </div>

        {error && <div className="alert">{error}</div>}

        {videos.length === 0 && !error && (
          <div className="empty">
            <div className="empty-icon">▣</div>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Library is empty</div>
            <div style={{ marginBottom: 18, fontSize: 14 }}>
              Generate a video in a project, then click "Keep in library".
            </div>
            <Link to="/dashboard" className="btn">Go to my projects →</Link>
          </div>
        )}

        <div className="grid">
          {videos.map((v) => (
            <div key={v.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <video controls src={v.url} style={{ width: "100%", margin: 0, borderRadius: 0, aspectRatio: "9/16", objectFit: "cover", background: "#000" }} />
              <div style={{ padding: 16 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{v.projectTitle}</h3>
                <div className="sub" style={{ fontSize: 12.5, marginBottom: 10 }}>
                  {v.duration ? Math.round(v.duration) + "s" : "…"} · {v.createdAt.slice(0, 10)}
                </div>
                {v.youtubeId ? (
                  <div className="sub" style={{ fontSize: 12.5, marginBottom: 10 }}>
                    {v.statsStatus === "missing"
                      ? "Video missing on YouTube"
                      : `${fmtCount(v.views)} views · ${fmtCount(v.likes)} likes · ${fmtCount(v.comments)} comments`}
                  </div>
                ) : (
                  <div className="sub" style={{ fontSize: 12.5, marginBottom: 10 }}>Not published</div>
                )}
                <div className="row" style={{ gap: 8 }}>
                  <a className="btn secondary sm" href={v.downloadUrl} download>⇩ MP4</a>
                  <Link className="btn secondary sm" to={`/project/${v.projectId}`}>Project</Link>
                  <button className="btn danger sm" onClick={() => remove(v)}>✕ Remove</button>
                </div>
                <YouTubeUpload key={v.id} videoId={v.id} defaultTitle={v.title || v.projectTitle} defaultDescription={v.description || ""} defaultTags={v.tags || []} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

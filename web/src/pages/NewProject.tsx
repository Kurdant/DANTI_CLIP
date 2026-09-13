import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Project, VideoTypeDef } from "../types";
import { TopBar } from "../components/TopBar";

export function NewProjectPage() {
  const nav = useNavigate();
  const [types, setTypes] = useState<VideoTypeDef[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ videoTypes: VideoTypeDef[] }>("/api/video-types")
      .then((r) => setTypes(r.videoTypes))
      .catch(() => {});
  }, []);

  async function create(type: VideoTypeDef) {
    if (busy) return;
    setBusy(type.id);
    setError("");
    try {
      const r = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        body: { videoType: type.id, mode: "auto", topic: "", title: type.label },
      });
      nav(`/project/${r.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setBusy(null);
    }
  }

  return (
    <div>
      <TopBar />
      <main className="container">
        <div className="head" style={{ marginTop: 26 }}>
          <div>
            <span className="kicker" style={{ marginBottom: 10 }}>Creation</span>
            <h1>New video</h1>
            <div className="sub">Choose a video type.</div>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}

        {types.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◈</div>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>No video types</div>
            <div style={{ marginBottom: 18, fontSize: 14 }}>Video types are not available at the moment.</div>
          </div>
        ) : (
          <div className="grid">
            {types.map((t) => (
              <div
                key={t.id}
                className="card clickable"
                onClick={() => create(t)}
              >
                <h3 style={{ margin: "0 0 6px" }}>{t.label}</h3>
                <p className="sub" style={{ margin: 0 }}>{t.description}</p>
                {busy === t.id && (
                  <span className="spinner" style={{ display: "inline-block", marginTop: 12 }} />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

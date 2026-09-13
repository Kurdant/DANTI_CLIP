import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { YouTubeStatus } from "../types";

interface Props {
  videoId: number;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultTags?: string[];
}

/** Normalise une liste de hashtags : retire le "#" et les espaces, garde les non vides. */
function normalizeTags(tags: string[]): string[] {
  return (Array.isArray(tags) ? tags : [])
    .map((t) => String(t).replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

/** Assemble la description prête à copier : corps + saut de ligne + hashtags. */
function buildPublicationDescription(body: string, tags: string[]): string {
  const cleanTags = normalizeTags(tags).map((t) => `#${t}`).join(" ");
  return [body.trim(), cleanTags].filter(Boolean).join("\n\n");
}

export function YouTubeUpload({ videoId, defaultTitle = "", defaultDescription = "", defaultTags = [] }: Props) {
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(() => buildPublicationDescription(defaultDescription, defaultTags));
  const [privacy, setPrivacy] = useState<"private" | "unlisted" | "public">("unlisted");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const tags = useMemo(() => normalizeTags(defaultTags), [defaultTags]);

  async function refresh() {
    const s = await api<YouTubeStatus>("/api/youtube/status");
    setStatus(s);
  }

  useEffect(() => {
    refresh().catch(() => setStatus({ configured: false, connected: false, hasOwnCredentials: false }));
  }, [videoId]);

  async function copyDescription() {
    try {
      await navigator.clipboard.writeText(description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Unable to copy automatically — select the text manually.");
    }
  }

  async function publish() {
    setBusy("publish");
    setError("");
    setResult(null);
    try {
      const r = await api<{ url: string }>("/api/youtube/upload", {
        method: "POST",
        body: { videoId, title, description, tags, privacyStatus: privacy },
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error during publishing");
    } finally {
      setBusy("");
    }
  }

  if (!status) return <div className="sub" style={{ fontSize: 13 }}>…</div>;

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      <div className="sub" style={{ fontWeight: 700, marginBottom: 10 }}>YouTube publishing</div>
      {error && <div className="alert">{error}</div>}

      {/* Bloc copiable : titre + description (hashtags inclus) */}
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Title (project card / YouTube)</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Ready-to-paste description (hashtags included)</label>
        <textarea
          className="input"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn secondary sm" disabled={!!busy} onClick={copyDescription}>
            {copied ? "✓ Copied" : "⇩ Copy description"}
          </button>
          <span className="sub" style={{ fontSize: 12 }}>Paste this block as is into YouTube.</span>
        </div>
      </div>

      {/* Partie publication : masquée si YouTube non configuré/connecté */}
      {!status.configured && !status.hasOwnCredentials ? (
        <div className="sub" style={{ fontSize: 13 }}>
          YouTube: feature ready — configure the OAuth credentials to publish automatically.{" "}
          <Link to="/connexions" style={{ fontWeight: 700 }}>Configure →</Link>
        </div>
      ) : !status.connected ? (
        <div style={{ marginTop: 10 }}>
          <div className="row">
            <a className="btn secondary sm" href="/api/youtube/auth">
              Connect YouTube to publish
            </a>
            <span className="sub" style={{ fontSize: 12.5 }}>OAuth authorization — only once.</span>
            <Link className="sub" to="/connexions" style={{ fontSize: 12.5 }}>
              Manage my credentials →
            </Link>
          </div>
        </div>
      ) : result ? (
        <div className="row">
          <span className="badge done">Published</span>
          <a className="btn secondary sm" href={result.url} target="_blank" rel="noreferrer">
            Open on YouTube →
          </a>
        </div>
      ) : (
        <div className="row between" style={{ marginBottom: 4 }}>
          <select className="input" style={{ width: 200 }} value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)}>
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
          <button className="btn sm" disabled={!!busy || !title.trim()} onClick={publish}>
            {busy === "publish" ? "Publishing…" : "Publish to YouTube"}
            {busy === "publish" && <span className="spinner" />}
          </button>
        </div>
      )}
    </div>
  );
}

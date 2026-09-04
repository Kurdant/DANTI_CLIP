import { useRef, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import type { Background } from "../types";

interface Props {
  backgrounds: Background[];
  selected: string | null;
  onSelect: (fileName: string | null) => void;
  /** Style sur fond dégradé (texte + boutons clairs). */
  accent?: boolean;
  /** Taille maximale d'upload en octets. */
  maxBytes: number;
  /** Appelé après un upload / une suppression pour rafraîchir la liste. */
  onChanged?: () => void;
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " Mo";
  if (n >= 1024) return (n / 1024).toFixed(0) + " Ko";
  return n + " o";
}

export function BackgroundPicker({ backgrounds, selected, onSelect, accent, maxBytes, onChanged }: Props) {
  const { csrf } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const limit = maxBytes > 0 ? maxBytes : 200 * 1024 * 1024;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sel, setSel] = useState<{ name: string; size: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const defaults = backgrounds.filter((b) => b.source === "default");
  const own = backgrounds.filter((b) => b.source === "user");
  const curSize = sel ? sel.size : 0;
  const overLimit = !!sel && sel.size > limit;

  const subStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    margin: "8px 0 6px",
    color: accent ? "rgba(255,255,255,.9)" : "var(--muted)",
  };

  function upload(f: File) {
    setError("");
    setSel({ name: f.name, size: f.size });
    setProgress(0);
    if (f.size > limit) return;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/backgrounds/upload");
    xhr.setRequestHeader("X-CSRF-Token", csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setSel(null);
        setProgress(null);
        onChanged?.();
      } else {
        let msg = "Erreur pendant l'upload";
        try {
          const j = JSON.parse(xhr.responseText) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* non-JSON */
        }
        setError(msg);
      }
      setProgress(null);
      setBusy("");
    };
    xhr.onerror = () => {
      setError("Erreur réseau pendant l'upload");
      setProgress(null);
      setBusy("");
    };
    setBusy("upload");
    const fd = new FormData();
    fd.append("file", f);
    xhr.send(fd);
  }

  async function remove(b: Background) {
    if (!confirm(`Supprimer le fond « ${b.fileName} » ?`)) return;
    setBusy("del-" + b.fileName);
    setError("");
    try {
      await api(`/api/backgrounds/${encodeURIComponent(b.fileName)}`, { method: "DELETE" });
      if (selected === b.fileName) onSelect(null);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy("");
    }
  }

  function gridItem(b: Background) {
    const isSel = selected === b.fileName;
    const isOwn = b.source === "user";
    return (
      <div
        key={b.source + ":" + b.fileName}
        style={{
          borderRadius: 8,
          overflow: "hidden",
          cursor: "pointer",
          position: "relative",
          border: isSel ? "2px solid var(--accent)" : "2px solid transparent",
          background: "#000",
        }}
        onClick={() => onSelect(isSel ? null : b.fileName)}
        title={b.fileName}
      >
        {b.thumbUrl ? (
          <img src={b.thumbUrl} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "9/16", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", aspectRatio: "9/16", display: "grid", placeItems: "center", color: "#888", fontSize: 22 }}>🎬</div>
        )}
        {isSel && (
          <span style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", fontSize: 26, color: "#fff" }}>✓</span>
        )}
        {isOwn && (
          <button
            className="btn danger sm"
            disabled={busy === "del-" + b.fileName}
            onClick={(e) => {
              e.stopPropagation();
              remove(b);
            }}
            style={{ position: "absolute", top: 4, right: 4, padding: "2px 7px", fontSize: 12 }}
            title="Supprimer mon fond"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  const barColor = overLimit ? "#e5484d" : "var(--accent)";

  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: accent ? "rgba(255,255,255,.9)" : undefined }}>
          {selected ? "" : "Fond vidéo (fond uni si aucun)"}
        </label>
        <button className="btn secondary sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === "upload" ? "Upload…" : "＋ Uploader un fond"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,.mp4,.webm,.mov,.mkv,.avi"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* Barre de limite : taille utilisee / maximum + reste (toujours visible) */}
      <div style={{ marginBottom: 8 }}>
        <div className="row between" style={{ fontSize: 12, marginBottom: 3 }}>
          <span style={{ color: accent ? "rgba(255,255,255,.9)" : "var(--muted)", wordBreak: "break-all" }}>
            {sel ? sel.name : "Aucun fichier sélectionné"}
          </span>
          <span style={{ color: accent ? "rgba(255,255,255,.9)" : "var(--muted)", fontWeight: 600 }}>
            {fmtBytes(curSize)} / {fmtBytes(limit)}
            {overLimit ? " — dépasse la limite" : ` — reste ${fmtBytes(Math.max(0, limit - curSize))}`}
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: accent ? "rgba(255,255,255,.35)" : "var(--panel-2)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, (curSize / limit) * 100)}%`,
              background: barColor,
              transition: "width .2s",
            }}
          />
        </div>
        {progress !== null && sel && !overLimit && curSize > 0 && (
          <div style={{ marginTop: 5 }}>
            <div className="row between" style={{ fontSize: 12, color: accent ? "rgba(255,255,255,.9)" : "var(--muted)" }}>
              <span>Envoi {busy === "upload" ? "…" : ""}</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: accent ? "rgba(255,255,255,.35)" : "var(--panel-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round(progress * 100)}%`, background: "var(--accent)", transition: "width .15s" }} />
            </div>
          </div>
        )}
      </div>

      {error && <div className="alert">{error}</div>}

      {backgrounds.length === 0 ? (
        <div style={{ fontSize: 13, color: accent ? "rgba(255,255,255,.85)" : "var(--muted)" }}>
          Aucune vidéo de fond. Uploade la tienne ci-dessus (ou téléverse des fonds par défaut côté serveur).
        </div>
      ) : (
        <>
          {own.length > 0 && (
            <>
              <div style={subStyle}>Mes fonds</div>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))" }}>
                {own.map(gridItem)}
              </div>
            </>
          )}
          {defaults.length > 0 && (
            <>
              <div style={subStyle}>Fonds par défaut</div>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))" }}>
                {defaults.map(gridItem)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const STORAGE_KEY = "dc-cookie-note";

export function CookieNote() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* stockage indisponible : on masque quand meme */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="card"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 90,
        margin: 0,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 13.5, flex: "1 1 260px", minWidth: 0 }}>
        This site uses only a session cookie strictly necessary for logging in
        (no advertising, no tracking).{" "}
        <Link to="/privacy" onClick={dismiss}>Learn more →</Link>
      </span>
      <button className="btn sm" onClick={dismiss}>Got it</button>
    </div>
  );
}

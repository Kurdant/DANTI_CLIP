import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export function Brand({ small, to = "/" }: { small?: boolean; to?: string }) {
  return (
    <Link to={to} className="brand" style={small ? { gap: 8 } : undefined}>
      <span className="brand-mark">▶</span>
      <span className="brand-name">danticlip</span>
    </Link>
  );
}

export function TopBar() {
  const { user } = useAuth();
  return (
    <header className="appbar">
      <div className="container">
        <Brand to="/dashboard" />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link to="/dashboard" className="btn sm">Dashboard</Link>
          <Link to="/connexions" className="user-chip" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="avatar">{user ? user.charAt(0).toUpperCase() : "?"}</span>
            <span className="sub" style={{ margin: 0 }}>{user}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

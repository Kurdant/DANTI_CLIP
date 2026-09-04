import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function Brand({ small }: { small?: boolean }) {
  return (
    <Link to="/" className="brand" style={small ? { gap: 8 } : undefined}>
      <span className="brand-mark">▶</span>
      <span className="brand-name">
        DANTI <em>CLIPER</em>
      </span>
    </Link>
  );
}

export function TopBar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <header className="appbar">
      <div className="container">
        <Brand />
        <nav className="nav-links">
          <Link to="/dashboard" className="always">Mes projets</Link>
          <span className="user-chip">
            <span className="avatar">{user ? user.charAt(0).toUpperCase() : "?"}</span>
            <span className="sub" style={{ margin: 0 }}>{user}</span>
            <button
              className="btn secondary sm"
              onClick={() => {
                logout().then(() => nav("/"));
              }}
            >
              Déconnexion
            </button>
          </span>
        </nav>
      </div>
    </header>
  );
}

import { Link, useLocation } from "react-router-dom";

export function ProfileTabs() {
  const { pathname } = useLocation();
  return (
    <div className="tabs">
      <Link className={"tab" + (pathname.startsWith("/connexions") ? " on" : "")} to="/connexions">
        Connections
      </Link>
      <Link className={"tab" + (pathname.startsWith("/parametres") ? " on" : "")} to="/parametres">
        Settings
      </Link>
      <Link className={"tab" + (pathname.startsWith("/privacy") ? " on" : "")} to="/privacy">
        GDPR
      </Link>
    </div>
  );
}

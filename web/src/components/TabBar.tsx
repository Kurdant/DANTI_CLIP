import { Link, useLocation } from "react-router-dom";

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <div className="tabs">
      <Link className={"tab" + (pathname.startsWith("/dashboard") ? " on" : "")} to="/dashboard">
        My projects
      </Link>
      <Link className={"tab" + (pathname.startsWith("/library") ? " on" : "")} to="/library">
        Library
      </Link>
      <Link className={"tab" + (pathname.startsWith("/automatisation") ? " on" : "")} to="/automatisation">
        Automation
      </Link>
    </div>
  );
}

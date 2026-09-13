import { TopBar } from "../components/TopBar";
import { ProfileTabs } from "../components/ProfileTabs";

export function SettingsPage() {
  return (
    <div>
      <TopBar />
      <main className="container">
        <ProfileTabs />
        <div className="head" style={{ marginTop: 26 }}>
          <div>
            <span className="kicker" style={{ marginBottom: 10 }}>Account</span>
            <h1>Settings</h1>
            <div className="sub">Preferences for your account and your creations.</div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Settings</h2>
          <p className="sub" style={{ margin: 0 }}>
            No configurable settings yet. Options (language, storage quota,
            notifications, appearance…) will arrive here.
          </p>
        </div>
      </main>
    </div>
  );
}

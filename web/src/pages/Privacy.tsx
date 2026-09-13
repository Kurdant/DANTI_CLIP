import { Link } from "react-router-dom";
import { Brand } from "../components/TopBar";
import { ProfileTabs } from "../components/ProfileTabs";
import { LEGAL } from "../legal";

const updated = new Date(
  Number(LEGAL.lastUpdated.slice(0, 4)),
  Number(LEGAL.lastUpdated.slice(5, 7)) - 1,
  Number(LEGAL.lastUpdated.slice(8, 10)),
).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

const DATA_ROWS = [
  ["Username (3 to 30 characters)", "Create and identify your account, display", "As long as the account is active"],
  ["Password (scrypt-hashed)", "Authenticate access to your account", "As long as the account is active"],
  ["Session cookie (__Host-dcli)", "Keep you logged in", "30 days (or logout)"],
  ["Anti-forgery token (CSRF)", "Secure account actions", "Session duration (30 days)"],
  ["Projects: ideas, scripts, texts", "To generate your shorts", "As long as the account exists"],
  ["Generated voices (MP3 + word-by-word subtitles)", "Listen to, approve and edit your videos", "As long as the account exists"],
  ["Generated videos (MP4)", "Download your 9:16 shorts", "As long as the account exists"],
  ["Uploaded video backgrounds (normalized MP4)", "Personal background library", "As long as the account exists"],
  ["Technical logs (IP address, requests)", "Security: anti-brute-force, abuse detection", "Short duration (log rotation, no profiling)"],
];

const PURPOSE_ROWS = [
  ["Provide the DANTI CLIPER service: account, projects, voice and video generation, file storage", "Performance of the contract (Art. 6.1.b GDPR)", "Signing up for the tool"],
  ["Account security: sessions, CSRF tokens, login attempt limiting, anti-abuse protection", "Legitimate interest (Art. 6.1.f GDPR + Recital 49)", "Protect accounts and the service"],
  ["Sending the script text to Edge TTS (Microsoft) for speech synthesis, if enabled", "Performance of the contract (Art. 6.1.b GDPR)", "It is the voice engine you use"],
  ["Sending the topic to the LLM provider (e.g. Groq) for idea and script generation, if enabled", "Performance of the contract (Art. 6.1.b GDPR)", "Enable LLM mode in the configuration"],
];

const RIGHT_ROWS = [
  ["Access", "Request a copy of the data concerning you (Art. 15)", "contact@kurdant.fr"],
  ["Rectification", "Correct your username or record a correction (Art. 16)", "contact@kurdant.fr"],
  ["Erasure", "Delete your account and all its data via \"Delete my account\" (Art. 17)", "Dashboard interface"],
  ["Portability", "Receive your projects (texts) in a readable format (Art. 20)", "contact@kurdant.fr"],
  ["Restriction", "Temporarily restrict a processing activity (Art. 18)", "contact@kurdant.fr"],
  ["Objection", "Object to processing based on our legitimate interest (Art. 21)", "contact@kurdant.fr"],
  ["Complaint", "Contact the CNIL: www.cnil.fr/fr/plaintes (Art. 77)", "CNIL"],
];

const COOKIE_ROWS = [
  ["__Host-dcli", "Session (authentication)", "Strictly necessary for the service: log you in and protect your account (HttpOnly, Secure, SameSite=Strict)", "30 days"],
];

export function PrivacyPage() {
  return (
    <div>
      <header className="appbar">
        <div className="container">
          <Brand />
          <nav className="nav-links">
            <Link to="/">← Home</Link>
          </nav>
        </div>
      </header>

      <main className="container" style={{ maxWidth: 900 }}>
        <ProfileTabs />
        <div className="head" style={{ marginTop: 30, marginBottom: 10 }}>
          <div>
            <span className="kicker" style={{ marginBottom: 10 }}>Privacy</span>
            <h1>Privacy policy</h1>
            <div className="sub">Last updated: {updated}</div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Who are we?</h2>
          <p>
            {LEGAL.siteName} is a nearly automatic 9:16 shorts studio (ideas, script, voice-over
            and synchronized subtitles). The service is published and operated by{" "}
            <strong>{LEGAL.operator}</strong>.
          </p>
          <p className="sub" style={{ marginBottom: 0 }}>
            For any questions about your personal data:{" "}
            <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
          </p>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>What data do we collect?</h2>
          <p>
            We practice data minimization: we only ask for a username and a password.
            The server already uses <code>scrypt</code> to hash passwords, and
            sessions are managed server-side (random token hashed in the database).
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Data type</th>
                  <th>Why</th>
                  <th>Retention period</th>
                </tr>
              </thead>
              <tbody>
                {DATA_ROWS.map((r) => (
                  <tr key={r[0]}>
                    <td>{r[0]}</td>
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Processing purposes and legal bases</h2>
          <p>
            Each processing activity has a single legal basis. No marketing processing, no
            profiling, no data resale.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Purpose</th>
                  <th>Legal basis</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {PURPOSE_ROWS.map((r) => (
                  <tr key={r[1]}>
                    <td>{r[0]}</td>
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ marginBottom: 0 }}>
            Consent is not collected because no ancillary processing (newsletter,
            advertising, third-party audience measurement) is currently in place.
          </p>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Retention periods</h2>
          <ul className="legal-list">
            <li>
              <strong>Account:</strong> deleted only at your request (as long as the account is
              active, the related data is retained).
            </li>
            <li>
              <strong>Sessions:</strong> 30 days maximum (then logout and deletion of the
              token from the database).
            </li>
            <li>
              <strong>Projects and files (ideas, scripts, voices, videos, uploaded backgrounds):</strong>{" "}
              as long as your account exists. Deleting your account deletes all these
              files and your uploaded backgrounds.
            </li>
            <li>
              <strong>On request:</strong> written request to {LEGAL.contactEmail} or direct
              deletion in the dashboard.
            </li>
          </ul>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Who is your data shared with?</h2>
          <p style={{ marginBottom: 8 }}>
            We do not share your data with any marketing third party, any advertising
            network, or any social network.
          </p>
          <ul className="legal-list">
            <li>
              <strong>Technical providers only to produce what you request:</strong>
              <ul>
                <li>
                  <strong>Edge TTS (Microsoft)</strong>: the text of your script is sent to
                  Microsoft's speech synthesis service to generate the voice. The audio
                  files stay on our server.
                </li>
                <li>
                  <strong>LLM provider (Groq if the mode is enabled)</strong>: your topic /
                  working text is sent to generate ideas and scripts. The LLM mode is
                  currently disabled (mock).
                </li>
                <li>
                  <strong>Google / YouTube (if you link your account to publish)</strong>:
                  only when you connect your YouTube account and publish a video.
                  We store an OAuth authorization token (access + refresh) so that
                  publishing works without reconnecting every time; it is deleted
                  when you disconnect YouTube. The video you publish is sent to your
                  YouTube account, under your responsibility. No data is transmitted to
                  Google without your action. If you enter your own Google credentials
                  (advanced option), they are encrypted in our database and never displayed.
                </li>
                <li>
                  <strong>Hosting</strong>: data is stored on the publisher's server
                  (self-hosted server — France / European Union, location to be confirmed
                  with the operator). Files never leave this server, except for the
                  YouTube publication mentioned above.
                </li>
              </ul>
            </li>
          </ul>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Your rights</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Right</th>
                  <th>What it means</th>
                  <th>How to exercise it</th>
                </tr>
              </thead>
              <tbody>
                {RIGHT_ROWS.map((r) => (
                  <tr key={r[1]}>
                    <td>{r[0]}</td>
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ marginBottom: 0 }}>
            Written requests are processed within one month, extendable: we respond to
            all requests as soon as possible.
          </p>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Cookies and trackers</h2>
          <p>
            This site uses only one cookie, <strong>strictly necessary</strong> for the
            service to work (authentication). There are no advertising cookies,
            no third-party scripts, no audience measurement.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Purpose</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {COOKIE_ROWS.map((r) => (
                  <tr key={r[0]}>
                    <td>{r[0]}</td>
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                    <td>{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ marginBottom: 0 }}>
            As this cookie is strictly necessary (Article 82 of the French Data Protection
            Act), it does not require your consent — but we inform you of its
            presence. Apart from this cookie, no reading or writing on your device.
          </p>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Children</h2>
          <p className="sub" style={{ marginBottom: 0 }}>
            DANTI CLIPER is not intended for children under 15 (the age of digital
            consent in France). We do not knowingly collect data from children. If you
            believe a child has provided us with data, contact us and we will delete it.
          </p>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Security</h2>
          <ul className="legal-list">
            <li>Encrypted communications: HTTPS everywhere (TLS).</li>
            <li>Passwords hashed with scrypt, never stored in plain text.</li>
            <li>Session cookie HttpOnly, Secure, SameSite=Strict; server-side sessions.</li>
            <li>CSRF protection on all modifying actions.</li>
            <li>Restrictive content security policy (scripts from the site itself only).</li>
            <li>Login attempt limiting (anti-brute-force per IP).</li>
            <li>Uploaded files: video content only, re-encoded and normalized to MP4 server-side (no execution of user-provided code).</li>
          </ul>
        </div>

        <footer className="container site-footer">
          <span>© 2026 {LEGAL.siteName} — from idea to video.</span>
          <span>
            <Link to="/">Home</Link> · Privacy policy
          </span>
        </footer>
      </main>
    </div>
  );
}

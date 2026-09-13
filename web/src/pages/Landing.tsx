import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { Brand } from "../components/TopBar";
import { CookieNote } from "../components/CookieNote";

const STEPS = [
  {
    n: "01",
    t: "Ideas",
    d: "Give a theme, or nothing at all. The AI suggests 3 short topics with an angle and a hook designed to grab attention in 3 seconds.",
  },
  {
    n: "02",
    t: "Script",
    d: "You pick the idea you like. The AI writes a structured script: hook, sections, full narration, pacing calibrated for 30-60 s.",
  },
  {
    n: "03",
    t: "Voice",
    d: "The voice is synthesized in French by an expressive voice engine: you listen, approve, and regenerate with another voice if needed.",
  },
  {
    n: "04",
    t: "Video",
    d: "Word-by-word synchronized subtitles in 5 styles, video background or solid color, 9:16 MP4 export ready for TikTok / YouTube Shorts / Reels.",
  },
];

const FEATURES = [
  { icon: "✦", t: "3 ideas every time", d: "The AI varies the angles — viral, educational, intriguing — with a distinct hook for each topic." },
  { icon: "◈", t: "Structured scripts", d: "Each script is split into sections, with a core idea and continuous narration ready to read." },
  { icon: "♫", t: "Natural AI voices", d: "A library of French voices: Remy, Vivienne and many more. Regenerate as many times as you want." },
  { icon: "▣", t: "Synchronized subtitles", d: "The editing engine computes word-by-word timings and generates subtitles that follow the voice, in the style of your choice." },
  { icon: "◉", t: "Custom video backgrounds", d: "Upload your own backgrounds or choose the default ones. Each account keeps its own private library." },
  { icon: "→", t: "9:16 export", d: "A vertical MP4, ready to publish. You can also download the voice alone to reuse the script elsewhere." },
];

const STYLES = ["Classic", "Neon", "Bold", "Minimal", "Outlined"];

const FAQ = [
  {
    q: "What exactly is DANTI CLIPER?",
    a: "A nearly automatic shorts studio: you open a project, approve each step (ideas → script → voice → video), and download a subtitled 9:16 MP4. You stay in control at every step.",
  },
  {
    q: "Do I need to know how to edit?",
    a: "No. The editing (background, subtitles, voice) is generated automatically. Your role: choose the idea, approve the script, listen to the voice and click \"Generate\".",
  },
  {
    q: "Which platforms are my videos for?",
    a: "TikTok, YouTube Shorts and Instagram Reels: the 9:16 format (1080×1920) is exactly the one used by these platforms.",
  },
  {
    q: "Can I use my own background videos?",
    a: "Yes. From a project, click \"＋ Upload a background\": the video is compressed automatically and is only visible to you. Default backgrounds are shared by everyone.",
  },
  {
    q: "Are my projects private?",
    a: "Yes. Each account has its own projects, uploaded backgrounds and history. The connection is protected (encrypted session, HTTPS).",
  },
];

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div>
      <header className="appbar">
        <div className="container">
          <Brand />
          <nav className="nav-links">
            <a href="#fonctionnement">How it works</a>
            <a href="#fonctionnalites">Features</a>
            <a href="#faq">FAQ</a>
            {user ? (
              <Link to="/dashboard" className="btn sm">My projects</Link>
            ) : (
              <>
                <Link to="/login" className="btn secondary sm">Log in</Link>
                <Link to="/register" className="btn sm">Get started</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="container hero">
        <div>
          <span className="kicker">✦ Shorts studio · AI + Voice</span>
          <h1>
            Your idea becomes <em>a video</em> ready to publish
          </h1>
          <p className="lead">
            DANTI CLIPER generates 9:16 shorts almost automatically: topics, script,
            voice-over and synchronized subtitles. You approve each step, the machine
            does the editing.
          </p>
          <div className="hero-ctas">
            {user ? (
              <Link to="/dashboard" className="btn lg">Open my dashboard →</Link>
            ) : (
              <>
                <Link to="/register" className="btn lg">Create my account</Link>
                <Link to="/login" className="btn secondary lg">I already have an account</Link>
              </>
            )}
          </div>
          <div className="hero-note">
            One project · ideas + script + voice + video · 9:16 MP4 export
          </div>
        </div>

        <div className="phone-stage">
          <div className="phone">
            <div className="phone-screen">
              <div className="phone-caption">
                <span className="c1">3 topics generated</span>
                <span className="c2">The hook that saves the night</span>
                <span className="c1">Voice: Remy Multilingual</span>
                <span className="c2">♪ 42 s narration</span>
              </div>
            </div>
          </div>
          <div className="float-chip a"><span className="dot" /> AI · ideas</div>
          <div className="float-chip b"><span className="dot rose" /> Voice · Edge TTS</div>
          <div className="float-chip c"><span className="dot rose" /> MP4 · 9:16</div>
        </div>
      </section>

      {/* FONCTIONNEMENT */}
      <section className="container section" id="fonctionnement">
        <div className="section-head">
          <span className="kicker">Pipeline</span>
          <h2 className="section-title">Four steps, zero editing</h2>
          <p className="section-sub">
            Each step is approved before moving on. Whatever you don't approve, you
            regenerate. You always decide.
          </p>
        </div>
        <div className="how-grid">
          {STEPS.map((s) => (
            <div className="how-card" key={s.n}>
              <div className="how-num">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FONCTIONNALITÉS */}
      <section className="container section" id="fonctionnalites">
        <div className="section-head">
          <span className="kicker">Features</span>
          <h2 className="section-title">A complete studio in your browser</h2>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature" key={f.t}>
              <span className="feature-icon">{f.icon}</span>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 34 }}>
          <div className="sub" style={{ marginBottom: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>
            Subtitle styles
          </div>
          <div className="row">
            {STYLES.map((s) => (
              <span className="chip" style={{ cursor: "default" }} key={s}>{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container section" id="faq">
        <div className="section-head">
          <span className="kicker">FAQ</span>
          <h2 className="section-title">Frequently asked questions</h2>
        </div>
        <div className="faq" style={{ maxWidth: 760, margin: "0 auto" }}>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container section" style={{ paddingTop: 20 }}>
        <div className="cta-band">
          <h2>Ready to create your next short?</h2>
          <p>
            Create an account, start a project, let the AI suggest three ideas and
            go all the way to the video.
          </p>
          {user ? (
            <Link to="/dashboard" className="btn lg">Go to my dashboard →</Link>
          ) : (
            <Link to="/register" className="btn lg">Start for free</Link>
          )}
        </div>
      </section>

      <footer className="container site-footer">
        <span>© 2026 DANTI CLIPER — from idea to video.</span>
        <span>
          <Link to="/privacy">Privacy</Link>
          <span style={{ margin: "0 8px" }}>·</span>
          Ideas · Script · Voice · Video — all in one.
        </span>
      </footer>

      <CookieNote />
    </div>
  );
}

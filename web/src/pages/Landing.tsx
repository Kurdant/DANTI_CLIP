import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { Brand } from "../components/TopBar";

const STEPS = [
  {
    n: "01",
    t: "Idées",
    d: "Donne un thème, ou rien du tout. L'IA te propose 3 sujets de shorts avec un angle et un hook pensés pour accrocher en 3 secondes.",
  },
  {
    n: "02",
    t: "Script",
    d: "Tu choisis l'idée qui te plaît. L'IA écrit un script structuré : hook, parties, narration complète, rythme calibré pour 30-60 s.",
  },
  {
    n: "03",
    t: "Voix",
    d: "La voix est synthétisée en français par un moteur vocal expressif : tu écoutes, tu valides, tu regénères avec une autre voix si besoin.",
  },
  {
    n: "04",
    t: "Vidéo",
    d: "Sous-titres synchronisés mot à mot dans 5 styles, fond vidéo ou solid color, export MP4 9:16 prêt pour TikTok / YouTube Shorts / Reels.",
  },
];

const FEATURES = [
  { icon: "✦", t: "3 idées à chaque fois", d: "L'IA varie les angles — viraux, pédagogiques, intrigants — avec un hook distinct pour chaque sujet." },
  { icon: "◈", t: "Scripts structurés", d: "Chaque script est découpé en parties, avec une idée de fond et une narration continue prête à lire." },
  { icon: "♫", t: "Voix IA naturelles", d: "Une bibliothèque de voix françaises : Remy, Vivienne et bien d'autres. Regénère autant de fois que tu veux." },
  { icon: "▣", t: "Sous-titres synchronisés", d: "Le montage calcule les timings mot à mot et génère des sous-titres qui suivent la voix, dans le style de ton choix." },
  { icon: "◉", t: "Fonds vidéo perso", d: "Uploads tes propres fonds ou choisis les fonds par défaut. Chaque compte garde sa bibliothèque privée." },
  { icon: "→", t: "Export 9:16", d: "Un MP4 vertical, prêt à publier. Tu peux aussi télécharger la voix seule pour réutiliser le script ailleurs." },
];

const STYLES = ["Classique", "Néon", "Gras", "Minimal", "Encadré"];

const FAQ = [
  {
    q: "C'est quoi exactement DANTI CLIPER ?",
    a: "Un studio de shorts quasi automatique : tu ouvres un projet, tu valides chaque étape (idées → script → voix → vidéo), et tu télécharges un MP4 9:16 sous-titré. Tu gardes le contrôle à chaque étape.",
  },
  {
    q: "Je dois savoir monter ?",
    a: "Non. Le montage (fond, sous-titres, voix) est généré automatiquement. Ton rôle : choisir l'idée, valider le script, écouter la voix et cliquer sur « Générer ».",
  },
  {
    q: "Quelles plateformes pour mes vidéos ?",
    a: "TikTok, YouTube Shorts et Instagram Reels : le format 9:16 (1080×1920) est exactement celui de ces plateformes.",
  },
  {
    q: "Puis-je utiliser mes propres vidéos de fond ?",
    a: "Oui. Depuis un projet, clique sur « ＋ Uploader un fond » : la vidéo est compressée automatiquement et n'est visible que par toi. Les fonds par défaut sont partagés par tout le monde.",
  },
  {
    q: "Mes projets sont-ils privés ?",
    a: "Oui. Chaque compte a ses propres projets, ses fonds uploadés et son historique. La connexion est protégée (session chiffrée, HTTPS).",
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
            <a href="#fonctionnement">Comment ça marche</a>
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#faq">FAQ</a>
            {user ? (
              <Link to="/dashboard" className="btn sm">Mes projets</Link>
            ) : (
              <>
                <Link to="/login" className="btn secondary sm">Connexion</Link>
                <Link to="/register" className="btn sm">Commencer</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="container hero">
        <div>
          <span className="kicker">✦ Studio de shorts · IA + Voix</span>
          <h1>
            Ton idée devient <em>une vidéo</em> prête à publier
          </h1>
          <p className="lead">
            DANTI CLIPER génère des shorts 9:16 quasi automatiquement : sujets, script,
            voix off et sous-titres synchronisés. Tu valides chaque étape, la machine
            fait le montage.
          </p>
          <div className="hero-ctas">
            {user ? (
              <Link to="/dashboard" className="btn lg">Ouvrir mon dashboard →</Link>
            ) : (
              <>
                <Link to="/register" className="btn lg">Créer mon compte</Link>
                <Link to="/login" className="btn secondary lg">J'ai déjà un compte</Link>
              </>
            )}
          </div>
          <div className="hero-note">
            Un projet · idées + script + voix + vidéo · export MP4 9:16
          </div>
        </div>

        <div className="phone-stage">
          <div className="phone">
            <div className="phone-screen">
              <div className="phone-caption">
                <span className="c1">3 sujets générés</span>
                <span className="c2">Le hook qui sauve la nuit</span>
                <span className="c1">Voix : Remy Multilingual</span>
                <span className="c2">♪ narration 42 s</span>
              </div>
            </div>
          </div>
          <div className="float-chip a"><span className="dot" /> IA · idées</div>
          <div className="float-chip b"><span className="dot rose" /> Voix · Edge TTS</div>
          <div className="float-chip c"><span className="dot rose" /> MP4 · 9:16</div>
        </div>
      </section>

      {/* FONCTIONNEMENT */}
      <section className="container section" id="fonctionnement">
        <div className="section-head">
          <span className="kicker">Pipeline</span>
          <h2 className="section-title">Quatre étapes, zéro montage</h2>
          <p className="section-sub">
            Chaque étape se valide avant d'enchaîner. Ce que tu ne valides pas, tu le
            regénères. C'est toujours toi qui décides.
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
          <span className="kicker">Fonctionnalités</span>
          <h2 className="section-title">Un studio complet dans le navigateur</h2>
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
            Styles de sous-titres
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
          <h2 className="section-title">Les questions qu'on me pose</h2>
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
          <h2>Prêt à créer ton prochain short ?</h2>
          <p>
            Crée un compte, lance un projet, laisse l'IA te proposer trois idées et
            enchaîne jusqu'à la vidéo.
          </p>
          {user ? (
            <Link to="/dashboard" className="btn lg">Aller sur mon dashboard →</Link>
          ) : (
            <Link to="/register" className="btn lg">Commencer gratuitement</Link>
          )}
        </div>
      </section>

      <footer className="container site-footer">
        <span>© 2026 DANTI CLIPER — de l'idée à la vidéo.</span>
        <span>Idées · Script · Voix · Vidéo — tout en un.</span>
      </footer>
    </div>
  );
}

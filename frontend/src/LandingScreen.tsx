import { Brand } from './Brand';

export function OrbitArt() {
  return (
    <svg
      className="orbit-art"
      viewBox="0 0 600 480"
      fill="none"
      aria-hidden="true"
    >
      <ellipse
        cx="304"
        cy="250"
        rx="264"
        ry="74"
        stroke="currentColor"
        transform="rotate(-24 304 250)"
      />
      <ellipse
        cx="304"
        cy="250"
        rx="264"
        ry="74"
        stroke="currentColor"
        transform="rotate(24 304 250)"
      />
      <ellipse
        cx="304"
        cy="250"
        rx="264"
        ry="74"
        stroke="currentColor"
        transform="rotate(-4 304 250)"
      />
      <circle cx="108" cy="151" r="19" fill="#b9ff66" />
      <circle cx="502" cy="330" r="13" fill="currentColor" />
      <g transform="rotate(-12 300 240)">
        <rect x="197" y="97" width="224" height="290" rx="22" fill="#191a23" />
        <rect
          x="177"
          y="77"
          width="224"
          height="290"
          rx="22"
          fill="white"
          stroke="#191a23"
          strokeWidth="2"
        />
        <rect x="205" y="110" width="92" height="35" rx="6" fill="#b9ff66" />
        <path
          d="M208 177H369M208 198H354M208 219H369M208 277H369M208 298H330"
          stroke="#191a23"
          strokeWidth="8"
        />
        <rect x="201" y="234" width="176" height="22" rx="3" fill="#b9ff66" />
        <path d="M208 245H364" stroke="#191a23" strokeWidth="5" />
      </g>
      <circle
        cx="422"
        cy="141"
        r="49"
        fill="#b9ff66"
        stroke="#191a23"
        strokeWidth="2"
      />
      <path
        d="m402 141 14 14 26-29"
        stroke="#191a23"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m92 305 12 31 31 12-31 12-12 31-12-31-31-12 31-12Z"
        fill="#191a23"
      />
      <path d="m490 46 9 24 24 9-24 9-9 24-9-24-24-9 24-9Z" fill="#191a23" />
    </svg>
  );
}

export function LandingScreen({
  onStart,
}: {
  onStart: (mode: 'login' | 'register') => void;
}) {
  return (
    <div className="landing">
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <header className="site-header page-width">
        <a href="#" aria-label="Citewise home">
          <Brand large />
        </a>
        <nav aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#process">How it works</a>
          <button className="button outline" onClick={() => onStart('login')}>
            Sign in <span>↗</span>
          </button>
        </nav>
      </header>
      <main id="content">
        <section className="hero page-width">
          <div>
            <p className="eyebrow">YOUR DOCUMENTS, CONNECTED</p>
            <h1>
              Ask your documents.
              <br />
              <span>Check every answer.</span>
            </h1>
            <p className="hero-copy">
              Upload a PDF, ask a question, and open the source page behind the
              answer.
            </p>
            <button className="button dark" onClick={() => onStart('register')}>
              Start your library <span>↗</span>
            </button>
            <p className="small-note">
              PDF & text files · Page-level citations
            </p>
          </div>
          <OrbitArt />
        </section>
        <section id="features" className="page-width section">
          <div className="section-heading">
            <h2>Less searching. More clarity.</h2>
          </div>
          <div className="feature-grid">
            {[
              [
                'Answers with receipts',
                'Open the source page behind each answer.',
                '01',
                '↗',
              ],
              [
                'Your library, connected',
                'Your PDFs and notes, plus a shared engineering library.',
                '02',
                '✳',
              ],
            ].map(([title, copy, number, symbol], i) => (
              <article className={`feature-card tone-${i}`} key={title}>
                <div>
                  <span className="card-number">/ {number}</span>
                  <h3>
                    <span>{title}</span>
                  </h3>
                  <p>{copy}</p>
                </div>
                <span className="feature-symbol" aria-hidden="true">
                  {symbol}
                </span>
              </article>
            ))}
          </div>
        </section>
        <section className="example-band page-width">
          <div>
            <h2>
              Don’t just take
              <br />
              AI’s word for it.
            </h2>
            <p>The best answer is one you can check.</p>
            <button className="button dark" onClick={() => onStart('register')}>
              Ask your first question ↗
            </button>
          </div>
          <figure className="answer-preview">
            <figcaption>EXAMPLE ANSWER</figcaption>
            <p className="example-question">What separates 2NF from 3NF?</p>
            <blockquote>
              2NF removes partial dependencies, while 3NF also removes
              transitive ones. <span className="citation">1</span>
            </blockquote>
            <div className="preview-source">
              <span>↗</span>
              <div>
                <strong>DBMS_Notes.pdf</strong>
                <p>Page 14 · Your answer, in context</p>
              </div>
            </div>
          </figure>
        </section>
        <section id="process" className="page-width section">
          <div className="section-heading">
            <h2>How it works</h2>
          </div>
          <div className="process-list">
            {[
              ['Build your library', 'Upload a PDF or text file, up to 10 MB.'],
              ['Ask away', 'Ask a question or search for a passage.'],
              [
                'Follow the evidence',
                'Click a citation to check the original page.',
              ],
            ].map(([title, copy], i) => (
              <details key={title} open={i === 0 ? true : undefined}>
                <summary>
                  <span className="step-number">0{i + 1}</span>
                  <h3>{title}</h3>
                  <span className="expand-icon" />
                </summary>
                <p>{copy}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className="site-footer page-width">
        <Brand />
        <button onClick={() => onStart('login')}>Open your library ↗</button>
        <div className="footer-bottom">
          <span>© 2026 Citewise</span>
          <span>Design inspired by Positivus by Olga Averchenko.</span>
        </div>
      </footer>
    </div>
  );
}

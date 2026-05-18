import React from 'react';
import { Link } from 'react-router-dom';

const styles = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #000; color: #e9edef; line-height: 1.6; }
.container { max-width: 1320px; margin: 0 auto; padding: 0 32px; }
.hero { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 80px 0 60px; }
.hero h1 { font-size: clamp(2.5rem, 6vw, 4rem); font-weight: 800; background: linear-gradient(135deg, #25D366, #128C7E); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.hero p { font-size: 1.15rem; color: #b0b8c1; max-width: 600px; margin: 16px 0 32px; }
.hero-buttons { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 14px 32px; border-radius: 12px; font-size: 1rem; font-weight: 600; text-decoration: none; transition: .2s; cursor: pointer; border: none; }
.btn-primary { background: #25D366; color: #000; }
.btn-primary:hover { background: #1ebe5a; transform: translateY(-2px); }
.btn-outline { border: 2px solid #25D366; color: #25D366; background: transparent; }
.btn-outline:hover { background: #25D36622; }
.features { padding: 72px 0; }
.features h2 { text-align: center; font-size: 2rem; margin-bottom: 40px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.card { background: #1a1a1a; border-radius: 16px; padding: 28px 24px; border: 1px solid #2a2a2a; transition: .2s; }
.card:hover { border-color: #25D366; transform: translateY(-4px); }
.card .icon { font-size: 1.8rem; margin-bottom: 12px; }
.card h3 { font-size: 1.08rem; margin-bottom: 10px; color: #25D366; }
.card p { font-size: .92rem; color: #b0b8c1; max-width: 32ch; }
@media (max-width: 1080px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.partnership { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 14px; padding: 36px 28px; text-align: center; margin: 32px 0; }
.partnership h2 { font-size: 1.5rem; margin-bottom: 10px; }
.partnership p { color: #b0b8c1; max-width: 600px; margin: 0 auto 20px; }
.partnership .badge { display: inline-block; background: #25D36622; color: #25D366; padding: 5px 14px; border-radius: 20px; font-size: .8rem; font-weight: 600; margin-bottom: 16px; }
.steps { padding: 48px 0; }
.steps h2 { text-align: center; font-size: 1.8rem; margin-bottom: 32px; }
`;
export const WabroLanding: React.FC = () => {
  return (
    <>
      <style>{styles}</style>
      <section className="hero">
        <div className="container">
          <h1>WaBro Broadcast</h1>
          <p>WhatsApp bulk messaging made simple. Send campaigns, manage contacts, track delivery — all from one dashboard.</p>
          <div className="hero-buttons">
            <Link className="btn btn-primary" to="/wabro/app">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
              Open WaBro app
            </Link>
            <a className="btn btn-outline" href="/wabro.apk" download>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download APK
            </a>
          </div>
        </div>
      </section>
      <section className="features" style={{ background: '#0d0d0d' }}>
        <div className="container">
          <h2>Built for WhatsApp broadcast</h2>
          <div className="grid">
            <div className="card">
              <div className="icon">📱</div>
              <h3>Multi-device</h3>
              <p>Link multiple WhatsApp numbers and send from any device simultaneously.</p>
            </div>
            <div className="card">
              <div className="icon">👥</div>
              <h3>Contact groups</h3>
              <p>Upload, tag, and organise contacts into targeted broadcast lists.</p>
            </div>
            <div className="card">
              <div className="icon">🚀</div>
              <h3>Bulk send</h3>
              <p>Send thousands of personalised messages with delivery confirmation.</p>
            </div>
            <div className="card">
              <div className="icon">📊</div>
              <h3>Live stats</h3>
              <p>Track sent, delivered, failed — real-time per-campaign analytics.</p>
            </div>
            <div className="card">
              <div className="icon">⏱️</div>
              <h3>Speed control</h3>
              <p>Rate-limit sends to keep your numbers safe from bans.</p>
            </div>
            <div className="card">
              <div className="icon">🔐</div>
              <h3>Self-hosted</h3>
              <p>Your data stays on your server. No third-party middleware.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="partnership">
        <div className="container">
          <div className="badge">Powered by PropAI Pulse</div>
          <h2>Runs inside your PropAI account</h2>
          <p>WaBro uses the same PropAI login, but access is enabled separately as its own broadcast product.</p>
          <Link className="btn btn-primary" to="/wabro/app">Open WaBro app</Link>
        </div>
      </section>
      <section className="steps">
        <div className="container">
          <h2>Get started in 3 steps</h2>
          <div className="grid" style={{ gap: '32px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', color: '#25D366', fontWeight: 800, marginBottom: 6 }}>01</p>
              <h3 style={{ textAlign: 'center' }}>Open the dashboard</h3>
              <p style={{ margin: '0 auto' }}>Navigate to the WaBro dashboard to add your first device.</p>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', color: '#25D366', fontWeight: 800, marginBottom: 6 }}>02</p>
              <h3 style={{ textAlign: 'center' }}>Link Android device</h3>
              <p style={{ margin: '0 auto' }}>Install the APK, sign into the same PropAI account, and let the Android device register for delivery.</p>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', color: '#25D366', fontWeight: 800, marginBottom: 6 }}>03</p>
              <h3 style={{ textAlign: 'center' }}>Send your first campaign</h3>
              <p style={{ margin: '0 auto' }}>Import contacts, compose a message, and broadcast in one click.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

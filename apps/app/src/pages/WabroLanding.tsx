import React from 'react';

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
.step-list { display: flex; flex-direction: column; gap: 16px; max-width: 600px; margin: 0 auto; }
.step { display: flex; gap: 14px; align-items: flex-start; }
.step .num { min-width: 32px; height: 32px; border-radius: 50%; background: #25D366; color: #000; font-weight: 700; font-size: .9rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.step h4 { margin-bottom: 2px; font-size: .95rem; }
.step p { font-size: .85rem; color: #b0b8c1; }
@media (max-width: 600px) { .container { padding: 0 18px; } .hero { padding: 60px 0 40px; } .hero-buttons { flex-direction: column; align-items: stretch; } .btn { justify-content: center; } .features { padding: 32px 0; } .features h2 { margin-bottom: 20px; } .grid { grid-template-columns: 1fr; gap: 16px; } .card p { max-width: none; } .steps { padding: 32px 0; } }
`;

export const WabroLanding: React.FC = () => {
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = styles;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  return (
    <div className="container">
      <section className="hero">
        <h1>WaBro</h1>
        <p>Broadcast WhatsApp messages to hundreds of leads with human-like timing. Built for real estate brokers, agents, and sales teams. <strong>Broker contacts auto-populate from PropAI Inbox — tag DMs as Realtor and they feed your broadcast lists.</strong></p>
        <div className="hero-buttons">
          <a href="/wabro.apk" className="btn btn-primary">&#8595; Download APK</a>
          <a href="/wabro/app" className="btn btn-outline">&#128187; Open Dashboard</a>
          <a href="#features" className="btn btn-outline">&#9660; Explore Features</a>
        </div>
      </section>

      <section className="features" id="features">
        <h2>Why WaBro?</h2>
        <div className="grid">
          {[
            ['📩', 'Bulk WhatsApp Broadcast', 'Send personalised messages to thousands of contacts automatically via WhatsApp.'],
            ['📊', 'Smart Lists', 'Auto-populate from PropAI Inbox DM tagging. Tag a contact as Realtor and it feeds your broadcast lists instantly.'],
            ['🤖', 'AI-Powered Skills', 'Translate, rewrite, and smart-caption messages using Gemini AI (optional).'],
            ['📅', 'Campaign Dashboard', 'Track sent, pending, and failed messages in real time. Resume from where you left off.'],
            ['💻', 'Web Control Panel', 'Manage brokers, listings, campaigns, devices, and leads from the browser while Android handles sending.'],
            ['👥', 'Group Contact Scraper', 'Extract participant names and numbers from WhatsApp groups automatically.'],
            ['🔒', 'Broadcast Lists', 'Save and reuse contact lists across campaigns. Import from CSV, phonebook, or groups.'],
            ['💼', 'Broker Management (V2)', 'Full CRM for brokers: geo-tagging, specialty tracking, groups, performance scoring & commission.'],
            ['🏠', 'Property Listings (V2)', 'Central listing repository with RERA compliance, auto-message cards, and deal pipeline tracking.'],
            ['📈', 'Response Tracking (V2)', 'NLP-based intent scoring (Hot/Warm/Cold), auto-follow-up triggers, and lead conversion dashboard.'],
          ].map(([icon, title, body]) => (
            <div key={title} className="card">
              <div className="icon">{icon}</div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="partnership">
        <div className="badge">&#129309; Powered by PropAI</div>
        <h2>Broker Contacts Flow Automatically From PropAI</h2>
        <p>Tag DMs as <strong>Realtor</strong> in the <strong>PropAI Inbox</strong> — they auto-populate as WaBro broker contacts with phone and locality, ready for broadcast campaigns. No manual import needed.</p>
        <a href="/inbox" className="btn btn-primary">&#8599; Open PropAI Inbox</a>
      </section>

      <section className="steps">
        <h2>How It Works</h2>
        <div className="step-list">
          {[
            ['Install WaBro', 'Download the APK and enable the Accessibility Service for WhatsApp.'],
            ['Build Your Broker List', 'Tag incoming DMs as Realtor from the PropAI Inbox, or import from phonebook/CSV. Auto-split into lists of 100.'],
            ['Compose Your Campaign', 'Write a message, add media, apply AI skills (translate, rewrite, caption).'],
            ['Broadcast & Track', 'Send with human-like delays. Monitor progress in the campaign dashboard.'],
            ['Get Listed on PropAI', 'Subscribe and get free visibility on the PropAI marketplace.'],
          ].map(([title, body], i) => (
            <div key={title} className="step">
              <div className="num">{i + 1}</div>
              <div>
                <h4>{title}</h4>
                <p>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

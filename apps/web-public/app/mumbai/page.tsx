import { getAreas } from '@/app/lib/supabase';
import Link from 'next/link';

export const metadata = {
  title: 'Explore Mumbai Areas - PropAI',
  description: 'Browse property listings by locality in Mumbai',
};

export default async function MumbaiPage() {
  const areas = await getAreas();

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <a href="/" className="logo">PropAI</a>
          <nav className="nav">
            <a href="/">Listings</a>
            <a href="/mumbai">Explore Mumbai</a>
          </nav>
        </div>
      </header>

      <main className="container">
        <div className="hero">
          <h1>Explore Mumbai</h1>
          <p>Browse property listings by locality in Mumbai</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 24 }}>
          {areas.map(area => (
            <Link
              key={area}
              href={`/mumbai/${encodeURIComponent(area)}/ALL`}
              style={{
                display: 'block',
                padding: '16px',
                background: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                color: '#0a0a0a',
                fontWeight: 500,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}
            >
              {area}
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

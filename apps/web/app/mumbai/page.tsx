import { listPublicAreas } from '@/app/lib/publicListingsService';
import Link from 'next/link';
import { Header } from '@/app/components/Header';

export const metadata = {
  title: 'Explore Mumbai Areas - PropAI',
  description: 'Browse property listings by locality in Mumbai',
};

export const dynamic = 'force-dynamic';

export default async function MumbaiPage() {
  const { items: areas } = await listPublicAreas();

  return (
    <>
      <Header />

      <main className="container">
        <div className="hero">
          <h1>Explore Mumbai</h1>
          <p>Browse property listings by locality in Mumbai</p>
        </div>

        <div className="area-grid">
          {areas.map(area => (
            <Link
              key={area}
              href={`/mumbai/${encodeURIComponent(area)}/ALL`}
              className="area-link"
            >
              {area}
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

import { redirect } from 'next/navigation';
import { Metadata } from 'next';

interface Props {
  params: Promise<{ area: string; type: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { area, type } = await params;
  const typeLabel = type === 'rent' ? 'for rent' : type === 'sale' ? 'for sale' : '';
  return {
    title: `${area} Mumbai Property ${typeLabel} | PropAI`,
    description: `Browse verified ${typeLabel} listings in ${area}, Mumbai. Find flats, apartments, and homes at PropAI.`,
  };
}

export default async function AreaTypePage({ params }: Props) {
  const { area, type } = await params;
  redirect(`https://www.propai.live/mumbai/${encodeURIComponent(area)}/${encodeURIComponent(type)}`);
}

import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Explore Mumbai Areas - PropAI',
  description: 'Browse property listings by locality in Mumbai',
};

export default function MumbaiPage() {
  redirect('https://www.propai.live');
}

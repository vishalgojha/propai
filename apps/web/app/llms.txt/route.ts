export const revalidate = 3600;

export async function GET() {
  const content = [
    '# PropAI Public Listings',
    '',
    'PropAI publishes structured Mumbai property listings parsed from broker WhatsApp activity.',
    'Public URLs include:',
    '- /',
    '- /mumbai',
    '- /mumbai/{area}/{type}',
    '- /listings/{id}',
    '',
    'Primary contact intent on public pages is broker WhatsApp redirection when a valid broker number has been parsed.',
  ].join('\n');

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain' },
  });
}

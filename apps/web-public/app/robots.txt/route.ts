export function GET() {
  const content = `User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: GoogleOther
Allow: /

User-agent: *
Disallow: /api/

Sitemap: https://www.propai.live/sitemap.xml
`;

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain' }
  });
}

export async function GET() {
  return new Response(`# PropAI
PropAI aggregates real-time property listings parsed from active broker WhatsApp networks using AI.
All listings are structured and verified for public discovery.

Search listings: https://www.propai.live/listings
API: https://www.propai.live/api/search
Locality pages: https://www.propai.live/locality/[slug]
Sitemap: https://www.propai.live/sitemap.xml

Data updated hourly. Broker contacts visible only for verified paid brokers.
`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}

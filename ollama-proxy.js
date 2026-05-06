const http = require('http');

const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;

const server = http.createServer((req, res) => {
  if (req.url === '/api/ai/models' && req.method === 'GET') {
    http.get(`http://${OLLAMA_HOST}:${OLLAMA_PORT}/api/tags`, (ollamaRes) => {
      let data = '';
      ollamaRes.on('data', chunk => data += chunk);
      ollamaRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const models = parsed.models.map(m => ({
            name: m.name,
            size: formatBytes(m.size),
            sizeBytes: m.size,
            modified: m.modified_at,
            digest: m.digest
          }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ models }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    }).on('error', e => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

function formatBytes(bytes) {
  if (bytes >= 1024**3) return (bytes / 1024**3).toFixed(1) + ' GB';
  if (bytes >= 1024**2) return (bytes / 1024**2).toFixed(0) + ' MB';
  return bytes + ' B';
}

server.listen(3003, '0.0.0.0', () => {
  console.log('Ollama proxy running on port 3003');
});

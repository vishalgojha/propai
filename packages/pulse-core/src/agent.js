import { spawn } from 'node:child_process';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const GEMINI_KEY = process.env.GOOGLE_API_KEY || '';

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function ollamaListModels() {
  const url = new URL('/api/tags', OLLAMA_BASE);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => ({ name: m.name, provider: 'ollama' }));
}

async function ollamaGenerate(model, system, message) {
  const url = new URL('/api/generate', OLLAMA_BASE);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, system, messages: [{ role: 'user', content: message }], stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data.response || '';
}

async function geminiListModels(apiKey) {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const models = (data.models || []).map((m) => ({
            name: m.name.replace('models/', ''),
            provider: 'gemini',
          }));
          resolve(models);
        } catch {
          reject(new Error('Failed to parse Gemini models response'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function geminiGenerate(model, system, message, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: message }] }],
      systemInstruction: { parts: [{ text: system }] },
    });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const req = https.request(
      url,
      { method: 'POST', headers: { 'content-type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.candidates?.[0]?.content?.parts?.[0]?.text || '');
          } catch {
            reject(new Error('Failed to parse Gemini response'));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function listModels() {
  const all = [];
  try {
    const ollamaModels = await ollamaListModels();
    all.push(...ollamaModels);
  } catch {
    // Ollama not available
  }
  if (GEMINI_KEY) {
    try {
      const geminiModels = await geminiListModels(GEMINI_KEY);
      all.push(...geminiModels);
    } catch {
      // Gemini not available
    }
  }
  return all;
}

export async function generateResponse(model, system, message) {
  if (model.startsWith('gemini-') || model.includes('gemini')) {
    if (!GEMINI_KEY) throw new Error('GOOGLE_API_KEY not set');
    return geminiGenerate(model, system, message, GEMINI_KEY);
  }
  return ollamaGenerate(model, system, message);
}
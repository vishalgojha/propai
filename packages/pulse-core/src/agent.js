import { spawn } from 'node:child_process';
import https from 'node:https';
import { URL } from 'node:url';

const GEMINI_KEY = process.env.GOOGLE_API_KEY || '';

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
  if (!GEMINI_KEY) return [];
  try {
    return await geminiListModels(GEMINI_KEY);
  } catch {
    return [];
  }
}

export async function generateResponse(model, system, message) {
  if (!GEMINI_KEY) throw new Error('GOOGLE_API_KEY not set');
  return geminiGenerate(model, system, message, GEMINI_KEY);
}

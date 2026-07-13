#!/usr/bin/env node
const https = require('https');

const KEY = process.env.COSMOS_MCP_KEY;
const HOST = 'cosmos.polarity-lab.com';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: HOST,
      port: 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-MCP-Key': KEY,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch {
          resolve(d);
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  if (!KEY) {
    console.error('COSMOS_MCP_KEY required');
    process.exit(1);
  }

  const whoami = await request('GET', '/api/polarity/whoami');
  console.log('whoami:', JSON.stringify(whoami, null, 2));

  const capture = await request('POST', '/api/polarity/capture-turn', {
    polarity_user_id: whoami.polarity_user_id,
    user_text: process.argv[2] || '',
    assistant_text: process.argv[3] || '',
    source: process.argv[4] || 'kimi-code',
    max_observations: 10,
  });
  console.log('capture:', JSON.stringify(capture, null, 2));
}

main().catch(console.error);

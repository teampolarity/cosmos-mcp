#!/usr/bin/env node

const https = require('https');
const readline = require('readline');

const KEY = process.env.COSMOS_MCP_KEY;
const ENDPOINT = 'https://cosmos.polarity-lab.com/api/mcp';

if (!KEY) {
  process.stderr.write('COSMOS_MCP_KEY environment variable is required\n');
  process.exit(1);
}

const url = new URL(ENDPOINT);

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch (e) {
    process.stderr.write('Failed to parse stdin: ' + e.message + '\n');
    return;
  }

  // Handle initialization handshake locally
  if (request.method === 'initialize') {
    const response = {
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'cosmos', version: '0.8.2' }
      },
      id: request.id
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  if (request.method === 'notifications/initialized') {
    return; // no response needed
  }

  const body = JSON.stringify(request);

  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
      'Content-Length': Buffer.byteLength(body)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        // Verify it's valid JSON before forwarding
        JSON.parse(data);
        process.stdout.write(data + '\n');
      } catch (e) {
        const error = {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Invalid response from Cosmos endpoint' },
          id: request.id || null
        };
        process.stdout.write(JSON.stringify(error) + '\n');
      }
    });
  });

  req.on('error', (e) => {
    const error = {
      jsonrpc: '2.0',
      error: { code: -32603, message: `Request failed: ${e.message}` },
      id: request.id || null
    };
    process.stdout.write(JSON.stringify(error) + '\n');
  });

  req.write(body);
  req.end();
});

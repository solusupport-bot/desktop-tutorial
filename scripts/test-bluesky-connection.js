#!/usr/bin/env node
/**
 * Bluesky Connection Test
 */

const https = require('https');

const identifier = process.env.BLUESKY_IDENTIFIER || '';
const password = process.env.BLUESKY_APP_PASSWORD || '';

async function testBlueskyConnection() {
  if (!identifier || !password) {
    console.error('❌ BLUESKY_IDENTIFIER or BLUESKY_APP_PASSWORD not set');
    process.exit(1);
  }

  try {
    console.log('🔗 Testing Bluesky connection...');
    console.log(`Identifier: ${identifier}`);

    // Simple request to Bluesky PDS to verify credentials
    const data = JSON.stringify({
      identifier,
      password
    });

    const options = {
      hostname: 'bsky.social',
      port: 443,
      path: '/xrpc/com.atproto.server.createSession',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const response = JSON.parse(body);
            console.log('✅ Bluesky connection successful!');
            console.log(`   DID: ${response.did}`);
            console.log(`   Handle: ${response.handle}`);
            resolve();
          } else if (res.statusCode === 401) {
            console.error('❌ Authentication failed. Check your credentials.');
            reject(new Error('Invalid credentials'));
          } else {
            console.error(`❌ HTTP ${res.statusCode}: ${body}`);
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

testBlueskyConnection();

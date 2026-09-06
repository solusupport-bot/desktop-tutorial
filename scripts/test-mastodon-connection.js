#!/usr/bin/env node
/**
 * Mastodon Connection Test
 */

const https = require('https');
const { URL } = require('url');

const instance = process.env.MASTODON_INSTANCE || '';
const token = process.env.MASTODON_ACCESS_TOKEN || '';

async function testMastodonConnection() {
  if (!instance || !token) {
    console.error('❌ MASTODON_INSTANCE or MASTODON_ACCESS_TOKEN not set');
    process.exit(1);
  }

  try {
    console.log('🔗 Testing Mastodon connection...');
    console.log(`Instance: ${instance}`);

    const url = new URL('/api/v1/accounts/verify_credentials', instance);

    await new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const account = JSON.parse(body);
            console.log('✅ Mastodon connection successful!');
            console.log(`   Username: @${account.username}`);
            console.log(`   Display name: ${account.display_name}`);
            console.log(`   Followers: ${account.followers_count}`);
            resolve();
          } else if (res.statusCode === 401) {
            console.error('❌ Authentication failed. Check your token.');
            reject(new Error('Invalid token'));
          } else {
            console.error(`❌ HTTP ${res.statusCode}: ${body}`);
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }).on('error', reject);
    });
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

testMastodonConnection();

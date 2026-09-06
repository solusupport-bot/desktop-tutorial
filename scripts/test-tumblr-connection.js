#!/usr/bin/env node
/**
 * Tumblr Connection Test
 */

const crypto = require('crypto');
const https = require('https');

const consumerKey = process.env.TUMBLR_CONSUMER_KEY || '';
const consumerSecret = process.env.TUMBLR_CONSUMER_SECRET || '';
const token = process.env.TUMBLR_TOKEN || '';
const tokenSecret = process.env.TUMBLR_TOKEN_SECRET || '';
const blogId = process.env.TUMBLR_BLOG_IDENTIFIER || '';

// OAuth 1.0a signature generation
function generateOAuthSignature(httpMethod, url, params, consumerSecret, tokenSecret) {
  const baseString = [
    httpMethod.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(
      Object.keys(params)
        .sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&')
    )
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');
}

async function testTumblrConnection() {
  if (!consumerKey || !consumerSecret || !token || !tokenSecret || !blogId) {
    console.error('❌ Tumblr credentials not fully set');
    console.error('   Required: TUMBLR_CONSUMER_KEY, TUMBLR_CONSUMER_SECRET,');
    console.error('             TUMBLR_TOKEN, TUMBLR_TOKEN_SECRET, TUMBLR_BLOG_IDENTIFIER');
    process.exit(1);
  }

  try {
    console.log('🔗 Testing Tumblr connection...');
    console.log(`Blog: ${blogId}`);

    const url = `https://api.tumblr.com/v2/blog/${blogId}/info`;
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');

    const params = {
      oauth_consumer_key: consumerKey,
      oauth_token: token,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_nonce: nonce,
      oauth_version: '1.0'
    };

    const signature = generateOAuthSignature('GET', url, params, consumerSecret, tokenSecret);
    params.oauth_signature = signature;

    const authHeader = 'OAuth ' + Object.keys(params)
      .map(key => `${key}="${encodeURIComponent(params[key])}"`)
      .join(', ');

    await new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'Authorization': authHeader
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const response = JSON.parse(body);
            const blog = response.response;
            console.log('✅ Tumblr connection successful!');
            console.log(`   Title: ${blog.title}`);
            console.log(`   Posts: ${blog.posts}`);
            console.log(`   Followers: ${blog.followers}`);
            resolve();
          } else if (res.statusCode === 401) {
            console.error('❌ Authentication failed. Check your OAuth credentials.');
            reject(new Error('Invalid credentials'));
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

testTumblrConnection();

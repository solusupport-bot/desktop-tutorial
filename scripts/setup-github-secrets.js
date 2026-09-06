#!/usr/bin/env node
/**
 * GitHub Secrets Setup Script
 * Sets repository secrets needed for SNS platform automation
 */

const axios = require('axios');
const sodium = require('tweetsodium');

const OWNER = 'solusupport-bot';
const REPO = 'desktop-tutorial';
const GITHUB_API_URL = 'https://api.github.com';

// Get GitHub token from environment
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN environment variable is not set');
  process.exit(1);
}

// Secrets to be set
const SECRETS = {
  BLUESKY_IDENTIFIER: 'landinkorea.bsky.social',
  BLUESKY_APP_PASSWORD: 'ykya-di6r-qpsc-kx7r',
  MASTODON_INSTANCE: 'https://mastodon.social',
  MASTODON_ACCESS_TOKEN: 'e-FFGbcXUFHi9iAaSETsqHj5x4C3vVfkpyH6U8MS51A',
  TUMBLR_CONSUMER_KEY: 'ZeFzPiAG30Z1qbseFTgyi3pJ0L16n932MsmtAMYsUoXRByo3TH',
  TUMBLR_CONSUMER_SECRET: 'uTFRZCXfsrnn5Yxf2XfAcO1orweDOnF41m9CBOyWVn34ZlERFN',
  TUMBLR_TOKEN: 'TERA3RkhGbJw41ZNEEiCfUGmhkBExJXL0MAb4ek7glzsrKEjlL',
  TUMBLR_TOKEN_SECRET: 'mSXOqW2XvexXcQWkCzMJliq9MKrgw0M7ZP6hWiYtmn5Dx9p3F0',
  TUMBLR_BLOG_IDENTIFIER: 'landinkorea'
};

const api = axios.create({
  baseURL: GITHUB_API_URL,
  headers: {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json'
  }
});

/**
 * Encrypt a secret value using libsodium's sealed box algorithm
 * This is required by the GitHub API for setting secrets
 */
function encryptSecret(publicKeyB64, secretValue) {
  try {
    const publicKey = Buffer.from(publicKeyB64, 'base64');

    // Use tweetsodium to encrypt the secret using sealed box
    const encryptedValue = sodium.seal(
      Buffer.from(secretValue),
      publicKey
    );

    return Buffer.from(encryptedValue).toString('base64');
  } catch (error) {
    console.error('Error encrypting secret:', error.message);
    throw error;
  }
}

/**
 * Get the public key for the repository
 */
async function getPublicKey() {
  try {
    const response = await api.get(
      `/repos/${OWNER}/${REPO}/actions/secrets/public-key`
    );
    return {
      key_id: response.data.key_id,
      key: response.data.key
    };
  } catch (error) {
    console.error('❌ Failed to get public key:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Set a single GitHub secret
 */
async function setSecret(secretName, secretValue, publicKeyInfo) {
  try {
    // Encrypt the secret value
    const encryptedValue = encryptSecret(publicKeyInfo.key, secretValue);

    // Call GitHub API to set the secret
    await api.put(
      `/repos/${OWNER}/${REPO}/actions/secrets/${secretName}`,
      {
        encrypted_value: encryptedValue,
        key_id: publicKeyInfo.key_id
      }
    );

    console.log(`✅ Set secret: ${secretName}`);
  } catch (error) {
    console.error(`❌ Failed to set secret ${secretName}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Main function to set all secrets
 */
async function setupAllSecrets() {
  try {
    console.log('🔐 GitHub Secrets Setup');
    console.log(`Repository: ${OWNER}/${REPO}\n`);

    // Get public key
    console.log('📝 Getting public key from GitHub...');
    const publicKeyInfo = await getPublicKey();
    console.log('✅ Public key retrieved\n');

    // Set each secret
    console.log('🔑 Setting secrets...');
    for (const [secretName, secretValue] of Object.entries(SECRETS)) {
      await setSecret(secretName, secretValue, publicKeyInfo);
    }

    console.log('\n✅ All secrets configured successfully!');
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run the setup
setupAllSecrets();

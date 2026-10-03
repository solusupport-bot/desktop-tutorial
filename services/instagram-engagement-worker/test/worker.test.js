import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildResponse, matchTopic } from '../src/rules.js';
import { extractComments, verifyMetaSignature } from '../src/index.js';

test('recognized topic creates a public reply without an inline URL', () => {
  const response = buildResponse('T-money는 어디에서 사나요?');
  assert.equal(response.action, 'public_reply');
  assert.equal(response.topic, 'tmoney');
  assert.equal(response.publicText.includes('http'), false);
  assert.match(response.publicText, /프로필/);
});

test('explicit guide request creates one UTM-tagged private link', () => {
  const response = buildResponse('Please send the eSIM guide link');
  assert.equal(response.action, 'private_reply');
  assert.match(response.privateText, /^.*https:\/\/landinkorea\.com\/posts\//);
  assert.match(response.privateText, /utm_source=instagram/);
  assert.equal(response.publicText.includes('http'), false);
});

test('unrecognized chatter is ignored', () => {
  assert.equal(matchTopic('Nice photo!'), null);
  assert.equal(buildResponse('Nice photo!'), null);
});

test('webhook extraction skips our own comments and non-comment feed events', () => {
  const payload = { entry: [{ changes: [
    { field: 'comments', value: { id: '1', text: 'KTX guide', from: { id: 'visitor' } } },
    { field: 'comments', value: { id: '2', text: 'KTX guide', from: { id: 'self' } } },
    { field: 'feed', value: { item: 'post', verb: 'add', post_id: '3', message: 'KTX' } }
  ] }] };
  assert.deepEqual(extractComments(payload, 'self'), [
    { commentId: '1', userId: 'visitor', text: 'KTX guide' }
  ]);
});

test('Meta HMAC signature is required and verified', async () => {
  const secret = 'test-secret';
  const body = new TextEncoder().encode('{"ok":true}');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, body);
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  assert.equal(await verifyMetaSignature(body, `sha256=${hex}`, secret), true);
  assert.equal(await verifyMetaSignature(body, 'sha256=bad', secret), false);
  assert.equal(await verifyMetaSignature(body, '', secret), false);
});

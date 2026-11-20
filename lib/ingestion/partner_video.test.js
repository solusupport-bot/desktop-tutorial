const assert = require('node:assert/strict');
const { test } = require('node:test');
const { findPartnerVideo } = require('./partner_video');

const entry = {
  partner: 'Haeundae Cafe', instagram: '@haeundae_cafe', link: 'https://naver.me/abc',
  match: 'Haeundae', file: 'cafe.mp4', consentDate: '2026-11-20'
};

test('uses a consented partner video whose match fits the topic, with credit and first comment', () => {
  const got = findPartnerVideo('Haeundae Beach', [], [entry]);
  assert.equal(got.url, 'https://raw.githubusercontent.com/solusupport-bot/desktop-tutorial/main/media/partner_videos/cafe.mp4');
  assert.equal(got.credit, '🎥 Video: Haeundae Cafe @haeundae_cafe');
  assert.equal(got.firstComment, '🎥 Video: Haeundae Cafe @haeundae_cafe\n📍 https://naver.me/abc');
});

test('never uses an entry without consentDate', () => {
  assert.equal(findPartnerVideo('Haeundae Beach', [], [{ ...entry, consentDate: '' }]), null);
});

test('skips other topics and already-used videos', () => {
  assert.equal(findPartnerVideo('Gyeongbokgung Palace', [], [entry]), null);
  const url = findPartnerVideo('Haeundae Beach', [], [entry]).url;
  assert.equal(findPartnerVideo('Haeundae Beach', [url], [entry]), null);
});

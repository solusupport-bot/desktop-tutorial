const assert = require('node:assert/strict');
const { test } = require('node:test');
const meta = require('./meta_client');

const calls = [];
meta.instagramGraphPost = async (p, body) => { calls.push([p, body]); return { id: p.endsWith('media_publish') ? 'MEDIA1' : 'C1' }; };
meta.instagramGraphGet = async () => ({ status_code: 'FINISHED' });
const { publishToInstagram } = require('./instagram');

test('posts the partner credit as the first comment after publishing', async () => {
  process.env.IG_ACCESS_TOKEN = 't'; process.env.IG_USER_ID = 'u';
  calls.length = 0;
  const res = await publishToInstagram({ text: 'cap', videoUrl: 'https://x/v.mp4', firstComment: '🎥 Video: Cafe\n📍 https://naver.me/a' });
  assert.equal(res.id, 'MEDIA1');
  assert.deepEqual(calls.at(-1), ['/MEDIA1/comments', { message: '🎥 Video: Cafe\n📍 https://naver.me/a' }]);
});

test('no comment call without firstComment', async () => {
  calls.length = 0;
  await publishToInstagram({ text: 'cap', videoUrl: 'https://x/v.mp4' });
  assert.ok(!calls.some(([p]) => p.endsWith('/comments')));
});

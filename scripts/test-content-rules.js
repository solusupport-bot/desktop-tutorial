const assert = require('assert');
const {
  applyPlatformLinkRule,
  ensureVideoAttribution,
  isWatermarkedImage
} = require('../lib/scheduler/content_rules');

const threadText = applyPlatformLinkRule(
  'threads',
  'Useful Korea tip.\n\n📖 Full guide: https://landinkorea.com/posts/test.html?utm_source=threads',
  'Useful Korea tip'
);
assert(!/https?:\/\//.test(threadText));
assert(/link in our profile/i.test(threadText));
assert(/Useful Korea tip/.test(threadText));
assert(!/^📖 Full guide:\s*$/m.test(threadText));

const instagramText = applyPlatformLinkRule('instagram', 'Save this.\n\nhttps://example.com', 'Seoul guide');
assert(!/https?:\/\//.test(instagramText));
assert(/link in our profile/i.test(instagramText));

const creditedInstagram = ensureVideoAttribution(
  applyPlatformLinkRule('instagram', 'Save this.\n\n#KoreaTravel #SeoulTrip', 'Seoul guide'),
  'https://cdn.pixabay.com/video/test.mp4'
);
assert(creditedInstagram.indexOf('link in our profile') < creditedInstagram.indexOf('#KoreaTravel'));
assert(creditedInstagram.indexOf('Video source: Pixabay') < creditedInstagram.indexOf('#KoreaTravel'));

const facebookText = applyPlatformLinkRule('facebook', 'Guide: https://landinkorea.com/posts/test', 'Test');
assert(/https:\/\/landinkorea\.com/.test(facebookText));

const credited = ensureVideoAttribution('Watch this.', 'https://videos.pexels.com/video-files/1/test.mp4');
assert(/Video source: Pexels/.test(credited));
assert.strictEqual(ensureVideoAttribution(credited, 'https://videos.pexels.com/video-files/1/test.mp4'), credited);

assert(isWatermarkedImage('https://landinkorea.com/sns-media/images/test.jpg'));
assert(!isWatermarkedImage('https://images.pexels.com/photos/test.jpg'));

console.log('\x1b[32m  ✓\x1b[0m 링크·워터마크·영상 출처 규칙 검증 통과.');

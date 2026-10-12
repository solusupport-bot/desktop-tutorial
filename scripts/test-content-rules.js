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

// 2026-10-12: 실제로 키워드와 안 맞게 올라갔던 영상 3건 — 한국 신호만 있고 주제 단어가 없으면 거부돼야 한다.
const { matchesTopic } = require('../lib/ingestion/topic_match');
assert(!matchesTopic('orange Seoul taxi on street korea', 'seoul, traffic, korea, transportation, city, road, infrastructure, urban'));
assert(!matchesTopic('phone map app street Seoul korea', 'road, cars, crosswalk, traffic, city, building, downtown, seoul, republic of korea, landscape'));
assert(!matchesTopic('autumn layering outfit korea', 'https://www.pexels.com/video/cherry-blossoms-in-seoul-s-springtime-32242980/'));
assert(matchesTopic('orange Seoul taxi on street korea', 'https://www.pexels.com/video/a-taxi-in-seoul-korea-123/'));
assert(matchesTopic('phone map app street Seoul korea', 'smartphone, map, navigation, seoul'));
assert(!matchesTopic('phone map app', 'happy, seoul'));
const { OTHER_COUNTRY } = require('../lib/ingestion/topic_match');
assert(OTHER_COUNTRY.test('china, shiva, map, globe, asia, japan, korea'));
assert(!OTHER_COUNTRY.test('seoul, traffic, korea, machine'));

// 2026-10-12 "중복 이미지·영상도 안 됨": 주소가 달라도 같은 사진/영상 번호면 중복으로 잡아야 한다.
const { isUsed, mediaKey } = require('../lib/ingestion/media_guard');
assert(isUsed(['https://images.pexels.com/photos/21011587/pexels-photo-21011587.jpeg?w=940'], 'https://images.pexels.com/photos/21011587/pexels-photo-21011587.jpeg?auto=compress&h=650'));
assert(isUsed(['https://videos.pexels.com/video-files/32242980/13750918_2160_3840_60fps.mp4'], 'https://videos.pexels.com/video-files/32242980/999_1080_1920_30fps.mp4'));
assert.strictEqual(mediaKey('https://cdn.pixabay.com/video/2024/06/24/218013_large.mp4'), 'pixabay:218013');
assert.strictEqual(mediaKey('https://pixabay.com/get/abc_1280.jpg#pixabay=555'), 'pixabay:555');
assert(!isUsed(['https://images.pexels.com/photos/1/a.jpeg'], 'https://images.pexels.com/photos/2/a.jpeg'));
const { matchesTopic: mt } = require('../lib/ingestion/topic_match');
assert(!mt('seoul city bus street korea', 'business district seoul korea'));
assert(!mt('phone map app street Seoul korea', 'maple apartment seoul'));
assert(!mt('autumn layering outfit korea', 'autumn leaves seoul korea'));
assert(mt('korean glasses shop', 'glass store korea'));

// 2026-10-13: 초안의 원화 금액은 원본 자료에 그대로 있어야 한다(AI가 "₩70-100k"를 지어낸 실측 사례).
const { checkMoneyFacts } = require('../lib/scheduler/quality_gate');
const src = 'The AREX express costs ₩13,000; a taxi is estimated at ₩65,000-80,000 plus tolls.';
assert.deepStrictEqual(checkMoneyFacts({ threads: 'Express is ₩13,000.' }, src), []);
assert.strictEqual(checkMoneyFacts({ facebook: 'Taxis – ₩70-100k in traffic' }, src).length, 2);
assert.strictEqual(checkMoneyFacts({ instagram: 'only 13,000 won' }, src).length, 0);
assert.strictEqual(checkMoneyFacts({ threads: 'about ₩65,000' }, src).length, 0);
// 검토 지적 오탐 케이스
assert.deepStrictEqual(checkMoneyFacts({ t: 'about ₩65,000-80k' }, '₩65,000-80,000'), []);
assert.deepStrictEqual(checkMoneyFacts({ t: 'Express is ₩13,000 - 2 stops later you transfer' }, '₩13,000'), []);
assert.deepStrictEqual(checkMoneyFacts({ t: 'up to ₩5 million per trip' }, 'up to ₩5,000,000 in total'), []);
assert.deepStrictEqual(checkMoneyFacts({ t: 'She won 3 won awards' }, ''), []);
assert.strictEqual(checkMoneyFacts({ t: ['₩99,000'] }, '₩13,000').length, 1);

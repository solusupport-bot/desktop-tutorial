#!/usr/bin/env node
// 2026-10-10 1회성 발행: Claude Code 세션에서 만든 T-money 현금충전 릴스(그래픽+Pexels+CC 음악).
// Instagram=영상, Facebook/Threads=이미지(CLAUDE.md 플랫폼 규칙), 나머지=이미지+블로그 링크.
// 사용: node scripts/publish-tmoney-reel.js <미디어 폴더>   (tmoney_reel.mp4, img1~6.jpg)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { PLATFORMS } = require('../lib/publishing');
const { uploadMediaFiles } = require('../lib/publishing/media_host');
const { withUtm } = require('../lib/ingestion/topic_blog_links');

const DIR = process.argv[2];
const BLOG = 'https://landinkorea.com/posts/korea-convenience-store-hacks';
const CREDITS = '🎬 Video: Pexels (FREE VIDEO HAPPY, Paul Bill)\n'
  + '🎵 Music: "Upbeat Corporate" by Soundrider/Dope (CC BY 3.0, via Jamendo)';

const TEXT = {
  instagram: `Your credit card won't top up T-money in Korea. Bring cash.

At CU, GS25 or 7-Eleven, hand your card to the cashier, say how much (like 10,000 won), and they tap it on a reader. It's cash only, even with a Korean card.

Save this for your first day in Korea.

📖 Full guide: link in profile → search "convenience store hacks"

#KoreaTravel #TmoneyCard #SeoulTravel #KoreaTips #VisitKorea

${CREDITS}
https://creativecommons.org/licenses/by/3.0/`,
  // Threads: 훅/관찰1/관찰2/주의사항/질문 5문단(답글 체인)
  threads: `Your credit card won't top up a T-money card in Korea. Here's what actually works. 1/5

Any CU, GS25 or 7-Eleven can recharge it. Hand the card to the cashier and say how much you want to add.

They tap it on a small reader at the register. Takes a few seconds, no app needed.

The catch: it's cash only. Foreign or Korean credit and debit cards don't work for this. Keep some won on you.

Did you get stuck at a subway gate with 0 balance? Full guide: ${withUtm(BLOG, 'threads')}`,
  facebook: `Your credit card won't top up T-money in Korea. Bring cash. 💳❌

At CU, GS25 or 7-Eleven: hand your card to the cashier, say how much (like 10,000 won), and they tap it on a reader. Cash only, even with a Korean card.

📖 Full guide: ${withUtm(BLOG, 'facebook')}

#KoreaTravel #TmoneyCard #KoreaTips`,
  short: (p) => `Your credit card won't top up T-money in Korea. At CU, GS25 or 7-Eleven, hand the cashier your card and cash, say the amount, done. Cash only, even with Korean cards.

📖 ${withUtm(BLOG, p)}`
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const stamp = 'tmoney-20261010';
  const files = ['tmoney_reel.mp4', ...[1, 2, 3, 4, 5, 6].map((n) => `img${n}.jpg`)];
  log.section('미디어 호스팅 (landinkorea.com/sns-media)');
  const urls = await uploadMediaFiles(files.map((f) => ({
    buffer: fs.readFileSync(path.join(DIR, f)), relativePath: `${stamp}/${f}`
  })));
  const [videoUrl, ...imageUrls] = urls;

  const jobs = {
    instagram: { text: TEXT.instagram, videoUrl },
    facebook: { text: TEXT.facebook, imageUrls },
    threads: { text: TEXT.threads, imageUrls },
    bluesky: { text: TEXT.short('bluesky'), imageUrls: imageUrls.slice(0, 4), blogUrl: BLOG },
    mastodon: { text: `${TEXT.short('mastodon')}\n\n#KoreaTravel #Korea`, imageUrls: imageUrls.slice(0, 4), blogUrl: BLOG },
    tumblr: { text: TEXT.short('tumblr'), imageUrls, blogUrl: BLOG }
  };

  const results = {};
  for (const [platform, payload] of Object.entries(jobs)) {
    log.section(`${platform} 발행`);
    try {
      const res = await PLATFORMS[platform].publish(payload);
      results[platform] = res ? (res.id || res.uri || res.url || 'ok') : 'FAILED';
      if (!res) process.exitCode = 1;
    } catch (err) {
      results[platform] = `FAILED: ${err.response?.data?.error?.message || err.message}`;
      process.exitCode = 1;
    }
    log.ok(`${platform}: ${JSON.stringify(results[platform])}`);
    await wait(3000);
  }
  console.log('TMONEY_RESULTS_JSON=' + JSON.stringify({ videoUrl, imageUrls, results }));
};

main();

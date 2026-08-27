#!/usr/bin/env node
// 한국관광공사 실시간 혼잡도 예측 데이터(TatsCnctrRateService)를 소재로 한 영상 게시글 발행.
// 공공데이터 4개 API 연결을 실제로 검증한 뒤, 그 데이터를 실제 캡션 본문에 반영하는
// 첫 실사용 사례 — 지어낸 수치가 아니라 그 시점 실제 API 응답값을 그대로 쓴다.
// 영상 파일 자체는 TourAPI가 제공하지 않으므로(Odii도 이미지+오디오이지 영상이 아님)
// 계속 Pexels를 시각 자료 폴백으로 쓰되, 최근 사용한 영상과는 겹치지 않게 한다.
require('dotenv').config();
const log = require('../lib/logger');
const { fetchCrowdForecast, buildCrowdContentAngles, AREA } = require('../lib/ingestion/tour_crowd');
const { findKoreaVideo } = require('../lib/ingestion/pexels_video');
const { curateContent } = require('../lib/curation/curate');
const { PLATFORMS } = require('../lib/publishing');
const { getPermalink } = require('../lib/publishing/permalink');
const { getRecentVideoUrls, recordVideoUrl } = require('../lib/scheduler/topic_rotation');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const seed = Number(process.argv[2] || 0);

  log.section('한국관광공사 실시간 혼잡도 예측 데이터 조회');
  const items = await fetchCrowdForecast();
  if (!items) {
    log.err('혼잡도 예측 데이터를 가져오지 못해 중단합니다.');
    process.exit(1);
  }
  const angles = buildCrowdContentAngles(items);
  if (!angles) {
    log.err('데이터는 받았지만 각도를 만들 수 없습니다 (busiest === quietest).');
    process.exit(1);
  }
  const content = angles[seed % angles.length];
  log.ok(content);

  const rawItem = {
    source: 'Crowd forecasts for popular attractions',
    author: 'Korea Tourism Organization (TourAPI)',
    url: 'https://english.visitkorea.or.kr',
    content
  };

  log.section('영상 소스 확보 (Pexels 폴백 — TourAPI는 영상 파일을 제공하지 않음)');
  const recentVideoUrls = getRecentVideoUrls();
  const videoUrl = await findKoreaVideo(process.env.PEXELS_API_KEY, `${AREA.label} palace tourists`, recentVideoUrls);
  if (!videoUrl) {
    log.err('영상을 찾지 못해 중단합니다.');
    process.exit(1);
  }

  const curated = await curateContent(rawItem, ['threads', 'facebook', 'instagram'], seed);

  const results = {};
  for (const platform of ['threads', 'facebook', 'instagram']) {
    const handler = PLATFORMS[platform];
    const text = curated[platform];
    log.section(`${platform} 영상 발행`);
    log.ok(text);
    const res = await handler.publish({ text, videoUrl });
    results[platform] = res || { error: 'publish failed' };
    if (!res) { process.exitCode = 1; continue; }

    try {
      await wait(3000);
      const permalinkData = await getPermalink(platform, res.id);
      results[platform].permalink = permalinkData.permalink || permalinkData.permalink_url || null;
      log.ok(`${platform} 실제 URL: ${results[platform].permalink}`);
    } catch (err) {
      log.warn(`${platform} permalink 조회 실패: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  if (!process.exitCode) recordVideoUrl(videoUrl);

  console.log('CROWD_VIDEO_RESULTS_JSON=' + JSON.stringify({ videoUrl, content, results }));
};

main();

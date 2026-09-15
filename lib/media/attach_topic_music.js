const fs = require('fs');
const log = require('../logger');
const { findMusic: findOpenverseMusic } = require('../ingestion/openverse_music');
const { findMusic: findInstagramSoundLibraryMusic } = require('../ingestion/instagram_sound_library');
const { attachMusicToVideo, cleanupMergedVideo } = require('./mix_audio');
const { findMusicForTopic } = require('./topic_music');
const { uploadMediaFile } = require('../publishing/github_raw_host');

// lib/scheduler/queue_topic.js와 동일한 이유로 환경변수화(PARALLELIZATION_RISKS.md 2-2-1).
const MEDIA_HOST_REPO = process.env.MEDIA_HOST_REPO || 'solusupport-bot/desktop-tutorial';

/**
 * Instagram Reels(Pexels 무음 영상)에 주제에 어울리는 무드의 배경음악을 입힌다
 * (2026-08-31 사용자 요청: "인스타에 음악이 안들어가서 허전한게 느껴저 내 주제에
 * 맞는음악이 넣어줬으면"). Openverse(가입/키 불필요, 상업적 이용+변형 가능 라이선스만
 * 필터링)에서 무드에 맞는 곡을 찾아 ffmpeg로 합성한 뒤 raw.githubusercontent.com으로
 * 호스팅한다. 음원 검색/합성/호스팅 중 어느 단계든 실패하거나 GITHUB_TOKEN이 없으면
 * null을 반환해 원본 무음 영상 그대로 발행한다 — 음악 없이 올리는 게 아예 안 올리는
 * 것보다 낫다는 기존 원칙과 동일.
 *
 * 2026-09-13: daily-auto-post.js와 publish-video-test.js(수동 테스트 발행) 양쪽에서
 * 같은 로직을 써야 해서 공용 모듈로 뽑았다 — 두 곳에 복사하면 나중에 무드 매칭
 * 우선순위를 또 고칠 때 한쪽만 고치는 실수가 생기기 쉽다.
 */
const attachTopicMusic = async (video, item, githubToken, captionText, recentMusicUrls = []) => {
  if (!githubToken) return null;
  const music = (await findMusicForTopic(findOpenverseMusic, item, recentMusicUrls))
    || (await findInstagramSoundLibraryMusic(null, recentMusicUrls));
  if (!music) return null;

  const mergedPath = await attachMusicToVideo(video, music.url, captionText);
  if (!mergedPath) return null;

  try {
    const buffer = fs.readFileSync(mergedPath);
    const hostedUrl = await uploadMediaFile(
      MEDIA_HOST_REPO, githubToken, buffer, `videos/${Date.now()}-instagram.mp4`
    );
    // CC 라이선스 음원(Openverse)만 표기 의무가 있어 attribution이 채워져 온다 —
    // 고정 Instagram 사운드 라이브러리는 attribution이 null이라 캡션에 곡명을 남기지 않는다.
    return { videoUrl: hostedUrl, musicUrl: music.url, attribution: music.attribution ? `🎵 ${music.attribution}` : null };
  } catch (err) {
    log.err(`합성 영상 호스팅 실패, 음악 없이 발행: ${err.response?.data?.message || err.message}`);
    return null;
  } finally {
    cleanupMergedVideo(mergedPath);
  }
};

module.exports = { attachTopicMusic };

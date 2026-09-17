// scripts/daily-auto-post.js의 실제 "한 주제를 큐에 등록하는" 파이프라인 전체
// (이미지/영상 수집 -> 워터마크 -> 배경음악 -> 8플랫폼 큐레이션 -> 큐 등록)를
// 재사용 가능하게 뽑아낸 모듈. daily-auto-post.js(자동 로테이션)와
// scripts/queue-custom-topic.js(대시보드에서 지정한 특정 주제 즉시 실행)가
// 둘 다 이 모듈의 queueOneTopic을 그대로 호출한다 — 로직 중복 없음.
//
// 2026-09-16: origin에 있던 두 가지 개선을 반영(rebase로 뒤늦게 발견) —
// (1) 영상 검색어를 TOPIC_QUERIES의 각도별 변형으로 seed 순환(반복 노출 완화),
// (2) 배경음악 로직을 lib/media/attach_topic_music.js 공용 모듈로 사용(Openverse 우선).
const fs = require('fs');
const log = require('../logger');
const { fetchTopicImages, TOPIC_QUERIES } = require('../ingestion/pexels_image');
const { findKoreaVideo } = require('../ingestion/pexels_video');
const { findCuratedVideo } = require('../ingestion/curated_video');
const { findKoreaPhotoPixabay } = require('../ingestion/pixabay_image');
const { findKoreaVideoPixabay } = require('../ingestion/pixabay_video');
const { findKoreaAttractionPhoto } = require('../ingestion/tour_odii_image');
const { TOPIC_IMAGES } = require('../ingestion/topic_images');
const { watermarkAndHostImages } = require('../media/watermark_images');
const { orderByVividness } = require('../media/image_vividness');
const { attachTopicMusic } = require('../media/attach_topic_music');
const {
  getRecentImageUrls, recordImageUrl, getRecentVideoUrls, recordVideoUrl,
  getRecentMusicUrls, recordMusicUrl
} = require('./topic_rotation');
const { curateContent } = require('../curation/curate');
const { runQualityGate } = require('./quality_gate');
const { addPost } = require('./queue');
const { getBlogLinkForTopic, withUtm, BLOG_HOME_URL } = require('../ingestion/topic_blog_links');

const loadRedditConfig = () => {
  try {
    return JSON.parse(fs.readFileSync('data/reddit_config.json', 'utf8'));
  } catch (err) {
    log.warn('reddit_config.json을 읽을 수 없습니다 — Reddit 발행이 건너뛰어집니다.');
    return null;
  }
};

const getRedditSubreddit = (topic, redditConfig) => {
  if (!redditConfig) return null;
  const config = redditConfig.topics?.[topic];
  if (!config || !config.enabled) return null;
  return config.subreddit;
};

const PLATFORMS = ['threads', 'facebook', 'instagram', 'reddit', 'pinterest', 'bluesky', 'mastodon', 'tumblr'];
const IMAGE_CAROUSEL_TARGET = 5;

// 2026-09-16: 새 계정(다른 주제)을 위해 이 파일을 복제할 때 이 저장소 이름을 안 바꾸면
// 새 계정의 이미지/영상이 계속 이 저장소의 media-assets 브랜치로 잘못 업로드된다
// (PARALLELIZATION_RISKS.md 2-2-1 참고). 환경변수로 뺐지만 기존 자동 실행(.env에
// MEDIA_HOST_REPO가 없는 GitHub Actions)은 기본값이 그대로라 동작이 바뀌지 않는다.
const MEDIA_HOST_REPO = process.env.MEDIA_HOST_REPO || 'solusupport-bot/desktop-tutorial';

const randomTimeInWindow = (now, [startH, endH]) => {
  const todayMidnightUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let startMs = todayMidnightUTC + startH * 3600 * 1000;
  let endMs = todayMidnightUTC + endH * 3600 * 1000;
  if (endMs <= now.getTime()) {
    startMs += 24 * 3600 * 1000;
    endMs += 24 * 3600 * 1000;
  } else if (startMs < now.getTime()) {
    startMs = now.getTime();
  }
  return new Date(startMs + Math.random() * (endMs - startMs));
};

const PLATFORM_PUBLISH_OFFSETS = {
  threads: 0,
  facebook: 5,
  bluesky: 30,
  mastodon: 60,
  reddit: 120,
  pinterest: 180,
  instagram: 10,
  tumblr: 180
};

const withPlatformJitter = (time, platform) => {
  const baseOffsetMinutes = PLATFORM_PUBLISH_OFFSETS[platform] || 0;
  const jitterMinutes = (Math.random() * 6 - 3);
  const totalOffsetMs = (baseOffsetMinutes + jitterMinutes) * 60 * 1000;
  return new Date(time.getTime() + totalOffsetMs);
};

const resolveImages = async (topicName, seed, count, placeKeyword) => {
  const recent = getRecentImageUrls();
  const live = [];

  if (placeKeyword) {
    const tourPhoto = await findKoreaAttractionPhoto(placeKeyword, recent);
    if (tourPhoto) live.push(tourPhoto);
  }

  live.push(...(await fetchTopicImages(topicName, [...recent, ...live], seed, count - live.length)));

  if (live.length < count && process.env.PIXABAY_API_KEY) {
    const used = [...recent, ...live];
    const variants = TOPIC_QUERIES[topicName] || [];
    for (let i = live.length; i < count && variants.length; i += 1) {
      const query = variants[i % variants.length];
      const url = await findKoreaPhotoPixabay(process.env.PIXABAY_API_KEY, query, used);
      if (!url) continue;
      live.push(url);
      used.push(url);
    }
  }

  if (live.length > 0) return live;

  const fallback = TOPIC_IMAGES[topicName];
  if (!fallback) {
    log.warn(`이미지를 하나도 못 구했습니다: ${topicName}`);
    return [];
  }
  if (recent.includes(fallback)) {
    log.warn(`기존 대표 이미지도 최근에 이미 사용됨 → 중복을 감수하고 사용: ${topicName}`);
  } else {
    log.warn(`Pexels 실패 → 기존 대표 이미지로 대체: ${topicName}`);
  }
  return [fallback];
};

/**
 * 주제 하나를 실제 파이프라인(이미지/영상 수집 -> 워터마크 -> 배경음악 -> 8플랫폼
 * 큐레이션 -> 큐 등록)에 태운다. topicAndSeed = { topic, seed } — 어떤 주제를 어떤
 * seed로 처리할지는 호출부가 결정한다.
 */
const queueOneTopic = async ({ topic: item, seed }, window) => {
  log.ok(`주제 선택: ${item.source} (구간 ${window[0]}~${window[1]}시)`);

  const resolvedImages = await resolveImages(item.source, seed, IMAGE_CAROUSEL_TARGET, item.placeKeyword);
  const images = await orderByVividness(resolvedImages);
  images.forEach(recordImageUrl);

  const watermarkedImages = await watermarkAndHostImages(images, MEDIA_HOST_REPO, process.env.GITHUB_TOKEN);

  // 2026-09-13: 영상 검색어가 주제당 1개 고정이라 같은 주제가 재등장할 때마다 매번
  // 똑같은 검색을 반복해 후보 풀이 금방 바닥난다 — 이미지처럼 TOPIC_QUERIES의 각도
  // 변형을 seed로 순환시켜 검색어 자체를 다양화한다. 등록 안 된 주제만 주제명 그대로 사용.
  const videoQueryVariants = TOPIC_QUERIES[item.source];
  const videoQuery = videoQueryVariants
    ? videoQueryVariants[seed % videoQueryVariants.length]
    : item.source.replace(/\(.*?\)/g, '').trim();
  const recentVideos = getRecentVideoUrls();
  // 2026-09-17: 실시간 검색은 "한국인지"만 확인하고 "주제랑 실제로 맞는지"는 확인
  // 못 해 오매칭 위험이 있다(실측: 지하철 주제에 성당 영상) — 사람이 미리 검증한
  // 영상(data/curated_videos.json)이 있으면 항상 그걸 최우선으로 쓴다.
  let video = findCuratedVideo(item.source, recentVideos);
  if (!video) video = await findKoreaVideo(process.env.PEXELS_API_KEY, videoQuery, recentVideos);
  if (!video && process.env.PIXABAY_API_KEY) {
    video = await findKoreaVideoPixabay(process.env.PIXABAY_API_KEY, videoQuery, recentVideos);
  }
  if (video) recordVideoUrl(video);

  const curated = await curateContent(item, PLATFORMS, seed);

  // 2026-09-17: Claude(콘텐츠 생성)와 다른 AI(Gemini, 검증)로 이중 검증한다 —
  // 통과하면 이 배치 전체를 approved:true로 등록해 사람 검수를 건너뛴다(자동화
  // 목표). GEMINI_API_KEY가 없거나 판정이 실패면 qualityGate는 null/pass:false로
  // 남아 기존처럼 approved:false(사람 검수)로 떨어진다 — 안전한 기본값 유지.
  const qualityGate = await runQualityGate(item.source, curated.threads || curated.instagram || Object.values(curated)[0]);

  const now = new Date();
  const baseTime = randomTimeInWindow(now, window);

  const rawBlogLink = getBlogLinkForTopic(item.source);
  const blogUrl = withUtm(rawBlogLink, 'facebook');
  const hasSpecificPost = blogUrl !== withUtm(BLOG_HOME_URL, 'facebook');
  const blogUrlByPlatform = (platform) => withUtm(rawBlogLink, platform);

  let instagramVideo = video;
  let instagramMusicAttribution = null;
  if (video) {
    const captionText = (curated.instagram || '').split('\n\n')[0] || null;
    const musicResult = await attachTopicMusic(video, item, process.env.GITHUB_TOKEN, captionText, getRecentMusicUrls());
    if (musicResult) {
      instagramVideo = musicResult.videoUrl;
      instagramMusicAttribution = musicResult.attribution;
      recordMusicUrl(musicResult.musicUrl);
    }
  }

  const mediaByPlatform = {
    facebook: { imageUrls: watermarkedImages },
    threads: watermarkedImages.length > 0 ? { imageUrls: watermarkedImages } : {},
    instagram: instagramVideo ? { videoUrl: instagramVideo } : { imageUrls: watermarkedImages },
    reddit: {},
    pinterest: watermarkedImages.length > 0 ? { imageUrls: [watermarkedImages[0]] } : {},
    bluesky: watermarkedImages.length > 0 ? { imageUrls: watermarkedImages.slice(0, 4) } : {},
    mastodon: watermarkedImages.length > 0 ? { imageUrls: watermarkedImages.slice(0, 4) } : {},
    tumblr: watermarkedImages.length > 0 ? { imageUrls: watermarkedImages.slice(0, 4) } : {}
  };

  const redditConfig = loadRedditConfig();

  for (const platform of PLATFORMS) {
    const media = mediaByPlatform[platform] || {};
    const TEXT_ONLY_OK = ['reddit', 'bluesky', 'mastodon', 'tumblr'];
    if (!TEXT_ONLY_OK.includes(platform) && !(media.imageUrls && media.imageUrls.length) && !media.videoUrl) {
      log.warn(`[${platform}] 사용할 미디어가 없어 큐 등록을 건너뜁니다: ${item.source}`);
      continue;
    }

    if (platform === 'reddit') {
      const subreddit = getRedditSubreddit(item.source, redditConfig);
      if (!subreddit) {
        log.warn(`[reddit] 설정된 subreddit이 없어 건너뜁니다: ${item.source}`);
        continue;
      }
    }

    const scheduledAt = withPlatformJitter(baseTime, platform).toISOString();
    let text = curated[platform];
    if (platform === 'threads') {
      text = `${text}\n\n📖 More on the blog — link in bio.`;
    } else if (platform === 'facebook') {
      text = `${text}\n\n📖 ${hasSpecificPost ? 'Full breakdown' : 'More on the blog'}: ${blogUrl}`;
    } else if (platform === 'instagram' && media.videoUrl && instagramMusicAttribution) {
      text = `${text}\n\n${instagramMusicAttribution}`;
    } else if (platform === 'reddit') {
      text = `${text}\n\n📖 Full article: ${blogUrlByPlatform('reddit')}`;
    }

    const postData = {
      text,
      imageUrls: media.imageUrls,
      videoUrl: media.videoUrl,
      platforms: [platform],
      scheduledAt,
      sourceImageUrls: images,
      sourceVideoUrl: video || null
    };

    // 대시보드(dashboard/)의 정보확인/검수 화면이 같은 주제의 8개 플랫폼 초안을
    // 하나의 배치로 묶어 보여주려면 모든 플랫폼에 topic이 있어야 한다.
    postData.topic = item.source;

    // Gemini 품질 게이트 통과분은 approved:true로 등록해 사람 검수를 건너뛴다
    // (자동화 목표). qualityGate가 null(키 없음)이거나 실패면 기존 기본값
    // approved:false 그대로 — 사람이 /review에서 본다.
    if (qualityGate) {
      postData.qualityGate = qualityGate;
      if (qualityGate.pass) postData.approved = true;
    }

    if (platform === 'reddit') {
      postData.subreddit = getRedditSubreddit(item.source, redditConfig);
    }
    if (platform === 'pinterest') {
      postData.blogUrl = blogUrlByPlatform('pinterest');
    }
    if (platform === 'bluesky' || platform === 'mastodon' || platform === 'tumblr') {
      postData.blogUrl = blogUrlByPlatform(platform);
    }

    const queued = addPost(postData);
    const imageCount = (media.imageUrls || []).length;
    const mediaLabel = media.videoUrl
      ? '영상'
      : imageCount > 1 ? `이미지 ${imageCount}장` : imageCount === 1 ? '단일 이미지' : '미디어 없음';
    log.ok(`[${platform}] 큐 등록: ${queued.id} (예약 ${scheduledAt}, ${mediaLabel})`);
  }
};

module.exports = { queueOneTopic, PLATFORMS, IMAGE_CAROUSEL_TARGET };

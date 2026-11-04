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
const { fetchTopicImages, TOPIC_QUERIES, topicQueries } = require('../ingestion/pexels_image');
const { findKoreaVideo } = require('../ingestion/pexels_video');
const { findCuratedVideo } = require('../ingestion/curated_video');
const { findKoreaPhotoPixabay } = require('../ingestion/pixabay_image');
const { findKoreaPhotoUnsplash } = require('../ingestion/unsplash_image');
const { findKoreaVideoPixabay } = require('../ingestion/pixabay_video');
const { findKoreaAttractionPhoto } = require('../ingestion/tour_odii_image');
const { TOPIC_IMAGES } = require('../ingestion/topic_images');
const { verifyMedia, isUsed } = require('../ingestion/media_guard');
const { watermarkAndHostImageVariants } = require('../media/watermark_images');
const { orderByVividness } = require('../media/image_vividness');
const { attachTopicMusic, attachAestheticMontage } = require('../media/attach_topic_music');
const {
  getRecentImageUrls, recordImageUrl, getRecentVideoUrls, recordVideoUrl,
  getRecentMusicUrls, recordMusicUrl
} = require('./topic_rotation');
const { curateContent, videoCaptionLines } = require('../curation/curate');
const { runPublishGates } = require('./quality_gate');
const { addPost } = require('./queue');
const { getBlogLinkForTopic, withUtm, BLOG_HOME_URL } = require('../ingestion/topic_blog_links');
const { applyPlatformLinkRule, ensureVideoAttribution, videoSourceName } = require('./content_rules');

const loadRedditConfig = () => {
  try {
    return JSON.parse(fs.readFileSync('data/reddit_config.json', 'utf8'));
  } catch (err) {
    log.warn('reddit_config.json을 읽을 수 없습니다 — Reddit 발행이 건너뛰어집니다.');
    return null;
  }
};

// 2026-10-16 실측: data/reddit_config.json의 topics 키가 전부 "korea-first-timer-essentials"
// 같은 카테고리 슬러그인데, 여기서는 item.source(주제 전체 문장)로 조회해서 단 한 번도
// 일치한 적이 없었다(api_safety_state.json에 reddit 성공 기록 0건) — reddit이 사실상 완전히
// 죽어 있던 원인. 정확히 일치하는 키가 있으면 그대로 쓰고, 없으면 거주/비자 관련 주제만
// expats로, 나머지는 koreatravel로 보낸다(둘 다 이미 승인된 subreddit).
const getRedditSubreddit = (topic, redditConfig, category) => {
  if (!redditConfig) return null;
  const exact = redditConfig.topics?.[topic];
  if (exact) return exact.enabled ? exact.subreddit : null;
  const text = `${topic} ${category || ''}`.toLowerCase();
  if (/visa|bank account|housing|goshiwon|officetel|deposit|\barc\b|expat|resident/.test(text)) return 'expats';
  return 'koreatravel';
};

// 2026-10-11: Pinterest 앱이 아직 Trial 등급이라 모든 발행 시도가 매번
// "Apps with Trial access may not create Pins in production"로 실패한다
// (api_safety_state.json에 consecutiveFailures 19 누적 확인, 성공 0건).
// Standard 등급 승급 승인되면([[project_landinkorea_pinterest_trial_pending]])
// 다시 추가할 것 — 그 전까지 큐에 넣어봐야 100% 헛발질이다.
const { isPlatformPaused } = require('./paused_platforms');
const PLATFORMS = ['threads', 'facebook', 'instagram', 'reddit', 'bluesky', 'mastodon', 'tumblr']
  .filter((platform) => !isPlatformPaused(platform));
// 2026-10-13: 모든 플랫폼이 사진 1장만 쓴다(mediaByPlatform의 slice(0, 1)). 5장을 모아 전부 비전 확인하면
// 무료 한도(분당 2~3장)를 5배로 쓰고 통과한 4장은 쓰지도 않고 사용 기록에 올라가 버려졌다.
// 캐러셀을 다시 쓰게 되면 늘릴 것.
const IMAGE_CAROUSEL_TARGET = 1;

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

const collectImageCandidates = async (topicName, seed, count, placeKeyword, exclude) => {
  const recent = [...getRecentImageUrls(), ...exclude];
  const live = [];

  if (placeKeyword) {
    const tourPhoto = await findKoreaAttractionPhoto(placeKeyword, recent);
    if (tourPhoto) live.push(tourPhoto);
  }

  live.push(...(await fetchTopicImages(topicName, [...recent, ...live], seed, count - live.length)));

  // 2026-10-18: 사용자 지적("무료 툴만 쓰면 완성도가 떨어지지 않냐") 대응 — Pexels로
  // 못 채운 나머지를 Unsplash(큐레이션 품질이 대체로 더 좋음)로 먼저 보충하고, 그래도
  // 부족하면 기존 Pixabay로 넘어간다. UNSPLASH_ACCESS_KEY 없으면 조용히 건너뜀.
  if (live.length < count && process.env.UNSPLASH_ACCESS_KEY) {
    const used = [...recent, ...live];
    const variants = topicQueries(topicName);
    for (let i = live.length; i < count && variants.length; i += 1) {
      const query = variants[i % variants.length];
      const url = await findKoreaPhotoUnsplash(process.env.UNSPLASH_ACCESS_KEY, query, used);
      if (!url) continue;
      live.push(url);
      used.push(url);
    }
  }

  if (live.length < count && process.env.PIXABAY_API_KEY) {
    const used = [...recent, ...live];
    const variants = topicQueries(topicName);
    for (let i = live.length; i < count && variants.length; i += 1) {
      const query = variants[i % variants.length];
      const url = await findKoreaPhotoPixabay(process.env.PIXABAY_API_KEY, query, used);
      if (!url) continue;
      live.push(url);
      used.push(url);
    }
  }

  if (live.length > 0) return live;

  const fallbackList = TOPIC_IMAGES[topicName];
  if (!fallbackList || !fallbackList.length) {
    log.warn(`이미지를 하나도 못 구했습니다: ${topicName}`);
    return [];
  }
  // 2026-10-02: 폴백 후보가 여러 장이면 아직 안 쓴 것부터 고른다 — 예전엔 폴백이
  // 문자열 1개뿐이라 recent에 있어도 그냥 재사용했고, 이게 "같은 주제가 돌아올
  // 때마다 똑같은 사진"으로 사용자에게 중복으로 보이던 원인이었다.
  const unused = fallbackList.find((url) => !isUsed(recent, url));
  if (unused) {
    log.warn(`Pexels/Pixabay 실패 → 기존 대표 이미지 후보 중 미사용분으로 대체: ${topicName}`);
    return [unused];
  }
  // 2026-10-12 사용자 하드룰 "중복 이미지·영상도 안 됨" — 예전엔 여기서 중복을 감수하고 재사용했다.
  log.warn(`기존 대표 이미지 후보(${fallbackList.length}장)도 전부 이미 사용됨 → 중복 금지라 이미지 없이 진행: ${topicName}`);
  return [];
};

// 2026-10-12 사용자 하드룰 "확인을 하고 올려": 모은 후보를 하나씩 실제로 보고(media_guard)
// 한국·주제 일치·선명함을 통과한 것만 쓴다. 탈락분은 제외하고 검색어 각도를 바꿔 최대 3번 다시 모은다.
const resolveImages = async (topicName, seed, count, placeKeyword) => {
  const verified = [];
  const rejected = [];
  // 사진 1장만 쓰게 된 뒤 라운드당 후보도 1장이라 3장만 보고 포기했다(10/13 주제 3개 전부 사진 없음) —
  // 검색어 각도를 바꿔가며 최대 6장까지 본다.
  for (let round = 0; round < 6 && verified.length < count; round += 1) {
    const candidates = await collectImageCandidates(topicName, seed + round, count - verified.length, placeKeyword, [...verified, ...rejected]);
    if (!candidates.length) break;
    for (const url of candidates) {
      if (await verifyMedia(url, topicName)) verified.push(url);
      else rejected.push(url);
    }
  }
  if (!verified.length) log.warn(`확인을 통과한 이미지가 없습니다: ${topicName}`);
  return verified;
};

/**
 * 주제 하나를 실제 파이프라인(이미지/영상 수집 -> 워터마크 -> 배경음악 -> 8플랫폼
 * 큐레이션 -> 큐 등록)에 태운다. topicAndSeed = { topic, seed } — 어떤 주제를 어떤
 * seed로 처리할지는 호출부가 결정한다.
 */
const queueOneTopic = async ({ topic: item, seed }, window, platforms = PLATFORMS) => {
  platforms = platforms.filter((platform) => !isPlatformPaused(platform));
  log.ok(`주제 선택: ${item.source} (구간 ${window[0]}~${window[1]}시)`);

  const resolvedImages = await resolveImages(item.source, seed, IMAGE_CAROUSEL_TARGET, item.placeKeyword);
  const images = await orderByVividness(resolvedImages);
  images.forEach(recordImageUrl);

  // 2026-09-13: 영상 검색어가 주제당 1개 고정이라 같은 주제가 재등장할 때마다 매번
  // 똑같은 검색을 반복해 후보 풀이 금방 바닥난다 — 이미지처럼 TOPIC_QUERIES의 각도
  // 변형을 seed로 순환시켜 검색어 자체를 다양화한다. 등록 안 된 주제만 주제명 그대로 사용.
  // 2026-11-04 실측: 검색어를 하나만 써 보고 포기해, 다른 검색어로는 영상이 있는 주제도
  // Instagram에서 "미디어 없음"으로 탈락했다. seed 순서로 시작해 변형을 전부 시도한다.
  const queryVariants = TOPIC_QUERIES[item.source] || [item.source.replace(/\(.*?\)/g, '').trim()];
  const videoQueries = queryVariants.map((_, i) => queryVariants[(seed + i) % queryVariants.length]);
  const recentVideos = getRecentVideoUrls();
  // 2026-09-17: 실시간 검색은 "한국인지"만 확인하고 "주제랑 실제로 맞는지"는 확인
  // 못 해 오매칭 위험이 있다(실측: 지하철 주제에 성당 영상) — 사람이 미리 검증한
  // 영상(data/curated_videos.json)이 있으면 항상 그걸 최우선으로 쓴다.
  // 2026-10-12: 어느 경로로 찾았든 대표 프레임을 실제로 보고(media_guard) 통과한 영상만 쓴다.
  // 2026-10-18: 아웃라이어 리서치(outlier_structure_library.md 카테고리 G) 근거 —
  // 실물 출연 없이 터진 영상은 전부 영상 1개가 아니라 여러 짧은 클립을 이어붙인
  // 몽타주였다. Instagram은 미학 몽타주 모드로 전환하기로 사용자가 결정(2026-10-18)
  // 했으므로, 기존처럼 영상 1개에서 멈추지 않고 최대 MONTAGE_CLIP_TARGET개까지
  // 계속 찾는다. 2개 미만이면(소재가 희귀한 주제) 아래에서 기존 단일 영상 경로로
  // 자동 대체된다 — 이 배열 자체는 다른 플랫폼에 영향 없음(video = videos[0]).
  // 2026-10-18 실측: 5개 목표로 돌리다 Groq 무료 비전 API 일일 한도(200,000 TPD)를
  // 소진해 Instagram이 "미디어 없음"으로 반려됐다(영상이 없어서가 아니라 검증 자체가
  // 막혀서). 클립마다 verifyMedia 호출 1회씩 쓰므로 3으로 낮춰 부담을 줄인다.
  const MONTAGE_CLIP_TARGET = 3;
  const videos = [];
  const rejectedVideos = [];
  for (let attempt = 0; attempt < 10 && videos.length < MONTAGE_CLIP_TARGET; attempt += 1) {
    const exclude = [...recentVideos, ...rejectedVideos, ...videos];
    let candidate = findCuratedVideo(item.source, exclude);
    for (const query of videoQueries) {
      if (candidate) break;
      candidate = await findKoreaVideo(process.env.PEXELS_API_KEY, query, exclude);
      if (!candidate && process.env.PIXABAY_API_KEY) {
        candidate = await findKoreaVideoPixabay(process.env.PIXABAY_API_KEY, query, exclude);
      }
    }
    if (!candidate) break;
    if (await verifyMedia(candidate, item.source, { isVideo: true })) videos.push(candidate);
    else rejectedVideos.push(candidate);
  }
  const video = videos[0] || null;
  videos.forEach(recordVideoUrl);

  let curated = await curateContent(item, PLATFORMS, seed);

  // 2026-09-17: Claude(콘텐츠 생성)와 다른 AI(Gemini, 검증)로 이중 검증한다.
  // 2026-10-02 실측: addPost()의 approved 기본값이 9/18부터 true로 바뀌어 있어서,
  // 이 게이트가 실패해도(qualityGate.pass===false) 그 결과를 반영할 코드가
  // 어디에도 없었다 — approved:true가 그대로 살아남아 품질게이트가 사실상
  // 장식이었다(/review 검수 대기함이 항상 비어 있던 이유). 같은 주제로 캡션을
  // 다시 써서 최대 2번 더 시도하고, 그래도 떨어지면 아래에서 명시적으로
  // status:'rejected' 처리한다 — "사람이 검수 안 해도 나쁜 글은 안 나간다"가
  // 목표지, 사람 검수를 대체하는 게 목표가 아니다.
  const MAX_QUALITY_RETRIES = 2;
  let qualityGate = await runPublishGates(item.source, curated, item.content);
  let qualityAttempts = 1;
  while (qualityGate && !qualityGate.pass && qualityAttempts <= MAX_QUALITY_RETRIES) {
    log.warn(`품질 게이트 미통과(${qualityAttempts}/${MAX_QUALITY_RETRIES} 재시도) — 캡션 재생성: ${qualityGate.reason}`);
    curated = await curateContent(item, PLATFORMS, seed + qualityAttempts);
    qualityGate = await runPublishGates(item.source, curated, item.content);
    qualityAttempts += 1;
  }
  // 걸린 플랫폼 목록이 있으면(금액·후킹 게이트) 그 플랫폼만 반려하고, 없으면(주제·문장 게이트) 전부 반려한다.
  const failedPlatforms = qualityGate && !qualityGate.pass ? qualityGate.failedPlatforms : null;
  const isRejected = (platform) => !!qualityGate && !qualityGate.pass
    && (!failedPlatforms || !failedPlatforms.length || failedPlatforms.includes(platform));

  const now = new Date();
  const baseTime = randomTimeInWindow(now, window);

  const rawBlogLink = getBlogLinkForTopic(item.source);
  const blogUrl = withUtm(rawBlogLink, 'facebook');
  const hasSpecificPost = blogUrl !== withUtm(BLOG_HOME_URL, 'facebook');
  const blogUrlByPlatform = (platform) => withUtm(rawBlogLink, platform);

  let instagramVideo = video;
  let instagramMusicAttribution = null;
  // 2026-10-18 사용자 결정("인스타/틱톡/유튜브는 미학 위주로 전환"): 클립이 2개 이상
  // 모이면 몽타주 경로를 쓴다 — 희귀 소재라 1개뿐이면 기존 정보형 단일 영상 경로로
  // 자연스럽게 내려간다(회귀 없음).
  if (videos.length >= 2) {
    const hookLine = `${item.source.replace(/\(.*?\)/g, '').trim()} 🇰🇷`;
    const montageResult = await attachAestheticMontage(videos, item, process.env.GITHUB_TOKEN, hookLine, getRecentMusicUrls());
    if (montageResult) {
      instagramVideo = montageResult.videoUrl;
      instagramMusicAttribution = montageResult.attribution;
      recordMusicUrl(montageResult.musicUrl);
    }
  } else if (video) {
    const captionLines = videoCaptionLines(curated.instagram);
    const musicResult = await attachTopicMusic(video, item, process.env.GITHUB_TOKEN, captionLines, getRecentMusicUrls());
    if (musicResult) {
      instagramVideo = musicResult.videoUrl;
      instagramMusicAttribution = musicResult.attribution;
      recordMusicUrl(musicResult.musicUrl);
    }
  }

  const variants = await watermarkAndHostImageVariants(
    images, MEDIA_HOST_REPO, process.env.GITHUB_TOKEN, [{}]
  );
  const watermarkedImages = variants[0];

  const mediaByPlatform = {
    facebook: { imageUrls: watermarkedImages.slice(0, 1) },
    // Threads 캐로셀은 이미지마다 컨테이너 생성과 상태 조회가 반복돼 API 호출이 크게
    // 늘어난다. 계정 보호를 위해 워터마크 이미지 한 장만 사용한다.
    threads: watermarkedImages.length > 0 ? { imageUrls: watermarkedImages.slice(0, 1) } : {},
    // 인스타그램은 영상 전용 하드룰 — 영상이 없으면 사진으로 대체하지 않고
    // missingMedia로 떨어뜨려 눈에 보이는 반려 행을 남긴다 (사진 발행 금지).
    instagram: instagramVideo ? { videoUrl: instagramVideo } : {},
    reddit: {},
    pinterest: watermarkedImages.length > 0 ? { imageUrls: [watermarkedImages[0]] } : {},
    bluesky: watermarkedImages.length > 0 ? { imageUrls: watermarkedImages.slice(0, 1) } : {},
    mastodon: watermarkedImages.length > 0 ? { imageUrls: watermarkedImages.slice(0, 1) } : {},
    tumblr: watermarkedImages.length > 0 ? { imageUrls: watermarkedImages.slice(0, 1) } : {}
  };

  const redditConfig = loadRedditConfig();

  for (const platform of platforms) {
    const media = mediaByPlatform[platform] || {};
    // 2026-10-15: instagram은 TEXT_ONLY_OK에 없는 유일한 플랫폼이라, 미디어 검증이
    // 전부 실패하면 예전엔 여기서 바로 continue해 큐 행 자체를 안 만들었다 — 반려
    // 기록도 안 남아 queue.json에서 흔적을 못 찾았다(오늘 실측). 품질게이트 반려와
    // 같은 패턴으로 "보이는 반려" 행을 만들도록 바꾼다.
    const TEXT_ONLY_OK = ['threads', 'facebook', 'reddit', 'bluesky', 'mastodon', 'tumblr'];
    const missingMedia = !TEXT_ONLY_OK.includes(platform) && !(media.imageUrls && media.imageUrls.length) && !media.videoUrl;
    const redditSubreddit = platform === 'reddit' ? getRedditSubreddit(item.source, redditConfig, item.category) : null;
    const missingSubreddit = platform === 'reddit' && !redditSubreddit;

    const scheduledAt = withPlatformJitter(baseTime, platform).toISOString();
    let text = applyPlatformLinkRule(platform, curated[platform], item.source);
    if (platform === 'facebook') {
      text = `${text}\n\n📖 ${hasSpecificPost ? 'Full breakdown' : 'More on the blog'}: ${blogUrl}`;
    } else if (platform === 'instagram' && media.videoUrl) {
      text = ensureVideoAttribution(text, video);
      if (instagramMusicAttribution) text = `${text}\n\n${instagramMusicAttribution}`;
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
      sourceVideoUrl: video || null,
      videoAttribution: media.videoUrl && video ? videoSourceName(video) : null
    };

    // 대시보드(dashboard/)의 정보확인/검수 화면이 같은 주제의 8개 플랫폼 초안을
    // 하나의 배치로 묶어 보여주려면 모든 플랫폼에 topic이 있어야 한다.
    postData.topic = item.source;

    if (qualityGate) {
      postData.qualityGate = qualityGate;
      if (qualityGate.pass) postData.approved = true;
    }
    // addPost()의 approved 기본값이 true라서, 재시도까지 거쳐 품질 게이트를 끝내
    // 통과 못한 배치는 approved를 그대로 두면 안 올라가야 할 글이 그냥 올라간다 —
    // status를 명시적으로 rejected로 박아서(대시보드 "반려" 버튼과 동일한 값)
    // claimDuePosts()/enforce-sns-content-rules.js가 이미 걸러내게 한다.
    if (missingMedia) {
      postData.status = 'rejected';
      postData.rejectedBy = 'no-media';
      postData.rejectedAt = new Date().toISOString();
      postData.rejectReason = '검증 통과한 사진/영상 없음';
    } else if (missingSubreddit) {
      postData.status = 'rejected';
      postData.rejectedBy = 'no-subreddit';
      postData.rejectedAt = new Date().toISOString();
      postData.rejectReason = `주제에 설정된 subreddit 없음: ${item.source}`;
    } else if (isRejected(platform)) {
      postData.status = 'rejected';
      postData.rejectedBy = 'auto-quality-gate';
      postData.rejectedAt = new Date().toISOString();
    }

    if (platform === 'reddit' && redditSubreddit) {
      postData.subreddit = redditSubreddit;
    }
    if (platform === 'threads' || platform === 'facebook' || platform === 'pinterest') {
      postData.blogUrl = blogUrlByPlatform(platform);
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

#!/usr/bin/env node
/**
 * scripts/engage-other-posts.js
 *
 * 남의 게시물(우리 계정 글이 아닌)에 문맥 맞는 댓글을 달아 블로그로 자연스러운
 * 유입을 유도한다. CLAUDE.md "다른 계정 게시물 자동 댓글" 절에서 사용자가 이미
 * 리스크를 감수하고 상시 자동 파이프라인으로 가기로 결정한 바 있음 — 단, 그 절의
 * 콘텐츠 안전장치(지어낸 경험담 금지, 상대 언어로 답변, 진짜 팔로우업 톤)는 그대로
 * 유지한다.
 *
 * "발견(discovery)"은 공식 검색/타임라인 API가 열려있는 세 곳만 쓴다 — Bluesky(AT
 * Protocol 로그인 검색), Reddit(OAuth script app), Mastodon(해시태그 타임라인).
 * Threads/Instagram/Facebook은 임의의 타 계정 글을 API로 검색하는 기능이 없어서
 * 대상에서 제외했다(2026-11-05).
 *
 * 2026-11-05 실측 교훈: "planning a trip to korea" 같은 포괄 키워드는 실제 질문하는
 * 여행자보다 우리와 같은 한국여행 콘텐츠/블로그 계정 글을 더 많이 찾아낸다. 키워드를
 * 질문형 문장으로 좁히고(data/engagement_keywords.json), 물음표/조언 요청 표현이 없는
 * 글은 looksLikeAQuestion()로 한 번 더 거른다.
 *
 * 실제 API 호출로 올리는 거라 "사람처럼 보이려고 미리 다른 글을 둘러보는" 위장은
 * 의미가 없다(브라우저 흔적이 아예 없음) — 대신 챙기는 건: ① 댓글 내용이 매번
 * 진짜로 다르고 사실에 근거할 것, ② 간격을 api_safety.js로 제한하고 그 안에서도
 * 무작위 지터를 둬서 기계적으로 똑같은 주기로 찍히지 않을 것.
 *
 * 사용법:
 *   node scripts/engage-other-posts.js                 # 기본 dry-run (게시 안 함, 미리보기만)
 *   node scripts/engage-other-posts.js --live           # 실제로 댓글을 게시
 *   node scripts/engage-other-posts.js --platform bluesky --live
 *   node scripts/engage-other-posts.js --max 1 --live   # 이번 실행에서 플랫폼당 최대 1건
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { searchBlueskyPosts, replyToBlueskyPost } = require('../lib/publishing/bluesky');
const { searchReddit, postRedditComment } = require('../lib/publishing/reddit');
const { searchMastodonByHashtag, replyToMastodonStatus, getOwnHandle } = require('../lib/publishing/mastodon');
const { draftComment } = require('../lib/ai/comment_draft');
const { canPublishNow, recordPublishResult } = require('../lib/scheduler/api_safety');
const { isPlatformPaused } = require('../lib/scheduler/paused_platforms');
const { getBlogLinkForTopic, withUtm } = require('../lib/ingestion/topic_blog_links');

const TOPIC_BANK = require('../data/topic_bank.json');
const KEYWORDS_CONFIG = require('../data/engagement_keywords.json');
const LOG_PATH = path.join(__dirname, '..', 'data', 'engagement_log.json');
const MAX_SEEN_PER_PLATFORM = 500;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = { platform: 'all', live: false, max: KEYWORDS_CONFIG.maxCandidatesPerRun || 3 };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--live') opts.live = true;
    else if (args[i] === '--platform') { opts.platform = args[i + 1]; i += 1; }
    else if (args[i] === '--max') { opts.max = Number(args[i + 1]); i += 1; }
  }
  return opts;
};

const loadLog = () => {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch (_) {
    return { bluesky: { seen: [] }, reddit: { seen: [] }, mastodon: { seen: [] } };
  }
};

/**
 * 2026-11-05: 포괄 키워드("planning a trip to korea")가 실제 질문하는 여행자보다
 * 우리와 같은 한국여행 콘텐츠/블로그 계정 글을 더 많이 걸러낸 게 실측으로 확인돼서
 * (koreaplainly.bsky.social, listingal.bsky.social 등) 추가한 필터. 물음표나 진짜
 * 조언을 구하는 표현이 없으면 "질문이 아니라 홍보/안내 글"로 보고 건너뛴다.
 */
const QUESTION_SIGNAL = KEYWORDS_CONFIG.requireQuestionSignal
  ? new RegExp(KEYWORDS_CONFIG.questionSignalPattern, 'i')
  : null;
const looksLikeAQuestion = (text) => !QUESTION_SIGNAL || QUESTION_SIGNAL.test(text || '');

const saveLog = (state) => {
  fs.writeFileSync(LOG_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
};

const markSeen = (state, platform, id) => {
  state[platform] ||= { seen: [] };
  state[platform].seen.push(id);
  if (state[platform].seen.length > MAX_SEEN_PER_PLATFORM) {
    state[platform].seen = state[platform].seen.slice(-MAX_SEEN_PER_PLATFORM);
  }
};

/** 게시물 본문에 등장하는 단어로 topic_bank에서 관련 사실 1~2개 + 블로그 링크 후보를 찾는다. */
const findFactsFor = (postText, platform) => {
  const lower = (postText || '').toLowerCase();
  const matched = TOPIC_BANK.find((entry) => {
    const topicWords = entry.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return topicWords.some((w) => lower.includes(w));
  });
  if (!matched) return { facts: [], blogUrl: null };
  const facts = matched.content.slice(0, 2);
  const blogUrl = withUtm(getBlogLinkForTopic(matched.topic), platform, 'engagement_comment');
  return { facts, blogUrl };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 매번 똑같은 간격으로 찍히지 않게 하는 작은 무작위 지터 — 위장용이 아니라
 * ops/local-cron의 기존 지터 관행(건별 최대 50분)과 같은 취지의 축소판이다. */
const jitter = (minMs, maxMs) => sleep(minMs + Math.random() * (maxMs - minMs));

const runBluesky = async ({ live, max, logState }) => {
  log.section('Bluesky — 다른 계정 글 찾기');
  const ownHandle = (process.env.BLUESKY_IDENTIFIER || '').replace(/\.bsky\.social$/, '').toLowerCase();
  const seen = new Set(logState.bluesky?.seen || []);
  const candidates = [];
  for (const keyword of KEYWORDS_CONFIG.keywords) {
    try {
      const posts = await searchBlueskyPosts({ query: keyword, limit: 15 });
      candidates.push(...posts);
    } catch (err) {
      log.warn(`Bluesky 검색 실패 ("${keyword}"): ${err.message}`);
    }
  }
  const unique = [];
  const dedupe = new Set();
  for (const c of candidates) {
    if (dedupe.has(c.uri)) continue;
    dedupe.add(c.uri);
    if (seen.has(c.uri)) continue;
    if (c.author && c.author.toLowerCase().includes(ownHandle) && ownHandle) continue;
    if (!looksLikeAQuestion(c.text)) continue;
    unique.push(c);
  }
  log.ok(`후보 ${unique.length}건 (중복/본인 글/질문 신호 없음/이미 처리됨 제외)`);

  const picked = unique.slice(0, max);
  for (const post of picked) {
    const { facts, blogUrl } = findFactsFor(post.text, 'bluesky');
    const draft = await draftComment({ postText: post.text, facts, blogUrl });
    if (!draft) {
      log.warn(`댓글 초안 생성 실패: ${post.permalink}`);
      continue;
    }

    log.step(`@${post.author}: "${post.text.slice(0, 80)}"`);
    log.step(`-> [${draft.language}] ${draft.comment}`);
    log.post(post.permalink);

    if (!live) {
      log.info('[DRY RUN] 게시하지 않음 — 위 댓글은 미리보기입니다.');
      continue;
    }

    const gate = canPublishNow('bluesky_comment');
    if (!gate.allowed) {
      log.warn(`Bluesky 댓글 한도/간격 미충족 — 이번엔 건너뜀 (${gate.reason})`);
      break;
    }
    const result = await replyToBlueskyPost({ uri: post.uri, cid: post.cid, text: draft.comment });
    recordPublishResult('bluesky_comment', Boolean(result));
    if (result) {
      markSeen(logState, 'bluesky', post.uri);
      saveLog(logState);
    }
    await jitter(20000, 70000);
  }
};

const runReddit = async ({ live, max, logState }) => {
  log.section('Reddit — 다른 계정 글 찾기');
  if (isPlatformPaused('reddit')) {
    log.warn('Reddit이 일시 중지 상태입니다(lib/scheduler/paused_platforms.js) — 발행 방식이 고장난 원인을 먼저 고칠 것. 건너뜁니다.');
    return;
  }
  const ownUsername = (process.env.REDDIT_USERNAME || '').toLowerCase();
  const seen = new Set(logState.reddit?.seen || []);
  const query = KEYWORDS_CONFIG.keywords.join(' OR ');
  const posts = await searchReddit({ subreddits: KEYWORDS_CONFIG.redditSubreddits, query, limit: 10 });

  const unique = [];
  const dedupe = new Set();
  for (const p of posts) {
    if (dedupe.has(p.id)) continue;
    dedupe.add(p.id);
    if (seen.has(p.id)) continue;
    if (ownUsername && p.author && p.author.toLowerCase() === ownUsername) continue;
    const haystack = `${p.title} ${p.selftext}`.toLowerCase();
    if (KEYWORDS_CONFIG.excludeIfContains.some((bad) => haystack.includes(bad))) continue;
    if (!looksLikeAQuestion(`${p.title} ${p.selftext}`)) continue;
    unique.push(p);
  }
  log.ok(`후보 ${unique.length}건 (중복/본인 글/제외 키워드/질문 신호 없음/이미 처리됨 제외)`);

  const picked = unique.slice(0, max);
  for (const post of picked) {
    const postText = `${post.title}\n${post.selftext}`;
    const { facts, blogUrl } = findFactsFor(postText, 'reddit');
    const draft = await draftComment({ postText, facts, blogUrl });
    if (!draft) {
      log.warn(`댓글 초안 생성 실패: ${post.permalink}`);
      continue;
    }

    log.step(`r/${post.subreddit} @${post.author}: "${post.title}"`);
    log.step(`-> [${draft.language}] ${draft.comment}`);
    log.post(post.permalink);

    if (!live) {
      log.info('[DRY RUN] 게시하지 않음 — 위 댓글은 미리보기입니다.');
      continue;
    }

    const gate = canPublishNow('reddit_comment');
    if (!gate.allowed) {
      log.warn(`Reddit 댓글 한도/간격 미충족 — 이번엔 건너뜀 (${gate.reason})`);
      break;
    }
    const result = await postRedditComment({ thingId: post.id, text: draft.comment });
    recordPublishResult('reddit_comment', Boolean(result));
    if (result) {
      markSeen(logState, 'reddit', post.id);
      saveLog(logState);
    }
    await jitter(20000, 70000);
  }
};

const runMastodon = async ({ live, max, logState }) => {
  log.section('Mastodon — 다른 계정 글 찾기');
  const ownAcct = (await getOwnHandle()) || '';
  const seen = new Set(logState.mastodon?.seen || []);
  const candidates = [];
  for (const hashtag of KEYWORDS_CONFIG.mastodonHashtags || []) {
    try {
      const posts = await searchMastodonByHashtag({ hashtag, limit: 20 });
      candidates.push(...posts);
    } catch (err) {
      log.warn(`Mastodon #${hashtag} 조회 실패: ${err.response?.data?.error || err.message}`);
    }
  }
  const unique = [];
  const dedupe = new Set();
  for (const c of candidates) {
    if (dedupe.has(c.id)) continue;
    dedupe.add(c.id);
    if (seen.has(c.id)) continue;
    if (ownAcct && c.author && c.author.toLowerCase() === ownAcct.toLowerCase()) continue;
    if (!looksLikeAQuestion(c.text)) continue;
    unique.push(c);
  }
  log.ok(`후보 ${unique.length}건 (중복/본인 글/질문 신호 없음/이미 처리됨 제외)`);

  const picked = unique.slice(0, max);
  for (const post of picked) {
    const { facts, blogUrl } = findFactsFor(post.text, 'mastodon');
    const draft = await draftComment({ postText: post.text, facts, blogUrl });
    if (!draft) {
      log.warn(`댓글 초안 생성 실패: ${post.permalink}`);
      continue;
    }

    log.step(`@${post.author}: "${post.text.slice(0, 80)}"`);
    log.step(`-> [${draft.language}] ${draft.comment}`);
    log.post(post.permalink);

    if (!live) {
      log.info('[DRY RUN] 게시하지 않음 — 위 댓글은 미리보기입니다.');
      continue;
    }

    const gate = canPublishNow('mastodon_comment');
    if (!gate.allowed) {
      log.warn(`Mastodon 댓글 한도/간격 미충족 — 이번엔 건너뜀 (${gate.reason})`);
      break;
    }
    const result = await replyToMastodonStatus({ statusId: post.id, text: draft.comment });
    recordPublishResult('mastodon_comment', Boolean(result));
    if (result) {
      markSeen(logState, 'mastodon', post.id);
      saveLog(logState);
    }
    await jitter(20000, 70000);
  }
};

/** 한 플랫폼이 터져도 나머지 플랫폼은 이번 실행에서 계속 돌게 한다(2026-11-05 실측 —
 * Mastodon에서 Groq 에러로 전체 프로세스가 죽어서 뒤에 올 플랫폼이 통째로 스킵됐었다). */
const runSafely = async (name, fn) => {
  try {
    await fn();
  } catch (err) {
    log.err(`${name} 실행 중 실패, 다음 플랫폼으로 계속 진행: ${err.message}`);
  }
};

const main = async () => {
  const opts = parseArgs();
  log.section(`다른 게시물 댓글 자동화 — ${opts.live ? '실제 게시' : 'DRY RUN (미리보기만)'}`);
  const logState = loadLog();

  if (opts.platform === 'all' || opts.platform === 'bluesky') {
    await runSafely('Bluesky', () => runBluesky({ live: opts.live, max: opts.max, logState }));
  }
  if (opts.platform === 'all' || opts.platform === 'reddit') {
    await runSafely('Reddit', () => runReddit({ live: opts.live, max: opts.max, logState }));
  }
  if (opts.platform === 'all' || opts.platform === 'mastodon') {
    await runSafely('Mastodon', () => runMastodon({ live: opts.live, max: opts.max, logState }));
  }

  if (!opts.live) {
    log.info('실제로 게시하려면 --live 를 붙여서 다시 실행하세요.');
  }
};

main().catch((err) => {
  log.err(`실패: ${err.message}`);
  process.exitCode = 1;
});

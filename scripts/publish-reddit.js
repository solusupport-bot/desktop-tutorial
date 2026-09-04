#!/usr/bin/env node

/**
 * scripts/publish-reddit.js
 * Reddit 포스트를 content/reddit-posts 디렉토리에서 읽어서 발행합니다.
 *
 * 사용법:
 *   node scripts/publish-reddit.js                    # 모든 Reddit 포스트 발행
 *   node scripts/publish-reddit.js korea-arrival      # 특정 포스트만 발행 (파일명 부분 일치)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const log = require('../lib/logger');
const { publishToReddit } = require('../lib/publishing/reddit');

const REDDIT_POSTS_DIR = path.join(__dirname, '../content/reddit-posts');

const parseMarkdownWithFrontmatter = (content) => {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  let frontmatter = {};
  let body = content;

  if (frontmatterMatch) {
    try {
      frontmatter = yaml.load(frontmatterMatch[1]) || {};
      body = content.replace(frontmatterMatch[0], '');
    } catch (e) {
      log.warn(`⚠️ Frontmatter 파싱 실패: ${e.message}`);
    }
  }

  return { frontmatter, body };
};

const extractTitle = (content) => {
  const titleMatch = content.match(/^#\s+(.+?)$/m);
  return titleMatch ? titleMatch[1].trim() : null;
};

const extractBody = (content) => {
  return content.replace(/^#\s+.+?$/m, '').trim();
};

const publishRedditPost = async (filePath) => {
  try {
    const filename = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseMarkdownWithFrontmatter(content);

    const subreddit = frontmatter.subreddit;
    const title = extractTitle(body);
    const text = extractBody(body);

    if (!subreddit) {
      throw new Error(`frontmatter에 subreddit이 없습니다`);
    }
    if (!title) {
      throw new Error(`# 헤더 제목을 찾을 수 없습니다`);
    }
    if (!text) {
      throw new Error(`본문이 비어있습니다`);
    }

    log.info(`📤 Reddit 발행 중: r/${subreddit} | ${filename}`);
    const result = await publishToReddit({
      subreddit,
      title,
      text
    });

    log.info(`✅ Reddit 발행 완료: ${result.url}`);
    return result;
  } catch (error) {
    log.error(`❌ Reddit 발행 실패 (${path.basename(filePath)}): ${error.message}`);
    throw error;
  }
};

const main = async () => {
  try {
    const filterArg = process.argv[2];

    if (!fs.existsSync(REDDIT_POSTS_DIR)) {
      throw new Error(`Reddit 포스트 디렉토리가 없습니다: ${REDDIT_POSTS_DIR}`);
    }

    let files = fs.readdirSync(REDDIT_POSTS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(REDDIT_POSTS_DIR, f));

    if (filterArg) {
      files = files.filter(f => f.includes(filterArg));
      if (files.length === 0) {
        throw new Error(`일치하는 Reddit 포스트를 찾을 수 없습니다: ${filterArg}`);
      }
    }

    log.info(`📋 Reddit 포스트 발행 시작 (${files.length}개 파일)`);
    const results = [];

    for (const file of files) {
      try {
        const result = await publishRedditPost(file);
        results.push(result);
      } catch (error) {
        // 오류가 발생했지만 계속 진행
        log.error(`⚠️ ${path.basename(file)} 발행 실패, 계속 진행...`);
      }
    }

    log.info(`\n📊 Reddit 발행 결과:`);
    log.info(`✅ 성공: ${results.length}/${files.length}`);

    if (results.length > 0) {
      results.forEach(r => {
        log.info(`   - r/${r.subreddit}: ${r.url}`);
      });
    }

    process.exit(results.length === files.length ? 0 : 1);
  } catch (error) {
    log.error(`❌ 발행 오류: ${error.message}`);
    process.exit(1);
  }
};

main();

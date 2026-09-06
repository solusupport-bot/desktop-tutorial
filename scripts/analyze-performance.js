#!/usr/bin/env node
/**
 * SNS Content Performance Analyzer
 * Purpose: Synthesize weekly performance data into category recommendations
 *
 * Usage: npm run analyze:performance
 * This script reads data/platform_performance.json and generates:
 * - Which content categories are performing best by platform
 * - Recommended publishing cadence adjustments
 * - Question performance insights (which CTAs drive replies)
 * - Week-over-week trend analysis (requires multiple weeks of data)
 */

const fs = require('fs');
const log = require('../lib/logger');

const performanceFile = 'data/platform_performance.json';
const questionPerformanceFile = 'data/question_performance.json';

const loadPerformance = () => {
  try {
    return JSON.parse(fs.readFileSync(performanceFile, 'utf8'));
  } catch (err) {
    log.err(`Failed to load ${performanceFile}: ${err.message}`);
    return null;
  }
};

const loadQuestionPerformance = () => {
  try {
    return JSON.parse(fs.readFileSync(questionPerformanceFile, 'utf8'));
  } catch (err) {
    log.warn(`Question performance data not available: ${err.message}`);
    return null;
  }
};

const analyzeCategoryPerformance = () => {
  const perf = loadPerformance();
  if (!perf) return;

  console.log('\n📊 CONTENT CATEGORY PERFORMANCE ANALYSIS');
  console.log('='.repeat(70));
  console.log(`Last Updated: ${perf.last_updated}\n`);

  const PLATFORMS = Object.keys(perf).filter((k) => k !== 'last_updated' && k !== 'note');

  const categoryPerformance = {};

  PLATFORMS.forEach((platform) => {
    if (!perf[platform].by_category) return;

    const categories = perf[platform].by_category;
    Object.entries(categories).forEach(([category, metrics]) => {
      if (!categoryPerformance[category]) {
        categoryPerformance[category] = {
          platforms: [],
          avg_views: 0,
          peak_views: 0,
          total_platforms: 0
        };
      }
      if (metrics.peak_views > 0) {
        categoryPerformance[category].platforms.push({
          platform,
          peak_views: metrics.peak_views,
          avg_views: metrics.avg_views,
          engagement_rate: metrics.engagement_rate
        });
        categoryPerformance[category].peak_views = Math.max(
          categoryPerformance[category].peak_views,
          metrics.peak_views
        );
        categoryPerformance[category].avg_views += metrics.avg_views;
        categoryPerformance[category].total_platforms += 1;
      }
    });
  });

  // Sort by peak performance
  const sorted = Object.entries(categoryPerformance)
    .sort((a, b) => b[1].peak_views - a[1].peak_views)
    .filter(([, data]) => data.peak_views > 0);

  if (sorted.length === 0) {
    console.log('⏳ No performance data available yet.');
    console.log('   Run `npm run review:performance` every Friday to collect data.\n');
    return;
  }

  console.log('🎯 RANKINGS (by peak views)\n');

  sorted.forEach(([category, data], idx) => {
    const trend = idx === 0 ? '🔥 HIGHEST' : idx === sorted.length - 1 ? '📉 LOWEST' : '→';
    console.log(`${idx + 1}. ${trend} ${category.toUpperCase()}`);
    console.log(`   Peak views: ${data.peak_views} | Avg: ${(data.avg_views / data.total_platforms).toFixed(0)}`);
    console.log(`   Strongest on: ${data.platforms.map((p) => p.platform).join(', ')}\n`);
  });

  console.log('='.repeat(70));
  console.log('\n💡 RECOMMENDATIONS\n');

  if (sorted[0]) {
    const topCategory = sorted[0][0];
    console.log(`✅ INCREASE: Publish ${topCategory} 2x per week (currently 1x)`);
  }

  if (sorted[1]) {
    const secondCategory = sorted[1][0];
    console.log(`✓ MAINTAIN: Keep ${secondCategory} at current cadence (1x/week)`);
  }

  if (sorted[sorted.length - 1]) {
    const bottomCategory = sorted[sorted.length - 1][0];
    console.log(`⚠️  DEPRIORITIZE: ${bottomCategory} to supplementary slot (reduce to 2x/month)\n`);
  }

  console.log('📋 IMPLEMENTATION CHECKLIST');
  console.log('  ☐ Update content publishing calendar');
  console.log('  ☐ Brief content team on top performers');
  console.log('  ☐ Add genre-specific hooks to curate.js PROMISE_OPENERS');
  console.log('  ☐ Re-run analysis next Friday\n');
};

const analyzeQuestionPerformance = () => {
  const qperf = loadQuestionPerformance();
  if (!qperf) return;

  console.log('\n❓ QUESTION CTA PERFORMANCE');
  console.log('='.repeat(70));
  console.log(`Last Updated: ${qperf.last_updated}\n`);

  const threads = qperf.threads_questions?.by_question;
  if (threads) {
    console.log('THREADS QUESTIONS (by avg_replies)\n');

    const sortedThreads = Object.entries(threads)
      .filter(([, q]) => q.usage_count > 0)
      .sort((a, b) => b[1].avg_replies - a[1].avg_replies);

    if (sortedThreads.length === 0) {
      console.log('⏳ No question data collected yet.\n');
    } else {
      sortedThreads.forEach(([question, metrics], idx) => {
        console.log(`${idx + 1}. "${question}"`);
        console.log(`   Used: ${metrics.usage_count}x | Avg replies: ${metrics.avg_replies} | Peak: ${metrics.peak_replies}`);
        console.log(`   Strength: ${metrics.strength}\n`);
      });

      const topQuestion = sortedThreads[0]?.[0];
      if (topQuestion) {
        console.log(`💡 INSIGHT: "${topQuestion}" drives most engagement.`);
        console.log('   → Rotate this question more frequently\n');
      }
    }
  }

  const facebook = qperf.facebook_questions?.by_question;
  if (facebook) {
    console.log('FACEBOOK QUESTIONS (by avg_comments)\n');

    const sortedFb = Object.entries(facebook)
      .filter(([, q]) => q.usage_count > 0)
      .sort((a, b) => b[1].avg_comments - a[1].avg_comments);

    if (sortedFb.length > 0) {
      sortedFb.slice(0, 3).forEach(([question, metrics], idx) => {
        console.log(`${idx + 1}. "${question}" | Avg: ${metrics.avg_comments} comments`);
      });
      console.log('');
    }
  }

  console.log('='.repeat(70) + '\n');
};

const generateWeeklyTrends = () => {
  const perf = loadPerformance();
  if (!perf || !perf.weekly_summary) return;

  console.log('\n📈 WEEKLY TRENDS\n');
  console.log('='.repeat(70));

  if (perf.weekly_summary) {
    console.log(`Period: ${perf.weekly_summary.review_period_start} → ${perf.weekly_summary.review_period_end}`);
    console.log(`Top category: ${perf.weekly_summary.top_performing_category}`);
    console.log(`Top platform: ${perf.weekly_summary.top_performing_platform}`);

    if (perf.weekly_summary.recommendations) {
      console.log('\nRecommendations:');
      perf.weekly_summary.recommendations.forEach((r) => {
        console.log(`  • ${r}`);
      });
    }
  } else {
    console.log('⏳ No weekly summary available. Run `npm run review:performance` first.\n');
  }

  console.log('='.repeat(70) + '\n');
};

const showDataHealthCheck = () => {
  const perf = loadPerformance();
  if (!perf) return;

  const PLATFORMS = Object.keys(perf).filter((k) => k !== 'last_updated' && k !== 'note');
  let categoriesWithData = 0;
  let totalCategories = 0;

  PLATFORMS.forEach((platform) => {
    if (!perf[platform].by_category) return;
    Object.values(perf[platform].by_category).forEach((cat) => {
      totalCategories += 1;
      if (cat.peak_views > 0) categoriesWithData += 1;
    });
  });

  console.log('\n📋 DATA HEALTH CHECK\n');
  console.log(`Platforms tracked: ${PLATFORMS.length}`);
  console.log(`Categories with data: ${categoriesWithData}/${totalCategories}`);
  console.log(`Last updated: ${perf.last_updated}`);

  if (categoriesWithData < 5) {
    console.log('\n⚠️  Not enough data for reliable recommendations.');
    console.log('   → Collect at least 2-3 weeks of weekly reviews (10+ data points per category)\n');
  } else {
    console.log('\n✅ Sufficient data for trend analysis\n');
  }
};

const main = () => {
  const command = process.argv[2] || 'full';

  switch (command) {
    case 'categories':
      analyzeCategoryPerformance();
      break;
    case 'questions':
      analyzeQuestionPerformance();
      break;
    case 'trends':
      generateWeeklyTrends();
      break;
    case 'health':
      showDataHealthCheck();
      break;
    case 'full':
      showDataHealthCheck();
      analyzeCategoryPerformance();
      analyzeQuestionPerformance();
      generateWeeklyTrends();
      break;
    default:
      console.log('SNS Content Performance Analyzer');
      console.log('\nUsage: npm run analyze:performance [command]');
      console.log('\nCommands:');
      console.log('  categories  - Analyze content categories by platform');
      console.log('  questions   - Analyze question CTA performance');
      console.log('  trends      - Show week-over-week trends');
      console.log('  health      - Data collection status');
      console.log('  full        - Run all analyses\n');
  }
};

main();

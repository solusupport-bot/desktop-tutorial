#!/usr/bin/env node
/**
 * Weekly SNS Performance Review Helper
 * Purpose: Guide manual data collection for platform_performance.json updates
 *
 * Usage: npm run review:performance
 * This script provides a structured checklist for reviewing posts published 7 days ago
 * across all platforms and recording their actual performance metrics.
 *
 * Data entry instructions (manual, but structured):
 * 1. For each platform, navigate to native analytics (Meta Business Suite, Reddit, etc.)
 * 2. Find posts published exactly 7 days ago
 * 3. Record: views, engagement_rate, category type
 * 4. Update data/platform_performance.json with actual metrics
 * 5. Identify which content category had best peak_views
 * 6. Recommend adjusting next week's publishing cadence toward high-performers
 */

const fs = require('fs');
const log = require('../lib/logger');

const PLATFORMS = ['threads', 'facebook', 'instagram', 'reddit', 'pinterest', 'bluesky', 'mastodon', 'tumblr'];
const CATEGORIES = ['safety_guides', 'practical_tips', 'etiquette', 'day_trips', 'food_guides', 'budget_breakdown'];

const performanceFile = 'data/platform_performance.json';

const loadPerformance = () => {
  try {
    return JSON.parse(fs.readFileSync(performanceFile, 'utf8'));
  } catch (err) {
    log.err(`Failed to load ${performanceFile}: ${err.message}`);
    return null;
  }
};

const generateWeeklyReviewChecklist = () => {
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weeklyReviewDate = sevenDaysAgo.toISOString().split('T')[0];

  console.log('\n📊 WEEKLY SNS PERFORMANCE REVIEW CHECKLIST');
  console.log('='.repeat(60));
  console.log(`📅 Reviewing posts published: ${weeklyReviewDate}\n`);

  console.log('STEP 1: Gather Performance Data\n');
  PLATFORMS.forEach((platform) => {
    console.log(`  ☐ [${platform.toUpperCase()}]`);
    console.log(`    → Navigate to ${getAnalyticsLink(platform)}`);
    console.log(`    → Find posts from ${weeklyReviewDate}`);
    console.log(`    → Record: views, engagement_rate, content_category\n`);
  });

  console.log('\nSTEP 2: Update data/platform_performance.json');
  console.log('  Template for each platform/category:');
  console.log(`  {
    "avg_views": <number>,
    "peak_views": <number>,
    "engagement_rate": <decimal 0-1>,
    "category_type": "high-potential|high-engagement|moderate|growing"
  }\n`);

  console.log('\nSTEP 3: Identify Winners');
  console.log('  ☐ Which platform had highest peak_views?');
  console.log('  ☐ Which content category was strongest?');
  console.log('  ☐ Which question (if tracked) drove most replies?\n');

  console.log('\nSTEP 4: Recommendations for Next Week');
  console.log('  ☐ Increase publishing cadence for top categories');
  console.log('  ☐ Rotate top-performing questions more frequently');
  console.log('  ☐ Note platform algorithm patterns in GROWTH_PLAN.md\n');

  console.log('='.repeat(60));
  console.log('Once complete, run: npm run performance:update\n');
};

const getAnalyticsLink = (platform) => {
  const links = {
    threads: 'Meta Business Suite → Threads → Insights',
    facebook: 'Meta Business Suite → Pages → Insights',
    instagram: 'Meta Business Suite → Instagram → Insights',
    reddit: 'Reddit profile → Posts → Subreddit karma',
    pinterest: 'Pinterest Business → Analytics → Pins',
    bluesky: 'No native analytics (track via blog referrers)',
    mastodon: 'Instance stats (depends on instance)',
    tumblr: 'Tumblr dashboard → Post performance'
  };
  return links[platform] || 'Platform analytics dashboard';
};

const generatePerformanceUpdateTemplate = () => {
  const perf = loadPerformance();
  if (!perf) return;

  console.log('\n📝 DATA ENTRY TEMPLATE\n');
  console.log('Copy this template to data/platform_performance.json and fill in actual numbers:\n');

  const template = {
    last_updated: new Date().toISOString().split('T')[0],
    weekly_summary: {
      review_period_start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      review_period_end: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      top_performing_category: 'FILL IN',
      top_performing_platform: 'FILL IN',
      recommendations: ['FILL IN']
    }
  };

  console.log(JSON.stringify(template, null, 2));
  console.log('\n');
};

const showCurrentMetrics = () => {
  const perf = loadPerformance();
  if (!perf) return;

  console.log('\n📈 CURRENT TRACKING BASELINE\n');
  console.log(JSON.stringify(perf, null, 2));
  console.log('\n');
};

const main = () => {
  const command = process.argv[2] || 'checklist';

  switch (command) {
    case 'checklist':
      generateWeeklyReviewChecklist();
      break;
    case 'template':
      generatePerformanceUpdateTemplate();
      break;
    case 'current':
      showCurrentMetrics();
      break;
    case 'full':
      generateWeeklyReviewChecklist();
      generatePerformanceUpdateTemplate();
      showCurrentMetrics();
      break;
    default:
      console.log('Weekly Performance Review Helper');
      console.log('\nUsage: npm run review:performance [command]');
      console.log('\nCommands:');
      console.log('  checklist - Show review checklist');
      console.log('  template  - Show data entry template');
      console.log('  current   - Show current metrics');
      console.log('  full      - Show everything\n');
  }
};

main();

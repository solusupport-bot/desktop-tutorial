// 2026-11-26 one-off: add "## Official sources" to queued GitLab drafts (validate.py blocks posts without it)
// and park drafts with unresolved fact conflicts in content/drafts/_pending_review/.
const axios = require('axios');
const API = 'https://gitlab.com/api/v4/projects/land-in-korea%2Fland-in-korea-blog';
const H = { headers: { 'PRIVATE-TOKEN': process.env.TOKEN } };
const sources = require('../data/blog_sources_patch.json');
const links = require('../data/topic_blog_links.json');
const PUBLISH = ['Gwangjang Market', 'Hwacheon Sancheoneo', 'Christmas in Korea', 'Gyeongju from Seoul', 'Ttareungyi'];
const HOLD = ['korea-changdeokgung-secret-garden-how-the-timed-huwon-tickets-actually-work',
  'korea-skiing-near-seoul-without-a-car-konjiam-elysian-gangchon-and-shuttle-buses',
  'korea-new-year-s-eve-in-korea-the-bosingak-bell-late-subways-and-first-sunrise-spots',
  'korea-shipping-souvenirs-home-from-a-korean-post-office-ems-small-packets-and-sea-mail',
  'korea-korean-winter-street-food-bungeoppang-hotteok-and-where-the-stalls-went',
  'korea-public-bathhouse-culture-in-korea-beyond-the-jjimjilbang-the-mogyoktang-rules'];
const section = (list) => `## Official sources\n\n${list.map(([n, u]) => `- [${n}](${u})`).join('\n')}\n\nPrices, dates, and hours change. Check the pages above before you go.\n\n`;
(async () => {
  const actions = [];
  for (const p of PUBLISH) {
    const topic = Object.keys(sources).find((t) => t.startsWith(p));
    const slug = links[topic];
    const path = `content/drafts/${slug}.md`;
    const { data: md } = await axios.get(`${API}/repository/files/${encodeURIComponent(path)}/raw?ref=main`, H);
    if (/^## (Official sources|Sources)/m.test(md)) { console.log('already has sources:', slug); continue; }
    const i = md.indexOf('## Frequently Asked Questions');
    const out = i >= 0 ? md.slice(0, i) + section(sources[topic]) + md.slice(i) : md.trimEnd() + '\n\n' + section(sources[topic]);
    actions.push({ action: 'update', file_path: path, content: out });
    console.log('patch', slug);
  }
  for (const slug of HOLD) actions.push({ action: 'move', previous_path: `content/drafts/${slug}.md`, file_path: `content/drafts/_pending_review/${slug}.md` });
  const { data } = await axios.post(`${API}/repository/commits`, { branch: 'main', commit_message: 'chore: add official sources to queued drafts; hold 6 drafts with fact conflicts for correction', actions }, H);
  console.log('commit', data.short_id);
  try {
    const r = await axios.post(`${API}/pipeline_schedules/4525847/play`, {}, H);
    console.log('schedule play:', r.status, JSON.stringify(r.data));
  } catch (e) { console.log('schedule play failed:', e.response && e.response.status, JSON.stringify(e.response && e.response.data)); }
})().catch((e) => { console.error(e.response ? JSON.stringify(e.response.data) : e.message); process.exit(1); });

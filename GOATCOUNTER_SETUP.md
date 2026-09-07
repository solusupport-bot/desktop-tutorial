# GoatCounter Setup Guide

**Purpose:** Track blog traffic by source (Threads, Reddit, Pinterest, etc.) to measure SNS → Blog → (return to SNS) circulation effectiveness.

**Status:** Not yet configured  
**Setup time:** 30 minutes (mostly manual registration)

---

## Why GoatCounter?

- ✅ **Free tier** — unlimited events, no credit card needed
- ✅ **Privacy-first** — no cookies, complies with GDPR/CCPA
- ✅ **Simple integration** — single script tag in blog template
- ✅ **Traffic source tracking** — referrer breakdown by platform
- ✅ **No API cost** — all analytics are free

**Alternatives considered & rejected:**
- Google Analytics: Overkill, requires consent popup
- Plausible: $20/month, unnecessary for hobby blog
- Fathom: $19/month, same reason
- Self-hosted Matomo: Maintenance overhead, not worth it

---

## Step 1: Register Account

1. Go to **https://www.goatcounter.com/** (free signup)
2. Click **"Sign Up"** 
3. Enter email + password
4. Verify email
5. Create a **site code** (e.g., `land-in-korea-blog` or `likorea`)
6. You will see your tracking code:
   ```
   https://YOUR_SITE_CODE.goatcounter.com/count
   ```

**Keep this code safe** — you'll need it in Step 2.

---

## Step 2: Add Tracking Script to Blog Template

### For Static HTML Blog

Add this to the `<head>` section of your blog template (`layout.html` or similar):

```html
<!-- GoatCounter analytics -->
<script data-goatcounter="https://YOUR_SITE_CODE.goatcounter.com/count" 
  async src="//gc.zgo.at/count.js"></script>
```

Replace `YOUR_SITE_CODE` with your actual site code from Step 1.

### For Next.js / React Blog

Add to `pages/_document.js` or your layout component:

```jsx
<Script
  data-goatcounter={`https://YOUR_SITE_CODE.goatcounter.com/count`}
  async
  src="//gc.zgo.at/count.js"
/>
```

### For Jekyll / Hugo / Other Static Generators

Add to your base template (`_layout.html`, `config.toml`, etc.):

```liquid
<!-- GoatCounter analytics -->
<script data-goatcounter="https://YOUR_SITE_CODE.goatcounter.com/count" 
  async src="//gc.zgo.at/count.js"></script>
```

---

## Step 3: Verify Data Collection

1. **Deploy** the updated blog with tracking script
2. **Visit your blog** in a browser (incognito mode to avoid blocking)
3. Click through a few pages
4. Go to **https://YOUR_SITE_CODE.goatcounter.com/stats** to view dashboard
5. Wait 1-2 minutes, then **refresh** — your pageview should appear

**Dashboard shows:**
- Total views today / this week / all-time
- **Referrer breakdown** ← This is the key metric (Threads, Reddit, Pinterest traffic)
- Browser, device, country
- Top pages

---

## Step 4: Store Configuration

Add to `land-in-korea-blog/automation/config.json`:

```json
{
  "goatcounter_code": "YOUR_SITE_CODE",
  "goatcounter_url": "https://YOUR_SITE_CODE.goatcounter.com/count"
}
```

Or set as environment variable:

```bash
export GOATCOUNTER_CODE="YOUR_SITE_CODE"
```

---

## Step 5: Integrate with Weekly Review

Once tracking is live, include GoatCounter data in weekly performance reviews:

```bash
npm run review:performance  # Includes GoatCounter referrer breakdown
```

**Metrics to track weekly:**
- Total blog visits
- Traffic source breakdown (Threads, Reddit, Pinterest, Bluesky, etc.)
- Bounce rate by source
- Return visitor rate (shows if SNS → Blog → Return circulation works)

---

## Dashboard Features

### Real-time View
- Current visitors
- Recent pageviews
- Referrer sources

### Statistics Tab
Shows:
- **Referrers** (breakdown by source domain)
  - `threads.net` = Threads traffic
  - `reddit.com` = Reddit traffic
  - `pinterest.com` = Pinterest traffic
  - etc.
- **Pages** (which blog posts get most traffic)
- **Browsers, devices, countries**

### Export Data
GoatCounter doesn't have built-in export, but you can:
1. Screenshot the referrer breakdown each Friday
2. Manually record in `data/platform_performance.json` under `blog.referrer_breakdown`
3. Or use GoatCounter API (see https://www.goatcounter.com/api)

---

## Troubleshooting

### No data appearing in dashboard

**Check 1:** Is tracking script deployed?
```bash
curl -s https://YOUR_BLOG_URL | grep "goatcounter.com"
# Should show script tag
```

**Check 2:** Browser extensions blocking it?
- Try incognito/private window
- Check browser console for errors
- Whitelist GoatCounter if using privacy extension

**Check 3:** Tracking script syntax?
- Use exact URL: `https://YOUR_SITE_CODE.goatcounter.com/count`
- Replace `YOUR_SITE_CODE` with actual code (no brackets)

---

## Privacy Policy Note

Add to your blog's privacy policy:

> We use GoatCounter for analytics. It does not store cookies and complies with GDPR. No personal data is collected.

---

## Weekly Review Workflow

Once GoatCounter is live:

```bash
# Every Friday:
npm run review:performance      # Platform-specific data checklist
# + Manual GoatCounter check:   # Visit dashboard, record referrer breakdown
npm run review:current          # View current metrics
npm run analyze:performance     # Generate recommendations
```

---

## Reference

- GoatCounter docs: https://www.goatcounter.com/help
- GoatCounter API: https://www.goatcounter.com/api
- Privacy by design: https://www.goatcounter.com/why

---

## Success Criteria

✅ Blog dashboard shows traffic by referrer source  
✅ Referrer data consistent with SNS publishing schedule  
✅ Weekly trending visible (e.g., Reddit posts → spike in reddit.com referrer traffic)  
✅ Return visitor rate tracked (re-circulation measurement)

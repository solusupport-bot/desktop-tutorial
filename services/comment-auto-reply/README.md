# Land in Korea — comment auto-reply bot

Replies to comments on our own Instagram/Facebook posts using real facts from
the 12 topics already published via `lib/ingestion/korea_travel.js`. Runs as
an always-on Flask service (not a GitHub Actions cron job) because Meta pushes
webhook events in real time.

## 1. Deploy to Render

1. Go to https://dashboard.render.com → **New** → **Blueprint**.
2. Connect the `solusupport-bot/desktop-tutorial` GitHub repo. Render reads
   `render.yaml` at the repo root and creates a Web Service scoped to
   `services/comment-auto-reply/` automatically.
3. Render will ask for the env vars marked `sync: false` in `render.yaml`
   before the first deploy — fill in:
   - `VERIFY_TOKEN` — any string you pick yourself (e.g. `landinkorea_verify`).
     You'll paste this same value into Meta's webhook setup in step 3 below.
   - `APP_SECRET` — Meta App Dashboard → **Settings → Basic** → App Secret.
   - `ACCESS_TOKEN` — a Page (for Facebook comments) or Instagram Business
     access token that has the `pages_manage_engagement` /
     `instagram_manage_comments` permission. The `FB_PAGE_ACCESS_TOKEN` /
     `IG_ACCESS_TOKEN` already used by `scheduler.yml` may already carry this
     scope — check under **Graph API Explorer → Permissions** before reusing
     it; if not, regenerate one with that scope added.
   - `GEMINI_API_KEY` — a free-tier key from https://aistudio.google.com/apikey
     (Google account, no billing required for the default rate limits).
     Without it, the bot still replies correctly using the fact-lookup
     fallback in `app.py`, just without Gemini's paraphrasing.
4. Deploy. Render gives you a public URL like
   `https://land-in-korea-comment-bot.onrender.com`.

## 2. Point Meta's webhook at it

1. Meta App Dashboard → **Webhooks** → add a subscription for the
   **Page** (and/or **Instagram**) object.
2. Callback URL: `https://<your-render-url>/webhook`
3. Verify token: the same `VERIFY_TOKEN` value you set in Render.
4. Subscribe to the `feed` field (Facebook Page comments) and/or `comments`
   field (Instagram) — not the whole object, just comments.

## 3. Confirm it's live

Comment on a real post from a test account and check the Render service logs
— you should see either `답글 게시 완료` (posted for real) or, if
`ACCESS_TOKEN` isn't set yet, `[dry-run, ACCESS_TOKEN 미설정]` with the reply
text so you can verify the logic before it goes live.

## Notes

- Rate-limited to 12 replies/hour and a 120s per-commenter cooldown — both in
  `app.py`, adjust `HOURLY_LIMIT` / `USER_COOLDOWN_SECONDS` if needed.
- If a comment doesn't match any topic in `KNOWLEDGE_BASE`, the bot says so
  honestly and links to the blog instead of guessing.
- Render's free plan spins down after inactivity and takes ~30s to wake on
  the next webhook — fine for comment replies, not for anything latency
  sensitive.

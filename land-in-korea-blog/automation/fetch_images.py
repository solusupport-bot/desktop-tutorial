#!/usr/bin/env python3
"""
Fills in a real, high-resolution, Korea-confirmed photo for every post that
has an `image_query` in its front matter but no `image` yet. Mirrors the
same safety logic used for the SNS pipeline (lib/ingestion/pexels_image.js):

  - the actual search sent to Pexels always has " south korea" appended,
    regardless of what image_query says
  - a result is only accepted if Pexels' own photo description (alt)
    mentions korea/korean/seoul/incheon/busan/hanok
  - falls back to relevance-only matching (still Korea-query-biased) only
    if no alt-confirmed photo exists after checking multiple pages
  - requires PEXELS_API_KEY; skips (leaves image_query as-is) if missing

Usage:
  PEXELS_API_KEY=... python3 fetch_images.py
"""
import json
import os
import re
import urllib.request
import urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS_SRC = os.path.join(BASE, "content", "posts")
SEARCH_URL = "https://api.pexels.com/v1/search"
MIN_ORIGINAL_WIDTH = 3000
KOREA_SIGNAL = re.compile(r"korea|korean|seoul|incheon|busan|hanok", re.IGNORECASE)


def search_pexels(api_key, query, page):
    params = urllib.parse.urlencode({"query": query, "per_page": 6, "page": page, "orientation": "landscape"})
    # Pexels rejects Python's default "Python-urllib/x.y" User-Agent with a 403,
    # so a normal browser-ish UA is required alongside the Authorization header.
    headers = {
        "Authorization": api_key,
        "User-Agent": "Mozilla/5.0 (compatible; LandInKoreaBlogBot/1.0)",
    }
    req = urllib.request.Request(f"{SEARCH_URL}?{params}", headers=headers)
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read().decode("utf-8"))
    return data.get("photos", [])


def find_korea_photo(api_key, raw_query):
    query = f"{raw_query} south korea"

    for require_alt_match in (True, False):
        for page in range(1, 6):
            photos = search_pexels(api_key, query, page)
            if not photos:
                break
            for photo in photos:
                if photo["width"] < MIN_ORIGINAL_WIDTH:
                    continue
                alt = photo.get("alt") or ""
                if require_alt_match and not (KOREA_SIGNAL.search(alt) or KOREA_SIGNAL.search(photo.get("url", ""))):
                    continue
                print(f"  -> found ({'Korea-confirmed' if require_alt_match else 'relevance-only'}, "
                      f"{photo['width']}px, alt=\"{alt}\"): {photo['url']}")
                return photo["src"]["large2x"]
    return None


def parse_front_matter(text):
    meta, body = {}, text
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            block = text[3:end].strip()
            body = text[end + 4:]
            for line in block.splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
    return meta, body


def main():
    api_key = os.environ.get("PEXELS_API_KEY")
    if not api_key:
        print("PEXELS_API_KEY not set — skipping image fetch.")
        return

    for fn in sorted(os.listdir(POSTS_SRC)):
        if not fn.endswith(".md"):
            continue
        path = os.path.join(POSTS_SRC, fn)
        with open(path, encoding="utf-8") as f:
            raw = f.read()
        meta, body = parse_front_matter(raw)
        if "image" in meta or "image_query" not in meta:
            continue

        print(f"{fn}: searching \"{meta['image_query']}\"")
        try:
            url = find_korea_photo(api_key, meta["image_query"])
        except Exception as err:  # one post's failure shouldn't block the rest
            print(f"  !! search failed for {fn}: {err}")
            continue
        if not url:
            print(f"  !! no Korea-confirmed image found for {fn}, leaving as text-only for now")
            continue

        end = raw.find("\n---", 3)
        new_raw = f"{raw[:end]}\nimage: {url}{raw[end:]}"
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_raw)
        print(f"  wrote image: to {fn}")


if __name__ == "__main__":
    main()

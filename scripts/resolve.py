# Resolve every model-picked track to a real, embeddable YouTube video.
#
#   search  : yt-dlp flat search (no API quota)
#   validate: YouTube Data API videos.list -> status.embeddable + regionRestriction (1 quota unit / 50 ids)
#
# Results are cached in data/track-cache.json and keyed on "artist :: title", so models that
# converge on the same record cost one lookup, and reruns are free.
import json, io, os, re, sys, time, hashlib
from concurrent.futures import ThreadPoolExecutor

import yt_dlp
import urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
CACHE_PATH = "data/track-cache.json"
API_KEY = os.environ.get("YOUTUBE_API_KEY", "").strip()
if not API_KEY:
    sys.exit("set YOUTUBE_API_KEY")

cache = json.load(io.open(CACHE_PATH, encoding="utf8")) if os.path.exists(CACHE_PATH) else {}

# Junk that ruins a DJ set: hour loops, reactions, sped-up edits, karaoke, full DJ mixes.
BAD = re.compile(
    r"\b(reaction|review|karaoke|instrumental only|tutorial|lyrics video|"
    r"slowed|reverb|sped ?up|nightcore|8d audio|1 ?hour|10 ?hours|full album|"
    r"mixtape|dj ?set|live ?set|full set|megamix|compilation|type beat|cover by)\b", re.I)
LIVE = re.compile(r"\b(live at|live in|live from|concert|tiny desk)\b", re.I)

def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()

def score(cand, artist, title):
    """Higher is better. Rewards title/artist match and sane length."""
    t, ch, dur = cand.get("title") or "", cand.get("channel") or "", cand.get("duration") or 0
    nt, na, nti = norm(t), norm(artist), norm(title)
    s = 0.0
    title_words = [w for w in nti.split() if len(w) > 2] or nti.split()
    if title_words:
        s += 42 * (sum(w in nt for w in title_words) / len(title_words))
    artist_words = [w for w in na.split() if len(w) > 2] or na.split()
    if artist_words:
        hit = sum(w in nt or w in norm(ch) for w in artist_words) / len(artist_words)
        s += 30 * hit
    if BAD.search(t):  s -= 60
    if LIVE.search(t): s -= 18
    if re.search(r"\b(official (video|audio|music video)|original mix)\b", t, re.I): s += 12
    if "topic" in norm(ch): s += 10          # auto-generated artist channels: clean audio, reliably embeddable
    if 100 <= dur <= 900:  s += 16           # 1:40 - 15:00
    elif dur > 1800:       s -= 45           # half hour plus is a mix, not a track
    elif dur and dur < 60: s -= 30
    return s

def search(artist, title, n=12):
    q = f"{artist} {title}"
    opts = {"quiet": True, "no_warnings": True, "skip_download": True,
            "extract_flat": "in_playlist", "default_search": f"ytsearch{n}", "socket_timeout": 30}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(q, download=False)
    except Exception as e:
        return []
    out = []
    for e in (info or {}).get("entries") or []:
        if not e or not e.get("id"):
            continue
        out.append({"videoId": e["id"], "title": e.get("title"), "channel": e.get("channel") or e.get("uploader"),
                    "duration": e.get("duration") or 0})
    return out

def api_status(video_ids):
    """videos.list -> {id: {embeddable, duration_s, title, channel, blocked}}"""
    out = {}
    for i in range(0, len(video_ids), 50):
        chunk = video_ids[i:i + 50]
        url = ("https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails,snippet&id="
               + ",".join(chunk) + "&key=" + API_KEY)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=45) as r:
                    d = json.loads(r.read().decode())
                break
            except Exception:
                if attempt == 2:
                    d = {"items": []}
                time.sleep(1.5 * (attempt + 1))
        for it in d.get("items", []):
            cd, st, sn = it.get("contentDetails", {}), it.get("status", {}), it.get("snippet", {})
            m = re.match(r"P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", cd.get("duration", "") or "")
            secs = 0
            if m:
                dd, hh, mm, ss = (int(x) if x else 0 for x in m.groups())
                secs = dd * 86400 + hh * 3600 + mm * 60 + ss
            rr = cd.get("regionRestriction") or {}
            out[it["id"]] = {
                "embeddable": bool(st.get("embeddable")) and st.get("privacyStatus") == "public"
                              and st.get("uploadStatus") == "processed",
                "duration": secs,
                "title": sn.get("title"),
                "channel": sn.get("channelTitle"),
                # blocked anywhere meaningful, or allow-listed to a short list -> too risky for a public site
                "blocked": bool(rr.get("blocked")) or bool(rr.get("allowed")),
            }
    return out

def start_offset(duration):
    """Where to drop the needle: past the intro, never past the end."""
    if duration <= 90:  return 0
    if duration <= 240: return 20
    if duration <= 420: return 35
    return 50

def resolve_one(key):
    artist, title = key.split(" :: ", 1)
    cands = search(artist, title)
    if not cands:
        return key, {"ok": False, "reason": "no search results"}
    cands.sort(key=lambda c: score(c, artist, title), reverse=True)
    top = cands[:8]
    stat = api_status([c["videoId"] for c in top])
    for c in top:
        s = stat.get(c["videoId"])
        if not s or not s["embeddable"] or s["blocked"]:
            continue
        dur = s["duration"] or c["duration"] or 0
        if dur < 60 or dur > 1200:
            continue
        return key, {"ok": True, "videoId": c["videoId"], "ytTitle": s["title"], "channel": s["channel"],
                     "duration": dur, "startSec": start_offset(dur),
                     "score": round(score(c, artist, title), 1)}
    return key, {"ok": False, "reason": "no embeddable candidate",
                 "tried": [c["videoId"] for c in top]}

# ---- collect every unique track across every raw set -------------------------------------
keys = set()
raw_files = sorted(os.listdir("data/raw"))
for fn in raw_files:
    d = json.load(io.open(f"data/raw/{fn}", encoding="utf8"))
    for t in d["tracks"]:
        keys.add(f"{t['artist'].strip()} :: {t['title'].strip()}")

todo = sorted(k for k in keys if k not in cache or (not cache[k].get("ok") and "--retry" in sys.argv))
print(f"{len(raw_files)} sets · {len(keys)} unique tracks · {len(todo)} to resolve")

done = 0
with ThreadPoolExecutor(max_workers=6) as ex:
    for key, res in ex.map(resolve_one, todo):
        cache[key] = res
        done += 1
        flag = "OK " if res.get("ok") else "-- "
        print(f"{flag}[{done}/{len(todo)}] {key[:58]:<58} {res.get('videoId') or res.get('reason','')}")
        if done % 10 == 0:
            json.dump(cache, io.open(CACHE_PATH, "w", encoding="utf8"), indent=1, ensure_ascii=False)

json.dump(cache, io.open(CACHE_PATH, "w", encoding="utf8"), indent=1, ensure_ascii=False)
ok = sum(1 for v in cache.values() if v.get("ok"))
print(f"\ncache: {ok}/{len(cache)} resolved")

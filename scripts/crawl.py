"""Public-source radar. Standard library only; no tokens, emails or external AI."""
import concurrent.futures
import copy
import hashlib
import json
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "radar.json"
UA = "SportFundRadar/1.0 (+https://github.com/HonzaKud/sportfund-radar-vlasim)"
MAX_BYTES = 2_000_000
locks, robots, robot_guard = {}, {}, threading.Lock()

def plain(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value.lower()) if not unicodedata.combining(c))

FINANCE = re.compile(r"dotac|grant|sponzor|partner|financ|podpor|nadac|vyzv|erasmus|crowdfund|daruj|vybaven|vystroj|puky|investic|skoleni|vzdelav")
SPORT = re.compile(r"hokej|sport|mladez|deti|klub|trener|pohyb")
IGNORE = re.compile(r"prihlas|login|kosik|cart|privacy|cookies|ochrana-osob|facebook|instagram|javascript|mailto")

def safe_url(url):
    p = urllib.parse.urlsplit(url)
    return p.scheme == "https" and bool(p.hostname) and not p.username and not p.password and p.port in (None, 443)

def canonical(url):
    p = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((p.scheme, p.netloc.lower(), p.path.rstrip("/") or "/", p.query, ""))

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.title_on = False
        self.title = ""
        self.texts = []
        self.links = []
        self.anchor = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style", "noscript", "svg"):
            self.skip += 1
        if tag == "title":
            self.title_on = True
        if tag == "a" and attrs.get("href"):
            self.anchor = [attrs["href"], ""]
        if tag == "img" and self.anchor and attrs.get("alt"):
            self.anchor[1] += " " + attrs["alt"]

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg"):
            self.skip = max(0, self.skip - 1)
        if tag == "title":
            self.title_on = False
        if tag == "a" and self.anchor:
            self.links.append(tuple(self.anchor))
            self.anchor = None

    def handle_data(self, value):
        if self.skip:
            return
        value = re.sub(r"\s+", " ", value).strip()
        if not value:
            return
        self.texts.append(value)
        if self.title_on:
            self.title += value
        if self.anchor:
            self.anchor[1] += " " + value

class SecureRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not safe_url(newurl):
            raise ValueError("Unsafe redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

opener = urllib.request.build_opener(SecureRedirect())

def request(url, limit=MAX_BYTES):
    if not safe_url(url):
        raise ValueError("HTTPS required")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"})
    with opener.open(req, timeout=18) as response:
        raw = response.read(limit + 1)
        if len(raw) > limit:
            raise ValueError("Page exceeds size limit")
        mime = response.headers.get_content_type()
        charset = response.headers.get_content_charset()
        if not charset:
            meta = re.search(br'charset\s*=\s*[\x22\x27]?\s*([a-zA-Z0-9_-]+)', raw[:12000], re.I)
            charset = meta.group(1).decode("ascii") if meta else "utf-8"
        try:
            body = raw.decode(charset)
        except (UnicodeDecodeError, LookupError):
            body = raw.decode("windows-1250", errors="replace")
        return body, mime

def allowed(url):
    origin = urllib.parse.urlsplit(url)
    base = origin.scheme + "://" + origin.netloc
    with robot_guard:
        lock = locks.setdefault(base, threading.Lock())
    with lock:
        if base not in robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                body, _ = request(base + "/robots.txt", 500_000)
                rp.parse(body.splitlines())
            except urllib.error.HTTPError as exc:
                if exc.code in (404, 410):
                    rp.parse([])
                else:
                    robots[base] = None
                    return False
            except Exception:
                robots[base] = None
                return False
            robots[base] = rp
        rp = robots[base]
        return rp is not None and rp.can_fetch(UA, url)

def fetch(url):
    if not allowed(url):
        raise ValueError("robots.txt disallows or could not be verified")
    origin = urllib.parse.urlsplit(url).netloc
    with robot_guard:
        lock = locks.setdefault("fetch:" + origin, threading.Lock())
    with lock:
        time.sleep(0.4)
        body, mime = request(url)
    if mime not in ("text/html", "application/xhtml+xml"):
        raise ValueError("Non-HTML source; manual review required")
    page = Page()
    page.feed(body)
    if len(" ".join(page.texts)) < 80:
        raise ValueError("Empty or script-only page")
    return page

def links_for(page, base):
    seen, result = set(), []
    host = urllib.parse.urlsplit(base).netloc
    for href, label in page.links:
        url = canonical(urllib.parse.urljoin(base, href))
        title = label.strip()
        if (safe_url(url) and urllib.parse.urlsplit(url).netloc == host
                and url not in seen and url != canonical(base)
                and 14 <= len(title) <= 220 and FINANCE.search(plain(title))
                and not IGNORE.search(plain(url))
                and not re.search(r"\.(pdf|jpg|png|zip|docx?|xlsx?)(\?|$)", url, re.I)):
            seen.add(url)
            result.append((url, title))
    return result[:4]

def fingerprint(page):
    return hashlib.sha256(" ".join(page.texts).encode()).hexdigest()

def scan(source):
    result = {"sourceId": source["id"], "status": "error", "pages": [], "candidates": [], "errors": []}
    try:
        page = fetch(source["url"])
        result["pages"].append({"url": canonical(source["url"]), "hash": fingerprint(page)})
        result["status"] = "ok"
        for url, title in links_for(page, source["url"]):
            try:
                child = fetch(url)
                result["pages"].append({"url": url, "hash": fingerprint(child)})
                context = plain(" ".join(child.texts))
                if SPORT.search(context) or source["category"] in ("Dotace", "Nadace", "Firmy", "Soutěže"):
                    result["candidates"].append({"url": url, "title": title, "context": context[:60000]})
            except Exception as exc:
                result["errors"].append({"url": url, "reason": type(exc).__name__})
    except Exception as exc:
        result["error"] = str(exc)[:160]
    return result

def signal_from(candidate, source, partners, now):
    text = plain(candidate["title"] + " " + candidate.get("context", ""))
    # A mention is not proof of a relationship: known names are a review flag only.
    known = [p["name"] for p in partners if any(plain(a) in text for a in p["aliases"])]
    if source["category"] in ("Jiné sporty", "Jiné kluby", "Crowdfunding"):
        idea = "Tohle by šlo zkusit i ve Vlašimi: ověřit mechanismus podpory, příjemce a podmínky; potom navrhnout obdobný mládežnický projekt."
    elif source["category"] == "Firmy":
        idea = "Prověřit vztah firmy ke sportu a stávajícím partnerům; připravit návrh věcné či finanční spolupráce."
    else:
        idea = "Ověřit podmínky, aktuální ročník a způsobilost vlašimského hokeje v původním zdroji."
    score = min(79, 35 + (20 if SPORT.search(text) else 0) + (15 if "hokej" in text else 0) + (9 if "vlasim" in text else 0))
    return {"id": hashlib.sha256(candidate["url"].encode()).hexdigest()[:16],
            "title": candidate["title"], "url": candidate["url"], "sourceId": source["id"],
            "firstFound": now, "lastChecked": now, "status": "unreviewed",
            "score": score, "idea": idea, "knownMentions": known,
            "note": "Automatický podnět; datum nálezu není datum zveřejnění. Termín, částka a vhodnost nebyly potvrzeny."}

def apply_results(data, results, now):
    old = {s["sourceId"]: s for s in data.get("sourceChecks", [])}
    sources = {s["id"]: s for s in data["sources"]}
    signals = {s["id"]: s for s in data.get("signals", [])}
    curated_urls = {canonical(s["url"]) for s in data["sources"]}
    checks = []
    for result in results:
        sid = result["sourceId"]
        previous = old.get(sid, {})
        checked = {"sourceId": sid, "status": result["status"], "attemptedAt": now,
                   "lastSuccess": now if result["status"] == "ok" else previous.get("lastSuccess"),
                   "pages": result["pages"] if result["status"] == "ok" else previous.get("pages", []),
                   "errors": result["errors"], "error": result.get("error")}
        checks.append(checked)
        for candidate in result["candidates"]:
            if candidate["url"] in curated_urls:
                continue
            sig = signal_from(candidate, sources[sid], data["partners"], now)
            if sig["id"] in signals:
                existing = signals[sig["id"]]
                existing["lastChecked"] = now
                existing["title"] = sig["title"]
            else:
                signals[sig["id"]] = sig
        if result["status"] != "ok":
            continue
        before = {p["url"]: p["hash"] for p in previous.get("pages", [])}
        root = canonical(sources[sid]["url"])
        after = {p["url"]: p["hash"] for p in result["pages"]}
        changed = root in before and before[root] != after.get(root)
        for item in data["opportunities"]:
            if sid not in item["sourceIds"]:
                continue
            # Network checks and human fact validation deliberately stay separate.
            if item["sourceIds"][0] == sid:
                item["lastChecked"] = now
            if changed:
                item["needsReview"] = True
                item["history"].append({"date": now, "event": sources[sid]["name"] + ": změna obsahu, ověřit podmínky."})
    for item in data["opportunities"]:
        if item["deadline"] and item["deadline"] < now[:10] and item["status"] in ("open", "verify"):
            item["status"] = "closed"
            item["history"].append({"date": now, "event": "Uplynul evidovaný termín; záznam zůstává v historii."})
    data["sourceChecks"] = checks
    data["signals"] = sorted(signals.values(), key=lambda s: (s["firstFound"], s["score"]), reverse=True)
    success = sum(r["status"] == "ok" for r in results)
    run = {"at": now, "sources": len(results), "ok": success, "failed": len(results)-success,
           "pages": sum(len(r["pages"]) for r in results), "signals": len(signals)}
    data["lastRun"] = run
    data.setdefault("runs", []).append(run)
    data["generatedAt"] = now
    return data

def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(scan, data["sources"]))
    data = apply_results(data, results, now)
    tmp = DATA.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(DATA)
    print(json.dumps(data["lastRun"]))
    if data["lastRun"]["ok"] == 0:
        raise SystemExit("No public source was reachable; deployment cancelled.")

if __name__ == "__main__":
    main()


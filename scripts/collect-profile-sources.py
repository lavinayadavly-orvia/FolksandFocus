"""Discover public professional source links. Never infer account ownership from footers."""
import argparse
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

AGENT = 'DOLNodesResearch/1.0'


def now():
    return datetime.now(timezone.utc).isoformat()


def name_key(value):
    return re.sub(r'[^a-z]', '', re.sub(r'\b(dr|prof|professor)\b', '', str(value).lower()))


def platform(url):
    host = urllib.parse.urlsplit(url).hostname or ''
    host = host.lower().removeprefix('www.')
    for label, domains in [('X', ['x.com', 'twitter.com']), ('YouTube', ['youtube.com', 'youtu.be', 'youtube-nocookie.com']), ('Instagram', ['instagram.com']), ('LinkedIn', ['linkedin.com', 'in.linkedin.com'])]:
        if host in domains:
            return label
    return None


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.schemas = []
        self.script = None
        self.json_text = []
        self.title = []
        self.in_title = False

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'title':
            self.in_title = True
        if tag == 'script':
            self.script = attrs.get('type', '')
            self.json_text = []
        if tag in ['a', 'iframe']:
            url = attrs.get('href' if tag == 'a' else 'src', '')
            if platform(url):
                self.links.append({'url': url, 'platform': platform(url), 'locator': tag, 'relationship': 'PAGE_LINK_OWNERSHIP_UNCONFIRMED'})

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)
        if self.script == 'application/ld+json':
            self.json_text.append(data)

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag == 'script':
            if self.script == 'application/ld+json':
                try:
                    self.schemas.append(json.loads(''.join(self.json_text)))
                except (ValueError, TypeError):
                    pass
            self.script = None


def objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from objects(child)


def extract(body, name):
    page = Page()
    page.feed(body)
    links = page.links[:]
    for obj in objects(page.schemas):
        types = obj.get('@type', [])
        types = [types] if isinstance(types, str) else types if isinstance(types, list) else []
        if 'Person' in types and name_key(obj.get('name', '')) == name_key(name):
            values = obj.get('sameAs', [])
            values = [values] if isinstance(values, str) else values
            for url in values if isinstance(values, list) else []:
                if isinstance(url, str) and platform(url):
                    links.append({'url': url, 'platform': platform(url), 'locator': 'Person.sameAs', 'relationship': 'PERSON_SCHEMA_ACCOUNT_CANDIDATE'})
        if 'VideoObject' in types:
            url = obj.get('embedUrl') or obj.get('contentUrl')
            if isinstance(url, str) and platform(url):
                links.append({'url': url, 'platform': platform(url), 'locator': 'VideoObject', 'title': str(obj.get('name', ''))[:220], 'dateAsReported': obj.get('uploadDate'), 'relationship': 'INSTITUTIONAL_VIDEO_CANDIDATE'})
    unique = {}
    for link in links:
        url = urllib.parse.urlsplit(link['url'])
        if url.scheme != 'https' or url.username or url.password:
            continue
        # Keep video query identifiers, but discard marketing trackers.
        query = urllib.parse.urlencode([(k, v) for k, v in urllib.parse.parse_qsl(url.query) if k in ['v', 'list']])
        link['url'] = urllib.parse.urlunsplit((url.scheme, url.netloc, url.path.rstrip('/'), query, ''))
        link.update(reviewStatus='REVIEW_REQUIRED', nativePostVerified=False)
        unique[(link['url'], link['relationship'])] = link
    return {'title': ' '.join(page.title)[:300], 'links': list(unique.values())}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url):
    parts = urllib.parse.urlsplit(url)
    url = urllib.parse.urlunsplit((parts.scheme, parts.netloc,
        urllib.parse.quote(parts.path, safe="/%:@!$&'()*+,;=-._~"),
        urllib.parse.quote(parts.query, safe="%:@!$&'()*+,;=/?-._~"), ''))
    request = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html,text/plain'})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=18) as response:
        content = response.read(4_000_001)
        if len(content) > 4_000_000:
            raise ValueError('PAGE_SIZE_LIMIT')
        return content.decode('utf-8', errors='replace')


def collect_host(host, jobs, checkpoint):
    robots_url = f'https://{host}/robots.txt'
    robot = urllib.robotparser.RobotFileParser(robots_url)
    robots_error = None
    try:
        robot.parse(fetch(robots_url).splitlines())
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            robot.parse([])
        else:
            robots_error = f'ROBOTS_HTTP_{exc.code}'
    except Exception as exc:
        robots_error = f'ROBOTS_UNAVAILABLE_{type(exc).__name__}'
    wait = max(1.0, robot.crawl_delay(AGENT) or robot.crawl_delay('*') or 0)
    host_blocked = None
    for job in jobs:
        key = hashlib.sha256((job['cohortId'] + job['url']).encode()).hexdigest()
        path = checkpoint / f'{key}.json'
        if path.exists():
            continue
        result = {**job, 'checkedAt': now(), 'robotsUrl': robots_url, 'links': []}
        if robots_error or host_blocked:
            result['status'] = robots_error or host_blocked
        elif not robot.can_fetch(AGENT, job['url']):
            result['status'] = 'ROBOTS_DISALLOWED'
        else:
            try:
                time.sleep(wait)
                body = fetch(job['url'])
                if re.search(r'<title>[^<]*(access denied|just a moment|attention required)', body, re.I):
                    result['status'] = 'ACCESS_CHALLENGE'
                    host_blocked = 'HOST_ACCESS_RESTRICTED'
                else:
                    result.update(extract(body, job['name']))
                    result.update(status='PAGE_CHECKED', sha256=hashlib.sha256(body.encode()).hexdigest())
            except urllib.error.HTTPError as exc:
                result['status'] = f'HTTP_{exc.code}'
                if exc.code in [401, 403, 429]:
                    host_blocked = 'HOST_ACCESS_RESTRICTED'
            except Exception as exc:
                result['status'] = f'FETCH_FAILED_{type(exc).__name__}'
        path.write_text(json.dumps(result, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('cohort')
    parser.add_argument('output')
    args = parser.parse_args()
    raw = Path(args.cohort).read_bytes()
    cohort = json.loads(raw)
    output = Path(args.output)
    checkpoint = output.with_suffix('.checkpoints')
    checkpoint.mkdir(exist_ok=True)
    groups = {}
    for doctor in cohort['doctors']:
        for url in dict.fromkeys(doctor['profile_urls']):
            parsed = urllib.parse.urlsplit(url)
            if parsed.scheme != 'https' or not parsed.hostname:
                raise ValueError('Invalid cohort profile URL')
            groups.setdefault(parsed.hostname, []).append({'cohortId': doctor['cohort_id'], 'name': doctor['name'], 'url': url})
    with ThreadPoolExecutor(max_workers=9) as pool:
        futures = {pool.submit(collect_host, host, jobs, checkpoint): host for host, jobs in groups.items()}
        for future in as_completed(futures):
            future.result()
            print('Completed host:', futures[future], flush=True)
    results = [json.loads(p.read_text()) for p in sorted(checkpoint.glob('*.json'))]
    expected = {(j['cohortId'], j['url']) for jobs in groups.values() for j in jobs}
    results = [r for r in results if (r['cohortId'], r['url']) in expected]
    statuses = {}
    for row in results:
        statuses[row['status']] = statuses.get(row['status'], 0) + 1
    data = {'cohortHash': hashlib.sha256(raw).hexdigest(), 'generatedAt': now(), 'cohortTotal': len(cohort['doctors']), 'statuses': statuses, 'profiles': results, 'limitations': ['Links are discovery candidates, not verified accounts or posts.', 'Institutional footer accounts must not be attributed to doctors.', 'Access restrictions are retained; no bypass or authenticated collection.', 'No dates, transcripts, sentiment or engagement are inferred from an embed.']}
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(json.dumps({'doctors': len({r['cohortId'] for r in results}), 'profiles': len(results), 'links': sum(len(r['links']) for r in results), 'statuses': statuses}), flush=True)


if __name__ == '__main__':
    main()

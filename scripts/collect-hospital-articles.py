"""Stage public hospital articles for attribution review, not verified commentary."""
import argparse
import hashlib
import importlib.util
import json
import re
import time
import urllib.parse
import urllib.error
import urllib.robotparser
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

spec = importlib.util.spec_from_file_location('profile_sources', Path(__file__).with_name('collect-profile-sources.py'))
sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sources)


def canonical(url, base):
    u = urllib.parse.urlsplit(urllib.parse.urljoin(base, url))
    origin = urllib.parse.urlsplit(base)
    if u.scheme != 'https' or u.hostname != origin.hostname or u.username or u.password or u.port:
        return None
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, '', ''))


class ArticlePage(sources.Page):
    def __init__(self, base):
        super().__init__()
        self.base = base
        self.articles = set()

    def handle_starttag(self, tag, attrs):
        super().handle_starttag(tag, attrs)
        if tag != 'a':
            return
        url = canonical(dict(attrs).get('href', ''), self.base)
        if not url:
            return
        parsed = urllib.parse.urlsplit(url)
        path = parsed.path.rstrip('/')
        care_article = parsed.hostname == 'www.carehospitals.com' and re.fullmatch(r'/blog-detail/[^/]+', path)
        if care_article or re.search(r'/(?:blog|blogs|patient-education-blog|news-events|events/news|blogs-events-news/[^/]+|blog-detail/[^/]+)/[^/]+$', path):
            self.articles.add(url)


def metadata_issues(metadata):
    dates = set()
    for item in metadata:
        date = item.get('datePublishedAsReported')
        if isinstance(date, str):
            match = re.match(r'^\d{4}-\d{2}-\d{2}(?=$|[ T])', date)
            if match:
                dates.add(match.group())
    return ['CONFLICTING_PUBLICATION_DATES'] if len(dates) > 1 else []


def inspect(body, url):
    page = ArticlePage(url)
    page.feed(body)
    metadata = []
    for obj in sources.objects(page.schemas):
        types = obj.get('@type', [])
        types = [types] if isinstance(types, str) else types
        if not isinstance(types, list) or not set(types) & {'Article', 'BlogPosting', 'NewsArticle', 'MedicalWebPage'}:
            continue
        credits = []
        for field in ['author', 'reviewedBy']:
            values = obj.get(field, [])
            for value in values if isinstance(values, list) else [values]:
                if isinstance(value, dict):
                    credits.append({'relationship': field, 'name': value.get('name'), 'url': value.get('url'), 'type': value.get('@type')})
                elif isinstance(value, str):
                    credits.append({'relationship': field, 'nameAsReported': value})
        metadata.append({'headline': obj.get('headline') or obj.get('name'), 'datePublishedAsReported': obj.get('datePublished'), 'dateModifiedAsReported': obj.get('dateModified'), 'credits': credits})
    return {'title': ' '.join(page.title)[:300], 'articleLinks': sorted(page.articles), 'articleMetadata': metadata}


class Reader:
    def __init__(self, checkpoint):
        self.checkpoint = checkpoint
        self.robots = {}
        self.blocked = set()

    def read(self, url):
        host = urllib.parse.urlsplit(url).hostname
        path = self.checkpoint / (hashlib.sha256(url.encode()).hexdigest() + '.json')
        if path.exists():
            row = json.loads(path.read_text())
            if row['status'] in ['HTTP_401', 'HTTP_403', 'HTTP_429', 'ACCESS_CHALLENGE', 'HOST_ACCESS_RESTRICTED']:
                self.blocked.add(host)
            # Encoding failures occurred before any network request; retry with encoded URLs.
            if row['status'] != 'FETCH_FAILED_UnicodeEncodeError':
                return row
        row = {'url': url, 'checkedAt': sources.now(), 'status': 'NOT_CHECKED', 'articleLinks': [], 'reviewStatus': 'REVIEW_REQUIRED', 'nativePostVerified': False}
        if host in self.blocked:
            row['status'] = 'HOST_ACCESS_RESTRICTED'
        else:
            try:
                if host not in self.robots:
                    robot = urllib.robotparser.RobotFileParser('https://' + host + '/robots.txt')
                    try:
                        robot.parse(sources.fetch(robot.url).splitlines())
                    except urllib.error.HTTPError as exc:
                        if exc.code != 404:
                            raise
                        robot.parse([])
                    self.robots[host] = robot
                robot = self.robots[host]
                if not robot.can_fetch(sources.AGENT, url):
                    row['status'] = 'ROBOTS_DISALLOWED'
                else:
                    time.sleep(max(1, robot.crawl_delay(sources.AGENT) or robot.crawl_delay('*') or 0))
                    body = sources.fetch(url)
                    if re.search(r'<title>[^<]*(access denied|just a moment|attention required)', body, re.I):
                        row['status'] = 'ACCESS_CHALLENGE'
                        self.blocked.add(host)
                    else:
                        row.update(inspect(body, url), status='PAGE_CHECKED', sha256=hashlib.sha256(body.encode()).hexdigest())
            except urllib.error.HTTPError as exc:
                row['status'] = f'HTTP_{exc.code}'
                if exc.code in [401, 403, 429]:
                    self.blocked.add(host)
            except Exception as exc:
                row['status'] = 'FETCH_FAILED_' + type(exc).__name__
        path.write_text(json.dumps(row, ensure_ascii=False))
        return row


def read_by_host(reader, urls, phase):
    groups = {}
    for url in dict.fromkeys(urls):
        groups.setdefault(urllib.parse.urlsplit(url).hostname, []).append(url)
    results = {}

    def host_rows(host, jobs):
        rows = []
        for index, url in enumerate(jobs, 1):
            rows.append(reader.read(url))
            if index % 50 == 0 or index == len(jobs):
                print(json.dumps({'phase': phase, 'host': host, 'accountedFor': index, 'total': len(jobs)}), flush=True)
        return rows

    # One serial worker per host preserves crawl delays; different hospitals are independent.
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(host_rows, host, jobs) for host, jobs in groups.items()]
        for future in as_completed(futures):
            for row in future.result():
                results[row['url']] = row
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('cohort')
    parser.add_argument('previous_discovery')
    parser.add_argument('output')
    parser.add_argument('--profile-limit', type=int, default=25)
    parser.add_argument('--article-limit', type=int, default=50)
    parser.add_argument('--profile-host', help='Limit discovery to one exact hospital hostname; use a new output path to retain earlier checkpoints')
    parser.add_argument('--all-profiles', action='store_true', help='Account for the full cohort, retaining prior access restrictions without retrying them')
    args = parser.parse_args()
    raw = Path(args.cohort).read_bytes()
    cohort = json.loads(raw)
    previous = json.loads(Path(args.previous_discovery).read_text())
    checksum = hashlib.sha256(raw).hexdigest()
    if previous['cohortHash'] != checksum:
        raise ValueError('Cohort checksum mismatch')
    output = Path(args.output)
    checkpoint = output.with_suffix('.checkpoints')
    checkpoint.mkdir(exist_ok=True)
    reader = Reader(checkpoint)
    for p in previous['profiles']:
        if p['status'] in ['HTTP_401', 'HTTP_403', 'HTTP_429', 'ACCESS_CHALLENGE', 'HOST_ACCESS_RESTRICTED']:
            reader.blocked.add(urllib.parse.urlsplit(p['url']).hostname)
    eligible = {p['url'] for p in previous['profiles'] if p['status'] == 'PAGE_CHECKED'}
    doctors = sorted(cohort['doctors'], key=lambda d: (not bool(set(d['specialties']) & {'Endocrinology', 'Diabetology'}), d['name']))
    jobs = [(d, u) for d in doctors for u in dict.fromkeys(d['profile_urls']) if u in eligible]
    if args.profile_host:
        jobs = [(d, u) for d, u in jobs if urllib.parse.urlsplit(u).hostname == args.profile_host]
    if not args.all_profiles:
        jobs = jobs[:args.profile_limit]
    profile_rows = read_by_host(reader, [u for _, u in jobs], 'profiles')
    profiles, candidates = [], {}
    for doctor, url in jobs:
        row = profile_rows[url]
        profiles.append({'cohortId': doctor['cohort_id'], **row})
        for link in row['articleLinks']:
            candidates.setdefault(link, []).append({'cohortId': doctor['cohort_id'], 'name': doctor['name'], 'profileUrl': url})
    if args.all_profiles:
        for previous_page in previous['profiles']:
            if previous_page['url'] not in eligible:
                profiles.append({'cohortId': previous_page['cohortId'], 'url': previous_page['url'], 'checkedAt': previous_page['checkedAt'], 'status': previous_page['status'], 'articleLinks': [], 'discoveryReason': 'Prior profile access unavailable; article scan not attempted'})
    article_rows = read_by_host(reader, sorted(candidates)[:args.article_limit], 'articles')
    articles = []
    for index, (url, backlinks) in enumerate(sorted(candidates.items())):
        row = article_rows[url] if index < args.article_limit else {'url': url, 'status': 'NOT_CHECKED', 'reviewStatus': 'REVIEW_REQUIRED', 'nativePostVerified': False}
        articles.append({**row, 'profileBacklinks': backlinks, 'attributionStatus': 'UNVERIFIED', 'reviewIssues': metadata_issues(row.get('articleMetadata', []))})
    summary = {'cohortTotal': len(cohort['doctors']), 'profileStatuses': len(profiles), 'doctorsAccountedFor': len({p['cohortId'] for p in profiles}), 'doctorsWithProfileRead': len({p['cohortId'] for p in profiles if p['status'] == 'PAGE_CHECKED'}), 'articleCandidates': len(articles), 'articlesRead': sum(a['status'] == 'PAGE_CHECKED' for a in articles), 'verifiedStatements': 0}
    output.write_text(json.dumps({'cohortHash': checksum, 'checkedAt': sources.now(), 'summary': summary, 'profiles': profiles, 'articles': articles, 'limitations': ['Hospital backlink is not authorship.', 'Structured author and reviewer credits are reported claims requiring identity review.', 'No clinical statement, date, sentiment or account ownership is inferred from a page title.', 'Partial bounded discovery, not complete cohort listening.']}, ensure_ascii=False, indent=2))
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()

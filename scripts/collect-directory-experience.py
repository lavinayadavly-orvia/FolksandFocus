"""Collect explicit experience from named hospital cards, not job titles."""
import importlib.util
import json
import hashlib
import re
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin
from lxml import html

spec = importlib.util.spec_from_file_location('articles', Path(__file__).with_name('collect-hospital-articles.py'))
articles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(articles)


def inspect(body, url):
    tree = html.fromstring(body)
    records = []
    for card in tree.xpath('//*[@class="doctor-card-new"]'):
        links = card.xpath('.//h4/a')
        if len(links) != 1:
            continue
        name = ' '.join(links[0].itertext()).strip()
        for paragraph in card.xpath('.//p[strong]'):
            text = ' '.join(' '.join(paragraph.itertext()).split())
            match = re.fullmatch(r'Experience:\s*(\d{1,2})(\+)?\s*Years?', text, re.I)
            if match:
                records.append({'nameAsReported': name, 'profileUrl': urljoin(url, links[0].get('href')),
                                'years': int(match[1]), 'lowerBound': bool(match[2]), 'asReported': text,
                                'publisher': 'Max Healthcare', 'sourceLocator': 'Doctor card: ' + name})
    return {'experienceRecords': records}


def main():
    output = Path(sys.argv[1])
    if len(sys.argv) == 3:
        saved = Path(sys.argv[2])
        body = saved.read_text()
        url = 'https://www.maxhealthcare.in/find-a-doctor'
        row = {'url': url, 'checkedAt': datetime.fromtimestamp(saved.stat().st_mtime, timezone.utc).isoformat(),
               'status': 'PAGE_CHECKED', 'sha256': hashlib.sha256(body.encode()).hexdigest(),
               'collectionMethod': 'Previously retrieved public directory; offline extraction', **inspect(body, url)}
        output.write_text(json.dumps({'pages': [row]}, indent=2))
        print(json.dumps({'cachedRecords': len(row['experienceRecords'])}))
        return
    checkpoint = output.with_suffix('.checkpoints')
    checkpoint.mkdir(exist_ok=True)
    cohort = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {confirmedCohort} from './generated/confirmed-cohort.mjs';console.log(JSON.stringify(confirmedCohort.doctors))"]))
    urls = sorted({e['source_url'] for p in cohort for e in p['evidence'] if e['publisher'] == 'Max Healthcare'})
    articles.inspect = inspect
    reader = articles.Reader(checkpoint)
    pages = articles.read_by_host(reader, urls, 'directory-experience')
    output.write_text(json.dumps({'pages': list(pages.values())}, indent=2))
    print(json.dumps({'pages': len(pages), 'read': sum(r['status'] == 'PAGE_CHECKED' for r in pages.values()),
                      'records': sum(len(r.get('experienceRecords', [])) for r in pages.values())}), flush=True)


if __name__ == '__main__':
    main()

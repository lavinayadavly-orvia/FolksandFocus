"""Extract experience only from a matched doctor's institutional biography."""
import importlib.util
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from lxml import html

spec = importlib.util.spec_from_file_location('articles', Path(__file__).with_name('collect-hospital-articles.py'))
articles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(articles)


def name_key(value):
    return re.sub('[^a-z]', '', re.sub(r'\b(dr|prof|professor)\b', '', value.lower()))


def inspect_profile(body, url, expected_name, publisher='Aster Hospitals'):
    tree = html.fromstring(body)
    headings = tree.xpath('//h2[@class="doctor-name"]') if publisher == 'CARE Hospitals' else tree.xpath('//h1')
    names = [' '.join(n.itertext()).strip() for n in headings]
    if not any(name_key(n) == name_key(expected_name) for n in names):
        return {'experienceRecords': [], 'experienceReview': 'PROFILE_NAME_MISMATCH'}
    if publisher == 'CARE Hospitals':
        amounts = tree.xpath('//div[@class="docbox-flex"][p[normalize-space(.)="Experience"]]/p[@class="doc-boxtext"]')
        records = []
        for node in amounts:
            text = ' '.join(' '.join(node.itertext()).split())
            match = re.fullmatch(r'(?:(over|more than|at least)\s+)?(\d{1,2}(?:\.\d)?)(\+)?\s*Years?', text, re.I)
            if match and float(match[2]) <= 80:
                records.append({'nameAsReported': expected_name, 'profileUrl': url, 'years': float(match[2]),
                                'lowerBound': bool(match[1] or match[3]), 'publisher': publisher,
                                'sourceLocator': 'Matched doctor-name / labelled Experience field', 'asReported': text})
        values = {(r['years'], r['lowerBound']): r for r in records}
        return {'experienceRecords': list(values.values()) if len(values) == 1 else [],
                'experienceReview': 'MULTIPLE_EXPERIENCE_AMOUNTS' if len(values) > 1 else None if values else 'EXPLICIT_EXPERIENCE_NOT_FOUND'}
    if publisher == 'Medanta':
        sections = tree.xpath('//div[contains(concat(" ",normalize-space(@class)," ")," cardilogy_sp_content_box ")]')[:1]
        locator = 'cardilogy_sp_content_box biography'
    elif publisher == 'Kauvery Hospital':
        sections = []
        for container in tree.xpath('//*[@id="tb1"]/*[contains(concat(" ",normalize-space(@class)," ")," tbtxt ")]'):
            for node in container:
                heading = ' '.join(' '.join(n.itertext()) for n in node.xpath('self::h2|self::h3|self::h4|.//b|.//strong')).strip()
                if re.search(r'education|qualification|award|publication|membership', heading, re.I):
                    break
                sections.append(node)
        locator = 'tb1 biography before qualifications, awards and publications'
    elif publisher == 'Marengo Asia Hospitals':
        sections = tree.xpath('//p[contains(concat(" ",normalize-space(@class)," ")," doctor-experience-tag ")]')
        locator = 'doctor-experience-tag'
    elif publisher == 'KIMS Hospitals':
        sections = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," doctor-profile-content ")]/p[string-length(normalize-space(.)) > 120][1]')[:1]
        locator = 'First biography paragraph; publication lists excluded'
    elif publisher == 'Manipal Hospitals':
        sections = tree.xpath('//*[@id="doc-overview"]')[:1]
        locator = 'doc-overview'
    else:
        sections = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," doctor__overview ")]')
        locator = 'doctor__overview'
    if not sections:
        return {'experienceRecords': [], 'experienceReview': 'BIOGRAPHY_NOT_FOUND'}
    text = ' '.join(' '.join(' '.join(n.itertext()) for n in sections).split())
    patterns = [
        r'(?<![\d.])(?P<bound>over|more than|at least|nearly|around|approximately)?\s*(?P<years>\d{1,2})\s*(?P<plus>\+)?\s*years?\s+(?:of\s+)?(?:(?:overall|clinical|medical|professional|extensive|rich|dedicated)\s+)?(?:experience|expertise|practi[cs]e)',
        r'experience\s+of\s+(?P<bound>over|more than|at least|nearly|around|approximately)?\s*(?P<years>\d{1,2})\s*(?P<plus>\+)?\s*years?',
    ]
    records = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.I):
            years = int(match['years'])
            if years > 80:
                continue
            # Preserve uncertainty rather than round approximate wording across tier boundaries.
            before = text[max(0,match.start()-70):match.start()]
            if match['bound'] and match['bound'].lower() in ['nearly', 'around', 'approximately']:
                continue
            if re.search(r'years?\s+of\s*$', before, re.I):
                continue
            records.append({'nameAsReported': expected_name, 'profileUrl': url, 'years': years,
                            'lowerBound': bool(match['bound'] or match['plus']), 'publisher': publisher,
                            'sourceLocator': 'Matched profile heading / '+locator,
                            'asReported': text[max(0,match.start()-100):match.end()+100]})
    unique = {(r['years'], r['lowerBound']): r for r in records}
    decades = {'a': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7}
    for match in re.finditer(r'(?P<bound>over|more than|at least|nearly|around|approximately)?\s*\b(?P<amount>a|one|two|three|four|five|six|seven)\s+decades?\s+(?:of\s+)?(?:(?:clinical|medical|professional)\s+)?(?:experience|expertise)', text, re.I):
        if match['bound'] and match['bound'].lower() in ['nearly', 'around', 'approximately']:
            continue
        years = decades[match['amount'].lower()] * 10
        bound = bool(match['bound'])
        unique[(years, bound)] = {'nameAsReported': expected_name, 'profileUrl': url, 'years': years,
                                 'lowerBound': bound, 'publisher': publisher,
                                 'sourceLocator': 'Matched profile heading / biography decade statement',
                                 'asReported': text[max(0,match.start()-70):match.end()+70]}
    if len(unique) > 1:
        return {'experienceRecords': [], 'experienceReview': 'MULTIPLE_EXPERIENCE_AMOUNTS', 'experienceCandidates': list(unique.values())}
    return {'experienceRecords': list(unique.values()), 'experienceReview': None if unique else 'EXPLICIT_EXPERIENCE_NOT_FOUND'}


def main():
    output = Path(sys.argv[1])
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10000
    publisher = sys.argv[3] if len(sys.argv) > 3 else 'Aster Hospitals'
    if publisher not in ['Aster Hospitals', 'CARE Hospitals', 'Manipal Hospitals', 'KIMS Hospitals', 'Marengo Asia Hospitals', 'Kauvery Hospital', 'Medanta']:
        raise ValueError('Unsupported hospital template')
    profiles = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {researchProfiles} from './data.mjs';console.log(JSON.stringify(researchProfiles.filter(p=>!p.experience)))"]))
    jobs = {f['url']: p['name'] for p in profiles for f in p['footprints']
            if f['type'] == 'INSTITUTION' and f.get('publisher') == publisher}
    checkpoint = output.with_suffix('.checkpoints')
    checkpoint.mkdir(exist_ok=True)
    cached = [url for url in jobs if (checkpoint / (hashlib.sha256(url.encode()).hexdigest()+'.json')).exists()]
    pending = [url for url in jobs if url not in cached]
    articles.inspect = lambda body, url: inspect_profile(body, url, jobs[url], publisher)
    pages = articles.read_by_host(articles.Reader(checkpoint), cached+pending[:limit], 'profile-experience')
    output.write_text(json.dumps({'pages': list(pages.values())}, indent=2))
    print(json.dumps({'pages': len(pages), 'read': sum(p['status'] == 'PAGE_CHECKED' for p in pages.values()),
                      'withExperience': sum(bool(p.get('experienceRecords')) for p in pages.values())}), flush=True)


if __name__ == '__main__':
    main()

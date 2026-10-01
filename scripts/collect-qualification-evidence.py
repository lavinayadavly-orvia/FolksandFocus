"""Collect explicitly dated MBBS entries from name-matched hospital profiles."""
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path
from lxml import html

spec = importlib.util.spec_from_file_location('experience', Path(__file__).with_name('collect-profile-experience.py'))
experience = importlib.util.module_from_spec(spec)
spec.loader.exec_module(experience)


def inspect(body, url, name, publisher='KIMS Hospitals'):
    tree = html.fromstring(body)
    headings = [' '.join(n.itertext()).strip() for n in tree.xpath('//h1')]
    if not any(experience.name_key(n) == experience.name_key(name) for n in headings):
        return {'qualificationRecords': [], 'qualificationReview': 'PROFILE_NAME_MISMATCH'}
    records = []
    if publisher in ['Aster Hospitals', 'Manipal Hospitals']:
        section_class = 'doctor__overview' if publisher == 'Aster Hospitals' else 'overview-para'
        sections = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," '+section_class+' ")]')
        for node in [item for section in sections for item in section.xpath('.//p|.//li[not(p)]')]:
            value = ' '.join(' '.join(node.itertext()).split())
            normalized = re.sub(r'M\.B\.B\.S\.?', 'MBBS', value, flags=re.I)
            if (re.search(r'\b(?:completed|graduated|earned|obtained|received)\b', normalized, re.I)
                    and re.search(r'\bMBBS\b', normalized, re.I)
                    and re.search(r'\b(?:19|20)\d{2}\b', normalized)
                    and not re.search(r'\b(?:batch|admission|enrolled|commenced|pursuing)\b', normalized, re.I)):
                records.append(normalized)
        return {'qualificationRecords': list(dict.fromkeys(records))}
    if publisher == 'Kauvery Hospital':
        containers = tree.xpath('//*[@id="tb1"]/*[contains(concat(" ",normalize-space(@class)," ")," tbtxt ")]')
    else:
        containers = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," doctor-profile-content ")]')
    for container in containers:
        in_education = False
        # Restrict to labelled education sections; papers and unrelated page chrome are excluded.
        for node in container:
            value = ' '.join(' '.join(node.itertext()).split())
            if re.fullmatch(r'(?:education(?:al)?(?:\s*(?:&|and)?\s*qualifications?)?|qualifications?(?:\s*/\s*education)?)\s*:?', value, re.I):
                in_education = True
                continue
            bold_heading = node.xpath('./strong|./b')
            is_bold_heading = bold_heading and value == ' '.join(' '.join(bold_heading[0].itertext()).split())
            if node.tag in ['h2', 'h3', 'h4', 'h5'] or is_bold_heading or (len(value) < 80 and value.endswith(':')):
                in_education = False
            if not in_education:
                continue
            for item in node.xpath('self::li|./li|self::p'):
                text = ' '.join(' '.join(item.itertext()).split())
                normalized = re.sub(r'M\.B\.B\.S\.?', 'MBBS', text, flags=re.I)
                if re.match(r'^MBBS\b', normalized, re.I) and re.search(r'\b(?:19|20)\d{2}\b', normalized):
                    records.append(normalized)
    return {'qualificationRecords': list(dict.fromkeys(records))}


def main():
    output = Path(sys.argv[1])
    publisher = sys.argv[2] if len(sys.argv) > 2 else 'KIMS Hospitals'
    if publisher not in ['KIMS Hospitals', 'Kauvery Hospital', 'Aster Hospitals', 'Manipal Hospitals']:
        raise ValueError('Unsupported hospital template')
    profiles = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {researchProfiles as p} from './data.mjs';console.log(JSON.stringify(p.filter(d=>!d.experience&&!d.experienceReview)))"]))
    jobs = {f['url']: p for p in profiles for f in p['footprints']
            if f['type'] == 'INSTITUTION' and f.get('publisher') == publisher}
    checkpoint = output.with_suffix('.checkpoints')
    checkpoint.mkdir(exist_ok=True)
    experience.articles.inspect = lambda body, url: inspect(body, url, jobs[url]['name'], publisher)
    pages = experience.articles.read_by_host(experience.articles.Reader(checkpoint), jobs, 'qualification')
    rows = []
    for url, page in pages.items():
        for qualification in page.get('qualificationRecords', []):
            rows.append({'hcpId': jobs[url]['id'], 'nameAsReported': jobs[url]['name'],
                'profile_url': url, 'qualifications': qualification, 'checked_at': page['checkedAt'],
                'publisher': publisher, 'sourceAccessStatus': page['status'],
                'sourceLocator': 'Name-matched profile / '+('biography qualification completion statement' if publisher in ['Aster Hospitals', 'Manipal Hospitals'] else 'labelled education section / MBBS entry'),
                'identityBasis': 'Exact institutional URL and normalized profile heading match existing cohort identity.',
                'sourceHash': page.get('sha256'),
                'accessNote': 'Hospital-published qualification date; calendar estimate only, not registration or continuous practice. Conflicting completion years require review.'})
    output.write_text(json.dumps({'pages': list(pages.values()), 'evidence': rows}, indent=2))
    print(json.dumps({'checked': len(pages), 'qualificationEntries': len(rows)}), flush=True)


if __name__ == '__main__':
    main()

"""Import only the selected priority sheet; preserve supplied claims without endorsing them."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit
import openpyxl

SHEET = 'Enrichment - Super-specialists'
PRIORITY = {'Diabetologist', 'Cardiologist', 'Endocrinologist', 'Gynecologist', 'Consulting Physician', 'General Practitioner'}

def scope_for(specialty):
    if re.search(r'cardiac.*anaesth|cardiac.*anesth', specialty, re.I):
        return 'LATER_CARDIAC_ANAESTHESIOLOGY'
    return 'NOW_PRIORITY_SPECIALTY' if specialty in PRIORITY else 'LATER_SPECIALTY_REVIEW'

def name_key(value):
    words = re.sub(r'[^a-z0-9 ]', ' ', str(value or '').lower()).split()
    return ' '.join(w for w in words if w not in {'dr', 'doctor', 'prof', 'professor'})

def url_key(value):
    p = urlsplit(str(value or '').strip())
    if p.scheme not in {'http', 'https'} or not p.netloc:
        return None
    return urlunsplit(('https', p.netloc.lower().removeprefix('www.'), p.path.rstrip('/'), '', ''))

def run(source, directory):
    repository = Path(__file__).resolve().parents[1]
    directory = directory.resolve()
    if directory == repository or repository in directory.parents:
        raise ValueError('Private output directory required')
    cohort = json.loads((directory / 'cohort-validation-baseline.json').read_text())['records']
    names, urls = defaultdict(list), defaultdict(list)
    for doctor in cohort:
        names[name_key(doctor['fields']['name']['value'])].append(doctor['id'])
        for u in doctor['rawSourceRecord'].get('profile_urls', []):
            if url_key(u):
                urls[url_key(u)].append(doctor['id'])
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    sheet = workbook[SHEET]
    stream = sheet.iter_rows(values_only=True)
    headers = next(stream)
    records, specialities, statuses, seen = [], Counter(), Counter(), Counter()
    for row_number, values in enumerate(stream, 2):
        if not any(v is not None for v in values):
            continue
        supplied = dict(zip(headers, values))
        source_id = str(supplied.get('THB ID') or '')
        seen[source_id] += 1
        name = name_key(supplied.get('Full Name'))
        name_matches = set(names.get(name, [])) if name else set()
        hospital_url = url_key(supplied.get('Hospital Bio Page'))
        url_matches = set(urls.get(hospital_url, [])) if hospital_url else set()
        confirmed = name_matches & url_matches
        status = 'CORROBORATED_NAME_AND_PROFILE_URL' if len(confirmed) == 1 and len(url_matches) == 1 else 'CANDIDATE_REVIEW' if name_matches or url_matches else 'NO_EXACT_MATCH_REVIEW_REQUIRED'
        specialty = str(supplied.get('Validated Specialty') or 'Unspecified')
        records.append({'sourceId':source_id, 'sheet':SHEET, 'row':row_number,
            'supplied':supplied, 'evidenceStatus':'USER_SUPPLIED_NOT_INDEPENDENTLY_VALIDATED',
            'scope':scope_for(specialty),
            'identityMatch':{'status':status, 'nameCandidates':sorted(name_matches), 'profileUrlCandidates':sorted(url_matches),
                'cohortId':next(iter(confirmed)) if status == 'CORROBORATED_NAME_AND_PROFILE_URL' else None},
            'nextAction':'Review differing factual fields and retain both source records' if status == 'CORROBORATED_NAME_AND_PROFILE_URL' else 'Resolve identity using qualification, institution and geography before any merge'})
        specialities[specialty] += 1
        statuses[status] += 1
    workbook.close()
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    summary = {'checkedAt':datetime.now(timezone.utc).isoformat(), 'sourcePath':str(source), 'sourceSha256':digest,
        'selectedSheet':SHEET, 'inputRows':len(records), 'existingCohortRecords':len(cohort),
        'specialties':dict(specialities), 'matchCounts':dict(statuses),
        'scopeCounts':dict(Counter(r['scope'] for r in records)),
        'duplicateSourceIds':{k:v for k,v in seen.items() if v>1}, 'missingSourceIds':seen.get('',0),
        'combinedUniqueDoctorCount':None, 'mergesApplied':0,
        'scopeNote':'Only selected 2233-record sheet imported; larger reference sheet excluded. Other original cohort records retained.',
        'limitation':'Exact-name candidates are not confirmed overlaps. Supplied enrichment and validation labels are retained as claims.'}
    for filename, data in [('priority-workbook-import.json', {'summary':summary, 'records':records}), ('priority-workbook-reconciliation-summary.json',summary)]:
        path=directory / filename
        path.touch(mode=0o600, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, default=str)+'\n')
    print(json.dumps(summary, indent=2))

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('source',type=Path)
    parser.add_argument('directory',type=Path)
    args=parser.parse_args()
    run(args.source,args.directory)

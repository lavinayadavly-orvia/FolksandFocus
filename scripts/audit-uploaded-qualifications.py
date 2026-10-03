"""Qualification triage of supplied claims, never professional verification."""
import argparse
import collections
import csv
import importlib.util
import json
import re
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location('csv_audit', Path(__file__).with_name('audit-doctor-csv.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def qualification_bucket(value):
    text = re.sub(r'[.]', '', value.upper())
    tokens = set(re.findall(r'[A-Z]+', text))
    mbbs = 'MBBS' in tokens
    ayush = bool(tokens & {'BAMS', 'BHMS', 'BUMS', 'BSMS', 'BNYS', 'DHMS', 'AYURVEDA', 'AYURVEDIC', 'HOMEOPATHY', 'HOMOEOPATHY', 'UNANI'})
    if mbbs and ayush:
        return 'MIXED_CREDENTIAL_REVIEW'
    if ayush:
        return 'AYUSH_CLAIM_SCOPE_REVIEW'
    if mbbs:
        return 'MBBS_CLAIM'
    if tokens & {'BDS', 'MDS'}:
        return 'DENTAL_CLAIM_SCOPE_REVIEW'
    if tokens & {'MD', 'MS', 'DNB', 'DM', 'DRNB', 'MRCP', 'FRCP', 'MCH'}:
        return 'POSTGRADUATE_CLAIM_PRIMARY_DEGREE_UNRESOLVED'
    return 'QUALIFICATION_UNRESOLVED'


def run(source, report_path, destination):
    target = destination.resolve()
    repo = Path(__file__).resolve().parents[1]
    if repo == target or repo in target.parents:
        raise ValueError('Private output directory required')
    report = json.loads(report_path.read_text())
    if audit.file_sha256(source) != report['sourceSha256']:
        raise ValueError('Source changed since audit')
    counts = collections.Counter()
    by_specialty = collections.defaultdict(collections.Counter)
    examples = collections.defaultdict(collections.Counter)
    records = []
    with source.open(encoding='utf-8-sig', errors='surrogateescape', newline='') as handle:
        for number, row in enumerate(csv.DictReader(handle), 2):
            if None in row or any(v is None for v in row.values()):
                raise ValueError('Malformed source row')
            detected = audit.specialties(' '.join([row.get('Specialty', ''), row.get('Specialty 2', '')]))
            if not detected:
                continue
            bucket = qualification_bucket(row['Qualification'])
            counts[bucket] += 1
            by_specialty[row['Specialty']][bucket] += 1
            examples[bucket][row['Qualification']] += 1
            records.append({'sourceRecord': number, 'sourceId': row['THB ID'], 'qualificationBucket': bucket, 'status': 'SUPPLIED_CLAIM_NOT_VERIFIED'})
    if len(records) != report['summary']['targetSpecialtyRows']:
        raise ValueError('Priority-row count does not reconcile')
    result = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'sourceSha256': report['sourceSha256'], 'prioritySourceRows': len(records), 'counts': dict(counts), 'bySpecialty': dict(by_specialty), 'commonQualificationStrings': {k: v.most_common(12) for k, v in examples.items()}, 'limitations': ['Counts are source rows, not unique people.', 'Qualifications are supplied claims, not verified degrees.', 'No record excluded or merged.', 'AYUSH and dental inclusion requires a scope decision; unknown qualifications remain eligible for research.']}
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name, payload in [('DB-qualification-audit.json', result), ('DB-qualification-triage.json', {'sourceSha256': report['sourceSha256'], 'records': records})]:
        path = target / name
        path.touch(mode=0o600, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + '\n')
    print(json.dumps({'prioritySourceRows': len(records), 'counts': counts}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('audit', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    run(args.source, args.audit, args.destination)

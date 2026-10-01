"""Stage uploaded specialty candidates privately; never merge or publish identities."""
import argparse
import collections
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit-doctor-csv.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def stage(source, directory, selection):
    selected = json.loads(selection.read_text())
    selected_rows = set(selected['sourceRecords'])
    if not selected_rows or any(type(i) is not int or i < 2 for i in selected_rows):
        raise ValueError('An explicit non-empty reviewed source-record selection is required')
    report = json.loads((directory / 'DB-audit-summary.json').read_text())
    with source.open('rb') as handle:
        digest = hashlib.sha256()
        for chunk in iter(lambda: handle.read(1048576), b''):
            digest.update(chunk)
        checksum = digest.hexdigest()
    if selected.get('sourceSha256') != checksum:
        raise ValueError('Selection does not match this source file')
    if checksum != report['sourceSha256']:
        raise ValueError('Source changed: rerun the CSV audit before staging')
    overlaps = json.loads((directory / 'DB-cohort-overlap-review.json').read_text())
    duplicates = json.loads((directory / 'DB-duplicate-review.json').read_text())
    if any(value['sourceSha256'] != checksum for value in [overlaps, duplicates]):
        raise ValueError('Review files do not match uploaded source')
    by_row = collections.defaultdict(set)
    for match in overlaps['matches']:
        by_row[match['sourceRecord']].add(match['cohortId'])
    duplicate_rows = {i for group in duplicates['groups']['sameDetailsDifferentId'] for i in group['sourceRecords']}
    target = directory / 'DB-priority-queue.sqlite'
    db = sqlite3.connect(target)
    db.execute('CREATE TABLE IF NOT EXISTS candidates (source_hash TEXT, source_record INTEGER, source_id TEXT, name TEXT, specialty TEXT, target_groups TEXT, institution TEXT, city TEXT, qualification TEXT, possible_cohort_ids TEXT, duplicate_review INTEGER, completeness INTEGER, bucket TEXT DEFAULT \'NOW\', scan_status TEXT DEFAULT \'NOT_STARTED\', deferred_fields TEXT DEFAULT \'[]\', PRIMARY KEY(source_hash,source_record))')
    counts = collections.Counter()
    with db, source.open(encoding='utf-8-sig', errors='surrogateescape', newline='') as handle:
        for index, row in enumerate(csv.DictReader(handle), 2):
            if index not in selected_rows:
                continue
            specialty = ' '.join([row.get('Specialty', ''), row.get('Specialty 2', '')])
            groups = audit.specialties(specialty)
            if not groups:
                continue
            if {'Internal Medicine', 'General Practice'} <= groups and 'CP/GP' in specialty.upper():
                groups -= {'Internal Medicine', 'General Practice'}
                explicit = row.get('Specialty 2', '').strip().lower()
                groups.add({'consulting physician': 'Internal Medicine', 'general practitioner': 'General Practice'}.get(explicit, 'Physician (CP/GP unresolved)'))
            counts['priorityRows'] += 1
            counts['possibleOverlapRows'] += bool(by_row[index])
            counts['duplicateReviewRows'] += index in duplicate_rows
            fields = [row.get('Full Name', ''), row.get('Hospital/Clinic Name', ''), row.get('City', '') or row.get('Mapped City', ''), row.get('Qualification', '')]
            clean = [value.encode('utf-8', errors='replace').decode('utf-8') for value in fields]
            db.execute('INSERT OR IGNORE INTO candidates (source_hash,source_record,source_id,name,specialty,target_groups,institution,city,qualification,possible_cohort_ids,duplicate_review,completeness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                       (checksum,index,row.get('THB ID',''),clean[0],specialty,json.dumps(sorted(groups)),clean[1],clean[2],clean[3],json.dumps(sorted(by_row[index])),int(index in duplicate_rows),sum(audit.nonempty(value) for value in fields)))
    with db:
        db.execute('CREATE INDEX IF NOT EXISTS research_order ON candidates(bucket,scan_status,completeness DESC)')
    stored = db.execute('SELECT COUNT(*) FROM candidates WHERE source_hash=?', (checksum,)).fetchone()[0]
    if stored != counts['priorityRows']:
        raise ValueError('Queue count does not reconcile')
    db.close()
    target.chmod(0o600)
    print(json.dumps({**counts, 'uniqueDoctors': None, 'status':'PRIVATE_CANDIDATES_NOT_MERGED'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('audit_directory', type=Path)
    parser.add_argument('--selection', type=Path, required=True, help='Reviewed JSON with sourceSha256 and sourceRecords; no broad default import')
    args = parser.parse_args()
    stage(args.source, args.audit_directory, args.selection)

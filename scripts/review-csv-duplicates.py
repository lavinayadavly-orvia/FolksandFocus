"""Review exact payload duplicates without merging people or exposing contacts."""
import argparse
import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


IGNORED = {'THB ID', 'Data Added as on'}
EMPTY = {'', 'na', 'n/a', 'null', 'none', '-', '0', 'nan', 'others'}


def present(value):
    return value.strip().lower() not in EMPTY


def classify(rows):
    payloads = [{k: v.strip() for k, v in row.items() if k not in IGNORED} for row in rows]
    identical = len(rows) > 1 and all(p == payloads[0] for p in payloads[1:])
    first = rows[0]
    signals = [field for field in ['Full Name', 'Specialty', 'Qualification', 'Hospital/Clinic Name', 'City', 'State'] if present(first.get(field, ''))]
    registration = first.get('MCI Number', '').strip()
    registration_candidate = present(registration) and bool(re.search(r'\d', registration))
    contacts_present = any(present(first.get(f, '')) for f in ['Email ID1', 'Email ID2', 'Phone Number 1', 'Phone Number 2'])
    return {
        'recordDisposition': 'REPEATED_PAYLOAD_CONFIRMED' if identical else 'PAYLOAD_MISMATCH_REVIEW',
        'identityDisposition': 'REVIEW_REQUIRED',
        'merged': False,
        'matchingNonemptyFields': signals if identical else [],
        'hasRegistrationCandidate': registration_candidate,
        'registrationVerified': False,
        'hasSharedContactClaim': contacts_present and identical,
        'reason': 'Same supplied payload, excluding source ID and added date; not independent identity evidence' if identical else 'Source no longer matches audited duplicate group',
        'nextAction': 'Corroborate registration with council and professional identity' if registration_candidate else 'Corroborate full name, clinical qualification and hospital/city using an independent professional source',
    }


def review(source, audit_path, destination):
    repository = Path(__file__).resolve().parents[1]
    target = destination.resolve()
    if repository == target or repository in target.parents or target in {source.resolve(), audit_path.resolve()}:
        raise ValueError('Use a private report path outside the served repository and source files')
    audit = json.loads(audit_path.read_text())
    digest = hashlib.sha256()
    with source.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1048576), b''):
            digest.update(chunk)
    if digest.hexdigest() != audit['sourceSha256']:
        raise ValueError('CSV changed since duplicate audit; re-audit before reviewing')
    groups = audit['groups']['sameDetailsDifferentId']
    wanted = {n for group in groups for n in group['sourceRecords']}
    selected = {}
    with source.open(encoding='utf-8-sig', errors='surrogateescape', newline='') as handle:
        for number, row in enumerate(csv.DictReader(handle), 2):
            if number in wanted:
                selected[number] = row
    if set(selected) != wanted:
        raise ValueError('Missing source records')
    results = []
    for group in groups:
        rows = [selected[n] for n in group['sourceRecords']]
        results.append({'sourceRecords': group['sourceRecords'], 'sourceIds': [r['THB ID'] for r in rows], 'nameAsReported': rows[0]['Full Name'], **classify(rows)})
    report = {
        'checkedAt': datetime.now(timezone.utc).isoformat(),
        'sourceSha256': audit['sourceSha256'],
        'groups': results,
        'summary': {'groupsReviewed': len(results), 'sourceRecordsReviewed': len(wanted), 'repeatedPayloadGroups': sum(r['recordDisposition'] == 'REPEATED_PAYLOAD_CONFIRMED' for r in results), 'groupsWithRegistrationCandidate': sum(r['hasRegistrationCandidate'] for r in results), 'identitiesMerged': 0},
        'limitations': ['No combined unique-doctor count established.', 'Original rows retained.', 'Shared contacts and matching supplied fields do not establish independent identity verification.'],
    }
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination.touch(mode=0o600, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report['summary']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('audit', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    review(args.source, args.audit, args.destination)

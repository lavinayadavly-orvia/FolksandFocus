"""Read-only audit of a supplied doctor CSV; no identity merges or public exports."""
import argparse
import collections
import csv
import hashlib
import json
import re
import sqlite3
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


def normalized(value):
    text = unicodedata.normalize('NFKC', value).casefold()
    text = re.sub(r'\b(?:dr|doctor|prof|professor)\b\.?', ' ', text)
    return ' '.join(re.findall(r'[^\W_]+', text))


def file_sha256(source):
    digest = hashlib.sha256()
    with source.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1048576), b''):
            digest.update(chunk)
    return digest.hexdigest()


def specialties(value):
    rules = {
        'Cardiology': r'cardiol|cardio\s*log',
        'Endocrinology': r'endocrin',
        'Diabetology': r'diabet',
        'Gynecology_Obstetrics': r'gyn[ae]ec|gynec|gynaec|obstet|obgyn',
        'Internal Medicine': r'internal medicine|general medicine|consultant physician|consulting physician|\bcp\b',
        'General Practice': r'general pract|family medicine|family physician|\bgp\b',
    }
    return {key for key, pattern in rules.items() if re.search(pattern, value, re.I)}


def nonempty(value):
    return bool(value.strip()) and value.strip().lower() not in {'na', 'n/a', 'null', 'none', '-', '0', 'nan'}


def email_candidate(value):
    local, domain = value.rsplit('@', 1)
    return len(value) <= 254 and len(local) <= 64 and not local.startswith('.') and not local.endswith('.') and '..' not in local and all(re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', label) for label in domain.split('.'))


def audit(source, cohort_path, output):
    cohort_bytes = cohort_path.read_bytes()
    cohort = json.loads(cohort_bytes)['doctors']
    by_name, by_compact = collections.defaultdict(list), collections.defaultdict(list)
    for doctor in cohort:
        name = normalized(doctor['name'])
        by_name[name].append(doctor)
        by_compact[name.replace(' ', '')].append(doctor)
    summary = {'rows': 0, 'malformedRows': 0, 'rowsWithEncodingIssues': 0, 'targetSpecialtyRows': 0, 'rowsWithValidEmail': 0,
               'rowsWithUnparsedEmailContent': 0, 'rowsWithName': 0, 'rowsWithMciNumber': 0,
               'rowsWithQualification': 0, 'rowsWithInstitution': 0, 'rowsWithCity': 0}
    specialty_counts = collections.Counter()
    overlaps = []
    with tempfile.TemporaryDirectory(prefix='dol-nodes-csv-audit-') as temp:
        db = sqlite3.connect(str(Path(temp) / 'keys.sqlite'))
        db.execute('CREATE TABLE records (rowid INTEGER, sourceid TEXT, name TEXT, digest TEXT, payload TEXT)')
        db.execute('CREATE TABLE contacts (rowid INTEGER, name TEXT, emailhash TEXT)')
        with source.open(encoding='utf-8-sig', errors='surrogateescape', newline='') as handle:
            reader = csv.DictReader(handle)
            expected = {'THB ID', 'Full Name', 'Specialty', 'Email ID1', 'Email ID2', 'Hospital/Clinic Name'}
            if not expected.issubset(reader.fieldnames or []):
                raise ValueError('Missing required CSV columns')
            for index, row in enumerate(reader, 2):
                summary['rows'] += 1
                if None in row or any(value is None for value in row.values()):
                    summary['malformedRows'] += 1
                    continue
                encoding_issue = any(re.search(r'[\udc80-\udcff]', value) for value in row.values())
                summary['rowsWithEncodingIssues'] += encoding_issue
                name = normalized(row['Full Name']) if nonempty(row['Full Name']) else ''
                source_id = row['THB ID'].strip() if nonempty(row['THB ID']) else ''
                digest = hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()
                payload = hashlib.sha256(json.dumps({k: v.strip() for k, v in row.items() if k not in {'THB ID', 'Data Added as on'}}, sort_keys=True).encode()).hexdigest()
                db.execute('INSERT INTO records VALUES (?,?,?,?,?)', (index, source_id, name, digest, payload))
                emails = set()
                unparsed = False
                for value in [row['Email ID1'], row['Email ID2']]:
                    if not nonempty(value):
                        continue
                    found = re.findall(r'[A-Za-z0-9.!#$%&\'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}', value)
                    found = [email for email in found if email_candidate(email)]
                    emails.update(email.lower() for email in found)
                    if not found:
                        unparsed = True
                for email in emails:
                    db.execute('INSERT INTO contacts VALUES (?,?,?)', (index, name, hashlib.sha256(email.encode()).hexdigest()))
                summary['rowsWithValidEmail'] += bool(emails)
                summary['rowsWithUnparsedEmailContent'] += unparsed
                summary['rowsWithName'] += bool(name)
                for key, field in [('rowsWithMciNumber', 'MCI Number'), ('rowsWithQualification', 'Qualification'), ('rowsWithInstitution', 'Hospital/Clinic Name')]:
                    summary[key] += nonempty(row.get(field, ''))
                summary['rowsWithCity'] += nonempty(row.get('City', '')) or nonempty(row.get('Mapped City', ''))
                reported_specialty = ' '.join([row.get('Specialty', ''), row.get('Specialty 2', '')])
                detected = specialties(reported_specialty)
                summary['targetSpecialtyRows'] += bool(detected)
                specialty_counts.update([row.get('Specialty', '').strip() or '(Missing)'])
                exact = by_name.get(name, []) if name else []
                candidates = exact or by_compact.get(name.replace(' ', ''), []) if name else []
                for doctor in candidates:
                    institution = normalized(row['Hospital/Clinic Name'])
                    institution_match = any(normalized(i).replace(' hospitals', '').replace(' hospital', '') in institution for i in doctor['institutions']) if institution else False
                    spec_match = bool(detected & specialties(' '.join(doctor['specialties'])))
                    basis = 'NAME_INSTITUTION_SPECIALTY' if exact and institution_match and spec_match else 'NAME_SPECIALTY' if exact and spec_match else 'NAME_ONLY' if exact else 'COMPACT_NAME_REVIEW'
                    overlaps.append({'sourceRecord': index, 'thbId': source_id, 'name': row['Full Name'],
                        'cohortId': doctor['cohort_id'], 'cohortName': doctor['name'], 'matchBasis': basis,
                        'institutionAsReported': row['Hospital/Clinic Name'], 'specialtyAsReported': reported_specialty.strip(),
                        'cityAsReported': row.get('City', ''), 'mappedCityAsReported': row.get('Mapped City', ''),
                        'hasEmail': bool(emails), 'hasMciNumber': nonempty(row.get('MCI Number', '')),
                        'reviewStatus': 'REVIEW_REQUIRED', 'encodingIssue': encoding_issue, 'merged': False})
                if index % 50000 == 0:
                    db.commit()
        db.commit()
        duplicate_review = {}
        for label, table, field in [('sourceId', 'records', 'sourceid'), ('normalizedName', 'records', 'name'), ('exactRow', 'records', 'digest'), ('sameDetailsDifferentId', 'records', 'payload'), ('email', 'contacts', 'emailhash')]:
            groups = db.execute(f'SELECT COUNT(*), COALESCE(SUM(n),0), COALESCE(SUM(n-1),0) FROM (SELECT COUNT(*) n FROM {table} WHERE {field} != \'\' GROUP BY {field} HAVING COUNT(*)>1)').fetchone()
            summary[label+'Duplicates'] = dict(zip(['groups', 'rowOccurrences', 'extraOccurrences'], groups))
            duplicate_review[label] = [{'sourceRecords': [int(i) for i in indices.split(',')], 'normalizedNames': names.split(',') if names else [], 'reviewStatus': 'REVIEW_REQUIRED'} for indices, names in db.execute(f"SELECT GROUP_CONCAT(rowid), GROUP_CONCAT(DISTINCT name) FROM {table} WHERE {field}!='' GROUP BY {field} HAVING COUNT(*)>1")]
        summary['distinctNormalizedNames'] = db.execute("SELECT COUNT(DISTINCT name) FROM records WHERE name!=''").fetchone()[0]
        summary['distinctEmails'] = db.execute('SELECT COUNT(DISTINCT emailhash) FROM contacts').fetchone()[0]
        summary['emailsSharedAcrossDifferentNames'] = db.execute("SELECT COUNT(*) FROM (SELECT emailhash FROM contacts WHERE name!='' GROUP BY emailhash HAVING COUNT(DISTINCT name)>1)").fetchone()[0]
        summary['sourceIdsWithConflictingNames'] = db.execute("SELECT COUNT(*) FROM (SELECT sourceid FROM records WHERE sourceid!='' AND name!='' GROUP BY sourceid HAVING COUNT(DISTINCT name)>1)").fetchone()[0]
        db.close()
    summary.update(cohortTotal=len(cohort), overlapRows=len({r['sourceRecord'] for r in overlaps}),
                   cohortDoctorsWithPossibleOverlap=len({r['cohortId'] for r in overlaps}),
                   overlapEvidenceCounts=dict(collections.Counter(r['matchBasis'] for r in overlaps)),
                   specialtiesAsReported=dict(specialty_counts.most_common()))
    output.mkdir(parents=True, exist_ok=True)
    report = {'source': str(source), 'sourceSha256': file_sha256(source),
              'cohortSha256': hashlib.sha256(cohort_bytes).hexdigest(), 'checkedAt': datetime.now(timezone.utc).isoformat(),
              'summary': summary, 'limitations': ['Email syntax is not deliverability or account ownership.',
              'Non-UTF-8 bytes are retained with surrogateescape and flagged; no source encoding is guessed.',
              'Matching names and contacts are review candidates, not automatic identity merges.',
              'MCI numbers, qualifications and locations are user-supplied claims, not registry verification.',
              'Source-record positions are CSV record numbers including the header, not physical lines.',
              'No raw email, phone, dedicated address field, date of birth, visiting card or image URL is exported. Hospital/Clinic Name is preserved as supplied and may itself contain an address.']}
    (output / 'DB-audit-summary.json').write_text(json.dumps(report, indent=2))
    (output / 'DB-cohort-overlap-review.json').write_text(json.dumps({'checkedAt': report['checkedAt'], 'sourceSha256': report['sourceSha256'], 'matches': overlaps}, indent=2))
    (output / 'DB-duplicate-review.json').write_text(json.dumps({'checkedAt': report['checkedAt'], 'sourceSha256': report['sourceSha256'], 'groups': duplicate_review}))
    print(json.dumps({k: v for k, v in summary.items() if k != 'specialtiesAsReported'}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('cohort', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    audit(args.source, args.cohort, args.output)

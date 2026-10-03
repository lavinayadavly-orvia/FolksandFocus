import {readFile, writeFile, realpath} from 'node:fs/promises';
import {resolve, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCanonicalDatabase} from '../canonical-database.mjs';

const directory = await realpath(resolve(process.argv[2] || '../doctor-reconciliation-private'));
const repository = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const path = relative(repository, directory);
if (!path || (!path.startsWith('..') && !isAbsolute(path))) throw Error('Private output required outside repository');
const read = async name => JSON.parse(await readFile(resolve(directory, name), 'utf8'));
const result = buildCanonicalDatabase({
  cohort: await read('cohort-validation-baseline.json'), upload: await read('priority-workbook-import.json'),
  division: await read('specialty-profile-division.json'), decisions: await read('reviewed-priority-links.json'),
  followups: await read('priority-identity-followups.json'),
});
for (const [name, data] of [
  ['canonical-working-database.json', {summary: result.summary, records: result.records, quarantined: result.quarantined}],
  ['canonical-duplicate-report.json', {summary: result.summary, records: result.duplicateReport}],
  ['canonical-field-completeness.json', {summary: result.summary, fields: result.fieldCompleteness}],
  ['canonical-later-queue.json', {summary: result.summary, tasks: result.later}],
]) await writeFile(resolve(directory, name), JSON.stringify(data, null, 2) + '\n', {mode: 0o600});
console.log(JSON.stringify(result.summary, null, 2));

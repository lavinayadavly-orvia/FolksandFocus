"""Recheck repeated uninformative responses without changing identity or backlinks."""
import argparse
import hashlib
import importlib.util
import json
from collections import defaultdict
from pathlib import Path

spec = importlib.util.spec_from_file_location('articles', Path(__file__).with_name('collect-hospital-articles.py'))
articles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(articles)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('collection')
    parser.add_argument('output')
    args = parser.parse_args()
    source, output = Path(args.collection), Path(args.output)
    if source.resolve() == output.resolve() or output.exists():
        raise ValueError('Use a new output path to preserve the previous collection')
    data = json.loads(source.read_text())
    groups = defaultdict(list)
    for row in data['articles']:
        if row['status'] == 'PAGE_CHECKED' and row.get('sha256') and not row.get('title') and not row.get('articleMetadata'):
            groups[(articles.urllib.parse.urlsplit(row['url']).hostname, row['sha256'])].append(row)
    selected = [row for group in groups.values() if len(group) > 1 for row in group]
    if len(selected) > 25:
        raise ValueError('More than 25 candidates; review the batch before collecting')
    checkpoint = output.with_suffix('.checkpoints')
    checkpoint.mkdir(exist_ok=True)
    reader = articles.Reader(checkpoint)
    restricted = {'HTTP_401', 'HTTP_403', 'HTTP_429', 'ACCESS_CHALLENGE', 'HOST_ACCESS_RESTRICTED'}
    reader.blocked.update(articles.urllib.parse.urlsplit(row['url']).hostname
                          for row in data['profiles'] + data['articles'] if row['status'] in restricted)
    results = articles.read_by_host(reader, [row['url'] for row in selected], 'response-recheck')
    for row in selected:
        previous = {key: row.get(key) for key in ['status', 'checkedAt', 'sha256', 'title', 'articleMetadata']}
        row.update(results[row['url']])
        row['previousResponse'] = previous
        row['reviewIssues'] = articles.metadata_issues(row.get('articleMetadata', []))
    data['checkedAt'] = articles.sources.now()
    data['summary']['articlesRead'] = sum(row['status'] == 'PAGE_CHECKED' for row in data['articles'])
    data['responseRecheck'] = {'attempted': len(selected), 'previousCollectionSha256': hashlib.sha256(source.read_bytes()).hexdigest()}
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(json.dumps({'rechecked': len(selected), 'statuses': {status: sum(row['status'] == status for row in selected) for status in sorted({row['status'] for row in selected})}}))


if __name__ == '__main__':
    main()

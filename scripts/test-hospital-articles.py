import importlib.util
import unittest
import hashlib
import json
import tempfile
import threading
import time
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('articles', Path(__file__).with_name('collect-hospital-articles.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArticleTests(unittest.TestCase):
    def test_recheck_preserves_backlinks_and_prior_host_restrictions(self):
        recheck_spec = importlib.util.spec_from_file_location('recheck', Path(__file__).with_name('recheck-article-responses.py'))
        recheck = importlib.util.module_from_spec(recheck_spec)
        recheck_spec.loader.exec_module(recheck)
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'old.json', Path(temp) / 'new.json'
            rows = [{'url': f'https://hospital.test/blog/{name}', 'status': 'PAGE_CHECKED', 'title': '', 'sha256': 'same', 'articleMetadata': [], 'profileBacklinks': [{'cohortId': 'a'}]} for name in ['one', 'two']]
            data = {'profiles': [{'url': 'https://hospital.test/doctors/a', 'status': 'HTTP_403'}], 'articles': rows, 'summary': {}}
            source.write_text(json.dumps(data))
            def read(reader, urls, phase):
                self.assertIn('hospital.test', reader.blocked)
                return {url: {'url': url, 'status': 'HOST_ACCESS_RESTRICTED'} for url in urls}
            with patch('sys.argv', ['recheck', str(source), str(output)]), patch.object(recheck.articles, 'read_by_host', side_effect=read):
                recheck.main()
            result = json.loads(output.read_text())
            self.assertEqual(result['summary']['articlesRead'], 0)
            self.assertEqual(result['responseRecheck']['attempted'], 2)
            for row in result['articles']:
                self.assertEqual(row['profileBacklinks'], [{'cohortId': 'a'}])
                self.assertEqual(row['previousResponse']['status'], 'PAGE_CHECKED')
            self.assertEqual(json.loads(source.read_text()), data)
            with patch('sys.argv', ['recheck', str(source), str(output)]):
                with self.assertRaises(ValueError):
                    recheck.main()

    def test_host_workers_deduplicate_and_keep_each_host_serial(self):
        class RecordingReader:
            def __init__(self):
                self.active = set()
                self.calls = []
                self.lock = threading.Lock()

            def read(self, url):
                host = module.urllib.parse.urlsplit(url).hostname
                with self.lock:
                    if host in self.active:
                        raise AssertionError('Concurrent requests to the same hospital')
                    self.active.add(host)
                    self.calls.append(url)
                time.sleep(0.01)
                with self.lock:
                    self.active.remove(host)
                return {'url': url, 'status': 'PAGE_CHECKED'}

        reader = RecordingReader()
        urls = ['https://a.test/one', 'https://a.test/two', 'https://b.test/one', 'https://a.test/one']
        results = module.read_by_host(reader, urls, 'test')
        self.assertEqual(set(results), set(urls))
        self.assertEqual(len(reader.calls), 3)
        self.assertLess(reader.calls.index(urls[0]), reader.calls.index(urls[1]))

    def test_article_links_are_same_host_and_not_listing_pages(self):
        row = module.inspect('<a href="/city/blog/topic?utm_source=x">Topic</a><a href="/city/blog/">List</a><a href="https://evil.test/blog/topic">Other</a>', 'https://hospital.test/doctors/a')
        self.assertEqual(row['articleLinks'], ['https://hospital.test/city/blog/topic'])
        self.assertEqual(module.canonical('/city/blog/topic/', 'https://hospital.test/doctors/a'), 'https://hospital.test/city/blog/topic/')

    def test_author_and_reviewer_remain_separate_and_modified_is_not_published(self):
        row = module.inspect('''<script type="application/ld+json">{"@type":"Article","headline":"Topic","author":{"@type":"Organization","name":"Hospital"},"reviewedBy":{"@type":"Person","name":"Dr A"},"dateModified":"2026-09-30"}</script>''', 'https://hospital.test/blog/topic')
        item = row['articleMetadata'][0]
        self.assertIsNone(item['datePublishedAsReported'])
        self.assertEqual([c['relationship'] for c in item['credits']], ['author', 'reviewedBy'])
        self.assertEqual(item['credits'][0]['type'], 'Organization')

    def test_care_nested_blog_details_keep_articles_not_category_indexes(self):
        row = module.inspect('''<a href="/indore/blog-detail/endocrinology/pre-diabetes">Article</a>
            <a href="/blog-detail/cardiology/heart-care/">Article</a>
            <a href="/indore/blog-detail/endocrinology">Category</a>
            <a href="/blog-detail/">Index</a>
            <a href="https://other.test/blog-detail/endocrinology/topic">External</a>''',
            'https://www.carehospitals.com/indore/doctor/ajay-gupta-endocrinologist')
        self.assertEqual(row['articleLinks'], ['https://www.carehospitals.com/blog-detail/cardiology/heart-care/',
            'https://www.carehospitals.com/indore/blog-detail/endocrinology/pre-diabetes'])

    def test_care_root_articles_do_not_turn_city_category_links_into_articles(self):
        body = '''<a href="/blog-detail/diabetes-care/">Article</a>
            <a href="/blog-detail/">Index</a>
            <a href="/indore/blog-detail/endocrinology">City category</a>'''
        row = module.inspect(body, 'https://www.carehospitals.com/doctor/a')
        self.assertEqual(row['articleLinks'], ['https://www.carehospitals.com/blog-detail/diabetes-care/'])
        self.assertEqual(module.inspect(body, 'https://other.test/doctor/a')['articleLinks'], [])

    def test_medanta_patient_education_articles_exclude_navigation_and_external_links(self):
        row = module.inspect('''
            <a href="/patient-education-blog/combat-typhoid-with-these-expert-treatment-strategies">Article</a>
            <a href="/patient-education-blog/">All articles</a>
            <a href="/patient-education-blog">All articles</a>
            <a href="/patient-education-blog/category/diabetes">Category</a>
            <a href="https://other.test/patient-education-blog/topic">External</a>
        ''', 'https://www.medanta.org/doctors/a')
        self.assertEqual(row['articleLinks'], ['https://www.medanta.org/patient-education-blog/combat-typhoid-with-these-expert-treatment-strategies'])

    def test_kauvery_newsletter_links_preserve_trailing_slash_without_collecting_lists(self):
        row = module.inspect('''<a href="/news-events/february-giddiness-and-fainting/">Article</a>
            <a href="/news-events/">News</a><a href="/news-events/category/diabetes">Category</a>
            <a href="https://external.test/news-events/article/">External</a>''',
            'https://www.kauveryhospital.com/doctors/a/')
        self.assertEqual(row['articleLinks'], ['https://www.kauveryhospital.com/news-events/february-giddiness-and-fainting/'])

    def test_aster_nested_articles_exclude_hospital_and_blog_indexes(self):
        row = module.inspect('''<a href="/blogs-events-news/aster-whitefield-bangalore/type-2-diabetes">Article</a>
            <a href="/blogs-events-news?doctor=123">Filtered index</a>
            <a href="/blogs-events-news/aster-whitefield-bangalore">Hospital index</a>
            <a href="https://external.test/blogs-events-news/hospital/article">External</a>''',
            'https://www.asterhospitals.in/doctors/aster-whitefield-bangalore/dr-narendra-bs')
        self.assertEqual(row['articleLinks'], ['https://www.asterhospitals.in/blogs-events-news/aster-whitefield-bangalore/type-2-diabetes'])

    def test_person_schema_and_mentions_do_not_become_authorship(self):
        row = module.inspect('Dr A <script type="application/ld+json">{"@type":"Person","name":"Dr A"}</script>', 'https://hospital.test/blog/topic')
        self.assertEqual(row['articleMetadata'], [])

    def test_cached_access_denial_stops_same_host_after_resume(self):
        with tempfile.TemporaryDirectory() as temp:
            url = 'https://hospital.test/blog/first'
            path = Path(temp) / (hashlib.sha256(url.encode()).hexdigest() + '.json')
            path.write_text(json.dumps({'url': url, 'status': 'HTTP_403', 'articleLinks': []}))
            reader = module.Reader(Path(temp))
            with patch.object(module.sources, 'fetch') as fetch:
                self.assertEqual(reader.read(url)['status'], 'HTTP_403')
                self.assertEqual(reader.read('https://hospital.test/blog/next')['status'], 'HOST_ACCESS_RESTRICTED')
                fetch.assert_not_called()

    def test_robots_disallow_does_not_fetch_article(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(module.sources, 'fetch', return_value='User-agent: *\nDisallow: /blog/') as fetch:
                row = module.Reader(Path(temp)).read('https://hospital.test/blog/topic')
                self.assertEqual(row['status'], 'ROBOTS_DISALLOWED')
                fetch.assert_called_once_with('https://hospital.test/robots.txt')

    def test_unicode_paths_are_encoded_once_without_changing_existing_escapes(self):
        with patch.object(module.sources.urllib.request, 'build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = b'page'
            module.sources.fetch('https://hospital.test/blog/\u092e\u0927\u0941\u092e\u0947\u0939?term=%20&lang=hi')
            request = opener.return_value.open.call_args.args[0]
            self.assertTrue(request.full_url.isascii())
            self.assertIn('term=%20&lang=hi', request.full_url)
            self.assertNotIn('%2520', request.full_url)

    def test_cached_encoding_failure_can_retry_without_retrying_access_denials(self):
        with tempfile.TemporaryDirectory() as temp:
            url = 'https://hospital.test/blog/topic'
            path = Path(temp) / (hashlib.sha256(url.encode()).hexdigest() + '.json')
            path.write_text(json.dumps({'url': url, 'status': 'FETCH_FAILED_UnicodeEncodeError'}))
            with patch.object(module.sources, 'fetch', side_effect=['User-agent: *\nAllow: /', '<title>Article</title>']), patch.object(module.time, 'sleep'):
                self.assertEqual(module.Reader(Path(temp)).read(url)['status'], 'PAGE_CHECKED')

    def test_unknown_schema_types_are_ignored(self):
        self.assertEqual(module.inspect('<script type="application/ld+json">{"@type":5}</script>', 'https://hospital.test/blog/topic')['articleMetadata'], [])

    def test_conflicting_published_dates_are_flagged_without_choosing_one(self):
        self.assertEqual(module.metadata_issues([{'datePublishedAsReported': '2025-10-10'}, {'datePublishedAsReported': '2025-12-11 00:00:00'}]), ['CONFLICTING_PUBLICATION_DATES'])
        self.assertEqual(module.metadata_issues([{'datePublishedAsReported': '2025-10-10'}, {'datePublishedAsReported': '2025-10-10 00:00:00'}]), [])
        self.assertEqual(module.metadata_issues([{'dateModifiedAsReported': '2025-10-10'}]), [])


if __name__ == '__main__':
    unittest.main()

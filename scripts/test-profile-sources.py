import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('sources', Path(__file__).with_name('collect-profile-sources.py'))
sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sources)


class SourceTests(unittest.TestCase):
    def test_footer_accounts_are_not_doctor_accounts(self):
        result = sources.extract('<a href="https://x.com/hospital">Hospital</a>', 'Anita Sharma')
        self.assertEqual(result['links'][0]['relationship'], 'PAGE_LINK_OWNERSHIP_UNCONFIRMED')
        self.assertFalse(result['links'][0]['nativePostVerified'])

    def test_person_sameas_requires_matching_person_not_organisation(self):
        result = sources.extract('''<script type="application/ld+json">[
          {"@type":"Organization","name":"Anita Sharma","sameAs":"https://x.com/hospital"},
          {"@type":"Person","name":"Other Sharma","sameAs":"https://x.com/other"},
          {"@type":"Person","name":"Dr. Anita Sharma","sameAs":"https://x.com/anita"}]
          </script>''', 'Anita Sharma')
        self.assertEqual(len(result['links']), 1)
        self.assertEqual(result['links'][0]['reviewStatus'], 'REVIEW_REQUIRED')

    def test_video_metadata_never_invents_date_metrics_or_authorship(self):
        result = sources.extract('''<script type="application/ld+json">{"@type":"VideoObject","name":"Clinical talk","embedUrl":"https://youtube.com/embed/abcdefghijk"}</script>''', 'Anita Sharma')
        self.assertIsNone(result['links'][0]['dateAsReported'])
        self.assertNotIn('metrics', result['links'][0])
        self.assertEqual(result['links'][0]['relationship'], 'INSTITUTIONAL_VIDEO_CANDIDATE')

    def test_bad_schema_and_lookalike_hosts_are_ignored(self):
        result = sources.extract('''<script type="application/ld+json">{"@type":17}</script><a href="https://x.com.evil.test/anita">Fake</a>''', 'Anita Sharma')
        self.assertEqual(result['links'], [])

    def test_tracking_removed_without_breaking_playlist_identifiers(self):
        result = sources.extract('<a href="https://youtube.com/playlist?list=PL123&amp;utm_source=web">Playlist</a>', 'Anita Sharma')
        self.assertEqual(result['links'][0]['url'], 'https://youtube.com/playlist?list=PL123')


if __name__ == '__main__':
    unittest.main()

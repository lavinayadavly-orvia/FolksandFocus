import importlib.util
import unittest
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit-doctor-csv.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def test_streamed_checksum_works_on_supported_python(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.csv'
            source.write_bytes(b'abc')
            self.assertEqual(audit.file_sha256(source), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')

    def test_name_normalization_does_not_equate_different_initials(self):
        self.assertEqual(audit.normalized('Dr. Praveen Chandra'), 'praveen chandra')
        self.assertNotEqual(audit.normalized('Dr A Kumar'), audit.normalized('Dr B Kumar'))

    def test_specialty_is_not_inferred_from_name_or_degree(self):
        self.assertEqual(audit.specialties('MBBS MD'), set())
        self.assertEqual(audit.specialties('Dentistry'), set())
        self.assertIn('Endocrinology', audit.specialties('Endocrinologist'))
        self.assertIn('Gynecology_Obstetrics', audit.specialties('Gynaecology and Obstetrics'))

    def test_email_syntax_is_conservative_and_does_not_strip_aliases(self):
        self.assertTrue(audit.email_candidate('doctor+clinic@example.org'))
        for value in ['doctor..name@example.org', '.doctor@example.org', 'doctor@example..org', 'doctor@-example.org']:
            self.assertFalse(audit.email_candidate(value))


if __name__ == '__main__':
    unittest.main()

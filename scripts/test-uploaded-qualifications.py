import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('qualification', Path(__file__).with_name('audit-uploaded-qualifications.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class QualificationTests(unittest.TestCase):
    def test_claims_not_verified(self):
        self.assertEqual(module.qualification_bucket('M.B.B.S., MD'), 'MBBS_CLAIM')
        self.assertEqual(module.qualification_bucket('MD'), 'POSTGRADUATE_CLAIM_PRIMARY_DEGREE_UNRESOLVED')

    def test_ayush_md_not_assumed_allopathic(self):
        self.assertEqual(module.qualification_bucket('BAMS MD'), 'AYUSH_CLAIM_SCOPE_REVIEW')
        self.assertEqual(module.qualification_bucket('MD Ayurveda'), 'AYUSH_CLAIM_SCOPE_REVIEW')
        self.assertEqual(module.qualification_bucket('MBBS BAMS'), 'MIXED_CREDENTIAL_REVIEW')

    def test_unknown_and_dental_preserved(self):
        self.assertEqual(module.qualification_bucket('OTHERS'), 'QUALIFICATION_UNRESOLVED')
        self.assertEqual(module.qualification_bucket('BDS MDS'), 'DENTAL_CLAIM_SCOPE_REVIEW')


if __name__ == '__main__':
    unittest.main()

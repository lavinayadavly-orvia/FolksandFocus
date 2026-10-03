import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('review', Path(__file__).with_name('review-csv-duplicates.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DuplicateReviewTests(unittest.TestCase):
    def test_public_report_destination_rejected_before_read(self):
        with self.assertRaisesRegex(ValueError, 'private report'):
            module.review(Path('/missing/source'), Path('/missing/audit'), Path(__file__).resolve().parent / 'report.json')

    def test_same_payload_is_not_verified_identity(self):
        row = {'THB ID': 'one', 'Full Name': 'A Kumar', 'MCI Number': '12345', 'City': 'Delhi'}
        result = module.classify([row, {**row, 'THB ID': 'two'}])
        self.assertEqual(result['recordDisposition'], 'REPEATED_PAYLOAD_CONFIRMED')
        self.assertFalse(result['merged'])
        self.assertFalse(result['registrationVerified'])
        self.assertTrue(result['hasRegistrationCandidate'])

    def test_state_name_is_not_registration_number(self):
        row = {'Full Name': 'A Kumar', 'MCI Number': 'Karnataka'}
        self.assertFalse(module.classify([row, row])['hasRegistrationCandidate'])

    def test_same_name_different_city_not_identical_payload(self):
        row = {'Full Name': 'A Kumar', 'City': 'Delhi'}
        self.assertEqual(module.classify([row, {**row, 'City': 'Mumbai'}])['recordDisposition'], 'PAYLOAD_MISMATCH_REVIEW')


if __name__ == '__main__':
    unittest.main()

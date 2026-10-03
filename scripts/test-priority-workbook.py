import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('priority', Path(__file__).with_name('reconcile-priority-workbook.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PriorityTests(unittest.TestCase):
    def test_specialty_scope(self):
        for specialty in module.PRIORITY:
            self.assertEqual(module.scope_for(specialty), 'NOW_PRIORITY_SPECIALTY')
        self.assertEqual(module.scope_for('Cardiac Anaesthesiology'), 'LATER_CARDIAC_ANAESTHESIOLOGY')
        self.assertEqual(module.scope_for('Chest Physician'), 'LATER_SPECIALTY_REVIEW')

    def test_name_normalization_keeps_initials(self):
        self.assertEqual(module.name_key('Dr. A. Kumar'), 'a kumar')
        self.assertNotEqual(module.name_key('A Kumar'), module.name_key('Anil Kumar'))

    def test_profile_paths_remain_distinct(self):
        self.assertEqual(module.url_key('http://www.hospital.test/a/'), 'https://hospital.test/a')
        self.assertNotEqual(module.url_key('https://hospital.test/a'), module.url_key('https://hospital.test/b'))
        self.assertIsNone(module.url_key('No source'))

    def test_public_output_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Private output'):
            module.run(Path('/missing'), Path(__file__).resolve().parents[1])

if __name__ == '__main__':
    unittest.main()

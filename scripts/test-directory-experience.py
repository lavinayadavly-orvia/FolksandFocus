import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-directory-experience.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class ExtractionTests(unittest.TestCase):
    def test_explicit_card_experience_only(self):
        body = '''<p>Hospital with 50 Years Experience</p>
        <div class="doctor-card-new"><h4><a href="/doctor/one">Dr One</a></h4>
        <p><strong>Experience: </strong>30+ Years</p></div>
        <div class="doctor-card-new"><h4><a href="/doctor/two">Dr Two</a></h4>
        <p>Senior Director 1990</p></div>'''
        rows = collector.inspect(body, 'https://hospital.org/doctors')['experienceRecords']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['nameAsReported'], 'Dr One')
        self.assertEqual(rows[0]['profileUrl'], 'https://hospital.org/doctor/one')
        self.assertEqual(rows[0]['years'], 30)
        self.assertTrue(rows[0]['lowerBound'])


if __name__ == '__main__':
    unittest.main()

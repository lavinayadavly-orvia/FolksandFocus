import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-profile-experience.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class ExperienceTests(unittest.TestCase):
    def test_medanta_biography_is_scoped(self):
        body = '<h1>Dr Test Doctor</h1><div class="cardilogy_sp_content_box">She has over 35 years of medical experience.</div><aside>Another doctor has 20 years of experience.</aside>'
        rows = collector.inspect_profile(body, 'https://hospital.org/doctor', 'Test Doctor', 'Medanta')['experienceRecords']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['years'], 35)
        self.assertTrue(rows[0]['lowerBound'])

    def test_kauvery_biography_stops_before_publications(self):
        body = '<h1>Dr Test Doctor</h1><div id="tb1"><div class="tbtxt"><div><b>Brief Profile:</b></div><div>She has 28 years of experience.</div><div><b>Publications</b></div><p>Hospital study: 50 years of experience.</p></div></div><div id="tb2"><p>40 years of experience.</p></div>'
        rows = collector.inspect_profile(body, 'https://hospital.org/doctor', 'Test Doctor', 'Kauvery Hospital')['experienceRecords']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['years'], 28)

    def test_marengo_explicit_profile_field(self):
        body = '<h1>Dr Test Doctor</h1><p class="doctor-meta-tag doctor-experience-tag">21 Years of Experience</p><p>Our hospital has 50 years of experience.</p>'
        result = collector.inspect_profile(body, 'https://hospital.org/doctor', 'Test Doctor', 'Marengo Asia Hospitals')
        self.assertEqual(len(result['experienceRecords']), 1)
        self.assertEqual(result['experienceRecords'][0]['years'], 21)
        self.assertEqual(collector.inspect_profile(body, 'https://hospital.org/doctor', 'Other Name', 'Marengo Asia Hospitals')['experienceReview'], 'PROFILE_NAME_MISMATCH')

    def test_kims_biography_excludes_publication_text(self):
        body = '<h1>Dr Test Doctor</h1><div class="content doctor-profile-content"><p>OP Timings:</p><p>Brief Profile:</p><p>Dr Test Doctor works as a consultant cardiologist at the hospital. He has 20 years of experience as a cardiologist and treats patients with a range of cardiac conditions.</p><ul><li>Study: 50 years of experience in the hospital.</li></ul></div>'
        rows = collector.inspect_profile(body, 'https://hospital.org/doctor', 'Test Doctor', 'KIMS Hospitals')['experienceRecords']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['years'], 20)
        self.assertEqual(rows[0]['publisher'], 'KIMS Hospitals')

    def test_manipal_overview_excludes_related_doctors(self):
        body = '<h1>Dr Test Doctor</h1><div id="doc-overview">Experience of over 16 years.</div><aside>Another doctor has 50 years of experience.</aside>'
        rows = collector.inspect_profile(body, 'https://hospital.org/doctor', 'Test Doctor', 'Manipal Hospitals')['experienceRecords']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['years'], 16)
        self.assertTrue(rows[0]['lowerBound'])
        self.assertEqual(rows[0]['publisher'], 'Manipal Hospitals')

    def test_care_labelled_experience(self):
        body = '<h1>Best Cardiologist</h1><h2 class="doctor-name">Dr Test Doctor</h2><div class="docbox-flex"><p>Experience</p><p class="doc-boxtext">42 Years</p></div>'
        result = collector.inspect_profile(body, 'https://care.org/doctor', 'Test Doctor', 'CARE Hospitals')
        self.assertEqual(result['experienceRecords'][0]['years'], 42)
        self.assertEqual(result['experienceRecords'][0]['publisher'], 'CARE Hospitals')
        self.assertEqual(collector.inspect_profile(body, 'https://care.org/doctor', 'Someone Else', 'CARE Hospitals')['experienceReview'], 'PROFILE_NAME_MISMATCH')

    def extract(self, text, heading='Dr Test Doctor'):
        return collector.inspect_profile(f'<h1>{heading}</h1><div class="doctor__overview">{text}</div><aside>50 years of experience</aside>', 'https://hospital.org/doctor', 'Test Doctor')

    def test_care_decimal_and_minimum_fields(self):
        for value, years, bound in [('Over 16 Years',16,True),('2.6 year',2.6,False),('10+ Years',10,True)]:
            body = f'<h2 class="doctor-name">Dr Test Doctor</h2><div class="docbox-flex"><p>Experience</p><p class="doc-boxtext">{value}</p></div>'
            row = collector.inspect_profile(body, 'https://care.org/doctor', 'Test Doctor', 'CARE Hospitals')['experienceRecords'][0]
            self.assertEqual((row['years'],row['lowerBound']),(years,bound))
        body = '<h2 class="doctor-name">Dr Test Doctor</h2><div class="docbox-flex"><p>Experience</p><p class="doc-boxtext">Nearly 20 Years</p></div>'
        self.assertEqual(collector.inspect_profile(body, 'https://care.org/doctor', 'Test Doctor', 'CARE Hospitals')['experienceRecords'],[])

    def test_explicit_experience_and_bound(self):
        for text, years, bound in [('She has 20 years of experience.', 20, False),
                                   ('His overall experience of 21 years includes clinical work.', 21, False),
                                   ('With more than 35 years of clinical experience.', 35, True),
                                   ('With 12+ years of experience.', 12, True),
                                   ('With over 15 years of clinical expertise.', 15, True),
                                   ('With over a decade of experience.', 10, True),
                                   ('With 8 years of dedicated experience.', 8, False),
                                   ('With over two decades of clinical experience.', 20, True),
                                   ('Three decades of medical experience.', 30, False)]:
            rows = self.extract(text)['experienceRecords']
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['years'], years)
            self.assertEqual(rows[0]['lowerBound'], bound)

    def test_no_invented_or_unrelated_experience(self):
        mixed = self.extract('Over 22 years of practise in Medicine and over 8 years of experience in Cardiology.')
        self.assertEqual(mixed['experienceReview'], 'MULTIPLE_EXPERIENCE_AMOUNTS')
        self.assertEqual({r['years'] for r in mixed['experienceCandidates']}, {22, 8})
        for text in ['MBBS 1990. Senior Director.', 'Nearly 20 years of experience.', '120 years of experience.', '5.5 years of experience.', 'Nearly two decades of clinical experience.']:
            self.assertEqual(self.extract(text)['experienceRecords'], [])
        self.assertEqual(self.extract('20 years of experience.', 'Dr Other')['experienceReview'], 'PROFILE_NAME_MISMATCH')
        self.assertEqual(self.extract('20 years of experience. 10 years of clinical experience.')['experienceReview'], 'MULTIPLE_EXPERIENCE_AMOUNTS')


if __name__ == '__main__':
    unittest.main()

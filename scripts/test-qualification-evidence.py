import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-qualification-evidence.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class QualificationTests(unittest.TestCase):
    def test_scoped_entries(self):
        body = '<h1>Dr. Test Doctor</h1><div class="doctor-profile-content"><h3>Qualifications:</h3><ul><li>M.B.B.S, Medical College - 2004</li><li>MD 2010</li></ul><h3>Publications:</h3><ul><li>MBBS students survey 2020</li></ul></div><aside>MBBS 1990</aside>'
        self.assertEqual(collector.inspect(body, 'url', 'Test Doctor')['qualificationRecords'], ['MBBS, Medical College - 2004'])
        self.assertEqual(collector.inspect(body, 'url', 'Other Doctor')['qualificationRecords'], [])

    def test_range_and_undated(self):
        body = '<h1>Dr Test Doctor</h1><div class="doctor-profile-content"><p><strong>Education &amp; Qualifications:</strong></p><ul><li>MBBS - College (2003-2009)</li><li>MBBS - College</li></ul><p>Experience:</p><ul><li>MBBS teaching 2017</li></ul></div>'
        self.assertEqual(collector.inspect(body, 'url', 'Test Doctor')['qualificationRecords'], ['MBBS - College (2003-2009)'])

    def test_kauvery_bold_section_boundary(self):
        body = '<h1>Dr Test Doctor</h1><div id="tb1"><div class="tbtxt"><p><strong>Educational Qualification</strong></p><ul><li>MBBS - College (2008)</li><li>MS 2012</li></ul><p><strong>Presentations</strong></p><ul><li>MBBS students study 2018</li></ul></div></div><div>MBBS 1990</div>'
        self.assertEqual(collector.inspect(body, 'url', 'Test Doctor', 'Kauvery Hospital')['qualificationRecords'], ['MBBS - College (2008)'])
        self.assertEqual(collector.inspect(body, 'url', 'Other Doctor', 'Kauvery Hospital')['qualificationRecords'], [])

    def test_no_education_label_no_qualification(self):
        body = '<h1>Dr Test Doctor</h1><div id="tb1"><div class="tbtxt"><p><strong>Research Experience</strong></p><ul><li>MBBS teaching 2010</li></ul></div></div>'
        self.assertEqual(collector.inspect(body, 'url', 'Test Doctor', 'Kauvery Hospital')['qualificationRecords'], [])

    def test_aster_completion_not_admission_or_related_doctor(self):
        body = '<h1>Dr Test Doctor</h1><div class="doctor__overview"><p>She completed MBBS at Medical College in 2004 and MD in 2010.</p><p>She enrolled in the MBBS 1998 batch.</p></div><aside><p>Another doctor completed MBBS in 1980.</p></aside>'
        self.assertEqual(collector.inspect(body, 'url', 'Test Doctor', 'Aster Hospitals')['qualificationRecords'], ['She completed MBBS at Medical College in 2004 and MD in 2010.'])

    def test_manipal_biography_not_publications(self):
        body = '<h1>Dr Test Doctor</h1><div id="doc-overview"><div class="overview-para"><li><p>He earned his MBBS in 2005 and MD in 2011.</p></li></div><div><li>Completed study of MBBS students in 2020</li></div></div>'
        self.assertEqual(collector.inspect(body, 'url', 'Test Doctor', 'Manipal Hospitals')['qualificationRecords'], ['He earned his MBBS in 2005 and MD in 2011.'])


if __name__ == '__main__':
    unittest.main()

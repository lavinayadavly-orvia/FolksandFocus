import importlib.util
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

spec = importlib.util.spec_from_file_location("collector", Path(__file__).with_name("collect-cohort-publications.py"))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
SOURCE = {"url": "https://eutils.ncbi.nlm.nih.gov/example", "checkedAt": "2026-09-30", "sha256": "test"}


class MetadataTests(unittest.TestCase):
    def test_author_affiliations_do_not_bleed_between_authors(self):
        node = ET.fromstring('''<PubmedArticle><MedlineCitation><PMID>1</PMID><Article>
        <ArticleTitle>Example <i>title</i></ArticleTitle><AuthorList>
        <Author><ForeName>Anita</ForeName><LastName>Sharma</LastName><AffiliationInfo><Affiliation>Hospital A; someone@example.org</Affiliation></AffiliationInfo></Author>
        <Author><ForeName>Other</ForeName><LastName>Author</LastName></Author></AuthorList>
        <Abstract>Never export this text.</Abstract></Article></MedlineCitation></PubmedArticle>''')
        record = collector.parse_article(node, SOURCE)
        self.assertEqual(record["title"], "Example title")
        self.assertNotIn("someone@", record["authors"][0]["affiliations"][0])
        self.assertEqual(record["authors"][1]["affiliations"], [])
        self.assertNotIn("abstract", record)
        self.assertFalse(record["socialPost"])

    def test_book_records_are_not_silently_dropped(self):
        node = ET.fromstring('''<PubmedBookArticle><BookDocument><PMID>2</PMID><Book>
        <BookTitle>Example report</BookTitle><Publisher><PublisherName>Publisher</PublisherName></Publisher>
        <PubDate><Year>2026</Year></PubDate><AuthorList><Author><ForeName>Anita</ForeName><LastName>Sharma</LastName></Author></AuthorList>
        </Book></BookDocument></PubmedBookArticle>''')
        record = collector.parse_book(node, SOURCE)
        self.assertEqual(record["pmid"], "2")
        self.assertEqual(record["publicationTypes"], ["Book / Report"])
        self.assertEqual(record["authors"][0]["name"], "Anita Sharma")

    def test_titles_are_removed_without_truncating_names(self):
        self.assertEqual(collector.clean_name("Dr. Dravid Kumar"), "Dravid Kumar")


if __name__ == "__main__":
    unittest.main()

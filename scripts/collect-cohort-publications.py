"""Checkpointed public PubMed metadata discovery; no abstracts or contact data exported."""
import argparse
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path


def clean_name(value):
    value = re.sub(r"\(Gp Capt\)|\b(?:dr|prof|professor)\b\.?", " ", value, flags=re.I)
    return re.sub(r"[^a-zA-Z ]", " ", value).strip()


def text(node):
    return "".join(node.itertext()).strip() if node is not None else ""


def request(endpoint, params, cache):
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/" + endpoint + "?" + urllib.parse.urlencode(params)
    key = hashlib.sha256(url.encode()).hexdigest()
    path = cache / (key + ".json")
    if path.exists():
        return json.loads(path.read_text())
    error = None
    for attempt in range(3):
        try:
            time.sleep(0.6 + attempt * 3)
            req = urllib.request.Request(url, headers={"User-Agent": "DOLyticsResearch/1.0 (public bibliographic metadata)"})
            with urllib.request.urlopen(req, timeout=45) as response:
                body = response.read().decode("utf-8")
            if '"error"' in body.lower() or "<ERROR>" in body:
                raise ValueError("Provider returned an error")
            result = {"url": url, "checkedAt": datetime.now(timezone.utc).isoformat(),
                      "sha256": hashlib.sha256(body.encode()).hexdigest(), "body": body}
            path.write_text(json.dumps(result))
            return result
        except Exception as exc:
            error = str(exc)
    raise RuntimeError(error)


def parse_article(node, source):
    citation = node.find("MedlineCitation")
    article = citation.find("Article")
    pmid = text(citation.find("PMID"))
    authors = []
    for author in article.findall("AuthorList/Author"):
        # Affiliation text can contain email addresses; they are not needed for identity resolution.
        affiliations = [re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]+", "[contact omitted]", text(a))
                        for a in author.findall("AffiliationInfo/Affiliation")]
        authors.append({"name": (text(author.find("ForeName")) + " " + text(author.find("LastName"))).strip(),
                        "initials": text(author.find("Initials")), "lastName": text(author.find("LastName")),
                        "affiliations": affiliations})
    dates = []
    for d in article.findall("ArticleDate"):
        dates.append({"basis": d.get("DateType"), **{c.tag: text(c) for c in d}})
    issue = article.find("Journal/JournalIssue/PubDate")
    if issue is not None:
        dates.append({"basis": "JOURNAL_ISSUE", **{c.tag: text(c) for c in issue}})
    return {"id": "PMID-" + pmid, "pmid": pmid, "url": "https://pubmed.ncbi.nlm.nih.gov/" + pmid + "/",
            "title": text(article.find("ArticleTitle")), "journal": text(article.find("Journal/Title")),
            "doi": next((text(a) for a in node.findall("PubmedData/ArticleIdList/ArticleId") if a.get("IdType") == "doi"), None),
            "authors": authors, "dates": dates, "publicationTypes": [text(p) for p in article.findall("PublicationTypeList/PublicationType")],
            "checkedAt": source["checkedAt"], "sourceUrl": source["url"], "sourceHash": source["sha256"],
            "clinicalFindingsAppraised": False, "socialPost": False}


def parse_book(node, source):
    document = node.find("BookDocument")
    book = document.find("Book")
    # Adapt book metadata into the same bibliographic schema without treating it as a journal article.
    article = ET.Element("PubmedArticle")
    citation = ET.SubElement(article, "MedlineCitation")
    citation.append(document.find("PMID"))
    content = ET.SubElement(citation, "Article")
    title = ET.SubElement(content, "ArticleTitle")
    title.text = text(document.find("ArticleTitle")) or text(book.find("BookTitle"))
    authors = document.find("AuthorList")
    if authors is None:
        authors = book.find("AuthorList")
    if authors is not None:
        content.append(authors)
    journal = ET.SubElement(content, "Journal")
    ET.SubElement(journal, "Title").text = text(book.find("Publisher/PublisherName"))
    issue = ET.SubElement(journal, "JournalIssue")
    if book.find("PubDate") is not None:
        issue.append(book.find("PubDate"))
    types = ET.SubElement(content, "PublicationTypeList")
    ET.SubElement(types, "PublicationType").text = "Book / Report"
    data = ET.SubElement(article, "PubmedData")
    if document.find("ArticleIdList") is not None:
        data.append(document.find("ArticleIdList"))
    return parse_article(article, source)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cohort")
    parser.add_argument("output")
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    args = parser.parse_args()
    doctors = json.loads(Path(args.cohort).read_text())["doctors"]
    output = Path(args.output)
    cache = output.parent / "pubmed-cache"
    cache.mkdir(exist_ok=True)
    searches, publications, errors = [], {}, []
    for offset in range(0, len(doctors), 40):
        batch = doctors[offset:offset + 40]
        names = sorted(set(clean_name(d["name"]) for d in batch))
        # Quoted natural-order names suppress PubMed's full-name translation.
        # Include both orders unquoted; corroborate only after retrieving author metadata.
        variants = set(names)
        variants.update(" ".join([name.split()[-1], *name.split()[:-1]]) for name in names if name)
        terms = " OR ".join(name + '[fau]' for name in sorted(variants) if name)
        hospitals = ' OR '.join(term + '[Affiliation]' for term in ['Manipal', 'Max', 'KIMS', 'Krishna Institute', 'Aster', 'Medicover', 'Medanta', 'Kauvery', 'CARE', 'Marengo'])
        query = f'({terms}) AND ({hospitals}) AND ("{args.start}"[Date - Publication] : "{args.end}"[Date - Publication])'
        try:
            result = request("esearch.fcgi", {"db": "pubmed", "term": query, "retmode": "json", "retmax": 9999, "tool": "dolytics"}, cache)
            found = json.loads(result["body"])["esearchresult"]
            ids = found["idlist"]
            search = {"cohortIds": [d["cohort_id"] for d in batch], "query": query, "sourceUrl": result["url"],
                      "checkedAt": result["checkedAt"], "count": int(found["count"]), "retrieved": len(ids),
                      "status": "COMPLETE" if len(ids) == int(found["count"]) else "TRUNCATED", "pmids": ids,
                      "queryTranslation": found.get("querytranslation"), "warnings": found.get("warninglist", {})}
            for start in range(0, len(ids), 150):
                source = request("efetch.fcgi", {"db": "pubmed", "id": ",".join(ids[start:start + 150]), "retmode": "xml", "tool": "dolytics"}, cache)
                root = ET.fromstring(source["body"])
                for node in root.findall("PubmedArticle"):
                    record = parse_article(node, source)
                    publications[record["pmid"]] = record
                for node in root.findall("PubmedBookArticle"):
                    record = parse_book(node, source)
                    publications[record["pmid"]] = record
            if any(pmid not in publications for pmid in ids):
                search["status"] = "INCOMPLETE_METADATA"
            searches.append(search)
        except Exception as exc:
            errors.append({"cohortIds": [d["cohort_id"] for d in batch], "error": str(exc), "query": query})
        payload = {"schemaVersion": 1, "cohortTotal": len(doctors), "cohortHash": hashlib.sha256(Path(args.cohort).read_bytes()).hexdigest(),
                   "window": {"start": args.start, "end": args.end}, "generatedAt": datetime.now(timezone.utc).isoformat(),
                   "searches": searches, "publications": list(publications.values()), "errors": errors,
                   "limitations": ["Author-name search is discovery, not identity verification.", "No social platform, news or conference coverage is implied.",
                                    "No result means not found by this query, not no publications.", "Discovery is restricted to cohort hospital-network affiliation terms; prior-institution publications may be missed.",
                                    "Search batches cover names together; matching is resolved per author separately."],
                   "providerNotice": "https://www.ncbi.nlm.nih.gov/About/disclaimer.html"}
        temporary = output.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        temporary.replace(output)
        print(f"{min(offset + 40, len(doctors))}/{len(doctors)} names searched; {len(publications)} unique publication candidates; {len(errors)} failed batches", flush=True)


if __name__ == "__main__":
    main()

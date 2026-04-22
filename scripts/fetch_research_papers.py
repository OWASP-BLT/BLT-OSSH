"""Fetch research papers from arXiv API and update ossh_catalog.json."""

import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "ossh_catalog.json"
ARXIV_API_URL = "http://export.arxiv.org/api/query?"
MAX_PAPERS = 100
RATE_LIMIT_DELAY = 2

# arXiv categories for computer science topics relevant to developers
SEARCH_QUERIES = [
    "cat:cs.SE",  # Software Engineering
    "cat:cs.PL",  # Programming Languages
    "cat:cs.LG",  # Machine Learning and Computational Learning Theory
    "cat:cs.AI",  # Artificial Intelligence
    "cat:cs.CR",  # Cryptography and Security
    "cat:cs.DS",  # Data Structures and Algorithms
    "cat:cs.DB",  # Databases
    "cat:cs.DC",  # Distributed, Parallel, and Cluster Computing
    "cat:cs.NE",  # Neural and Evolutionary Computing
    "cat:cs.CL",  # Computation and Language
]


def fetch_arxiv_papers():
    """Fetch papers from arXiv using API queries."""
    papers = {}
    
    # Get papers from the last 30 days
    yesterday = datetime.utcnow() - timedelta(days=30)
    date_query = f"submittedDate:[{yesterday.strftime('%Y%m%d')}000000 TO 9999999999999]"

    for query in SEARCH_QUERIES:
        try:
            time.sleep(RATE_LIMIT_DELAY)
            
            # Combine category query with date filter
            full_query = f"{query} AND {date_query}"
            params = {
                "search_query": full_query,
                "start": 0,
                "max_results": 20,
                "sortBy": "submittedDate",
                "sortOrder": "descending",
            }

            response = requests.get(ARXIV_API_URL, params=params, timeout=30)
            response.raise_for_status()

            # Parse Atom feed XML (simple parsing)
            import xml.etree.ElementTree as ET
            root = ET.fromstring(response.content)
            
            # Namespace for Atom feed
            ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}

            for entry in root.findall("atom:entry", ns):
                try:
                    # Extract paper details
                    arxiv_id = entry.find("atom:id", ns).text.split("/abs/")[-1]
                    
                    if arxiv_id in papers:
                        continue

                    title = entry.find("atom:title", ns).text.strip()
                    summary = entry.find("atom:summary", ns).text.strip()
                    published = entry.find("atom:published", ns).text
                    
                    # Get authors
                    authors = []
                    for author in entry.findall("atom:author", ns):
                        name = author.find("atom:name", ns)
                        if name is not None:
                            authors.append(name.text)
                    
                    # Get categories/tags
                    tags = []
                    for category in entry.findall("atom:category", ns):
                        term = category.get("term")
                        if term:
                            # Clean up the category (e.g., "cs.SE" -> "software-engineering")
                            tags.append(term.lower().replace(".", "-"))
                    
                    # Parse PDF link
                    pdf_url = f"https://arxiv.org/abs/{arxiv_id}"
                    
                    papers[arxiv_id] = {
                        "title": title,
                        "authors": authors[:3],  # First 3 authors
                        "summary": summary[:500],  # Truncate summary
                        "published": published,
                        "arxiv_id": arxiv_id,
                        "url": pdf_url,
                        "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}.pdf",
                        "source": "arXiv",
                        "tags": tags,
                    }
                    
                except Exception as e:
                    logger.warning("Failed to parse entry: %s", e)
                    continue

            logger.info(
                "Fetched papers for query '%s' (total unique: %d)",
                query,
                len(papers),
            )

        except requests.exceptions.RequestException as e:
            logger.error("Request failed for query '%s': %s", query, e)
        except Exception as e:
            logger.error("Unexpected error for query '%s': %s", query, e)

    return list(papers.values())[:MAX_PAPERS]


def main():
    """Update catalog with research papers."""
    try:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error("Failed to read catalog: %s", e)
        return

    papers = fetch_arxiv_papers()

    existing_count = len(catalog.get("research_papers", []))
    if not papers:
        logger.warning("No papers fetched, keeping existing data")
    elif existing_count > 0 and len(papers) < existing_count * 0.5:
        logger.warning(
            "Fetched significantly fewer papers (%d vs %d), keeping existing data",
            len(papers),
            existing_count,
        )
    else:
        catalog["research_papers"] = papers
        logger.info("Updated catalog with %d research papers", len(papers))

    CATALOG_PATH.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

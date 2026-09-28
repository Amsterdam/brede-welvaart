"""
Test script for the collection of raadsinformatie documents directly from
https://amsterdam.raadsinformatie.nl/
Requires selenium and this and that.
The repo does not contain setup instructions as it was an exploration script.

There are some concerns related to clicking and unclicking checkboxes.
Filters for documents don't work as expected (read desired) as documents are often
older than the discussion items.

Also, documents are heavily duplicated (with different names, ids, etc).

Overall, not suitable for the production system.

Usage: uv run python -m scripts.explore_collect_raadsinformatie_selenium
"""
import os
import pathlib
import subprocess
import time
from time import sleep

import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By

# ── Constants ─────────────────────────────────────────────────────────────────

BASE_SEARCH_URL = (
    "https://amsterdam.raadsinformatie.nl/zoeken"
    "?keywords={query}"
    "&filter%5Borganisations%5D%5B%5D=281"
    "&filter%5Borganisations%5D%5B%5D=547"
    "&filter%5Borganisations%5D%5B%5D=977"
    "&filter%5Borganisations%5D%5B%5D=1170"
    "&filter%5Borganisations%5D%5B%5D=1413"
    "&filter%5Borganisations%5D%5B%5D=1424"
    "&filter%5Borganisations%5D%5B%5D=1425"
    "&filter%5Borganisations%5D%5B%5D=2122"
    "&filter%5Borganisations%5D%5B%5D=2328"
    "&filter%5Borganisations%5D%5B%5D=4187"
    "&search=send&limit=10&sort=relevance&show_result=show_all"
)

DOC_TYPE_CHECKBOXES = {
    "document": "document_type_1",
    "bijlage": "document_type_14",
    "voordracht": "document_type_102",
    "besluit": "document_type_12",
    "amendement": "document_type_11",
    "notulen": "document_type_19",
    "agenda": "document_type_10",
    "agenda_555": "document_type_555",  # duplicate label, different id
    "termijnagenda": "document_type_231",
    "adviesaanvraag": "document_type_114",
    "verslag": "document_type_5",
    "flap": "document_type_47",
    "uitslagenlijst": "document_type_349",
    "beeldverslag": "document_type_348",
    "link": "document_type_111",
    "raadsbesluit": "document_type_73",
    "pdf": "document_type_64",
    "conceptverslag": "document_type_518",
    "kadernota": "document_type_210",
    "besluitenlijst": "document_type_2",
    "jaarverslag": "document_type_6",
    "verordening": "document_type_8",
    "schriftelijke_vraag": "document_type_20",
    "raadsvoorstel": "document_type_21",
    "brief": "document_type_46",
    "voorstel": "document_type_13",
    "tknlijst": "document_type_135",
    "toezeggingen": "document_type_325",
    "supplementagenda": "document_type_334",
    "rekenkameronderzoek": "document_type_512",
    "rapport": "document_type_113",
    "actiepuntenlijst": "document_type_511",
    "bonus": "document_type_17",
    "toezegging": "document_type_9",
    "notitie": "document_type_57",
    "terugkoppeling": "document_type_104",
    "reacties": "document_type_485",
    "ter_kennisname_stukken": "document_type_613",
}


MAX_SCROLL_DOCS = 100
MAX_COLLECT_DOCS = 20
SCROLL_SLEEP = 5


# ── Search configs ─────────────────────────────────────────────────────────────

# SEARCHES = [
#     # dict(name="voordrachten",         doc_types=["voordracht", "document"]),
#     dict(name="voordrachten",         doc_types=["voordracht"]),
#     dict(name="besluiten",            doc_types=["besluit"]),
#     dict(name="adviesaanvraag",       doc_types=["adviesaanvraag"]),
#     # dict(name="actualiteit",          doc_types=["document", "bijlage"]),
#     # dict(name="amendement",           doc_types=["document", "amendement"]),
# ]

SEARCHES = [
    {"name": doc_type, "doc_types": [doc_type]}
    for doc_type in DOC_TYPE_CHECKBOXES.keys()
    # for doc_type in ["termijnagenda"]
]


# ── Driver ────────────────────────────────────────────────────────────────────


def get_driver():
    profile_dir = f"/tmp/chrome-profile-{os.getpid()}"
    subprocess.run(["rm", "-rf", profile_dir])  # clear any stale lock

    options = Options()
    options.binary_location = "/usr/bin/chromium"
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-setuid-sandbox")
    options.add_argument(f"--user-data-dir={profile_dir}")

    service = Service(
        "/usr/bin/chromedriver",
        log_output="/tmp/chromedriver.log",
        log_level="DEBUG",
    )
    driver = webdriver.Chrome(options=options, service=service)
    driver.maximize_window()
    return driver


# ── Scraping helpers ──────────────────────────────────────────────────────────


def scroll_forever(driver, max_docs=None, scroll_sleep=SCROLL_SLEEP):
    last_height = driver.execute_script("return document.body.scrollHeight")
    while True:
        print("scrolling...")
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(scroll_sleep)
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height
        if max_docs:
            results = driver.find_element(By.ID, "search_result")
            n_links = len(results.find_elements(By.XPATH, "//a[@href]"))
            if n_links > max_docs:
                break


def get_documents(driver):
    results = driver.find_element(By.ID, "search_result")
    result_links = results.find_elements(By.XPATH, "//a[@href]")
    print(f"Total links: {len(result_links)}")
    for elem in result_links:
        href = elem.get_attribute("href")
        if "document" in href:
            yield href


def download_doc(url, file_name, force_download=False, timeout=5):
    """Given a url, download doc into file_name"""
    if force_download or not pathlib.Path.exists(file_name):
        response = requests.get(url, timeout=timeout)

        if response.status_code == 200:
            with open(file_name, "wb") as f:
                f.write(response.content)


def get_all_search_documents(  # noqa: C901
    docs_folder,
    search_url,
    checkbox_ids,
    max_scroll_docs=MAX_SCROLL_DOCS,
    max_collect_docs=MAX_COLLECT_DOCS,
    scroll_sleep=SCROLL_SLEEP,
):
    pathlib.Path(docs_folder).mkdir(parents=True, exist_ok=True)
    driver = get_driver()

    clicked_ids = []
    try:
        driver.get(search_url)
        sleep(2)

        for checkbox_id in checkbox_ids:
            try:
                checkbox = driver.find_element(By.ID, checkbox_id)
                driver.execute_script("arguments[0].click();", checkbox)
                clicked_ids.append(checkbox_id)
            except Exception as e:
                print(f"Exception: {e}")

        scroll_forever(driver, max_scroll_docs, scroll_sleep)

        cnt = 0
        for href in get_documents(driver):
            if cnt >= max_collect_docs:
                break
            print(href)
            try:
                doc_id = href.split("document/")[-1].split("/")[0]
                output_file = pathlib.Path(docs_folder) / f"{doc_id}.pdf"
                # doc_path = href.split("document/")[-1]  # "12345/some-document-name.pdf"
                # doc_id, doc_filename = doc_path.split("/", 1)
                # output_file = pathlib.Path(docs_folder) / f"{doc_id}-{doc_filename}.pdf"
                if not output_file.exists():
                    download_doc(href, output_file)
            except Exception as e:
                print(e)
            cnt += 1
    finally:
        for checkbox_id in clicked_ids:  # ← uncheck what we checked
            try:
                checkbox = driver.find_element(By.ID, checkbox_id)
                driver.execute_script("arguments[0].click();", checkbox)
            except Exception as e:
                print(f"Exception unchecking {checkbox_id}: {e}")
        driver.quit()


def run_search(
    name, doc_types=None, checkbox_ids=None, query=None, year_start=None, year_end=None, **kwargs
):
    doc_type_ids = [DOC_TYPE_CHECKBOXES[dt] for dt in (doc_types or [])]
    extra_ids = checkbox_ids or []
    year_ids = [f"date_{y}" for y in range(year_start, year_end + 1)] if year_start else []
    resolved_ids = doc_type_ids + extra_ids + year_ids
    docs_folder = pathlib.Path("./data") / f"raadsinformatie_test_selenium/{query}/{name}"
    search_url = BASE_SEARCH_URL.format(query=query or "")
    print(f"\n=== {name} {query} ===")
    print(search_url)
    get_all_search_documents(docs_folder, search_url, resolved_ids, **kwargs)


def main():
    for cfg in SEARCHES:
        for search_query in ["brede%20welvaart", "drones", "vrouwen veiligheid", "SAIL"]:
            run_search(**cfg, query=search_query, year_start=2022, year_end=2026)


if __name__ == "__main__":
    main()

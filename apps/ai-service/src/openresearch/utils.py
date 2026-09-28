"""Utils for the OpenResearch collector."""

import html
import re

RAADSINFORMATIE_PATTERN = re.compile(
    r'https://amsterdam\.raadsinformatie\.nl/document/[^\s"\'<>]+'
)


def extract_raadsinformatie_urls(html_body: str) -> list[str]:
    """Extract amsterdam.raadsinformatie.nl document URLs from an HTML string."""
    urls = RAADSINFORMATIE_PATTERN.findall(html_body)
    return [html.unescape(url) for url in dict.fromkeys(urls)]

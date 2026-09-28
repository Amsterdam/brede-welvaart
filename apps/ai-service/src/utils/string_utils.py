"""Helpers for string manipulation, cleaning, and HTML stripping."""

import re
from html.parser import HTMLParser


class _HTMLStripper(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def handle_starttag(self, tag: str, attrs: list) -> None:
        # Block-level tags → newline so paragraphs don't run together
        if tag in {"p", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "div"}:
            self._parts.append("\n")

    def get_text(self) -> str:
        return "".join(self._parts)


def strip_html(html: str) -> str:
    """Strip HTML tags and return clean plain text."""
    if not html:
        return ""
    stripper = _HTMLStripper()
    stripper.feed(html)
    return clean_text(stripper.get_text())


def clean_text(text: str) -> str:
    """
    Normalize whitespace in raw text:
    - collapse multiple spaces/tabs to single space
    - collapse 3+ newlines to 2 (preserve paragraph breaks)
    - strip leading/trailing whitespace
    """
    if not text:
        return ""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_and_extract_open_text_answers(input_string: str) -> str:
    """Clean response string using regex."""
    # Remove everything between [] and <> (including the brackets)
    if not input_string:
        return ""
    cleaned_string = re.sub(r"\[.*?\]|\<.*?\>", "", input_string)
    cleaned_string = cleaned_string.replace("\r\n", "").replace("\n\n", "").lstrip()
    return cleaned_string

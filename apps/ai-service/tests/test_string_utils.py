from src.utils.string_utils import clean_and_extract_open_text_answers, clean_text, strip_html


def test_clean_text_collapses_whitespace_but_preserves_paragraphs():
    text = "  Eerste\tregel\n\n\n\nTweede   regel  "

    assert clean_text(text) == "Eerste regel\n\nTweede regel"


def test_strip_html_keeps_block_content_separated():
    html = "<p>Eerste</p><div>Tweede<br>Derde</div>"

    assert strip_html(html) == "Eerste\nTweede\nDerde"


def test_clean_and_extract_open_text_answers_removes_markup_tokens():
    answer = "[metadata] <instruction> Dit is het antwoord.\r\n"

    assert clean_and_extract_open_text_answers(answer) == "Dit is het antwoord."

from types import SimpleNamespace

import pytest

from src.bw_analyzer.key_message import generate_key_message
from src.utils.schemas import BWGenerateKeyMessageRequest


class FakeLLM:
    def __init__(self, response: str = "Positief effect\n- Negatief effect", error: bool = False):
        self.response = response
        self.error = error
        self.calls = []

    def prompt(self, prompt, system=None):
        self.calls.append((prompt, system))
        return SimpleNamespace(raw_response=self.response, error=self.error)


def request() -> BWGenerateKeyMessageRequest:
    return BWGenerateKeyMessageRequest(
        name="Woningbouw",
        description="Een scan",
        goal="Nieuwe woningen",
        motivation="Effecten afwegen",
        scope="Amsterdam",
        themes=[{
            "name": "Wonen",
            "slug": "wonen",
            "arguments": [{
                "title": "Meer aanbod",
                "explanation": "Het woningaanbod groeit.",
                "sentiment": "POSITIVE",
            }],
        }],
    )


def test_generates_bulleted_editable_key_message_from_scan_content():
    llm = FakeLLM()

    result = generate_key_message(llm, request())

    assert result == "• Positief effect\n• Negatief effect"
    assert "Meer aanbod" in llm.calls[0][0]
    assert "tag: #wonen" in llm.calls[0][0]
    assert "Verzin geen feiten" in llm.calls[0][1]
    assert "alleen als het inhoudelijk bijdraagt 1 of 2 concrete effecten" in llm.calls[0][1]
    assert "Neem geen effect of tag op om alleen aan dit aantal te voldoen" in llm.calls[0][1]


def test_fails_loud_when_model_returns_no_content():
    with pytest.raises(RuntimeError, match="empty"):
        generate_key_message(FakeLLM(response="  "), request())

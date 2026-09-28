"""Generate an editable key-message draft from user-curated scan content."""

from src.llms.base import BaseLLM
from src.utils.schemas import BWGenerateKeyMessageRequest

MAX_KEY_MESSAGE_LENGTH = 740


def _scan_context(request: BWGenerateKeyMessageRequest) -> str:
    sections = [
        f"Naam: {request.name}",
        f"Beschrijving: {request.description}",
        f"Onderwerp: {request.goal}",
        f"Doel: {request.motivation}",
        f"Afbakening: {request.scope}",
    ]
    for theme in request.themes:
        effects = "\n".join(
            f"- [{argument.sentiment}] {argument.title}: {argument.explanation}"
            for argument in theme.arguments
        )
        if effects:
            sections.append(f"Thema {theme.name} (tag: #{theme.slug}):\n{effects}")
    return "\n\n".join(sections)


def generate_key_message(llm: BaseLLM, request: BWGenerateKeyMessageRequest) -> str:
    system = (
        "U ondersteunt medewerkers van Gemeente Amsterdam bij een bredewelvaartscan. "
        "Schrijf alleen op basis van de aangeleverde scaninhoud. Verzin geen feiten. "
        "Schrijf helder Nederlands op B1-niveau. Benoem de belangrijkste positieve en "
        "negatieve effecten evenwichtig. Verwerk alleen als het inhoudelijk bijdraagt 1 of 2 "
        "concrete effecten en zet bij elk van die effecten de aangeleverde tag van het thema. "
        "Neem geen effect of tag op om alleen aan dit aantal te voldoen. Geef 1 tot 3 korte "
        "regels. Begin elke regel met "
        "'• '. Gebruik maximaal 740 tekens. Geef alleen de kernboodschap."
    )
    response = llm.prompt(
        f"Maak een concept-kernboodschap voor deze scan:\n\n{_scan_context(request)}",
        system=system,
    )
    if response.error:
        raise RuntimeError("LLM generation failed")

    lines = [line.strip().lstrip("-• ").strip() for line in response.raw_response.splitlines()]
    key_message = "\n".join(f"• {line}" for line in lines if line)
    if not key_message:
        raise RuntimeError("LLM returned an empty key message")
    return key_message[:MAX_KEY_MESSAGE_LENGTH].rstrip()

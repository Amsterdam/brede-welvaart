import { Link, Paragraph } from "@amsterdam/design-system-react";

export default function SearchQuestionExplanation({ onEdit }) {
	return (
		<div className="ai-dashboard-block-body ai-dashboard-actions-info">
			<Paragraph>
				Deze zoekvraag is afgeleid uit de beantwoorde vragen. Je kunt 'm aanpassen via{" "}
				<Link className="ai-dashboard-inline-link" linkComponent="button" type="button" onClick={onEdit}>
					Zoekvraag aanpassen
				</Link>{" "}
				— de AI-verkenning wordt dan opnieuw uitgevoerd. Je kan de vraag ook aanpassen naar een specifiek
				onderdeel, onderwerp of thema.
			</Paragraph>
		</div>
	);
}

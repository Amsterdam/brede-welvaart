import { CircularGraph } from "../CircularGraph";

import "./index.scss";

const REASON_LABELS = {
	COUNCIL_LETTER: "Raadsbrief",
	NEW_POLICY: "Nieuw beleid",
	PROJECT_PROPOSAL: "Projectvoorstel",
};

function getReasonText(project) {
	const reasons = (project.reason ?? []).map((reason) => REASON_LABELS[reason]).filter(Boolean);
	if (project.reason?.includes("OTHER") && project.reasonOther) reasons.push(project.reasonOther);
	return reasons.join(", ");
}

function getMethodology(project) {
	const methods = ["Effecten die tijdens de werksessie zijn toegevoegd"];
	if (project.uploadedDocuments?.length) methods.push("Documenten die bij deze scan zijn geüpload");
	if (project.aiDraftEffects?.length) methods.push("Resultaten uit de AI-ondersteunde verkenning");
	return methods;
}

export default function CoverPage({ project, totalPages }) {
	const reason = getReasonText(project);
	const methodology = getMethodology(project);

	return (
		<div className="scan-cover">
			<div className="scan-cover__hero">
				<div className="scan-cover__hero-text">
					<h2>Brede Welvaart Scan</h2>
					<p className="scan-cover__subject">{project.scanGoal || project.name}</p>
					{reason && <p className="scan-cover__reason-summary">Aanleiding: {reason}</p>}
				</div>
				<div className="scan-cover__graph" aria-hidden="true">
					<CircularGraph themes={project.themes} />
				</div>
			</div>

			<div className="scan-cover__sections">
				<section>
					<h3>Doel en context</h3>
					<p>
						{project.impactMotivation ||
							project.coverText ||
							"Het doel en de context zijn nog niet ingevuld."}
					</p>
					{project.impactMotivation && project.coverText && project.coverText !== project.impactMotivation && (
						<p>{project.coverText}</p>
					)}
				</section>

				<section>
					<h3>Aanleiding</h3>
					<p>{reason || "De aanleiding is nog niet ingevuld."}</p>
				</section>

				<section>
					<h3>Afbakening</h3>
					<p>{project.scope || "De afbakening is nog niet ingevuld."}</p>
				</section>

				<section>
					<h3>Methodologie</h3>
					<p>De effecten in deze scan zijn gebaseerd op:</p>
					<ul>
						{methodology.map((method) => (
							<li key={method}>{method}</li>
						))}
					</ul>
					<p>De resultaten ondersteunen het gesprek en zijn geen volledige effectbeoordeling.</p>
				</section>

				<section>
					<h3>Leeswijzer</h3>
					<ol>
						<li>Totaaloverzicht (pagina 2): positieve en negatieve effecten per thema.</li>
						<li>Effectenoverzicht (pagina 3): alle effecten per thema.</li>
						<li>
							Themaoverzicht (pagina 4{totalPages > 4 ? ` tot en met ${totalPages}` : ""}): definities en
							effecten per thema.
						</li>
					</ol>
				</section>
			</div>
		</div>
	);
}

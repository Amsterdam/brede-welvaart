import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useQuery } from "@apollo/client/react";
import { GET_PROJECT } from "../../graphql/queries";

import Icon from "../../components/common/Icon";

import Header from "../../layouts/Header";

import EditorPreview from "../EditorPreview";
import WizardNavigation from "../../components/custom/Wizard/WizardNavigation";
import WizardContent from "../../components/custom/Wizard/WizardContent";
import ProductTour from "../../components/custom/ProductTour";

import "./index.scss";
import { Spinner } from "@shared/ui";
import { Alert, Link, Paragraph } from "@amsterdam/design-system-react";

export default function Wizard() {
	const { projectSlug, themeSlug } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const tourPhase = !themeSlug && location.state?.productTourPhase;

	const { data, loading, error } = useQuery(GET_PROJECT, {
		variables: { slug: projectSlug },
		fetchPolicy: "cache-first",
	});
	if (loading) {
		return <Spinner fullPage={true} />;
	}
	if (error || !data?.project) {
		return (
			<div className="wizard wizard-error">
				<Alert heading="Niet gelukt" headingLevel={2} severity="error">
					<Paragraph>
						{error
							? "Fout tijdens het laden van het project."
							: "We kunnen dit project niet vinden. Het is misschien verwijderd."}
					</Paragraph>
				</Alert>
				<Link href="#/" className="wizard-error-back">
					<Icon name="arrow-left-blue" size={16} />
					<span>Terug naar het overzicht</span>
				</Link>
			</div>
		);
	}

	return (
		<div className="wizard">
			<ProductTour phase={tourPhase} />
			<div className={`wizard-content ${themeSlug ? "wizard-content-theme-overview" : "wizard-content-themes"}`}>
				<div className="wizard-content-editor">
					<WizardNavigation project={data.project} />
					<WizardContent project={data.project} />
				</div>
				<EditorPreview />
			</div>
		</div>
	);
}

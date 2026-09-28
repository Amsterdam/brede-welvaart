import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../../service/auth";

import { Button as UIButton } from "@shared/ui";
import { Paragraph, Heading, Logo, Row, Column, Page } from "@amsterdam/design-system-react";

import authImg from "../../assets/images/auth.png";

import Icon from "../../components/common/Icon";

import "./index.scss";
import "../../assets/scss/breakpoints.scss";

export default function Login() {
	const { instance } = useMsal();

	async function handleLogin() {
		try {
			await instance.loginRedirect(loginRequest);
		} catch (error) {
			console.error(error);
		}
	}

	return (
		<Page className="login-page">
			<Row as="section" gap="none">
				<Column as="section" gap="none" className="login-column" align="between" alignHorizontal="center">
					<Logo className="login-logo" />
					<Column as="div" className="login-actions">
						<Heading level={1}>
							Inloggen
							<br />
							Brede Welvaart Scan
						</Heading>
						<Paragraph size="small">
							Inloggen bij de Brede Welvaart Scan voor medewerkers van de Gemeente Amsterdam.
						</Paragraph>
						<UIButton className="login-button" type="submit" onClick={handleLogin}>
							Inloggen met ADW
						</UIButton>
						{/* </div> */}
					</Column>
					<Paragraph className="login-footer">
						Problemen met inloggen? &nbsp;
						<a href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL || "innovatie@amsterdam.nl"}`}>Neem dan contact op</a>
					</Paragraph>
				</Column>
				<Column alignHorizontal="center" align="center" as="section" className="info-column">
					<img src={authImg} alt="Brede Welvaartscan" className="scan-image" />
					<div className="text-content">
						<Heading level={2}>Het versterken van de brede welvaart in Amsterdam.</Heading>
						<Paragraph size="small">
							Je kunt de effecten van brede welvaart met de Brede Welvaart Scan in kaart brengen voor
							college en raad als je nieuw beleid ontwikkelt. Hierbij laat je zien wat het beleidsvoorstel
							voor gevolgen heeft op de tien thema's van brede welvaart.
						</Paragraph>
					</div>
					<div className="info-column-cards">
						<Column as="div" gap="large">
							<div className="info-column-cards-card-header">
								<Icon name={"piechart-blue"} />
								<Heading level={5}>Grafisch overzicht</Heading>
							</div>
							<Paragraph size="small">
								De scan helpt goed overzicht van al deze effecten en de samenhang daartussen te krijgen.
								Niet alleen in het hier en nu, maar ook elders en later.
							</Paragraph>
						</Column>
						<Column as="div">
							<div className="info-column-cards-card-header">
								<Icon name={"document-blue"} />
								<Heading level={5}>Exporteren en delen</Heading>
							</div>
							<Paragraph size="small">
								In deze digitale tool vul je de scan in door effecten toe te voegen per thema, de tool
								maakt een overzicht & diagram. Je deelt voor feedback en exporteert naar pdf formaat.
							</Paragraph>
						</Column>
					</div>
				</Column>
			</Row>
		</Page>
	);
}

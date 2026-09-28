import { Heading, Link, OrderedList, Paragraph, UnorderedList } from "@amsterdam/design-system-react";

import Icon from "../../components/common/Icon";
import scanPreview from "../../assets/images/about-scan-preview.png";

import "./index.scss";

// Static copy of the ten fixed BW themes (source: Figma explainer + backend themeTemplates).
const themes = [
	{
		slug: "subjectief-welzijn",
		name: "Subjectief Welzijn",
		description:
			"Subjectief welzijn gaat om de tevredenheid met het leven en de mate van ervaren regie over het eigen leven. Mensen streven niet alleen naar financiële stabiliteit, maar ook naar een breder gevoel van controle en autonomie. Een samenleving waarin brede welvaart wordt nagestreefd, biedt kansen waarmee individuen en groepen zich kunnen blijven ontwikkelen en zich beter kunnen aanpassen aan veranderingen (een leven lang leren).",
	},
	{
		slug: "gezondheid",
		name: "Gezondheid",
		description:
			"Gezondheid gaat over fysieke en mentale gezondheid. Het gaat over het hebben van gezonde jaren, ervaren gezondheid en levensverwachting. Gezondheid kan worden beïnvloed door bijvoorbeeld overgewicht, eenzaamheid of stress. Gezondheid gaat ook over actief en volwaardig deel kunnen nemen aan de samenleving met of zonder beperking.",
	},
	{
		slug: "consumptie-en-inkomen",
		name: "Consumptie en Inkomen",
		description:
			"Consumptie en inkomen gaat over de financiële situatie op het persoonlijk vlak. Het gaat hierbij zowel om inkomstensbronnen als om consumptiemogelijkheden. Het betreft de individuele keuze en mogelijkheid om diensten en goederen te kiezen, het opbouwen of hebben van een financiële buffer en de ruimte om een eigen levensstijl te onderhouden. Dit is inclusief keuzemogelijkheden in onderwijs en gezondheidszorg.",
	},
	{
		slug: "onderwijs-en-opleiding",
		name: "Onderwijs en Opleiding",
		description:
			"Onderwijs en opleiding bevat alle onderdelen van overdracht van kennis, leren van vaardigheden en socialisatie op alle leeftijden. Het bevat zowel officiële en onofficiële kennisoverdrachten. Denk aan stages, verenigingen, opleidingen, cursussen of algemene scholing, maar ook informele leermogelijkheden zoals onderdeel zijn van een jeugdteam of het leren van een muziekinstrument.",
	},
	{
		slug: "ruimtelijke-samenhang-en-kwaliteit",
		name: "Ruimtelijke Samenhang en Kwaliteit",
		description:
			"Een kwalitatief goede inrichting van de ruimte is een belangrijke randvoorwaarde voor de ervaren brede welvaart. Ruimtelijke Samenhang en Kwaliteit gaat over de staat en gebruik van de bebouwde en onbebouwde omgeving. De inrichting en samenhang is gericht op nu en de toekomst. Ruimtelijke samenhang draagt bij aan een kwalitatieve beleving van stad, omgeving of aanzicht.",
	},
	{
		slug: "economisch-kapitaal",
		name: "Economisch Kapitaal",
		description:
			"Economisch kapitaal omvat de verschillende vormen van waarde voor de stad, die nodig zijn voor het opbouwen van materiële welvaart en het genereren van economische groei. Het gaat over bedrijfsvestigingen en aantrekkelijkheid voor bedrijven, werkloosheid, werkgelegenheid, vermogens en vermogensongelijkheid binnen de eigen gemeente maar ook in vergelijking met andere gemeentes.",
	},
	{
		slug: "sociaal-kapitaal",
		name: "Sociaal Kapitaal",
		description:
			"Sociaal kapitaal gaat over het verbonden voelen met anderen. Belangrijk zijn sociale netwerken (online en fysiek) die zorgen voor toegang tot informatie en het hebben of maken van een sociaal vangnet. Het gaat om verenigingsgevoel, sociale cohesie, veiligheid om te zijn wie je bent en groepsvorming (bijvoorbeeld met verenigingen of binnen een geloofsovertuiging).",
	},
	{
		slug: "natuurlijk-kapitaal",
		name: "Natuurlijk Kapitaal",
		description:
			"Natuurlijk kapitaal gaat om een schone, groene, biodiverse leefomgeving hier en nu, denk aan schoon drinkwater, schone lucht en voldoende kwalitatief groen in de stad. Het gaat enerzijds dat de stad behouden moet worden voor de toekomst, anderzijds dat de leefomstandigheden op de planeet gunstig moeten blijven voor de mensheid en al het andere leven.",
	},
	{
		slug: "wonen",
		name: "Wonen",
		description:
			"Een goede betaalbare woonruimte is één van de eerste levensbehoeften. Niet iedereen kan op dit moment aan een woning komen die bij haar/zijn/hen situatie past. Het gaat over de kwaliteit van de woning (incl duurzaamheid) en tevredenheid met de woning en woonomgeving. Daarnaast ook de ervaren overlast in/nabij de woning en de woonlasten.",
	},
	{
		slug: "veiligheid",
		name: "Veiligheid",
		description:
			"Veiligheid gaat in op de mate waarin overlast, ondermijning en criminaliteit plaatsvinden in de stad en online. Het is een breed spectrum met onder meer hoge-impact-criminaliteit, cybercriminaliteit, druggerelateerde criminaliteit, huiselijk geweld, seksueel geweld en intimidatie, discriminatie en racisme. Het gaat ook over veiligheid verbeteren, overlast terugdringen en slachtoffers helpen.",
	},
];

export default function About() {
	return (
		<div className="about">
			<header className="about-header" aria-label="Over de Brede Welvaart Scan">
				<div className="about-header-title">Over de Brede Welvaart Scan</div>
				<div className="about-header-back">
					<Link href="#/" className="about-back-link">
						<Icon name="arrow-left-blue" size={16} />
						<span>Terug</span>
					</Link>
				</div>
			</header>

			<main className="about-main">
				<section className="about-section about-intro" aria-labelledby="about-intro-heading">
					<Heading id="about-intro-heading" level={1}>
						Wat is Brede Welvaart?
					</Heading>
					<Paragraph>
						Brede welvaart gaat over de kwaliteit van leven van mensen, hier en nu, en later en elders.
						Het gaat om alles wat mensen belangrijk vinden. Naast materiële welvaart gaat het ook om
						zaken als gezondheid, onderwijs, milieu en leefomgeving, sociale cohesie, persoonlijke
						ontplooiing en (on)veiligheid.
					</Paragraph>
					<Paragraph>
						Het gaat zowel om de kwaliteit van leven in het ‘hier en nu’, als om de effecten van onze
						manier van leven op het welzijn van mensen op andere plekken en voor toekomstige generaties.
					</Paragraph>
				</section>

				<section className="about-section about-themes" aria-labelledby="about-themes-heading">
					<div className="about-themes-text">
						<Heading id="about-themes-heading" level={2}>
							Thema’s van brede welvaart
						</Heading>
						<Paragraph>
							De Brede Welvaart Scan brengt effecten in beeld binnen tien thema’s van brede welvaart.
						</Paragraph>
						<Paragraph>
							Alle maatschappelijke effecten vallen onder minimaal één van deze thema’s. De thema’s
							helpen om vanuit verschillende perspectieven naar een beleidsvraagstuk of verandering te
							kijken.
						</Paragraph>
						<Paragraph>
							Brede welvaart bouwt voort op bestaande maatschappelijke modellen, zoals de SDG’s, de
							donut economie en de circulaire economie. Voor gemeenten is brede welvaart goed
							toepasbaar, omdat het aansluit op gemeentelijke taken en beleid. De schaal van de analyse
							kan verschillen per vraagstuk. Zo kan het gaan over een crisis zoals de woningnood of de
							locatiekeuze van een elektriciteit onderstation.
						</Paragraph>
					</div>
					<ul className="about-themes-cards">
						{themes.map((theme) => (
							<li
								key={theme.slug}
								className="about-theme-card"
								style={{ "--about-theme-color": `var(--theme-${theme.slug})` }}
							>
								<div className="about-theme-card-title">
									<Icon name={`${theme.slug}-straight`} size={21} />
									<Heading level={3}>{theme.name}</Heading>
								</div>
								<Paragraph size="small" className="about-theme-card-description">
									{theme.description}
								</Paragraph>
							</li>
						))}
					</ul>
				</section>

				<section className="about-section about-goal" aria-labelledby="about-goal-heading">
					<Heading id="about-goal-heading" level={2}>
						Doel van de brede welvaart scan
					</Heading>
					<Paragraph>
						Met de brede welvaart scan maak je zichtbaar hoe beleid bijdraagt aan brede welvaart. De
						scan laat zien welke positieve en negatieve effecten een beleidsvoorstel kan hebben, nu en
						in de toekomst.
					</Paragraph>
					<Paragraph>
						De scan helpt om effecten vanuit meerdere perspectieven mee te nemen in besluitvorming. Zo
						ontstaat een breder beeld van wat van waarde is binnen een casus of beleidsvraagstuk. Het
						doel van de scan is om een overwegingskader te vormen dat alles van waarde zichtbaar maakt
						zodat er waardegedreven besluitvorming kan plaatsvinden over wat in die casus echt van
						belang is.
					</Paragraph>
				</section>

				<section className="about-section about-parts" aria-labelledby="about-parts-heading">
					<div className="about-parts-preview">
						<img src={scanPreview} alt="Voorbeeld van de effectenroos in de Brede Welvaart Scan" />
					</div>
					<div className="about-parts-text">
						<div className="about-parts-block">
							<Heading id="about-parts-heading" level={2}>
								Wat is de brede welvaart scan?
							</Heading>
							<Paragraph>De brede welvaart scan bestaat uit vier onderdelen:</Paragraph>
							<OrderedList>
								<OrderedList.Item>de voorpagina</OrderedList.Item>
								<OrderedList.Item>de effectenroos</OrderedList.Item>
								<OrderedList.Item>het effectenoverzicht</OrderedList.Item>
								<OrderedList.Item>de detailpagina’s</OrderedList.Item>
							</OrderedList>
						</div>

						<div className="about-parts-block">
							<Heading level={3}>Voorpagina</Heading>
							<Paragraph>
								De voorpagina introduceert het onderwerp van de scan. Hier beschrijf je de casus, de
								aanleiding en de afbakening van het vraagstuk. Ook geef je aan wat het doel van de
								scan is.
							</Paragraph>
						</div>

						<div className="about-parts-block">
							<Heading level={3}>Effectenroos</Heading>
							<Paragraph>
								De effectenroos geeft een overzicht van alle beschreven effecten per thema van brede
								welvaart. <strong>Positieve effecten</strong> worden <strong>groen</strong>{" "}
								weergegeven en <strong>negatieve effecten rood</strong>.
							</Paragraph>
							<Paragraph>
								Elk beschreven effect krijgt één rood of groen vlak. De effectenroos laat daarmee{" "}
								<strong>het aantal beschreven</strong> effecten zien. De roos laat niet zien hoe groot
								de impact van een effect is.
							</Paragraph>
							<Paragraph>
								De <strong>zwarte lijn</strong> in het midden geeft de <strong>huidige situatie</strong>{" "}
								weer en scheidt de positieve en negatieve effecten van elkaar.
							</Paragraph>
							<Paragraph>
								Elk effect krijgt ook een tijdsindicatie en een ruimtelijke indicatie. Een effect kan
								bijvoorbeeld lokaal zichtbaar zijn of juist effect hebben op stedelijk, regionaal of
								wereldwijd niveau. Ook kan een effect op korte termijn optreden of pas over meerdere
								jaren zichtbaar worden.
							</Paragraph>
							<Paragraph>
								In de buitenring van de effectenroos staat per thema een samenvatting van de
								beschreven effecten.
							</Paragraph>
							<Paragraph>
								Effecten staan afzonderlijk in de roos weergegeven, maar kunnen elkaar beïnvloeden. In
								de kernboodschap onder de effectenroos beschrijf je hoe effecten elkaar versterken of
								juist tegenwerken.
							</Paragraph>
						</div>

						<div className="about-parts-block">
							<Heading level={3}>Effectenoverzicht</Heading>
							<Paragraph>
								Het effectenoverzicht laat per thema zien welke positieve, negatieve en neutrale
								effecten zijn beschreven.
							</Paragraph>
							<Paragraph>
								Per thema kunnen maximaal vijf effecten worden weergegeven. Zo blijft het overzicht
								leesbaar. De maker van de scan bepaalt welke effecten zichtbaar zijn in het overzicht.
							</Paragraph>
						</div>

						<div className="about-parts-block">
							<Heading level={3}>Detailoverzicht</Heading>
							<Paragraph>Vanaf de vierde pagina begint de verdieping per thema.</Paragraph>
							<Paragraph>Elke detailpagina bevat:</Paragraph>
							<UnorderedList>
								<UnorderedList.Item>een definitie van het thema</UnorderedList.Item>
								<UnorderedList.Item>een beschrijving van de effecten</UnorderedList.Item>
								<UnorderedList.Item>een toelichting op de effecten</UnorderedList.Item>
								<UnorderedList.Item>de gebruikte bron of onderbouwing</UnorderedList.Item>
								<UnorderedList.Item>een tijdsindicatie</UnorderedList.Item>
								<UnorderedList.Item>een ruimtelijke indicatie</UnorderedList.Item>
							</UnorderedList>
							<Paragraph>
								Bronnen kunnen bijvoorbeeld bestaan uit data, beleid, onderzoek, bewonersinzichten of
								expertkennis.
							</Paragraph>
							<Paragraph>
								Effecten kunnen invloed hebben op andere thema’s. Wanneer effecten elkaar versterken
								of tegenspreken, kan in de toelichting een verwijzing naar een ander thema worden
								opgenomen.
							</Paragraph>
						</div>
					</div>
				</section>

				<section className="about-section about-links" aria-labelledby="about-links-heading">
					<Heading id="about-links-heading" level={2}>
						Andere BW-instrumenten en voorbeelden
					</Heading>
					<Paragraph>
						Wil je meer weten over brede welvaart of de voorbeelden van de brede welvaart scan zien?
						Bekijk dan{" "}
						<Link
							href="https://openresearch.amsterdam/nl/page/132453/brede-welvaartscan-bezoekerseconomie---impact-van-de"
							target="_blank"
							rel="noreferrer"
						>
							de brede welvaartscan van de bezoekerseconomie op openresearch.amsterdam
						</Link>
						.
					</Paragraph>
					<Paragraph>
						Er is ook een workshop gemaakt om brede welvaart meer kwalitatief toe te passen in een
						groep. Zie{" "}
						<Link
							href="https://openresearch.amsterdam/nl/page/111584/brede-welvaart-spel"
							target="_blank"
							rel="noreferrer"
						>
							het brede welvaart spel op openresearch.amsterdam
						</Link>{" "}
						voor alle benodigdheden en uitleg.
					</Paragraph>
					<Paragraph>
						Onderzoek &amp; Statistiek:{" "}
						<Link
							href="https://onderzoek.amsterdam.nl/interactief/dashboard-kerncijfers?tab=brede-welvaart&taal=nl"
							target="_blank"
							rel="noreferrer"
						>
							Dashboard brede welvaart
						</Link>
					</Paragraph>
				</section>
			</main>
		</div>
	);
}

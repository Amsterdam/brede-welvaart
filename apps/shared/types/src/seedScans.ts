// Realistic example Brede Welvaart scans, shared by both dev seed paths — the
// browser-console window.seedDev() (frontend) and the seed:scans backend script —
// so the two stay byte-identical instead of drifting. Field mapping mirrors the
// intake form: the UI label "onderwerp" is stored in `scanGoal`, "doel" in
// `impactMotivation`, "afbakening" in `scope`.
export interface ExampleSeedScan {
	name: string;
	description: string;
	scanGoal: string;
	impactMotivation: string;
	scope: string;
	reason: string[];
}

export const EXAMPLE_SEED_SCANS: ExampleSeedScan[] = [
	{
		name: "Chatbots in interactie met burgers: meldingen en vergunningen",
		description:
			"Scan naar de impact van burgergerichte chatbots die de gemeente inzet voor meldingen, vergunningen en andere diensten. We zitten in een fase van onderzoek en pilots.",
		scanGoal:
			"De scan gaat over de impact van burgergerichte chatbots die de gemeente inzet voor interactie met Amsterdammers, bijvoorbeeld bij meldingen in de openbare ruimte, vergunningaanvragen en andere gemeentelijke diensten. Deze chatbots vervangen of vullen aan op het reguliere contact via balie, telefoon of webformulier. Neem mee dat we nu in een fase van onderzoek, verkenning en pilots zitten, waarin we kansen en risico's in kaart willen brengen voordat een bredere uitrol plaatsvindt. Het gaat om tekst-gebaseerde AI-assistenten in publieke kanalen, niet om interne tools voor ambtenaren of telefonische spraakbots.",
		impactMotivation:
			"Het doel is om de brede impact van chatbots op de relatie tussen burger en overheid te begrijpen, zodat we vroeg in de ontwikkeling kunnen bijsturen en toekomstige problemen kunnen voorkomen. We willen effecten zien op vertrouwen in de overheid, menselijk contact, toegankelijkheid voor verschillende groepen Amsterdammers (zoals laaggeletterden, ouderen, anderstaligen en mensen met een beperking), en op duurzaamheid en energiegebruik van deze systemen. We gebruiken brede welvaart om dit zo breed mogelijk te verkennen, zodat de inzichten beleidsvorming voeden over wanneer en hoe chatbots ingezet worden en wanneer juist niet.",
		scope:
			"We kijken naar chatbots in interactie met burgers, met focus op dienstverlening rond meldingen, vergunningen en vergelijkbare gemeentelijke diensten. Buiten scope vallen interne chatbots zoals tools voor ambtenaren en telefonische spraakbots. We nemen mee hoe verschillende groepen Amsterdammers de chatbot ervaren, wat het betekent voor mensen die geen toegang hebben tot of vertrouwen hebben in digitale kanalen, en welke effecten dit heeft op de menselijke kant van de dienstverlening. Ook kijken we naar de positie van ambtenaren die nu deze interacties doen en welke rol zij houden of krijgen.",
		reason: ["PROJECT_PROPOSAL"],
	},
	{
		name: "Gemeentelijk dronebeleid voor Amsterdam richting 2030",
		description:
			"Scan ter onderbouwing van toekomstbestendig gemeentelijk dronebeleid richting 2030: goede toepassingen mogelijk maken en de stad weerbaar houden tegen risico's.",
		scanGoal:
			"De scan gaat over het ontwikkelen van gemeentelijk beleid voor het gebruik van drones in Amsterdam richting 2030. Op dit moment ligt vrijwel de hele stad in het gecontroleerd luchtruim van Schiphol (CTR EHAM), waardoor drones in de Open categorie (A1, A2, A3) feitelijk overal verboden zijn zonder ontheffing van de luchtverkeersleiding. Er bestaat nationale en Europese regelgeving via EASA en ILT, maar een duidelijk gemeentelijk kader met regels, uitzonderingen, vergunningen en handhaving ontbreekt. In 2023 vond ongeveer 99 procent van de waargenomen dronevluchten zonder toestemming plaats, wat aangeeft dat het huidige regime in de praktijk slecht werkt. We willen voorbereid zijn op een toekomst waarin drones een grotere rol spelen in de stad, van bezorging en kade-inspecties tot inzet door politie, brandweer en medische diensten.",
		impactMotivation:
			"Het doel is om een helder en toekomstbestendig gemeentelijk dronebeleid te ontwikkelen dat goede toepassingen mogelijk maakt en de stad tegelijk weerbaar houdt tegen risico's. We willen positieve effecten benutten zoals efficiëntere inspecties van kades en bruggen, medische drones, en duurzamere alternatieven voor bepaalde voertuigbewegingen. Tegelijk willen we negatieve effecten begrenzen rond privacy, geluidsoverlast, veiligheid en de leefbaarheid van de openbare ruimte. De scan onderbouwt beleid dat rond 2030 in werking treedt en helpt bij keuzes rond vergunningstelsels, zonering en handhaving.",
		scope:
			"We nemen alle dronegebruikers mee: recreatief, commercieel (bezorging, vastgoed, inspecties, filmproductie) en overheidsgebruik (politie, brandweer, handhaving, medisch). Het gebied is stadsbreed, met extra aandacht voor drukke locaties zoals het centrum, parken, evenementenlocaties en de Zuidas waar de spanning met andere belangen het grootst is. We kijken naar effecten op bewoners, bezoekers, drone-gebruikers zelf, en op partijen die drones inzetten voor publieke taken of bedrijfsdoeleinden. Buiten scope vallen militair gebruik en het luchtruim boven Schiphol zelf, omdat dat onder rijksbevoegdheid valt en niet via gemeentelijk beleid te sturen is.",
		reason: ["NEW_POLICY"],
	},
	{
		name: "Fatbikeverbod en verkeersveiligheid binnen de ring",
		description:
			"Scan ter onderbouwing van een mogelijk fatbikeverbod binnen de ring van Amsterdam, met focus op de effecten op verkeersveiligheid voor fatbikegebruikers en andere weggebruikers.",
		scanGoal:
			"De impact van een fatbikeverbod op verkeersveiligheid binnen de ring van Amsterdam. Neem het aantal ongelukken mee dat fatbikebestuurders aan zichzelf en andere weggebruikers veroorzaken. Problemen die door fatbikes voorkomen is vooral door jongeren op de fatbike. Het verbod gaat om de zwaarte van de fiets en de breedte van de banden en probeert vooral de negatieve impact op de maatschappij van de fatbike aan te pakken. Ik zoek die negatieve effecten. Het verbod zou medio 2026 in moeten gaan.",
		impactMotivation:
			"Het doel is om de negatieve en positieve effecten in beeld te krijgen zodat dit een basis kan zijn voor het te maken nieuwe beleid en dat alle belangen overwogen worden. Er zijn een paar ideeën voor nieuw beleid zoals restricties op gebieden of begrenzing of verbod op fietsen met brede banden. Ook wordt er gekeken naar helm verplichten of minimale leeftijden.",
		scope:
			"Ik wil vooral de effecten weten op de fatbike gebruikers zoals trots zijn op de fiets en de financiële investering van een fatbike en dat het bijvoorbeeld duurzamer is dan een scooter. Maar ook voor de andere fietspad gebruikers. Ik wil inzoomen in het gebied binnen de ring van Amsterdam, omdat het hier drukker is en er veel verschillende weggebruikers zijn zoals kinderen, bakfietsen, bezorgers en ouderen. We nemen het opgevoerde fatbikes niet meer want die zijn al illegaal.",
		reason: ["NEW_POLICY"],
	},
	{
		name: "Vergrijzing en de druk op zorg en woningmarkt in 2027",
		description:
			"Scan naar de impact van de vergrijzing in Amsterdam op zorg en woningmarkt in 2027, met focus op 80-plussers die langer thuis blijven wonen.",
		scanGoal:
			"De scan gaat over de impact van de vergrijzing binnen Amsterdam op de zorg en woningmarkt in 2027. Richt je op het aantal 80-plussers in Amsterdam in 2027 die nog thuis wonen met thuis- en mantelzorg ontvangen of gaan ontvangen. Deze groep heeft vaker chronische aandoeningen zoals dementie, artrose of hart- en vaatziekten. Vaak hebben 80-plussers ook meerdere aandoeningen tegelijk. De 80-plussers hebben daarom ook andere woonvormen en aanpassingen in de woonomgeving nodig, zoals minder trappen en drempels.",
		impactMotivation:
			"De demografische veranderingen en de druk op zorg en mantelzorg gaat de komende jaren waarschijnlijk groeien. Die problemen wil ik in kaart brengen zodat we aanhakingspunten voor nieuwe regelingen kunnen maken of de woonvisie kan worden aangepast. Dit beleid willen we zo breed mogelijk verkennen daarom gebruiken we brede welvaart. Specifieke kansen zijn rondom langer thuis blijven wonen en de doelgroep is ouderen boven de 80 jaar.",
		scope:
			"Neem de impact van 80-plussers mee op de zorg en woonomgeving binnen Amsterdam. 80-plussers moeten dichtbij voorzieningen, zoals supermarkten en huisartensposten en/of ziekenhuizen wonen. Ook moeten er sociale voorzieningen in de buurt zijn om eenzaamheid tegen te gaan wat een negatieve impact heeft op de gezondheid.",
		reason: ["NEW_POLICY"],
	},
];

import connectDB from '../lib/database';
import mongoose from 'mongoose';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { Comment } from '../models/Comment';

import { themeTemplates, ThemeTemplateEnum } from '../templates/themeTemplates';
import { ProjectStatus } from '@shared/types';

async function seed() {
  try {
    console.info('🌱 Starting seed process...');

    // Connect to database
    await connectDB();

    // Clear existing data
    await Project.deleteMany({});
    await Comment.deleteMany({});
    // Only delete the seed users, not all users
    await User.deleteMany({ entraId: { $in: ["test-user-id", "reviewer-user-id"] } });

    // Try to find an existing user that is not the seed user
    let user = await User.findOne({ entraId: { $ne: "test-user-id" } });
    if (!user) {
      // Create test user if no other user exists
      user = await User.create({
        entraId: "test-user-id",
        email: "test@amsterdam.nl",
        displayName: "Test User"
      });
    }

    // 1. Create Project using the DEFAULT template
    const defaultTemplateProject = await Project.create({
      name: "Project with DEFAULT template",
      description: "This project uses the DEFAULT theme template.",
      status: ProjectStatus.Published,
      createdBy: user._id,
      themes: themeTemplates[ThemeTemplateEnum.DEFAULT],
      keyMessage: "This is a seeded key message.",
      users: [
        {
          user: user._id,
          role: 'OWNER'
        }
      ]
    });

    // 2. Create Project with merged DEFAULT template and seeded themes (deduplicated by name)
    // Prepare custom seeded themes
    const customSeededThemes = [
      {
        name: "Economisch kapitaal",
        arguments: [
          {
            title: "Verliezen innovatiedistrict",
            explanation: "Innovatiedistricten, gekenmerkt door een hoge concentratie van start-ups, technologiebedrijven, onderzoeksinstituten en creatieve industrieën, fungeren als motoren voor economische groei en technologische vooruitgang. Als deze districten verliezen lijden – door bijvoorbeeld minder ruimte voor bedrijven en innovatie midden in de samenleving, meer wonen zorgt voor disbalans wat kan zorgen voor een grotere stem van bewoners en de beschikbaarheid van Marineterrein om voor de stad te werken, leren en recreëren neemt af.",
            importance: "HIGH",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'NEGATIVE'
          },
          {
            title: "Toevoegen van dure woningen door hoge prijs grond zorgt voor vergroting vermogensongelijkheid",
            explanation: "Het Marineterrein kent een beperkte ruimte voor ontwikkeling op een van de duurste plekken van de stad. Als er meer woningen komen en er moeten daardoor ook meer ontwikkelingen plaatsvinden, zullen de woningen geld moeten opbrengen. Hierdoor is de kans zeer aanwezig dat deze duur worden en daarmee ook de toegankelijkheid van iedereen op de woningmarkt verkleind wordt.",
            importance: "HIGH",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'NEGATIVE'
          },
          {
            title: "Meer wonen heeft invloed op de betaalbare ruimte voor kunst en cultuur",
            explanation: "Wanneer het Marineterrein intensief worden ontwikkeld voor woonruimte, worden vaak de huren van commerciële en creatieve ruimtes opgedreven. Kunstenaars, culturele instellingen en creatieve ondernemers kunnen hierdoor moeite krijgen om betaalbare locaties te vinden voor hun werk, wat leidt tot een verarming van het culturele aanbod.",
            importance: "MEDIUM",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'NEGATIVE'
          },
          {
            title: "Potentie op meer testwoningen",
            explanation: "Doordat er op het Marineterrein een groot deel bestaan blijft voor innovatie en ontwikkeling, kan er ook door de toename van woningen hier een test voor gedaan worden. Een test die de opschaalbaarheid van de toekomstbestendige bouw een boost kan geven door nieuwe inzichten en technieken.",
            importance: "MEDIUM",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'POSITIVE'
          }
        ]
      },
      {
        name: "Consumptie en Inkomen",
        arguments: [
          {
            title: "Meer betaalbare woningen is gunstig voor bestedingspatroon",
            explanation: "De toename van woningen op het Marineterrein heeft een positief effect op het bestedingspatroon op en rondom het Marineterrein. Meer mensen zullen meer consumeren, wat bijdraagt aan het [economisch kapitaal](#economisch-kapitaal) van de buurt. Dit kan ten goede komen aan de omgeving waar veel winkels en horeca is, maar ook op het terrein zelf voor (nieuwe) voorzieningen.",
            importance: "MEDIUM",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'POSITIVE'
          },
          {
            title: "Dure grond veroorzaakt hoge aanschafkosten/woonlasten negatief voor consumptiemogelijkheden",
            explanation: "Door de hoge aanschaf- en ontwikkelingskosten zal een substantieel bedrag van het inkomen opgaan aan directe woonlasten. Hierdoor blijft er minder over voor consumptie.",
            importance: "HIGH",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'NEGATIVE'
          }
        ]
      },
      {
        name: "Ruimtelijke samenhang en kwaliteit",
        arguments: [
          {
            title: "Meer stimulans voor gedeelde ruimte",
            explanation: "Het Marineterrein is bij uitstek een plek nu waar veel gebeurt. In zowel de openbare ruimte, in de gebouwen als in de voorzieningen die er zijn. Een profiel welke onderscheidend is ten opzichte van veel andere plekken, mede door het innovatieve karakter.",
            importance: "HIGH",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'POSITIVE'
          },
          {
            title: "Minder openbare ruimte/groen",
            explanation: "De ruimte op het Marineterrein is beperkt voor alle functies die daar moeten komen. Als er meer woningbouw komt, zal dat betekenen dat er minder ruimte zal zijn in het openbaar gebied en daardoor ook minder ruimte voor groen. Dit heeft direct invloed op het [natuurlijk kapitaal](#natuurlijk-kapitaal) en de leefbaarheid van het gebied.",
            importance: "HIGH",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'NEGATIVE'
          }
        ]
      },
      {
        name: "Subjectief welzijn",

        arguments: [
          {
            title: "Meer geluk door potentiële diversiteit",
            explanation: "Een diverse omgeving als het Marineterrein in termen van gebruik aan aanzicht draagt bij aan een verhoogd subjectief welzijn. Door het verschillende gebruik en de mogelijkheden om hier aan bij te dragen of er midden in te staan, voelen mensen zich thuis.",
            importance: "MEDIUM",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'POSITIVE'
          },
          {
            title: "Het gevoel van geluk vermindert wanneer de ruimte monofunctioneel wordt",
            explanation: "Het Marineterrein is bij uitstek een plek nu waar veel gebeurt. Als dit sterk uit evenwicht wordt gehaald door het meer toevoegen van wonen, en daarmee een andere dominantie optreedt, kan dit sterke invloed hebben op het gevoel van geluk en herkenbaarheid.",
            importance: "MEDIUM",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'NEGATIVE'
          }
        ]
      },
      {
        name: "Sociaal kapitaal",
        arguments: [
          {
            title: "Clusteren van wonen verhoogt de kans om te verbinden met anderen",
            explanation: "Wanneer er op het marineterrein meer woningen worden gebouwd, ontstaan er meer mogelijkheden voor informele en formele ontmoetingen tussen bewoners. Het regelmatig tegenkomen van dezelfde mensen bevordert het vertrouwen en wederzijds begrip onderling.",
            importance: "HIGH",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'POSITIVE'
          },
          {
            title: "Grotere bewonersgroep betekent ook potentieel meer anonimiteit",
            explanation: "Naarmate het Marineterrein groeit en de bewoners aantallen toenemen, kan de anonimiteit toenemen, wat betekent dat bewoners minder persoonlijk contact hebben met hun buren. Deze anonimiteit kan leiden tot een afname van de kans op informele ontmoetingen.",
            importance: "MEDIUM",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'NEGATIVE'
          }
        ]
      },
      {
        name: "Natuurlijk kapitaal",
        arguments: [
          {
            title: "Uitputting van grondstoffen",
            explanation: "Bij het bouwen van nieuwe woningen worden grote hoeveelheden natuurlijke bronnen gebruikt. Deze grondstoffen zijn vaak eindig en hun overmatig gebruik kan leiden tot uitputting van ecosystemen, verlies van biodiversiteit en verstoring van natuurlijke processen.",
            importance: "HIGH",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'NEGATIVE'
          },
          {
            title: "Meer verstening zorgt voor meer hitte in de stad",
            explanation: "Verstening, waarbij natuurlijke bodems en groene ruimtes plaatsmaken voor beton en asfalt, versterkt het stedelijke hitte-eilandeffect. Dit fenomeen houdt in dat steden aanzienlijk warmer worden dan omliggende landelijke gebieden, vooral tijdens de zomer. Dit heeft niet alleen impact op het [natuurlijk kapitaal](#natuurlijk-kapitaal) maar ook op de [ruimtelijke samenhang en kwaliteit](#ruimtelijke-samenhang-en-kwaliteit) van de leefomgeving.",
            importance: "HIGH",
            timeFrame: ["FIVE_TO_TEN_Y"],
            location: ["NEIGHBORHOOD"],
            source: {
              type: "EXPERT",
            },
            sentiment: 'NEGATIVE'
          }
        ]
      }
    ];

    // Assign order to each argument in each custom seeded theme
    customSeededThemes.forEach(theme => {
      if (Array.isArray(theme.arguments)) {
        theme.arguments.forEach((arg, idx) => {
          arg.order = idx;
        });
      }
    });

    // Merge DEFAULT template themes and custom themes, deduplicating by name
    const defaultTemplateThemes = themeTemplates[ThemeTemplateEnum.DEFAULT] || [];
    // Merge: for each template theme, use the detailed version from customSeededThemes if available, else use the template
    const mergedThemes = defaultTemplateThemes.map(templateTheme => {
      const custom = customSeededThemes.find(t => t.name === templateTheme.name);
      const merged = custom ? { ...templateTheme, ...custom } : templateTheme;
      const { slug, ...rest } = merged;
      return rest;
    });

    console.info('Merged themes:', mergedThemes);

    const project = await Project.create({
      name: "300 extra woningen op het Marineterrein",
      description: "...",
      status: "DRAFT",
      createdBy: user._id,
      themes: mergedThemes,
      keyMessage: "Key message for Marineterrein project.",
      users: [
        {
          user: user._id,
          role: 'OWNER'
        }
      ]
    });

    // Create sample comments and replies
    console.info('🗨️ Creating sample comments...');

    // Create a second user for replies
    const reviewerUser = await User.create({
      entraId: "reviewer-user-id",
      email: "reviewer@amsterdam.nl",
      displayName: "Reviewer User"
    });

    // Create comments for the main project
    const comment1 = await Comment.create({
      projectId: project._id,
      author: user._id,
      body: "Dit is een interessant punt over economisch kapitaal. Kunnen we hier meer data over verzamelen?",
      page: "1:theme:economisch-kapitaal",
      locationData: {
        type: "argument",
        x: 120,
        y: 340,
        elementId: "argument-1"
      }
    });

    const comment2 = await Comment.create({
      projectId: project._id,
      author: reviewerUser._id,
      body: "De impact op natuurlijk kapitaal verdient meer aandacht. Misschien kunnen we dit uitbreiden?",
      page: "6:theme:natuurlijk-kapitaal",
      locationData: {
        type: "element",
        x: 250,
        y: 180,
        target: "theme-section"
      },
      replies: [
        {
          author: user._id,
          body: "Goed punt! Ik zal meer onderzoek doen naar de milieu-impact.",
          resolved: false
        }
      ]
    });

    const comment3 = await Comment.create({
      projectId: project._id,
      author: user._id,
      body: "Kunnen we de tijdslijn voor sociaal kapitaal aanpassen? Dit lijkt me een langetermijneffect.",
      page: "5:theme:sociaal-kapitaal",
      locationData: {
        type: "root",
        x: 100,
        y: 50,
        anchor: "top-left"
      },
      resolved: true
    });

    // Create a comment with multiple replies
    const comment4 = await Comment.create({
      projectId: project._id,
      author: reviewerUser._id,
      body: "Het argument over ruimtelijke kwaliteit heeft meer nuance nodig.",
      page: "3:theme:ruimtelijke-samenhang-en-kwaliteit",
      locationData: {
        type: "argument",
        x: 300,
        y: 220,
        elementId: "argument-2",
        section: "explanation"
      },
      replies: [
        {
          author: user._id,
          body: "Wat bedoel je precies met meer nuance?",
          resolved: false
        },
        {
          author: reviewerUser._id,
          body: "We moeten ook rekening houden met de positieve aspecten van verdichting.",
          resolved: false
        },
        {
          author: user._id,
          body: "Akkoord, ik zal dit toevoegen aan het argument.",
          resolved: true
        }
      ]
    });

    // Create some comments for the default template project too
    const comment5 = await Comment.create({
      projectId: defaultTemplateProject._id,
      author: user._id,
      body: "Dit is een test comment voor het default template project.",
      page: "0:overview:main",
      locationData: {
        type: "root",
        x: 150,
        y: 100,
        viewport: "desktop"
      }
    });

    // Add a comment on the key message section
    const comment6 = await Comment.create({
      projectId: project._id,
      author: reviewerUser._id,
      body: "De key message zou specifieker kunnen zijn over de verwachte impact.",
      page: "0:key-message:main",
      locationData: {
        type: "element",
        x: 200,
        y: 75,
        target: "key-message-text",
        offset: { top: 10, left: 5 }
      }
    });

    // Add a comment on consumptie theme
    const comment7 = await Comment.create({
      projectId: project._id,
      author: user._id,
      body: "Misschien moeten we ook rekening houden met de impact op lokale ondernemers?",
      page: "2:theme:consumptie-en-inkomen",
      locationData: {
        type: "argument",
        x: 180,
        y: 160,
        elementId: "argument-3",
        highlightText: "bestedingspatroon"
      },
      replies: [
        {
          author: reviewerUser._id,
          body: "Dat is een goede toevoeging! Kun je daar een apart argument voor maken?",
          resolved: false
        }
      ]
    });

    console.info('✅ Seed completed successfully');
    console.info('Created:');
    // Get the created document
    const createdProject = Array.isArray(project) ? project[0] : project;

    console.info(`- User: ${user.displayName} (${user.email})`);
    console.info(`- Reviewer: ${reviewerUser.displayName} (${reviewerUser.email})`);
    console.info(`- Project: ${createdProject.name}`);
    console.info(`- Theme: ${createdProject.themes[0].name}`);
    console.info(`- Arguments: ${createdProject.themes[0].arguments.length} arguments created`);
    console.info(`- Comments: 7 comments created with replies`);

    // Also log the default template project
    console.info(`- Default Template Project: ${defaultTemplateProject.name}`);
    console.info(`- Default Template Themes: ${defaultTemplateProject.themes.length}`);

    // 3. Create overflow test project with substantial content
    const overflowTestProject = await Project.create({
      name: "Content Overflow Test Project",
      description: "This project is designed to test content overflow handling with extensive text content in arguments.",
      status: ProjectStatus.Draft,
      createdBy: user._id,
      themes: [
        {
          name: "Sociaal kapitaal - Uitgebreide overflow test",
          description: "Dit thema test de overflow handling met 10 uitgebreide argumenten (5 positieve, 5 negatieve) die de normale grenzen van pagina-indeling kunnen overschrijden door zeer lange tekstinhoud.",
          arguments: [
            {
              title: "Uitgebreide positieve impact op gemeenschapsvorming en sociale cohesie binnen stedelijke woongebieden",
              explanation: "De ontwikkeling van nieuwe woongebieden heeft een diepgaande en multifaceteerde impact op de sociale structuren binnen stedelijke gemeenschappen. Wanneer nieuwe bewoners zich vestigen in een gebied, ontstaat er een natuurlijk proces van gemeenschapsvorming waarbij verschillende sociale groepen samenkomen en nieuwe netwerken ontwikkelen. Dit proces wordt versterkt door gedeelde voorzieningen zoals speeltuinen, gemeenschapscentra en lokale winkels, die als ontmoetingsplaatsen fungeren. De diversiteit die nieuwe bewoners meebrengen, draagt bij aan een rijkere culturele uitwisseling en vergroot de sociale veerkracht van de gemeenschap. Bovendien leidt de toename van het aantal bewoners tot een grotere vraag naar lokale diensten en voorzieningen, wat op zijn beurt kansen creëert voor lokale ondernemers en bijdraagt aan de economische vitaliteit van het gebied. Deze positieve spiraal van sociale en economische ontwikkeling versterkt het sociale kapitaal door het creëren van meer mogelijkheden voor formele en informele interacties tussen bewoners.",
              importance: "HIGH",
              timeFrame: ["ONE_TO_FIVE_Y", "FIVE_TO_TEN_Y"],
              location: ["NEIGHBORHOOD", "CITY_DISTRICT"],
              source: {
                type: "EXPERT",
              },
              sentiment: 'POSITIVE'
            },
            {
              title: "Verhoogde kansen op intergenerationele kennisoverdracht en mentorschap binnen diverse leeftijdsgroepen",
              explanation: "Nieuwe woongebieden trekken vaak een diverse mix van leeftijdsgroepen aan, van jonge gezinnen tot senioren die willen downsizen. Deze demografische diversiteit creëert unieke kansen voor intergenerationele uitwisseling waarbij verschillende leeftijdsgroepen van elkaar kunnen leren. Ouderen kunnen hun levenservaring en praktische vaardigheden delen met jongere generaties, terwijl jongeren op hun beurt nieuwe technologieën en moderne perspectieven kunnen introduceren. Dit type uitwisseling vindt plaats in verschillende contexten: van informele ontmoetingen in gemeenschappelijke ruimtes tot georganiseerde activiteiten in buurtcentra. De aanwezigheid van verschillende generaties draagt ook bij aan een stabielere gemeenschap, waarbij de wisselende behoeften en perspectieven van verschillende levensfasen worden gerespecteerd en geïntegreerd in de sociale structuur. Deze intergenerationele verbindingen versterken het sociale weefsel van de gemeenschap en creëren een ondersteunend netwerk dat bijdraagt aan het welzijn van alle bewoners.",
              importance: "MEDIUM",
              timeFrame: ["FIVE_TO_TEN_Y", "TEN_TO_TWENTY_Y"],
              location: ["NEIGHBORHOOD"],
              source: {
                type: "EXPERT",
              },
              sentiment: 'POSITIVE'
            },
            {
              title: "Versterking van lokale democratische participatie en burgerbetrokkenheid bij gemeenschapsinitiatieven",
              explanation: "Nieuwe woongebieden bieden uitstekende kansen voor het versterken van democratische participatie op lokaal niveau. Wanneer bewoners zich in een nieuwe omgeving vestigen, zijn zij vaak meer gemotiveerd om actief bij te dragen aan de ontwikkeling van hun leefomgeving. Dit uit zich in hogere participatiegraaden bij buurtbijeenkomsten, verenigingsactiviteiten en lokale verkiezingen. De noodzaak om nieuwe sociale structuren op te bouwen, stimuleert bewoners om initiatief te nemen en leiderschap te tonen in gemeenschapsprojecten. Bovendien creëert de aanwezigheid van nieuwe bewoners met diverse achtergronden en expertises een rijke pool van vaardigheden en ideeën die ten goede komen aan de hele gemeenschap. Deze verhoogde betrokkenheid leidt tot meer effectieve lokale governance en een sterker gevoel van eigenaarschap over de publieke ruimte en gemeenschappelijke voorzieningen. Het resultaat is een meer democratische en responsieve gemeenschap waarin alle stemmen gehoord worden.",
              importance: "HIGH",
              timeFrame: ["NOW", "ONE_TO_FIVE_Y"],
              location: ["NEIGHBORHOOD", "CITY_DISTRICT"],
              source: {
                type: "EXPERT",
              },
              sentiment: 'POSITIVE'
            },
            {
              title: "Ontwikkeling van innovatieve sociale ondernemingen en coöperatieve initiatieven binnen lokale economieën",
              explanation: "De komst van nieuwe bewoners stimuleert vaak de ontwikkeling van innovatieve sociale ondernemingen die inspelen op de specifieke behoeften van de groeiende gemeenschap. Deze ondernemingen, die vaak worden opgezet als coöperaties of sociale enterprises, richten zich op het creëren van lokale oplossingen voor gemeenschappelijke uitdagingen. Voorbeelden hiervan zijn gemeenschappelijke tuinen, deeleconomieplatforms, lokale energiecoöperaties en buurtrestaurants die gebruik maken van lokaal geproduceerde ingrediënten. Deze initiatieven versterken niet alleen de lokale economie door geld binnen de gemeenschap te houden, maar creëren ook nieuwe vormen van sociale samenhang door bewoners actief te betrekken bij economische activiteiten. De coöperatieve structuur van veel van deze ondernemingen bevordert democratische besluitvorming en zorgt ervoor dat de voordelen eerlijk worden verdeeld onder alle deelnemers. Dit leidt tot een meer inclusieve en duurzame lokale economie die bijdraagt aan het sociale kapitaal van de gemeenschap.",
              importance: "MEDIUM",
              timeFrame: ["ONE_TO_FIVE_Y", "FIVE_TO_TEN_Y"],
              location: ["NEIGHBORHOOD"],
              source: {
                type: "DATA",
              },
              sentiment: 'POSITIVE'
            },
            {
              title: "Risico op sociale fragmentatie en de vorming van exclusieve groepen binnen diverse gemeenschappen",
              explanation: "Ondanks de potentiële voordelen van diversiteit, bestaat er een reëel risico dat nieuwe woongebieden leiden tot sociale fragmentatie waarbij verschillende groepen bewoners zich afzonderen in exclusieve sociale cirkels. Dit fenomeen kan ontstaan door verschillen in socio-economische status, culturele achtergrond, levensstijl of levensfase. Wanneer bewoners zich hoofdzakelijk associëren met gelijkgestemden, kunnen er parallelle sociale structuren ontstaan die weinig interactie hebben met elkaar. Deze segregatie wordt vaak versterkt door de architectuur en indeling van woongebieden, waarbij bepaalde woningtypes of locaties aantrekkelijker zijn voor specifieke groepen. Het gebrek aan meaningful contact tussen verschillende groepen kan leiden tot misverstanden, vooroordelen en een afname van sociale cohesie. Bovendien kunnen exclusieve groepen concurreren om toegang tot beperkte gemeenschappelijke voorzieningen, wat spanning en conflict kan veroorzaken. Deze dynamiek ondermijnt het sociale kapitaal door het creëren van een verdeelde gemeenschap waarin niet alle bewoners gelijke kansen hebben om deel te nemen aan het sociale leven.",
              importance: "HIGH",
              timeFrame: ["ONE_TO_FIVE_Y", "FIVE_TO_TEN_Y"],
              location: ["NEIGHBORHOOD", "CITY_DISTRICT"],
              source: {
                type: "EXPERT",
              },
              sentiment: 'NEGATIVE'
            },
            {
              title: "Verbetering van informele ondersteuningsnetwerken en wederzijdse hulpverlening tussen buren",
              explanation: "In nieuwe woongebieden ontwikkelen zich vaak sterke informele ondersteuningsnetwerken waarbij bewoners elkaar spontaan helpen met dagelijkse uitdagingen. Deze netwerken ontstaan natuurlijk wanneer mensen in een nieuwe omgeving aankomen en zich moeten aanpassen aan hun nieuwe leefomgeving. De gedeelde ervaring van nieuw zijn, creëert een gevoel van solidariteit en wederzijds begrip. Bewoners delen praktische informatie over lokale diensten, helpen elkaar bij kleine klusjes, passen op elkaars kinderen en bieden emotionele steun tijdens moeilijke periodes. Deze informele hulpverlening is bijzonder waardevol omdat het toegankelijk en flexibel is, zonder de bureaucratie van formele ondersteuningssystemen. Het draagt bij aan een gevoel van veiligheid en verbondenheid binnen de gemeenschap. Bovendien fungeren deze netwerken als een vangnet voor kwetsbare bewoners en dragen zij bij aan de algemene veerkracht van de gemeenschap bij het omgaan met uitdagingen.",
              importance: "HIGH",
              timeFrame: ["NOW", "ONE_TO_FIVE_Y"],
              location: ["NEIGHBORHOOD"],
              source: {
                type: "EXPERT",
              },
              sentiment: 'POSITIVE'
            },
            {
              title: "Overbelasting van bestaande sociale infrastructuur en verminderde kwaliteit van gemeenschappelijke voorzieningen",
              explanation: "De toevoeging van nieuwe bewoners aan een gebied kan leiden tot overbelasting van de bestaande sociale infrastructuur, waardoor de kwaliteit van gemeenschappelijke voorzieningen afneemt. Scholen kunnen overcrowded raken, wat resulteert in grotere klasgrootten en minder individuele aandacht voor leerlingen. Gezondheidscentra kunnen langere wachttijden ervaren, wat de toegang tot zorg belemmert. Gemeenschapscentra en sportfaciliteiten kunnen overboekt raken, waardoor bewoners minder mogelijkheden hebben voor sociale activiteiten en recreatie. Deze overbelasting heeft een directe negatieve impact op het sociale kapitaal omdat het de mogelijkheden voor sociale interactie en gemeenschapsopbouw beperkt. Bovendien kan de verminderde kwaliteit van voorzieningen leiden tot frustratie en ontevredenheid onder bewoners, wat de sociale cohesie verder ondermijnt. De situatie wordt nog verergerd wanneer er onvoldoende planning en investering is geweest in het uitbreiden van de infrastructuur om de groeiende bevolking te accommoderen.",
              importance: "HIGH",
              timeFrame: ["NOW", "ONE_TO_FIVE_Y"],
              location: ["NEIGHBORHOOD", "CITY_DISTRICT"],
              source: {
                type: "DATA",
              },
              sentiment: 'NEGATIVE'
            },
            {
              title: "Verlies van bestaande sociale netwerken en gemeenschapstradities door demografische veranderingen",
              explanation: "Snelle demografische veranderingen in een gebied kunnen leiden tot het verlies van bestaande sociale netwerken en gemeenschapstradities die door lange tijd bewoners zijn opgebouwd. Wanneer nieuwe bewoners in grote aantallen arriveren, kunnen de oorspronkelijke sociale structuren worden verstoord of verdund. Lokale tradities, informele ontmoetingsplaatsen en historisch gegroeide sociale gewoonten kunnen verdwijnen wanneer ze niet worden begrepen of gewaardeerd door nieuwkomers. Dit proces wordt versneld wanneer er grote verschillen bestaan tussen de cultuur en waarden van nieuwe en bestaande bewoners. Het verlies van deze sociale structuren heeft een negatieve impact op het sociale kapitaal omdat het de continuïteit van gemeenschapsbanden doorbreekt en kan leiden tot een gevoel van vervreemding bij lange tijd bewoners. Bovendien gaat er waardevolle lokale kennis en sociale geschiedenis verloren, wat de gemeenschap als geheel verarmt. Dit creëert spanning tussen verschillende groepen bewoners en kan leiden tot conflicten over de richting waarin de gemeenschap zich ontwikkelt.",
              importance: "MEDIUM",
              timeFrame: ["NOW", "ONE_TO_FIVE_Y"],
              location: ["NEIGHBORHOOD"],
              source: {
                type: "EXPERT",
              },
              sentiment: 'NEGATIVE'
            },
            {
              title: "Toegenomen sociale druk en concurrentie om beperkte gemeenschappelijke middelen en mogelijkheden",
              explanation: "In groeiende gemeenschappen ontstaat er vaak toegenomen concurrentie om beperkte gemeenschappelijke middelen en mogelijkheden, wat sociale druk en spanning creëert tussen bewoners. Deze concurrentie manifesteert zich op verschillende manieren: ouders die strijden om hun kinderen in de beste scholen te krijgen, bewoners die concurreren om parkeerplekken in de buurt, en verenigingen die strijden om toegang tot gemeenschapsruimten. Deze competitieve dynamiek kan leiden tot een afname van sociale solidariteit en samenwerking, omdat bewoners elkaar meer als concurrenten dan als medebewoners gaan zien. De druk wordt nog verhoogd wanneer er grote verschillen bestaan in middelen en invloed tussen verschillende groepen bewoners. Welgestelde bewoners kunnen hun voordelen gebruiken om betere toegang te krijgen tot voorzieningen, wat ongelijkheid versterkt en minder bedeelde bewoners marginaliseert. Deze dynamiek ondermijnt het sociale kapitaal door het creëren van een competitieve in plaats van coöperatieve gemeenschapscultuur.",
              importance: "MEDIUM",
              timeFrame: ["ONE_TO_FIVE_Y", "FIVE_TO_TEN_Y"],
              location: ["NEIGHBORHOOD"],
              source: {
                type: "EXPERT",
              },
              sentiment: 'NEGATIVE'
            },
            {
              title: "Erosie van lokale democratische processen door gebrek aan gedeelde identiteit en gemeenschappelijke doelen",
              explanation: "Wanneer nieuwe woongebieden een zeer diverse mix van bewoners aantrekken zonder voldoende gemeenschappelijke verbindende elementen, kan dit leiden tot erosie van lokale democratische processen. Het gebrek aan een gedeelde identiteit of gemeenschappelijke doelen maakt het moeilijk om consensus te bereiken over belangrijke gemeenschapskwesties. Verschillende groepen bewoners kunnen zeer uiteenlopende prioriteiten hebben wat betreft de ontwikkeling van hun leefomgeving, wat resulteert in verdeelde stemming bij lokale verkiezingen en lage opkomst bij gemeenschapsbijeenkomsten. Deze fragmentatie kan leiden tot politieke apathie waarbij bewoners zich terugtrekken uit democratische processen omdat ze het gevoel hebben dat hun stem er niet toe doet. Bovendien kunnen er parallelle besluitvormingsstructuren ontstaan waarbij verschillende groepen hun eigen informele leiderschap ontwikkelen, wat de legitimiteit van formele democratische instituties ondermijnt. Het resultaat is een verzwakte lokale democratie die minder effectief is in het vertegenwoordigen en dienen van alle bewoners.",
              importance: "HIGH",
              timeFrame: ["FIVE_TO_TEN_Y", "TEN_TO_TWENTY_Y"],
              location: ["CITY_DISTRICT", "CITY"],
              source: {
                type: "EXPERT",
              },
              sentiment: 'NEGATIVE'
            }
          ]
        }
      ],
      keyMessage: "Dit project test de grenzen van content overflow in onze PDF preview door gebruik te maken van uitgebreide argumenten met zeer lange teksten die de normale grenzen van onze layout kunnen overschrijden.",
      users: [
        {
          user: user._id,
          role: 'OWNER'
        }
      ]
    });

    // Assign order to arguments in the overflow test project
    overflowTestProject.themes.forEach((theme: any) => {
      theme.arguments.forEach((arg: any, idx: number) => {
        arg.order = idx;
      });
    });
    await overflowTestProject.save();

    console.info(`- Overflow Test Project: ${overflowTestProject.name}`);
    console.info(`- Overflow Test Themes: ${overflowTestProject.themes.length}`);
    console.info(`- Theme (${overflowTestProject.themes[0].name}): ${overflowTestProject.themes[0].arguments.length} arguments (5 positive, 5 negative)`);
    console.info(`- Total overflow test arguments: ${overflowTestProject.themes[0].arguments.length}`);

  } catch (error) {
    console.error('❌ Seed failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run seed
seed();

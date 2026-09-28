import { Project } from '../models/Project';
import { ProjectStatus, Project as ProjectType } from '@shared/types';
import { mapMongoToGraphQL } from './mongoMapper';
import { themeTemplates, ThemeTemplateEnum } from '../templates/themeTemplates';

export const createDemoProject = async (userId: string) => {
  // Delete all projects owned by the current user
  // await Project.deleteMany({
  //   'users.user': userId,
  //   'users.role': 'OWNER'
  // });

  // Demo project themes with the same data from seed.ts
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
          sentiment: 'NEGATIVE',
          order: 0
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
          sentiment: 'NEGATIVE',
          order: 1
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
          sentiment: 'NEGATIVE',
          order: 2
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
          sentiment: 'POSITIVE',
          order: 3
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
          sentiment: 'POSITIVE',
          order: 0
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
          sentiment: 'NEGATIVE',
          order: 1
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
          sentiment: 'POSITIVE',
          order: 0
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
          sentiment: 'NEGATIVE',
          order: 1
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
          sentiment: 'POSITIVE',
          order: 0
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
          sentiment: 'NEGATIVE',
          order: 1
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
          sentiment: 'POSITIVE',
          order: 0
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
          sentiment: 'NEGATIVE',
          order: 1
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
          sentiment: 'NEGATIVE',
          order: 0
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
          sentiment: 'NEGATIVE',
          order: 1
        }
      ]
    }
  ];

  // Merge DEFAULT template themes and custom themes, deduplicating by name
  const defaultTemplateThemes = themeTemplates[ThemeTemplateEnum.DEFAULT] || [];
  const mergedThemes = defaultTemplateThemes.map(templateTheme => {
    const custom = customSeededThemes.find(t => t.name === templateTheme.name);
    const merged = custom ? { ...templateTheme, ...custom } : templateTheme;
    const { slug, ...rest } = merged;
    return rest;
  });

  const project = new Project({
    name: "300 extra woningen op het Marineterrein",
    description: "Demo project voor brede welvaart analyse van woningbouw op het Marineterrein",
    status: ProjectStatus.Draft,
    createdBy: userId,
    themes: mergedThemes,
    keyMessage: "Key message for Marineterrein project.",
    users: [
      {
        user: userId,
        role: 'OWNER',
      }
    ]
  });

  await project.save();
  return mapMongoToGraphQL<ProjectType>(project);
};

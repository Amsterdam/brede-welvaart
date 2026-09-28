# Brede Welvaart Scan

A digital tool for the City Council of Amsterdam to collect, review, and archive outcomes from Brede Welvaart (BW) workshops.

---

## Overview

Each project (Scan) consists of 10 fixed topics:

1. Subjectief welzijn - Subjective well-being
2. Gezondheid - Health
3. Consumptie en inkomen - Consumption and income
4. Onderwijs en opleiding - Education and training
5. Ruimtelijke samenhang en kwaliteit - Spatial cohesion and quality
6. Economisch kapitaal - Economic capital
7. Natuurlijk kapitaal - Natural capital
8. Sociaal kapitaal - Social capital
9. Veiligheid - Safety
10. Wonen - Housing

Each topic contains 1–8 arguments:
- Typically 4 positive and 4 negative
- Sometimes includes a neutral argument

---

## Terminology
- **Scan**: The overall project containing all topics and arguments
- **Brede Welvaart**: The concept of broad prosperity, which the scan is based on. A Dutch term that translates to "broad prosperity" or "well-being."
- **Location: Straat**: The argument is specific to a street or neighborhood
- **Location: Buurt/wijk**: The argument is specific to a neighborhood or district
- **Location: Prov/regio**: The argument is specific to a province or region
- **Location: Stadsdeel**: The argument is specific to a district within the city
- **Location: Stad**: The argument is applicable to the entire city
- **Location: Nationaal**: The argument is applicable to the entire Netherlands
- **Location: Binnen EU**: The argument is applicable within the European Union
- **Location: Buiten EU**: The argument is applicable outside the European Union


## User Roles

**Facilitator**
- Creates new scan project
- Fills in arguments for each topic
- Invites reviewers
- Finalizes scan and exports PDF

**Reviewer**
- Views and comments on arguments
- Cannot edit content

---

## Workflow

1. Facilitator creates scan after workshop
2. Inputs arguments per topic
3. Invites reviewers (via email/token)
4. Reviewers comment inline
5. Facilitator finalizes scan and exports PDF
6. PDF is archived via API to council system

---

## Tech Stack

- Monorepo: `/frontend`, `/backend`, `/shared`
- Frontend: React + GraphQL
- Backend: Node.js + GraphQL (Apollo) + MongoDB
- Auth: SSO via Entree
- PDF: HTML to PDF (e.g. Puppeteer or Print Service)
- Types: GraphQL codegen → output to `shared`
- Only apps/frontend needs to be built, the rest is run via `tsx`

---

## Structure
```
/frontend → Facilitator & Reviewer UI
/backend → GraphQL API, auth, PDF, archive
/shared → GraphQL types, utilities
```

---

## Key Entities

- `Scan`: The overall project with all topics
- `Topic`: Fixed label (1 of 10), contains arguments
- `Argument`: Title, description, sentiment (positive/negative/neutral)
- `Comment`: Linked to argument or topic
- `User`: Facilitator or Reviewer
- `Review`: Collection of comments by a reviewer on a scan

---

## Output

- PDF includes all topics, arguments, and comments
- Metadata: date, facilitator, reviewers
- Sent to archival endpoint after finalization

---

## Requirements

- All scans must be editable until finalized
- Reviewers can only comment, not edit
- Only authenticated users via Entraid SSO
- GraphQL API schema must fully cover all front-end actions
- All types generated to shared package

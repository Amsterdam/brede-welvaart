import { createServer, IncomingMessage } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

const DEFAULT_FIXTURE = JSON.parse(readFileSync(join(FIXTURES_DIR, 'default.json'), 'utf8'));
const CATEGORY_LABELS: Record<string, string> = {
  economisch_kapitaal: 'Economisch kapitaal',
  gezondheid: 'Gezondheid',
  inkomen: 'Consumptie en inkomen',
  natuurlijk_kapitaal: 'Natuurlijk kapitaal',
  ruimte: 'Ruimtelijke samenhang en kwaliteit',
  sociaal_kapitaal: 'Sociaal kapitaal',
  subjectief_welzijn: 'Subjectief welzijn',
  veiligheid: 'Veiligheid',
  wonen: 'Wonen',
};

// Inline slugify — strip diacritics, lowercase, replace non-alphanum with '-'
function slug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function loadFixture(themeName?: string) {
  if (!themeName) return enrichFixture(DEFAULT_FIXTURE);
  const path = join(FIXTURES_DIR, 'themes', `${slug(themeName)}.json`);
  return enrichFixture(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : DEFAULT_FIXTURE);
}

function getFixtureName(themeName?: string) {
  if (!themeName) return 'default.json';
  const name = `${slug(themeName)}.json`;
  return existsSync(join(FIXTURES_DIR, 'themes', name)) ? name : 'default.json';
}

function getOpenResearchId(source: any) {
  const fromDocId = String(source.doc_id ?? '').match(/openresearch:(\d+)/i)?.[1];
  const fromUrl = String(source.url ?? '').match(/\/page\/(\d+)/)?.[1];
  return fromDocId ?? fromUrl ?? undefined;
}

function enrichFixture(fixture: any) {
  return {
    ...fixture,
    sources: (fixture.sources ?? []).map((source: any, index: number) => enrichSource(source, index)),
    authors: (fixture.authors ?? []).map((author: any) => enrichAuthor(author)),
  };
}

function enrichSource(source: any, index: number) {
  const openResearchId = getOpenResearchId(source);
  const categoryLabel = CATEGORY_LABELS[source.category] ?? source.category;
  const existingKeywords = Array.isArray(source.metadata?.keywords) ? source.metadata.keywords : [];

  return {
    ...source,
    metadata: {
      collection: 'Open Research Amsterdam',
      sourceName: 'Open Research Amsterdam',
      author: 'Gemeente Amsterdam',
      page: index + 1,
      keywords: [...new Set([categoryLabel, source.chunk_type, ...existingKeywords].filter(Boolean))],
      ...(openResearchId ? { openresearch_id: openResearchId } : {}),
      ...(source.metadata ?? {}),
    },
  };
}

function getOpenResearchProfileUrl(author: any) {
  const profileUrl = author.metadata?.openResearchUrl ?? author.metadata?.profileUrl ?? author.url;
  if (profileUrl) return profileUrl;
  if (author.id === null || author.id === undefined) return undefined;
  return `https://openresearch.amsterdam/nl/page/${author.id}`;
}

function enrichAuthor(author: any) {
  return {
    ...author,
    metadata: {
      ...(author.metadata ?? {}),
      openResearchUrl: getOpenResearchProfileUrl(author),
    },
  };
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function loadAllFixtures(): any[] {
  const all = [DEFAULT_FIXTURE];
  const themesDir = join(FIXTURES_DIR, 'themes');
  if (existsSync(themesDir)) {
    for (const file of readdirSync(themesDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        all.push(JSON.parse(readFileSync(join(themesDir, file), 'utf8')));
      } catch (e) {
        console.warn('[mock] skipping malformed fixture', file, e);
      }
    }
  }
  return all;
}

// Extract numeric tail "51001" from "openresearch:51001" or "/page/51001"
function extractNumericId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return String(value).match(/(\d+)/)?.[1];
}

function findSourceById(id: string): any | undefined {
  const target = extractNumericId(id) ?? id;
  for (const fixture of loadAllFixtures()) {
    for (let i = 0; i < (fixture.sources ?? []).length; i++) {
      const src = fixture.sources[i];
      const candidates = [
        src.doc_id,
        extractNumericId(src.doc_id),
        extractNumericId(src.url),
        src.metadata?.openresearch_id,
      ].filter(Boolean).map(String);
      if (candidates.includes(target) || candidates.includes(id)) {
        return enrichSource(src, i);
      }
    }
  }
  return undefined;
}

const DELAY_MS = Number(process.env.MOCK_DELAY_MS ?? 1500);

const server = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', mode: 'mock' }));
    return;
  }

  if (req.method === 'GET' && req.url === '/bw/analyze') {
    const fixture = loadFixture();
    res.writeHead(200);
    res.end(JSON.stringify({
      ...fixture,
      project_id: 'mock-project',
      computed_at: new Date().toISOString(),
      note: 'Debug response. The backend uses POST /bw/analyze with a JSON body.',
    }));
    return;
  }

  if (req.method === 'POST' && req.url === '/bw/analyze') {
    try {
      const body = await readBody(req);
      const themeName: string | undefined = body?.input?.theme;
      const fixture = loadFixture(themeName);

      if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));

      res.writeHead(200);
      res.end(JSON.stringify({
        ...fixture,
        project_id: body?.project_id ?? 'mock-project',
        computed_at: new Date().toISOString(),
      }));
      console.log(`[mock] /bw/analyze theme=${themeName ?? '(none)'} → fixture=${getFixtureName(themeName)}`);
    } catch (e: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e?.message ?? String(e) }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/bw/generate-key-message') {
    try {
      const body = await readBody(req);
      const effects = (body?.themes ?? []).flatMap((theme: any) => theme.arguments ?? []);
      const firstPositive = effects.find((effect: any) => effect.sentiment === 'POSITIVE');
      const firstNegative = effects.find((effect: any) => effect.sentiment === 'NEGATIVE');
      const lines = [firstPositive, firstNegative].filter(Boolean).map((effect: any) => `• ${effect.title}`);

      if (DELAY_MS > 0) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      res.writeHead(200);
      res.end(JSON.stringify({
        key_message: lines.join('\n') || `• ${body?.goal || body?.name || 'Concept-kernboodschap'}`,
      }));
    } catch (e: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e?.message ?? String(e) }));
    }
    return;
  }

  // GET /bw/source/:id — fetch a single enriched source across all fixtures
  if (req.method === 'GET' && req.url) {
    const m = req.url.match(/^\/bw\/source\/([^/?#]+)\/?$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const source = findSourceById(id);
      if (!source) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'source not found', id }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(source));
      console.log(`[mock] /bw/source/${id} → doc_id=${source.doc_id}`);
      return;
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found', method: req.method, url: req.url }));
});

const PORT = Number(process.env.PORT ?? 8000);
server.listen(PORT, () => {
  console.log(`[ai-service-mock] listening on :${PORT} (delay ${DELAY_MS}ms)`);
});

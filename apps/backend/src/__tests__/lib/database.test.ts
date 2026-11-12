import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above module-level consts, so share the mock via vi.hoisted.
const { getToken } = vi.hoisted(() => ({ getToken: vi.fn<() => Promise<{ token: string }>>() }));

vi.mock('@azure/identity', () => ({
  // Called with `new`, so the implementation must be a function, not an arrow.
  DefaultAzureCredential: vi.fn(function () { return { getToken }; }),
}));

vi.mock('../../config', () => ({
  __esModule: true,
  default: {
    database: {
      url: '',
      cosmosConnectionStringUrl: '',
      name: 'ct-bw-o-db',
    },
  },
}));

import config from '../../config';
import { getDatabaseUrl } from '../../lib/database';

const databaseConfig = config.database as {
  url: string;
  cosmosConnectionStringUrl: string;
  name: string;
};

describe('getDatabaseUrl', () => {
  beforeEach(() => {
    databaseConfig.url = '';
    databaseConfig.cosmosConnectionStringUrl = '';
    databaseConfig.name = 'ct-bw-o-db';
    getToken.mockReset();
    vi.restoreAllMocks();
  });

  it('uses the Cosmos managed identity configuration before MONGODB_URI', async () => {
    databaseConfig.url = 'mongodb://localhost:27017/ct-bw';
    databaseConfig.cosmosConnectionStringUrl = 'https://management.azure.com/cosmos/listConnectionStrings';
    getToken.mockResolvedValue({ token: 'access-token' });
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      connectionStrings: [{
        connectionString: 'mongodb://cosmos.example:10255/?ssl=true',
        keyKind: 'Primary',
        type: 'MongoDB',
      }],
    }), { status: 200 }));

    await expect(getDatabaseUrl()).resolves.toBe(
      'mongodb://cosmos.example:10255/ct-bw-o-db?ssl=true'
    );
  });

  it('uses MONGODB_URI for explicit local configuration', async () => {
    databaseConfig.url = 'mongodb://mongodb:27017/ct-bw';

    await expect(getDatabaseUrl()).resolves.toBe('mongodb://mongodb:27017/ct-bw');
  });

  it('fails instead of implicitly connecting to localhost', async () => {
    await expect(getDatabaseUrl()).rejects.toThrow(
      'No MongoDB connection configuration is available'
    );
  });
});

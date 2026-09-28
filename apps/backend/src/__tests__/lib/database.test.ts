import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getToken = jest.fn<() => Promise<{ token: string }>>();

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(() => ({ getToken })),
}));

jest.mock('../../config', () => ({
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
    jest.restoreAllMocks();
  });

  it('uses the Cosmos managed identity configuration before MONGODB_URI', async () => {
    databaseConfig.url = 'mongodb://localhost:27017/ct-bw';
    databaseConfig.cosmosConnectionStringUrl = 'https://management.azure.com/cosmos/listConnectionStrings';
    getToken.mockResolvedValue({ token: 'access-token' });
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
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

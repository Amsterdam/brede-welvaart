import mongoose from 'mongoose';
import { DefaultAzureCredential } from '@azure/identity';
import config from '../config';
import { DatabaseError } from './errors';

const MANAGEMENT_SCOPE = 'https://management.azure.com/.default';

type ConnectionStringsResponse = {
  connectionStrings?: Array<{ connectionString?: string; keyKind?: string; type?: string }>;
};

const addDatabaseName = (connectionString: string, databaseName: string) => {
  const separator = connectionString.indexOf('/?');
  if (separator === -1) return connectionString;
  return `${connectionString.slice(0, separator + 1)}${encodeURIComponent(databaseName)}${connectionString.slice(separator + 1)}`;
};

export async function getDatabaseUrl(): Promise<string> {
  if (config.database.cosmosConnectionStringUrl) {
    const credential = new DefaultAzureCredential();
    const accessToken = await credential.getToken(MANAGEMENT_SCOPE);
    const response = await fetch(config.database.cosmosConnectionStringUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken.token}` },
    });
    if (!response.ok) {
      throw new Error(`Cosmos connection configuration request failed with status ${response.status}`);
    }
    const result = await response.json() as ConnectionStringsResponse;
    const connectionString = result.connectionStrings?.find(
      item => item.type === 'MongoDB' && item.keyKind === 'Primary'
    )?.connectionString;
    if (!connectionString) throw new Error('Azure did not return a primary MongoDB connection string');
    return addDatabaseName(connectionString, config.database.name);
  }

  if (config.database.url) return config.database.url;

  throw new Error('No MongoDB connection configuration is available');
}

export default async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(await getDatabaseUrl(), {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
      heartbeatFrequencyMS: 30000 // Check connection every 30 seconds
    });
    console.info('📦 Connected to MongoDB');

    // Verify connection is alive
    await mongoose.connection.db?.command({ ping: 1 });
    console.info('✅ MongoDB connection verified');

    // Handle connection errors after initial connection
    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      throw new DatabaseError(error);
    });

    // Handle when the connection is disconnected
    mongoose.connection.on('disconnected', () => {
      console.warn('Lost MongoDB connection...');
    });

    // Handle when the connection is reconnected
    mongoose.connection.on('reconnected', () => {
      console.info('Reconnected to MongoDB');
    });

  } catch (error: any) {
    console.error('Failed to connect to MongoDB:', error);
    throw new DatabaseError(error);
  }
}

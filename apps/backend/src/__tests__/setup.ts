import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach } from '@jest/globals';

let mongod: MongoMemoryServer | undefined;

beforeAll(async () => {
  const mongoUri = process.env.MONGODB_TEST_URI ?? await startMemoryServer();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

async function startMemoryServer() {
  mongod = await MongoMemoryServer.create();
  return mongod.getUri();
}

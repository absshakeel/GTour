import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Shared in-memory MongoDB for integration tests.
 *
 * The API skips its own DB connection when `NODE_ENV === 'test'`, so tests
 * connect explicitly and start from a clean database per suite.
 */
let mongod: MongoMemoryServer | null = null;

export async function startTestDatabase(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'gtour-test' });
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

export async function clearTestDatabase(): Promise<void> {
  const collections = await mongoose.connection.db?.collections();
  await Promise.all(collections?.map((collection) => collection.deleteMany({})) ?? []);
}
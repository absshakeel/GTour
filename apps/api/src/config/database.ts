import mongoose from 'mongoose';
import { loadEnv } from './env';
import { DEFAULT_MONGODB_URI, resolveMongoUri } from './mongoUri';

export const connectDB = async (): Promise<void> => {
  loadEnv();

  const usingFallback = !process.env.MONGODB_URI;

  if (usingFallback) {
    console.warn(`⚠️ MONGODB_URI is not set; falling back to ${DEFAULT_MONGODB_URI}`);
  }

  const { uri, dbName, hadDbName } = resolveMongoUri();

  if (!hadDbName) {
    console.warn(`⚠️ MONGODB_URI does not name a database; using "${dbName}" instead of Mongoose's default "test"`);
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ MongoDB connection error: ${message}`);
    console.error('   Check: MONGODB_URI, MongoDB service/Atlas cluster status, network access/IP allowlist, credentials, and DNS/SRV support.');
    process.exit(1);
  }
};

export default mongoose;
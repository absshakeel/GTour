/**
 * MongoDB connection-string helpers.
 *
 * The Atlas cluster used by this project is addressed by a URI that carries no
 * database name, which makes Mongoose silently fall back to a database called
 * `test`. That is never what we want, so every entry point resolves the URI
 * through {@link resolveMongoUri} to pin the platform database explicitly.
 */

export const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/gtour';
export const DEFAULT_DB_NAME = 'gtour';

/** Split a connection string into the part before the query and the query itself. */
function splitQuery(uri: string): { base: string; query: string } {
  const index = uri.indexOf('?');
  if (index === -1) return { base: uri, query: '' };
  return { base: uri.slice(0, index), query: uri.slice(index) };
}

/**
 * Extract the database name from a MongoDB connection string, if it has one.
 *
 * Handles both `mongodb://` and `mongodb+srv://` schemes, credentials that
 * contain reserved characters, and multi-host replica-set lists. Returns
 * `undefined` when the URI ends at the host (or at a bare `/`), which is the
 * case that used to make Mongoose default to `test`.
 */
export function databaseNameFromUri(uri: string): string | undefined {
  const { base } = splitQuery(uri.trim());
  const schemeIndex = base.indexOf('://');
  if (schemeIndex === -1) return undefined;

  const afterScheme = base.slice(schemeIndex + 3);
  const credentialsIndex = afterScheme.lastIndexOf('@');
  const hostAndPath = credentialsIndex === -1 ? afterScheme : afterScheme.slice(credentialsIndex + 1);

  const slashIndex = hostAndPath.indexOf('/');
  if (slashIndex === -1) return undefined;

  const dbName = hostAndPath.slice(slashIndex + 1).replace(/\/+$/, '');
  return dbName.length > 0 ? decodeURIComponent(dbName) : undefined;
}

export interface ResolvedMongoUri {
  /** A connection string that always includes an explicit database name. */
  uri: string;
  /** The database the process will connect to. */
  dbName: string;
  /** True when the supplied URI already named a database. */
  hadDbName: boolean;
}

/**
 * Resolve a connection string to one that names its database explicitly.
 *
 * @param rawUri Connection string to normalise. Defaults to `MONGODB_URI`, then
 *   to the local development URI.
 * @param fallbackDbName Database to use when the URI omits one.
 */
export function resolveMongoUri(rawUri?: string, fallbackDbName: string = DEFAULT_DB_NAME): ResolvedMongoUri {
  const uri = (rawUri ?? process.env.MONGODB_URI ?? DEFAULT_MONGODB_URI).trim();
  const dbName = databaseNameFromUri(uri);

  if (dbName) return { uri, dbName, hadDbName: true };

  const { base, query } = splitQuery(uri);
  return { uri: `${base.replace(/\/+$/, '')}/${fallbackDbName}${query}`, dbName: fallbackDbName, hadDbName: false };
}

export default resolveMongoUri;

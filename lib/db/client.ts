// Prisma client singleton.
// Only active when DATABASE_URL is set.
// After adding DATABASE_URL to .env.local:
//   npm install && npx prisma generate && npx prisma migrate deploy

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any | null = null;

export function getDb(): unknown | null {
  if (!process.env.DATABASE_URL) return null;
  if (_client) return _client;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require("@prisma/client");
    _client = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
    return _client;
  } catch {
    console.error(
      "[db] @prisma/client not ready. Run: npm install && npx prisma generate && npx prisma migrate deploy"
    );
    return null;
  }
}

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export async function disconnectDb(): Promise<void> {
  if (_client) {
    await (_client as { $disconnect: () => Promise<void> }).$disconnect();
    _client = null;
  }
}

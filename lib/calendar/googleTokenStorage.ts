import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

// Local single-user storage for Google OAuth tokens.
// If GOOGLE_TOKEN_ENCRYPTION_KEY is set, tokens are encrypted with AES-256-GCM.
// data/google_tokens.json is excluded from git via .gitignore.

const DATA_DIR = path.join(process.cwd(), "data");
const TOKEN_FILE = path.join(DATA_DIR, "google_tokens.json");

export interface GoogleTokenData {
  provider: "google";
  connected: boolean;
  calendarId: string;
  scope: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  createdAt: string;
  updatedAt: string;
}

interface EncryptedCredentials {
  iv: string;
  authTag: string;
  data: string;
}

// On-disk format — may have plain tokens or an encrypted blob
interface StoredTokenFile extends Omit<GoogleTokenData, "accessToken" | "refreshToken"> {
  accessToken?: string;
  refreshToken?: string;
  encryptedCredentials?: EncryptedCredentials;
}

// ─── Encryption helpers ────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer | null {
  const keyStr = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!keyStr) return null;

  // Accept 64-char hex (32 bytes) or 44-char base64 (32 bytes)
  if (keyStr.length === 64 && /^[0-9a-fA-F]+$/.test(keyStr)) {
    return Buffer.from(keyStr, "hex");
  }
  const buf = Buffer.from(keyStr, "base64");
  if (buf.length === 32) return buf;

  throw new Error(
    "GOOGLE_TOKEN_ENCRYPTION_KEY moet 32 bytes zijn (64 hex tekens of 44 base64 tekens)"
  );
}

function encrypt(plaintext: string, key: Buffer): EncryptedCredentials {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return {
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    data: encrypted.toString("hex"),
  };
}

function decrypt(enc: EncryptedCredentials, key: Buffer): string {
  const iv = Buffer.from(enc.iv, "hex");
  const authTag = Buffer.from(enc.authTag, "hex");
  const data = Buffer.from(enc.data, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function isEncryptionEnabled(): boolean {
  return !!process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
}

export async function readGoogleTokens(): Promise<GoogleTokenData | null> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf-8");
    const stored = JSON.parse(raw) as StoredTokenFile;
    const key = getEncryptionKey();

    let accessToken: string;
    let refreshToken: string;

    if (stored.encryptedCredentials) {
      if (!key) {
        // Tokens are encrypted but no key → cannot decrypt
        throw new Error(
          "Tokens zijn versleuteld maar GOOGLE_TOKEN_ENCRYPTION_KEY ontbreekt. " +
          "Voeg de key toe aan .env.local of verwijder data/google_tokens.json en koppel opnieuw."
        );
      }
      const creds = JSON.parse(decrypt(stored.encryptedCredentials, key)) as {
        accessToken: string;
        refreshToken: string;
      };
      accessToken = creds.accessToken;
      refreshToken = creds.refreshToken;
    } else if (stored.accessToken && stored.refreshToken) {
      accessToken = stored.accessToken;
      refreshToken = stored.refreshToken;
    } else {
      return null;
    }

    return {
      provider: stored.provider,
      connected: stored.connected,
      calendarId: stored.calendarId,
      scope: stored.scope,
      accessToken,
      refreshToken,
      expiryDate: stored.expiryDate,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
  } catch (err) {
    // Re-throw encryption errors; swallow missing-file errors
    if (err instanceof Error && err.message.includes("versleuteld")) throw err;
    return null;
  }
}

export async function writeGoogleTokens(data: GoogleTokenData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const key = getEncryptionKey();

  const base: Omit<StoredTokenFile, "accessToken" | "refreshToken" | "encryptedCredentials"> = {
    provider: data.provider,
    connected: data.connected,
    calendarId: data.calendarId,
    scope: data.scope,
    expiryDate: data.expiryDate,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };

  const stored: StoredTokenFile = key
    ? {
        ...base,
        encryptedCredentials: encrypt(
          JSON.stringify({ accessToken: data.accessToken, refreshToken: data.refreshToken }),
          key
        ),
      }
    : { ...base, accessToken: data.accessToken, refreshToken: data.refreshToken };

  await fs.writeFile(TOKEN_FILE, JSON.stringify(stored, null, 2), "utf-8");
}

export async function isGoogleConnected(): Promise<boolean> {
  try {
    const tokens = await readGoogleTokens();
    return !!(tokens?.connected && tokens.refreshToken);
  } catch {
    return false;
  }
}

// Herkent een verlopen/ingetrokken refresh-token (Google geeft dan "invalid_grant").
export function isInvalidGrant(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return /invalid_grant/i.test(msg) || data === "invalid_grant";
}

// Zet de koppeling op "niet verbonden" zodat het systeem stopt met stilletjes falen
// en de UI/health duidelijk om herkoppeling vraagt. Tokens blijven staan (recoverbaar).
export async function markGoogleReauthNeeded(): Promise<void> {
  try {
    const t = await readGoogleTokens();
    if (!t || !t.connected) return;
    await writeGoogleTokens({ ...t, connected: false, updatedAt: new Date().toISOString() });
  } catch {
    /* niets — best effort */
  }
}

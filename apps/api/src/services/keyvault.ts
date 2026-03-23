import { SecretClient } from '@azure/keyvault-secrets';
import { KeyClient, CryptographyClient } from '@azure/keyvault-keys';
import { DefaultAzureCredential } from '@azure/identity';

/**
 * Key Vault service for secret storage, retrieval, and envelope encryption.
 *
 * Uses DefaultAzureCredential for authentication, which supports:
 * - Managed identity in Azure (production)
 * - Azure CLI / VS Code credentials (local dev)
 * - Environment variables (CI/CD)
 *
 * AUTH-04: Key Vault envelope encryption for sensitive columns
 * (tenant tokens, credentials) + Azure SQL TDE for data at rest.
 * This substitutes Always Encrypted (unsupported by Node.js tedious driver).
 */

let secretClient: SecretClient | null = null;
let cryptoClient: CryptographyClient | null = null;

function getSecretClient(): SecretClient {
  if (!secretClient) {
    const vaultUrl = process.env.KEY_VAULT_URL;
    if (!vaultUrl) {
      throw new KeyVaultError('KEY_VAULT_URL environment variable is required');
    }
    const credential = new DefaultAzureCredential();
    secretClient = new SecretClient(vaultUrl, credential);
  }
  return secretClient;
}

async function getCryptoClient(): Promise<CryptographyClient> {
  if (!cryptoClient) {
    const vaultUrl = process.env.KEY_VAULT_URL;
    const keyName = process.env.KEY_VAULT_KEY_NAME || 'omzig-encryption-key';
    if (!vaultUrl) {
      throw new KeyVaultError('KEY_VAULT_URL environment variable is required');
    }
    const credential = new DefaultAzureCredential();
    const keyClient = new KeyClient(vaultUrl, credential);
    const key = await keyClient.getKey(keyName);
    cryptoClient = new CryptographyClient(key, credential);
  }
  return cryptoClient;
}

/**
 * Custom error class for Key Vault operations.
 * Contains the KEYVAULT_ERROR code for structured API error responses.
 */
class KeyVaultError extends Error {
  public readonly code = 'KEYVAULT_ERROR';

  constructor(message: string) {
    super(`KEYVAULT_ERROR: ${message}`);
    this.name = 'KeyVaultError';
  }
}

/**
 * Retrieve a secret value from Key Vault.
 * @param name - The secret name
 * @returns The secret value
 * @throws KeyVaultError if the operation fails
 */
export async function getSecret(name: string): Promise<string> {
  try {
    const client = getSecretClient();
    const secret = await client.getSecret(name);
    if (!secret.value) {
      throw new Error(`Secret "${name}" has no value`);
    }
    return secret.value;
  } catch (err) {
    if (err instanceof KeyVaultError) throw err;
    throw new KeyVaultError(
      `Failed to retrieve secret "${name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Store a secret value in Key Vault.
 * @param name - The secret name
 * @param value - The secret value to store
 * @throws KeyVaultError if the operation fails
 */
export async function setSecret(name: string, value: string): Promise<void> {
  try {
    const client = getSecretClient();
    await client.setSecret(name, value);
  } catch (err) {
    if (err instanceof KeyVaultError) throw err;
    throw new KeyVaultError(
      `Failed to store secret "${name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Retrieve a tenant's authentication token from Key Vault.
 * Uses naming convention: tenant-token-{tenantId}
 * @param tenantId - The tenant ID
 * @returns The tenant token value
 */
export async function getTenantToken(tenantId: string): Promise<string> {
  return getSecret(`tenant-token-${tenantId}`);
}

/**
 * Store a tenant's authentication token in Key Vault.
 * Uses naming convention: tenant-token-{tenantId}
 * @param tenantId - The tenant ID
 * @param token - The token value to store
 */
export async function storeTenantToken(tenantId: string, token: string): Promise<void> {
  await setSecret(`tenant-token-${tenantId}`, token);
}

/**
 * Encrypt a sensitive value using Key Vault envelope encryption.
 * Uses RSA-OAEP with the configured encryption key.
 * @param value - The plaintext value to encrypt
 * @returns Base64-encoded ciphertext
 */
export async function encryptValue(value: string): Promise<string> {
  try {
    const client = await getCryptoClient();
    const plainBuffer = Buffer.from(value, 'utf-8');
    const result = await client.encrypt('RSA-OAEP', plainBuffer);
    return Buffer.from(result.result).toString('base64');
  } catch (err) {
    if (err instanceof KeyVaultError) throw err;
    throw new KeyVaultError(
      `Failed to encrypt value: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Decrypt a value that was encrypted with encryptValue().
 * @param encrypted - Base64-encoded ciphertext
 * @returns The decrypted plaintext value
 */
export async function decryptValue(encrypted: string): Promise<string> {
  try {
    const client = await getCryptoClient();
    const cipherBuffer = Buffer.from(encrypted, 'base64');
    const result = await client.decrypt('RSA-OAEP', cipherBuffer);
    return Buffer.from(result.result).toString('utf-8');
  } catch (err) {
    if (err instanceof KeyVaultError) throw err;
    throw new KeyVaultError(
      `Failed to decrypt value: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

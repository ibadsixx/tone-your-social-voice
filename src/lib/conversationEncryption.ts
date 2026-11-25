import {
  getCachedConversationKey,
  setCachedConversationKey,
  clearConversationKeyCache,
  ensureConversationKey,
  fetchOtherParticipantEcdhKey
} from './crypto';

export async function initConversationEncryption(
  conversationId: string,
  currentUserId: string,
  myEcdhPrivateKey: CryptoKey
): Promise<boolean> {
  const existing = getCachedConversationKey(conversationId);
  if (existing) return true;

  const theirPubSpki = await fetchOtherParticipantEcdhKey(conversationId, currentUserId);
  if (!theirPubSpki) return false;

  try {
    await ensureConversationKey(conversationId, myEcdhPrivateKey, theirPubSpki);
    return true;
  } catch {
    return false;
  }
}

export async function encryptContent(
  conversationId: string,
  plaintext: string
): Promise<{ encryptedContent: string; iv: string } | null> {
  const key = getCachedConversationKey(conversationId);
  if (!key) return null;

  try {
    const { encryptAesGcm } = await import('./crypto');
    const { ciphertext, iv } = await encryptAesGcm(key, plaintext);
    return { encryptedContent: ciphertext, iv };
  } catch {
    return null;
  }
}

export async function decryptContent(
  conversationId: string,
  encryptedContent: string,
  iv: string
): Promise<string | null> {
  const key = getCachedConversationKey(conversationId);
  if (!key) return null;

  try {
    const { decryptAesGcm } = await import('./crypto');
    return decryptAesGcm(key, encryptedContent, iv);
  } catch {
    return null;
  }
}

export function isEncryptionReady(conversationId: string): boolean {
  return getCachedConversationKey(conversationId) !== undefined;
}

export function resetEncryption(): void {
  clearConversationKeyCache();
}

export { deleteCachedConversationKey } from './crypto';

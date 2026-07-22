import { gateway } from '@/lib/gateway';

function b64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function b64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  const pairs: string[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const part = bytes.slice(i, i + 2);
    const hex = Array.from(part)
      .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    pairs.push(hex);
  }
  return pairs.join('  ');
}

export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

export async function exportEcdhPublicKeySpki(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', key);
  return b64Encode(new Uint8Array(spki));
}

export async function exportEcdhPrivateKeyPkcs8(key: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', key);
  return b64Encode(new Uint8Array(pkcs8));
}

export async function importEcdhPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    b64Decode(spkiB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

export async function importEcdhPrivateKey(pkcs8B64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    b64Decode(pkcs8B64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
}

export async function computeEcdhFingerprint(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  const hash = await crypto.subtle.digest('SHA-256', spki);
  return bytesToHex(new Uint8Array(hash));
}

export async function deriveConversationKey(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey,
  conversationId: string
): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    256
  );

  const encoder = new TextEncoder();
  const combined = new Uint8Array(32 + encoder.encode(conversationId).length);
  combined.set(new Uint8Array(sharedBits), 0);
  combined.set(encoder.encode(conversationId), 32);

  const keyMaterial = await crypto.subtle.digest('SHA-256', combined);

  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptAesGcm(
  key: CryptoKey,
  plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    ciphertext: b64Encode(new Uint8Array(encrypted)),
    iv: b64Encode(iv)
  };
}

export async function decryptAesGcm(
  key: CryptoKey,
  ciphertext: string,
  iv: string
): Promise<string> {
  const decoded = b64Decode(ciphertext);
  const ivBytes = b64Decode(iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    decoded
  );
  return new TextDecoder().decode(decrypted);
}

export type EcdhKeySet = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeySpki: string;
  fingerprint: string;
};

export async function generateEcdhKeySet(): Promise<EcdhKeySet> {
  const keyPair = await generateECDHKeyPair();
  const publicKeySpki = await exportEcdhPublicKeySpki(keyPair.publicKey);
  const fingerprint = await computeEcdhFingerprint(keyPair.publicKey);
  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeySpki,
    fingerprint
  };
}

export async function deriveConversationKeyForUser(
  myEcdhPrivateKey: CryptoKey,
  theirEcdhPublicKeySpki: string,
  conversationId: string
): Promise<CryptoKey> {
  const theirPub = await importEcdhPublicKey(theirEcdhPublicKeySpki);
  return deriveConversationKey(myEcdhPrivateKey, theirPub, conversationId);
}

const conversationKeyCache = new Map<string, CryptoKey>();

export function getCachedConversationKey(conversationId: string): CryptoKey | undefined {
  return conversationKeyCache.get(conversationId);
}

export function setCachedConversationKey(conversationId: string, key: CryptoKey): void {
  conversationKeyCache.set(conversationId, key);
}

export function clearConversationKeyCache(): void {
  conversationKeyCache.clear();
}

export function deleteCachedConversationKey(conversationId: string): void {
  conversationKeyCache.delete(conversationId);
}

export async function ensureConversationKey(
  conversationId: string,
  myEcdhPrivateKey: CryptoKey,
  theirEcdhPublicKeySpki: string
): Promise<CryptoKey> {
  const cached = conversationKeyCache.get(conversationId);
  if (cached) return cached;
  const key = await deriveConversationKeyForUser(
    myEcdhPrivateKey,
    theirEcdhPublicKeySpki,
    conversationId
  );
  conversationKeyCache.set(conversationId, key);
  return key;
}

export async function fetchOtherParticipantEcdhKey(
  conversationId: string,
  currentUserId: string
): Promise<string | null> {
  const { data, error } = await gateway.rpc('get_encryption_details', {
    p_conversation_id: conversationId
  });
  if (error || !data) return null;

  const details = data as {
    participants: Array<{
      user_id: string;
      devices: Array<{ ecdh_public_key?: string | null }>;
    }>;
  };

  const other = details.participants?.find(p => p.user_id !== currentUserId);
  if (!other) return null;

  const device = other.devices?.find(d => d.ecdh_public_key);
  return device?.ecdh_public_key ?? null;
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { gateway } from '@/lib/gateway';
import { importEcdhPrivateKey } from '@/lib/crypto';

export type DeviceKey = {
  id: string;
  public_key: string;
  key_fingerprint: string;
  device_info: string;
  created_at: string;
  last_seen_at: string;
};

type StoredKeyData = {
  privateKey: string;
  publicKey: string;
  fingerprint: string;
  ecdhPrivateKey?: string;
  ecdhPublicKey?: string;
  ecdhFingerprint?: string;
};

export const KEY_STORAGE_KEY = 'tysv-encryption-key';

function hexPairs(hex: string): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    pairs.push(hex.substring(i, i + 2).toUpperCase());
  }
  return pairs;
}

function formatFingerprint(hex: string): string {
  const pairs = hexPairs(hex);
  const lines: string[] = [];
  for (let i = 0; i < pairs.length; i += 16) {
    lines.push(pairs.slice(i, i + 16).join(' '));
  }
  return lines.join('\n');
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
}

async function exportPublicKeySpki(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', key);
  return bytesToB64(new Uint8Array(spki));
}

async function computeFingerprint(spkiBase64: string): Promise<string> {
  const bytes = b64ToBytes(spkiBase64);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return formatFingerprint(Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(''));
}

function getDeviceInfo(): string {
  if (typeof navigator === 'undefined') return 'Unknown browser';
  const ua = navigator.userAgent;
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  return 'Other';
}

function loadStoredKey(): StoredKeyData | null {
  try {
    const raw = localStorage.getItem(KEY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredKeyData;
  } catch {
    return null;
  }
}

function storeKey(data: StoredKeyData): void {
  try {
    localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to store encryption key:', e);
  }
}

export function useEncryptionKeys() {
  const [keys, setKeys] = useState<DeviceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFingerprint, setCurrentFingerprint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ensuredRef = useRef(false);

  const syncKeyToServer = useCallback(async (
    publicKeySpki: string,
    fingerprint: string,
    deviceInfo: string,
    ecdhPublicKey?: string,
    ecdhFingerprint?: string
  ) => {
    const { error: rpcError } = await gateway.rpc('upsert_encryption_key', {
      p_public_key: publicKeySpki,
      p_key_fingerprint: fingerprint,
      p_device_info: deviceInfo,
      p_ecdh_public_key: ecdhPublicKey || null,
      p_ecdh_key_fingerprint: ecdhFingerprint || null
    });
    if (rpcError) {
      console.error('Failed to sync encryption key:', rpcError);
    }
  }, []);

  const ensureKeys = useCallback(async () => {
    if (ensuredRef.current) return;
    ensuredRef.current = true;

    try {
      const stored = loadStoredKey();
      if (stored) {
        setCurrentFingerprint(stored.fingerprint);
        await syncKeyToServer(
          stored.publicKey,
          stored.fingerprint,
          getDeviceInfo(),
          stored.ecdhPublicKey,
          stored.ecdhFingerprint
        );
        return;
      }

      const keyPair = await generateKeyPair();
      const publicKeySpki = await exportPublicKeySpki(keyPair.publicKey);
      const fingerprint = await computeFingerprint(publicKeySpki);

      const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      const privateKeyB64 = bytesToB64(new Uint8Array(privateKeyRaw));

      const { generateECDHKeyPair, exportEcdhPublicKeySpki, exportEcdhPrivateKeyPkcs8, computeEcdhFingerprint } = await import('@/lib/crypto');
      const ecdhKeyPair = await generateECDHKeyPair();
      const ecdhPublicKeySpki = await exportEcdhPublicKeySpki(ecdhKeyPair.publicKey);
      const ecdhFingerprint = await computeEcdhFingerprint(ecdhKeyPair.publicKey);
      const ecdhPrivateKeyRaw = await exportEcdhPrivateKeyPkcs8(ecdhKeyPair.privateKey);

      const storedData: StoredKeyData = {
        privateKey: privateKeyB64,
        publicKey: publicKeySpki,
        fingerprint,
        ecdhPrivateKey: ecdhPrivateKeyRaw,
        ecdhPublicKey: ecdhPublicKeySpki,
        ecdhFingerprint
      };

      storeKey(storedData);
      setCurrentFingerprint(fingerprint);
      await syncKeyToServer(publicKeySpki, fingerprint, getDeviceInfo(), ecdhPublicKeySpki, ecdhFingerprint);
    } catch (err) {
      console.error('Error ensuring encryption keys:', err);
      setError('Failed to generate encryption keys');
    }
  }, [syncKeyToServer]);

  const fetchKeys = useCallback(async () => {
    try {
      const { data, error: rpcError } = await gateway.rpc('get_my_encryption_keys');
      if (rpcError) throw rpcError;
      setKeys((data as DeviceKey[]) || []);
    } catch (err) {
      console.error('Error fetching encryption keys:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    ensureKeys();
    fetchKeys();
  }, [ensureKeys, fetchKeys]);

  return { keys, loading, currentFingerprint, error, refreshKeys: fetchKeys };
}

export function loadEcdhPrivateKeyB64(): string | null {
  const stored = loadStoredKey();
  return stored?.ecdhPrivateKey ?? null;
}

export async function loadEcdhPrivateKey(): Promise<CryptoKey | null> {
  const b64 = loadEcdhPrivateKeyB64();
  if (!b64) return null;
  return importEcdhPrivateKey(b64);
}

export async function loadEcdhPublicKeySpki(): Promise<string | null> {
  const stored = loadStoredKey();
  return stored?.ecdhPublicKey ?? null;
}

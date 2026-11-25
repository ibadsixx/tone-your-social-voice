// ICE configuration for browser WebRTC (GET /realtime/ice-servers only).
//
// This is deliberately NOT a publish/subscribe or generic realtime gateway.
// It verifies the central Auth caller and returns a small, short-lived ICE
// server list. When TURN is configured, credentials are ephemeral HMAC values
// (RFC 7635 style) derived from a Function secret, so no static relay password
// ever reaches the browser. When TURN is not configured, only public STUN
// servers are returned; the client keeps its existing safe fallback.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// TURN_SERVER_URL (e.g. turn:relay.example.com:3478) and
// TURN_SHARED_SECRET (optional pair; both required to issue TURN credentials),
// TURNS_SERVER_URL (optional TLS relay URL).
//
// No database/service-role client is used here. There is no cache table, no
// temporary record and no CRUD surface.

import { jsonResponse } from '../_shared/crossProject.ts';
import { functionSubPath, handleRequest, notFound } from '../_shared/operation.ts';

const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const TURN_TTL_SECONDS = 600;

async function hmacBase64(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  let binary = '';
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

Deno.serve((req) => handleRequest(req, ['GET'], async () => {
  if (functionSubPath(req, 'realtime') !== '/ice-servers') {
    notFound('Realtime endpoint not found');
  }

  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [...STUN];
  const turnUrl = Deno.env.get('TURN_SERVER_URL');
  const turnSecret = Deno.env.get('TURN_SHARED_SECRET');
  if (turnUrl && turnSecret) {
    // The username carries its own expiry. A leaked credential stops working
    // after this window; a new request derives a new one.
    const username = String(Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS);
    const credential = await hmacBase64(turnSecret, username);
    iceServers.push({ urls: turnUrl, username, credential });
    const turnsUrl = Deno.env.get('TURNS_SERVER_URL');
    if (turnsUrl) iceServers.push({ urls: turnsUrl, username, credential });
  }

  // Flat envelope: webrtc.ts reads json.iceServers directly.
  return jsonResponse({ iceServers });
}));

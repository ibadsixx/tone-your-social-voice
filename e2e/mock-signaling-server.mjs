// Test-only Edge Function double for real-browser Tone Live P2P verification.
// It implements the same two endpoints the frontend uses:
//   POST /api/live/sessions/:id/signaling-ticket
//   WS   /api/live/signaling?ticket=...&after=...
// It is deliberately in-memory; this is NOT part of the deployed Functions.

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.MOCK_SIGNALING_PORT || 8787);
const tickets = new Map();
const rooms = new Map(); // sessionId -> { sockets: Set, seq: number, messages: [] }

function room(sessionId) {
  if (!rooms.has(sessionId)) rooms.set(sessionId, { sockets: new Set(), seq: 0, messages: [] });
  return rooms.get(sessionId);
}

function send(ws, value) {
  if (ws.readyState === 1) ws.send(JSON.stringify(value));
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const match = url.pathname.match(/^\/functions\/v1\/live\/sessions\/([^/]+)\/signaling-ticket$/);
  if (req.method === 'POST' && match) {
    const auth = req.headers.authorization || '';
    const userId = auth.replace(/^Bearer\s+/i, '').trim();
    if (!userId) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing authorization header' }));
      return;
    }
    const ticket = randomUUID();
    tickets.set(ticket, { sessionId: decodeURIComponent(match[1]), userId, uses: 0 });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ticket,
      sessionId: decodeURIComponent(match[1]),
      userId,
      role: 'host',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
    return;
  }
  if (url.pathname === '/functions/v1/live/signaling') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ name: 'Tone Live mock signaling', ok: true }));
    return;
  }
  const endMatch = url.pathname.match(/^\/functions\/v1\/live\/sessions\/([^/]+)\/end$/);
  if (req.method === 'POST' && endMatch) {
    const sessionKey = decodeURIComponent(endMatch[1]);
    const state = rooms.get(sessionKey);
    if (state) {
      const ended = {
        id: randomUUID(),
        sessionId: sessionKey,
        fromUserId: 'live-function',
        type: 'session-ended',
        role: 'host',
        sequence: ++state.seq,
        timestamp: new Date().toISOString(),
      };
      state.messages.push(ended);
      for (const peer of state.sockets) send(peer, ended);
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ended' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: 128 * 1024 });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const raw = url.searchParams.get('ticket') || '';
  const ticket = tickets.get(raw);
  if (!ticket || ticket.uses > 0) {
    ws.close(4002, 'invalid_or_used_ticket');
    return;
  }
  ticket.uses++;
  tickets.delete(raw);

  const { sessionId, userId } = ticket;
  const state = room(sessionId);
  ws.userId = userId;
  state.sockets.add(ws);
  send(ws, {
    id: randomUUID(),
    sessionId,
    fromUserId: 'live-function',
    type: 'connected',
    role: 'host',
    sequence: state.seq,
    timestamp: new Date().toISOString(),
  });

  const join = {
    id: randomUUID(),
    sessionId,
    fromUserId: userId,
    type: 'join',
    role: 'host',
    sequence: ++state.seq,
    timestamp: new Date().toISOString(),
  };
  state.messages.push(join);
  for (const peer of state.sockets) send(peer, join);

  ws.on('message', (rawFrame) => {
    let frame;
    try { frame = JSON.parse(rawFrame.toString()); } catch { return; }
    if (!frame || typeof frame.type !== 'string') return;
    const message = {
      ...frame,
      id: typeof frame.id === 'string' ? frame.id : randomUUID(),
      sessionId,
      fromUserId: userId,
      sequence: ++state.seq,
      timestamp: new Date().toISOString(),
    };
    state.messages.push(message);
    for (const peer of state.sockets) {
      if (message.toUserId && peer.userId !== message.toUserId) continue;
      send(peer, message);
    }
  });

  ws.on('close', () => {
    state.sockets.delete(ws);
    const leave = {
      id: randomUUID(),
      sessionId,
      fromUserId: userId,
      type: 'leave',
      role: 'host',
      state: { targetUserId: userId },
      sequence: ++state.seq,
      timestamp: new Date().toISOString(),
    };
    for (const peer of state.sockets) send(peer, leave);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Tone Live mock signaling listening on http://127.0.0.1:${PORT}`);
});

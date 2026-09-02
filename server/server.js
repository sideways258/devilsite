/* =====================================================================
   Devils in the Details — server
   - Serves the static site in ../public
   - Runs a lightweight multiplayer relay over WebSockets
   Enemies are simulated identically on every client (time-based motion),
   so the server only needs to sync: player transforms, enemy-kill events,
   story progression, boss HP and the win state.
   ===================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TICK_MS = 66; // ~15 Hz broadcast of player transforms

// ---------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/play' || urlPath === '/play/') urlPath = '/game.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  serveStatic(req, res);
});

// ---------------------------------------------------------------- multiplayer
const wss = new WebSocketServer({ server });

/** rooms: Map<roomId, Room> */
const rooms = new Map();

function getRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    room = {
      id,
      players: new Map(),   // clientId -> { id, name, x, y, vx, vy, face, anim, hearts, socks }
      killed: new Set(),    // enemy ids caught
      nextBeat: 0,          // index of the next story beat allowed to fire
      stage: 0,             // 0 living room, 1 kitchen, 2 basement, 3 rescued
      bossHp: 3,
      bossSpawned: false,
      won: false
    };
    rooms.set(id, room);
  }
  return room;
}

let nextClientId = 1;

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(room, obj, exceptId) {
  const msg = JSON.stringify(obj);
  for (const [, p] of room.players) {
    if (p.id === exceptId) continue;
    if (p.ws && p.ws.readyState === p.ws.OPEN) p.ws.send(msg);
  }
}

function playerList(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, x: p.x, y: p.y, face: p.face, anim: p.anim, hearts: p.hearts
  }));
}

wss.on('connection', (ws) => {
  const clientId = nextClientId++;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let room = null;
  let self = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'join') {
      const roomId = String(m.room || 'house').slice(0, 24).replace(/[^a-z0-9-]/gi, '') || 'house';
      room = getRoom(roomId);
      self = {
        id: clientId,
        ws,
        name: String(m.name || 'Detail').slice(0, 16) || 'Detail',
        x: 0, y: 0, vx: 0, vy: 0, face: 1, anim: 'idle',
        hearts: 3, socks: 0
      };
      room.players.set(clientId, self);

      send(ws, {
        t: 'welcome',
        id: clientId,
        room: roomId,
        stage: room.stage,
        nextBeat: room.nextBeat,
        killed: [...room.killed],
        bossSpawned: room.bossSpawned,
        bossHp: room.bossHp,
        won: room.won,
        players: playerList(room).filter((p) => p.id !== clientId)
      });
      broadcast(room, { t: 'peerJoin', id: clientId, name: self.name }, clientId);
      return;
    }

    if (!room || !self) return;

    switch (m.t) {
      case 'state':
        self.x = +m.x || 0; self.y = +m.y || 0;
        self.vx = +m.vx || 0; self.vy = +m.vy || 0;
        self.face = m.face === -1 ? -1 : 1;
        self.anim = String(m.anim || 'idle').slice(0, 12);
        if (typeof m.hearts === 'number') self.hearts = m.hearts;
        if (typeof m.socks === 'number') self.socks = m.socks;
        break;

      case 'stomp': {
        const id = String(m.id || '');
        if (id && !room.killed.has(id)) {
          room.killed.add(id);
          broadcast(room, { t: 'stomp', id, by: self.id });
        }
        break;
      }

      case 'trigger': {
        // story beats fire strictly in order, once
        const idx = m.id | 0;
        if (idx === room.nextBeat) {
          room.nextBeat = idx + 1;
          broadcast(room, { t: 'dialog', id: idx });
          if (typeof m.stage === 'number' && m.stage > room.stage) {
            room.stage = m.stage;
            broadcast(room, { t: 'stage', stage: room.stage });
          }
          if (m.spawnBoss && !room.bossSpawned) {
            room.bossSpawned = true;
            broadcast(room, { t: 'bossSpawn' });
          }
        }
        break;
      }

      case 'bossHit': {
        if (room.bossSpawned && !room.won && room.bossHp > 0) {
          room.bossHp -= 1;
          broadcast(room, { t: 'bossHp', hp: room.bossHp });
          if (room.bossHp <= 0) {
            room.won = true;
            room.stage = 3;
            broadcast(room, { t: 'win' });
          }
        }
        break;
      }

      case 'sock': {
        self.socks = (self.socks || 0) + 1;
        break;
      }

      case 'reset': {
        // any player can restart the room once won or if everyone agrees
        room.killed.clear();
        room.nextBeat = 0;
        room.stage = 0;
        room.bossHp = 3;
        room.bossSpawned = false;
        room.won = false;
        broadcast(room, { t: 'roomReset' });
        break;
      }

      case 'chat': {
        const text = String(m.text || '').slice(0, 160);
        if (text) broadcast(room, { t: 'chat', id: self.id, name: self.name, text });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (room && self) {
      room.players.delete(self.id);
      broadcast(room, { t: 'peerLeave', id: self.id });
      if (room.players.size === 0) {
        // keep finished rooms briefly so a quick reconnect resumes, then drop
        setTimeout(() => { if (room.players.size === 0) rooms.delete(room.id); }, 60000);
      }
    }
  });
});

// heartbeat: drop dead sockets
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch { /* ignore */ }
  });
}, 30000);

// broadcast player transforms
setInterval(() => {
  for (const [, room] of rooms) {
    if (room.players.size === 0) continue;
    broadcast(room, { t: 'players', list: playerList(room) });
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`Devils in the Details running on http://localhost:${PORT}`);
});

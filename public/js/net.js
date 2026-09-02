// Multiplayer client. Falls back to a self-contained solo mode when there is
// no server (e.g. the page opened from a file, or the relay is unreachable).
// The game code above this layer does not care which mode it is in — it calls
// the same methods and listens for the same events.

const listeners = new Map();
function emit(type, data) {
  const set = listeners.get(type);
  if (set) for (const cb of set) cb(data || {});
}

let ws = null;
let solo = true;
let selfId = 0;
let sendTimer = 0;

// solo-mode story/boss bookkeeping (server owns this in multiplayer)
const soloState = { nextBeat: 0, killed: new Set(), bossHp: 3, bossSpawned: false, won: false };

export const Net = {
  online: false,
  selfId: 0,
  room: 'house',

  on(type, cb) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(cb);
  },

  connect(name, room) {
    this.room = room || 'house';
    return new Promise((resolve) => {
      let settled = false;
      const finish = (isOnline) => {
        if (settled) return;
        settled = true;
        solo = !isOnline;
        this.online = isOnline;
        resolve(isOnline);
      };

      // no ws support / non-http origin → solo
      if (typeof WebSocket === 'undefined' || !/^https?:/.test(location.protocol)) {
        return finish(false);
      }

      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      try {
        ws = new WebSocket(`${proto}://${location.host}`);
      } catch {
        return finish(false);
      }

      const timeout = setTimeout(() => { try { ws.close(); } catch {} finish(false); }, 3500);

      ws.onopen = () => {
        ws.send(JSON.stringify({ t: 'join', name, room: this.room }));
      };
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') {
          clearTimeout(timeout);
          selfId = m.id;
          this.selfId = m.id;
          this.room = m.room;
          emit('welcome', m);
          finish(true);
          return;
        }
        emit(m.t, m);
      };
      ws.onerror = () => { clearTimeout(timeout); finish(false); };
      ws.onclose = () => {
        if (this.online) { this.online = false; solo = true; emit('offline', {}); }
      };
    });
  },

  // throttled transform update
  sendState(s, dt) {
    if (solo) return;
    sendTimer -= dt;
    if (sendTimer > 0) return;
    sendTimer = 1 / 15;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        t: 'state', x: +s.x.toFixed(2), y: +s.y.toFixed(2),
        vx: +s.vx.toFixed(2), vy: +s.vy.toFixed(2),
        face: s.face, anim: s.anim, hearts: s.hearts, socks: s.socks
      }));
    }
  },

  stomp(id) {
    if (solo) {
      if (!soloState.killed.has(id)) { soloState.killed.add(id); emit('stomp', { id, by: selfId }); }
      return;
    }
    ws.send(JSON.stringify({ t: 'stomp', id }));
  },

  // fire a story beat (id in order). meta: { stage, spawnBoss }
  trigger(id, meta = {}) {
    if (solo) {
      if (id !== soloState.nextBeat) return;
      soloState.nextBeat = id + 1;
      emit('dialog', { id });
      if (typeof meta.stage === 'number') emit('stage', { stage: meta.stage });
      if (meta.spawnBoss && !soloState.bossSpawned) {
        soloState.bossSpawned = true;
        emit('bossSpawn', {});
      }
      return;
    }
    ws.send(JSON.stringify({ t: 'trigger', id, stage: meta.stage, spawnBoss: !!meta.spawnBoss }));
  },

  bossHit() {
    if (solo) {
      if (soloState.won) return;
      soloState.bossHp -= 1;
      emit('bossHp', { hp: soloState.bossHp });
      if (soloState.bossHp <= 0) { soloState.won = true; emit('win', {}); }
      return;
    }
    ws.send(JSON.stringify({ t: 'bossHit' }));
  },

  sock() {
    if (solo || !ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ t: 'sock' }));
  },

  chat(text) {
    if (solo || !ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ t: 'chat', text }));
  },

  reset() {
    soloState.nextBeat = 0;
    soloState.killed.clear();
    soloState.bossHp = 3;
    soloState.bossSpawned = false;
    soloState.won = false;
    if (!solo && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'reset' }));
    else emit('roomReset', {});
  }
};

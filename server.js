const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

const TICK = 60;
const MAP_W = 3000;
const MAP_H = 3000;
const MAX_PLAYERS = 10;
const PLAYER_SPEED = 3.5;
const PLAYER_RADIUS = 18;
const BULLET_SPEED = 12;
const BULLET_RADIUS = 5;

const WEAPONS = {
  pistol:  { name: 'Pistolet',    damage: 20, fireRate: 20, bulletSpeed: 12, spread: 0.05, ammo: 30, color: '#aaa' },
  shotgun: { name: 'Shotgun',     damage: 15, fireRate: 45, bulletSpeed: 10, spread: 0.25, pellets: 5, ammo: 16, color: '#c8a96e' },
  rifle:   { name: 'Fusil',       damage: 35, fireRate: 10, bulletSpeed: 18, spread: 0.01, ammo: 20, color: '#6eb5c8' },
  smg:     { name: 'Mitraillette',damage: 12, fireRate: 6,  bulletSpeed: 13, spread: 0.12, ammo: 45, color: '#c86e6e' },
};

const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a'];

// Map generation
function generateMap() {
  const walls = [];
  const loots = [];

  // Outer boundary walls
  const thickness = 40;
  walls.push({ x: 0, y: 0, w: MAP_W, h: thickness });
  walls.push({ x: 0, y: MAP_H - thickness, w: MAP_W, h: thickness });
  walls.push({ x: 0, y: 0, w: thickness, h: MAP_H });
  walls.push({ x: MAP_W - thickness, y: 0, w: thickness, h: MAP_H });

  // Buildings / obstacles
  const buildings = [
    { x: 300, y: 300, w: 180, h: 140 },
    { x: 700, y: 200, w: 120, h: 200 },
    { x: 1200, y: 150, w: 200, h: 160 },
    { x: 1800, y: 300, w: 160, h: 120 },
    { x: 2400, y: 200, w: 180, h: 180 },
    { x: 200, y: 800, w: 140, h: 160 },
    { x: 600, y: 700, w: 200, h: 100 },
    { x: 1000, y: 600, w: 160, h: 160 },
    { x: 1400, y: 700, w: 120, h: 200 },
    { x: 1800, y: 600, w: 180, h: 140 },
    { x: 2200, y: 700, w: 160, h: 160 },
    { x: 2600, y: 600, w: 200, h: 120 },
    { x: 300, y: 1300, w: 160, h: 160 },
    { x: 700, y: 1200, w: 200, h: 140 },
    { x: 1100, y: 1100, w: 240, h: 240 },
    { x: 1600, y: 1200, w: 160, h: 160 },
    { x: 2100, y: 1100, w: 200, h: 180 },
    { x: 2500, y: 1300, w: 160, h: 160 },
    { x: 200, y: 1900, w: 180, h: 140 },
    { x: 600, y: 1800, w: 160, h: 200 },
    { x: 1000, y: 1700, w: 200, h: 160 },
    { x: 1500, y: 1800, w: 160, h: 160 },
    { x: 1900, y: 1700, w: 200, h: 140 },
    { x: 2400, y: 1800, w: 160, h: 200 },
    { x: 300, y: 2400, w: 200, h: 160 },
    { x: 800, y: 2300, w: 160, h: 200 },
    { x: 1300, y: 2200, w: 200, h: 200 },
    { x: 1800, y: 2300, w: 160, h: 160 },
    { x: 2300, y: 2400, w: 200, h: 160 },
    { x: 2700, y: 2200, w: 160, h: 200 },
    // rocks / small covers
    { x: 500, y: 500, w: 60, h: 60 },
    { x: 900, y: 400, w: 50, h: 80 },
    { x: 1500, y: 450, w: 70, h: 50 },
    { x: 2000, y: 500, w: 60, h: 60 },
    { x: 2700, y: 450, w: 80, h: 60 },
    { x: 400, y: 1050, w: 60, h: 60 },
    { x: 850, y: 950, w: 70, h: 50 },
    { x: 1700, y: 950, w: 60, h: 70 },
    { x: 2300, y: 1000, w: 80, h: 60 },
    { x: 500, y: 1600, w: 60, h: 60 },
    { x: 1200, y: 1500, w: 70, h: 50 },
    { x: 2000, y: 1600, w: 60, h: 60 },
    { x: 2700, y: 1500, w: 50, h: 80 },
    { x: 400, y: 2100, w: 60, h: 60 },
    { x: 1000, y: 2100, w: 80, h: 60 },
    { x: 1700, y: 2100, w: 60, h: 70 },
    { x: 2500, y: 2100, w: 70, h: 60 },
    { x: 600, y: 2700, w: 60, h: 60 },
    { x: 1100, y: 2700, w: 80, h: 60 },
    { x: 1600, y: 2700, w: 60, h: 60 },
    { x: 2100, y: 2700, w: 70, h: 70 },
    { x: 2700, y: 2700, w: 60, h: 60 },
  ];

  walls.push(...buildings);

  // Loot spawns
  const weaponTypes = Object.keys(WEAPONS);
  const lootPositions = [
    [450,450],[850,350],[1350,250],[1950,400],[2550,350],
    [350,900],[750,850],[1150,750],[1550,850],[2050,800],[2650,750],
    [450,1400],[850,1300],[1400,1400],[1750,1300],[2250,1250],[2650,1400],
    [350,1950],[750,1850],[1150,1750],[1650,1900],[2050,1800],[2550,1950],
    [450,2500],[900,2400],[1450,2500],[1950,2400],[2450,2500],[2750,2400],
    [1500,1500],[800,1500],[2200,1500],[1500,800],[1500,2200],
  ];

  lootPositions.forEach(([x, y], i) => {
    loots.push({
      id: 'loot_' + i,
      x, y,
      type: weaponTypes[Math.floor(Math.random() * weaponTypes.length)],
      picked: false,
    });
  });

  return { walls, loots };
}

let mapData = generateMap();
let players = {};
let bullets = [];
let bulletId = 0;
let gameState = 'lobby';
let gameLoop = null;
let zone = { x: MAP_W/2, y: MAP_H/2, radius: MAP_W * 0.7, targetRadius: MAP_W * 0.35, shrinkSpeed: 0.3, damage: 0.5 };
let zonePhase = 0;
let zoneTimer = 0;
const ZONE_PHASES = [
  { waitTicks: 60*30, shrinkTicks: 60*25, targetScale: 0.5 },
  { waitTicks: 60*20, shrinkTicks: 60*20, targetScale: 0.28 },
  { waitTicks: 60*15, shrinkTicks: 60*15, targetScale: 0.13 },
  { waitTicks: 60*10, shrinkTicks: 60*10, targetScale: 0.05 },
  { waitTicks: 60*5,  shrinkTicks: 60*8,  targetScale: 0.01 },
];
let zoneShrinking = false;

function spawnPlayer(id, name, colorIdx) {
  const angle = (colorIdx / MAX_PLAYERS) * Math.PI * 2;
  const dist = 1100;
  return {
    id, name,
    color: COLORS[colorIdx % COLORS.length],
    x: MAP_W/2 + Math.cos(angle) * dist,
    y: MAP_H/2 + Math.sin(angle) * dist,
    vx: 0, vy: 0,
    angle: 0,
    hp: 100, maxHp: 100,
    shield: 0, maxShield: 50,
    alive: true,
    weapon: 'pistol',
    ammo: { pistol: 30, shotgun: 16, rifle: 20, smg: 45 },
    fireCooldown: 0,
    kills: 0,
    inputs: { up:false, down:false, left:false, right:false, shoot:false, angle:0 },
    rank: 0,
  };
}

function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(cx, rx + rw));
  const nearY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearX, dy = cy - nearY;
  return dx*dx + dy*dy < cr*cr;
}

function resolveWallCollision(p) {
  for (const wall of mapData.walls) {
    if (circleRect(p.x, p.y, PLAYER_RADIUS, wall.x, wall.y, wall.w, wall.h)) {
      const cx = wall.x + wall.w/2, cy = wall.y + wall.h/2;
      const dx = p.x - cx, dy = p.y - cy;
      const overlapX = (wall.w/2 + PLAYER_RADIUS) - Math.abs(dx);
      const overlapY = (wall.h/2 + PLAYER_RADIUS) - Math.abs(dy);
      if (overlapX < overlapY) p.x += overlapX * Math.sign(dx);
      else p.y += overlapY * Math.sign(dy);
    }
  }
}

function bulletHitsWall(b) {
  for (const wall of mapData.walls) {
    if (circleRect(b.x, b.y, BULLET_RADIUS, wall.x, wall.y, wall.w, wall.h)) return true;
  }
  return false;
}

let eliminationOrder = [];

function tickGame() {
  const pList = Object.values(players).filter(p => p.alive);

  // Zone
  zoneTimer++;
  if (zonePhase < ZONE_PHASES.length) {
    const phase = ZONE_PHASES[zonePhase];
    if (!zoneShrinking) {
      if (zoneTimer >= phase.waitTicks) {
        zoneShrinking = true;
        zoneTimer = 0;
        zone.targetRadius = (MAP_W / 2) * phase.targetScale;
      }
    } else {
      const t = zoneTimer / phase.shrinkTicks;
      if (t >= 1) {
        zone.radius = zone.targetRadius;
        zoneShrinking = false;
        zoneTimer = 0;
        zonePhase++;
      } else {
        const startR = zonePhase === 0 ? MAP_W * 0.7 : (MAP_W / 2) * ZONE_PHASES[zonePhase - 1].targetScale;
        zone.radius = startR + (zone.targetRadius - startR) * t;
      }
    }
  }

  // Players
  for (const p of pList) {
    const spd = PLAYER_SPEED;
    let mx = 0, my = 0;
    if (p.inputs.up)    my -= 1;
    if (p.inputs.down)  my += 1;
    if (p.inputs.left)  mx -= 1;
    if (p.inputs.right) mx += 1;
    if (mx !== 0 && my !== 0) { mx *= 0.707; my *= 0.707; }
    p.x += mx * spd;
    p.y += my * spd;
    p.angle = p.inputs.angle;
    resolveWallCollision(p);
    p.x = Math.max(PLAYER_RADIUS, Math.min(MAP_W - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(MAP_H - PLAYER_RADIUS, p.y));

    // Zone damage
    const dx = p.x - zone.x, dy = p.y - zone.y;
    if (Math.sqrt(dx*dx + dy*dy) > zone.radius) {
      p.hp -= zone.damage;
      if (p.hp <= 0) killPlayer(p, null);
    }

    // Fire cooldown
    if (p.fireCooldown > 0) p.fireCooldown--;

    // Shooting
    if (p.inputs.shoot && p.fireCooldown === 0 && p.alive) {
      const w = WEAPONS[p.weapon];
      if (p.ammo[p.weapon] > 0) {
        const pellets = w.pellets || 1;
        for (let i = 0; i < pellets; i++) {
          const spread = (Math.random() - 0.5) * w.spread * 2;
          const ang = p.angle + spread;
          bullets.push({
            id: bulletId++,
            owner: p.id,
            x: p.x + Math.cos(ang) * 25,
            y: p.y + Math.sin(ang) * 25,
            vx: Math.cos(ang) * w.bulletSpeed,
            vy: Math.sin(ang) * w.bulletSpeed,
            damage: w.damage,
            life: 80,
            color: w.color,
          });
        }
        p.ammo[p.weapon]--;
        p.fireCooldown = w.fireRate;
      }
    }

    // Loot pickup
    for (const loot of mapData.loots) {
      if (loot.picked) continue;
      const ldx = p.x - loot.x, ldy = p.y - loot.y;
      if (Math.sqrt(ldx*ldx + ldy*ldy) < PLAYER_RADIUS + 20) {
        p.weapon = loot.type;
        loot.picked = true;
      }
    }
  }

  // Bullets
  bullets = bullets.filter(b => {
    b.x += b.vx; b.y += b.vy;
    b.life--;
    if (b.life <= 0) return false;
    if (bulletHitsWall(b)) return false;
    if (b.x < 0 || b.x > MAP_W || b.y < 0 || b.y > MAP_H) return false;
    for (const p of pList) {
      if (p.id === b.owner || !p.alive) continue;
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx*dx + dy*dy < (PLAYER_RADIUS + BULLET_RADIUS) ** 2) {
        if (p.shield > 0) {
          const shieldDmg = Math.min(p.shield, b.damage);
          p.shield -= shieldDmg;
          p.hp -= (b.damage - shieldDmg);
        } else {
          p.hp -= b.damage;
        }
        if (p.hp <= 0) {
          const shooter = players[b.owner];
          if (shooter) shooter.kills++;
          killPlayer(p, b.owner);
        }
        return false;
      }
    }
    return true;
  });

  checkWin();

  broadcast({
    type: 'gameState',
    players: serializePlayers(),
    bullets: bullets.map(b => ({ id:b.id, x:Math.round(b.x), y:Math.round(b.y), color:b.color })),
    zone: { x: Math.round(zone.x), y: Math.round(zone.y), radius: Math.round(zone.radius) },
    loots: mapData.loots.filter(l => !l.picked),
  });
}

function killPlayer(p, killerId) {
  if (!p.alive) return;
  p.alive = false;
  p.hp = 0;
  const alive = Object.values(players).filter(q => q.alive).length;
  p.rank = alive + 1;
  eliminationOrder.push(p.id);
  broadcast({ type: 'playerDied', id: p.id, name: p.name, killerId, killerName: killerId ? players[killerId]?.name : null, rank: p.rank });
}

function checkWin() {
  const alive = Object.values(players).filter(p => p.alive);
  if (alive.length <= 1 && Object.keys(players).length > 1) {
    if (alive.length === 1) alive[0].rank = 1;
    clearInterval(gameLoop); gameLoop = null;
    gameState = 'ended';
    broadcast({ type: 'gameOver', winner: alive[0] ? { id: alive[0].id, name: alive[0].name, color: alive[0].color, kills: alive[0].kills } : null });
  }
}

function serializePlayers() {
  return Object.values(players).map(p => ({
    id: p.id, name: p.name, color: p.color,
    x: Math.round(p.x), y: Math.round(p.y), angle: p.angle,
    hp: Math.max(0, Math.round(p.hp)), maxHp: p.maxHp,
    shield: Math.round(p.shield), maxShield: p.maxShield,
    alive: p.alive, weapon: p.weapon,
    ammo: p.ammo[p.weapon], kills: p.kills,
  }));
}

function startGame() {
  gameState = 'playing';
  mapData = generateMap();
  eliminationOrder = [];
  zone = { x: MAP_W/2, y: MAP_H/2, radius: MAP_W * 0.7, targetRadius: MAP_W * 0.35, shrinkSpeed: 0.3, damage: 0.5 };
  zonePhase = 0; zoneTimer = 0; zoneShrinking = false;
  bullets = [];
  let idx = 0;
  for (const id of Object.keys(players)) {
    const name = players[id].name;
    players[id] = spawnPlayer(id, name, idx++);
  }
  gameLoop = setInterval(tickGame, 1000 / TICK);
  broadcast({ type: 'gameStart', map: { walls: mapData.walls, loots: mapData.loots, w: MAP_W, h: MAP_H } });
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });
}

let colorIdx = 0;

wss.on('connection', ws => {
  let playerId = null;

  ws.send(JSON.stringify({ type: 'init', gameState, playerCount: Object.keys(players).length, mapSize: { w: MAP_W, h: MAP_H } }));

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      if (Object.keys(players).length >= MAX_PLAYERS) { ws.send(JSON.stringify({ type: 'error', msg: 'Partie pleine !' })); return; }
      const name = (msg.name || 'Joueur').slice(0, 16);
      playerId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
      players[playerId] = spawnPlayer(playerId, name, colorIdx++ % MAX_PLAYERS);
      ws.playerId = playerId;
      ws.send(JSON.stringify({ type: 'joined', id: playerId, color: players[playerId].color }));
      broadcast({ type: 'lobby', players: Object.values(players).map(p => ({ id:p.id, name:p.name, color:p.color })), gameState });
    }

    if (msg.type === 'startGame' && gameState === 'lobby') startGame();

    if (msg.type === 'restart' && gameState === 'ended') {
      gameState = 'lobby'; colorIdx = 0; players = {}; bullets = [];
      broadcast({ type: 'lobby', players: [], gameState: 'lobby' });
    }

    if (msg.type === 'inputs' && playerId && players[playerId]) {
      const p = players[playerId];
      Object.assign(p.inputs, msg.inputs);
    }
  });

  ws.on('close', () => {
    if (playerId && players[playerId]) {
      delete players[playerId];
      broadcast({ type: 'lobby', players: Object.values(players).map(p => ({ id:p.id, name:p.name, color:p.color })), gameState });
      if (gameState === 'playing') checkWin();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === 'IPv4' && !net.internal) localIP = net.address;
  console.log(`\n🎮  Battle Royale lancé !`);
  console.log(`👉  http://${localIP}:${PORT}\n`);
});

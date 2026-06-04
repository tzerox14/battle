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
const MAP_W = 3200, MAP_H = 3200;
const MAX_PLAYERS = 10;
const PLAYER_SPEED = 4;
const PLAYER_RADIUS = 20;
const BULLET_RADIUS = 5;

const WEAPONS = {
  pistol:   { name:'Pistolet',     emoji:'🔫', damage:22, fireRate:18, bulletSpeed:13, spread:0.04, ammo:24,  maxAmmo:24,  range:600, pellets:1, color:'#95a5a6', rarity:'common' },
  smg:      { name:'Mitraillette', emoji:'⚡', damage:11, fireRate:5,  bulletSpeed:14, spread:0.13, ammo:36,  maxAmmo:36,  range:400, pellets:1, color:'#e74c3c', rarity:'common' },
  shotgun:  { name:'Shotgun',      emoji:'💥', damage:18, fireRate:50, bulletSpeed:11, spread:0.28, ammo:8,   maxAmmo:8,   range:250, pellets:6, color:'#e67e22', rarity:'uncommon' },
  rifle:    { name:'Fusil sniper', emoji:'🎯', damage:70, fireRate:90, bulletSpeed:22, spread:0.005,ammo:5,   maxAmmo:5,   range:1200,pellets:1, color:'#3498db', rarity:'rare' },
  burst:    { name:'Rafale',       emoji:'🔥', damage:20, fireRate:8,  bulletSpeed:15, spread:0.06, ammo:21,  maxAmmo:21,  range:550, pellets:1, color:'#9b59b6', rarity:'uncommon', burstCount:3, burstDelay:4 },
  rocket:   { name:'Roquette',     emoji:'🚀', damage:80, fireRate:120,bulletSpeed:8,  spread:0.01, ammo:3,   maxAmmo:3,   range:800, pellets:1, color:'#e74c3c', rarity:'epic', explosive:true, explosionRadius:120 },
  minigun:  { name:'Minigun',      emoji:'🌀', damage:8,  fireRate:3,  bulletSpeed:13, spread:0.18, ammo:80,  maxAmmo:80,  range:450, pellets:1, color:'#f1c40f', rarity:'epic' },
};

const RARITY_COLORS = { common:'#95a5a6', uncommon:'#2ecc71', rare:'#3498db', epic:'#9b59b6' };
const PLAYER_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#cddc39'];

const BUILDING_THEMES = [
  { wall:'#c0392b', roof:'#922b21', accent:'#e74c3c' },
  { wall:'#2980b9', roof:'#1a5276', accent:'#3498db' },
  { wall:'#27ae60', roof:'#1e8449', accent:'#2ecc71' },
  { wall:'#8e44ad', roof:'#6c3483', accent:'#9b59b6' },
  { wall:'#d35400', roof:'#a04000', accent:'#e67e22' },
  { wall:'#17a589', roof:'#0e6655', accent:'#1abc9c' },
];

function generateMap() {
  const walls = [];
  const loots = [];
  const buildingMeta = [];

  const T = 40;
  walls.push({ x:0, y:0, w:MAP_W, h:T, type:'border' });
  walls.push({ x:0, y:MAP_H-T, w:MAP_W, h:T, type:'border' });
  walls.push({ x:0, y:0, w:T, h:MAP_H, type:'border' });
  walls.push({ x:MAP_W-T, y:0, w:T, h:MAP_H, type:'border' });

  const buildingDefs = [
    {x:260,y:260,w:200,h:160},{x:700,y:180,w:140,h:220},{x:1150,y:120,w:220,h:180},
    {x:1700,y:200,w:180,h:160},{x:2200,y:160,w:200,h:200},{x:2650,y:240,w:160,h:160},
    {x:180,y:750,w:160,h:180},{x:580,y:680,w:220,h:120},{x:980,y:620,w:180,h:180},
    {x:1400,y:680,w:140,h:220},{x:1820,y:620,w:200,h:160},{x:2220,y:680,w:180,h:180},
    {x:2680,y:620,w:160,h:140},{x:260,y:1280,w:180,h:180},{x:680,y:1180,w:220,h:160},
    {x:1080,y:1080,w:260,h:260},{x:1580,y:1180,w:180,h:180},{x:2080,y:1080,w:220,h:200},
    {x:2580,y:1280,w:180,h:180},{x:180,y:1880,w:200,h:160},{x:580,y:1780,w:180,h:220},
    {x:980,y:1680,w:220,h:180},{x:1480,y:1780,w:180,h:180},{x:1880,y:1680,w:220,h:160},
    {x:2380,y:1780,w:180,h:220},{x:2780,y:1880,w:160,h:160},{x:260,y:2380,w:220,h:180},
    {x:760,y:2280,w:180,h:220},{x:1260,y:2180,w:220,h:220},{x:1780,y:2280,w:180,h:180},
    {x:2280,y:2380,w:220,h:180},{x:2780,y:2280,w:160,h:220},
  ];

  buildingDefs.forEach((b, i) => {
    const theme = BUILDING_THEMES[i % BUILDING_THEMES.length];
    buildingMeta.push({ ...b, theme, type:'building' });
    walls.push({ x:b.x, y:b.y, w:b.w, h:T*0.6, type:'wall', theme });
    walls.push({ x:b.x, y:b.y+b.h-T*0.6, w:b.w, h:T*0.6, type:'wall', theme });
    walls.push({ x:b.x, y:b.y, w:T*0.6, h:b.h, type:'wall', theme });
    walls.push({ x:b.x+b.w-T*0.6, y:b.y, w:T*0.6, h:b.h, type:'wall', theme });
  });

  const rocks = [
    {x:480,y:480,w:55,h:55},{x:880,y:360,w:60,h:45},{x:1480,y:420,w:50,h:65},
    {x:1980,y:460,w:60,h:55},{x:2480,y:380,w:55,h:60},{x:380,y:1020,w:60,h:55},
    {x:880,y:980,w:55,h:60},{x:1680,y:980,w:60,h:55},{x:2280,y:1020,w:55,h:60},
    {x:480,y:1580,w:60,h:55},{x:1180,y:1480,w:55,h:65},{x:1980,y:1580,w:60,h:55},
    {x:2780,y:1480,w:55,h:60},{x:380,y:2080,w:60,h:55},{x:980,y:2080,w:55,h:60},
    {x:1680,y:2080,w:60,h:55},{x:2480,y:2080,w:55,h:60},{x:580,y:2680,w:60,h:55},
    {x:1080,y:2680,w:55,h:60},{x:1580,y:2680,w:60,h:55},{x:2080,y:2680,w:55,h:60},
    {x:2680,y:2680,w:60,h:55},{x:1480,y:780,w:55,h:55},{x:1480,y:2380,w:55,h:55},
    {x:780,y:1580,w:55,h:55},{x:2380,y:1580,w:55,h:55},{x:1580,y:480,w:55,h:55},
  ];

  rocks.forEach(r => walls.push({ ...r, type:'rock' }));

  const weaponKeys = Object.keys(WEAPONS);
  const lootSpots = [];
  for (let x = 300; x < MAP_W - 300; x += 280) {
    for (let y = 300; y < MAP_H - 300; y += 280) {
      lootSpots.push([x + (Math.random()-0.5)*80, y + (Math.random()-0.5)*80]);
    }
  }
  lootSpots.forEach(([x,y], i) => {
    const rnd = Math.random();
    let wtype;
    if (rnd < 0.35) wtype = 'pistol';
    else if (rnd < 0.55) wtype = 'smg';
    else if (rnd < 0.72) wtype = 'shotgun';
    else if (rnd < 0.83) wtype = 'burst';
    else if (rnd < 0.92) wtype = 'rifle';
    else if (rnd < 0.97) wtype = 'minigun';
    else wtype = 'rocket';
    loots.push({ id:'l'+i, x, y, type:wtype, picked:false });
  });

  return { walls, loots, buildings: buildingMeta };
}

let mapData = generateMap();
let players = {};
let bullets = [];
let explosions = [];
let bulletId = 0;
let gameState = 'lobby';
let gameLoop = null;
let zone = { x:MAP_W/2, y:MAP_H/2, radius:MAP_W*0.68 };
let zonePhase = 0, zoneTimer = 0, zoneShrinking = false;
let zoneStartRadius = MAP_W*0.68;
const ZONE_PHASES = [
  {wait:60*28,shrink:60*22,scale:0.48},
  {wait:60*18,shrink:60*18,scale:0.26},
  {wait:60*14,shrink:60*14,scale:0.12},
  {wait:60*10,shrink:60*10,scale:0.05},
  {wait:60*5, shrink:60*8, scale:0.01},
];

function makePlayer(id, name, colorIdx) {
  const angle = (colorIdx/MAX_PLAYERS)*Math.PI*2;
  const dist = 1200;
  return {
    id, name,
    color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length],
    x: MAP_W/2 + Math.cos(angle)*dist,
    y: MAP_H/2 + Math.sin(angle)*dist,
    angle: 0,
    hp: 100, maxHp: 100,
    shield: 0, maxShield: 75,
    alive: true,
    inventory: ['pistol', null, null],
    activeSlot: 0,
    ammo: Object.fromEntries(Object.keys(WEAPONS).map(k=>[k, WEAPONS[k].ammo])),
    fireCooldown: 0,
    burstLeft: 0, burstTimer: 0,
    kills: 0,
    inputs: { up:false, down:false, left:false, right:false, shoot:false, angle:0, slot:0, interact:false },
    interactCooldown: 0,
    rank: 0,
    dashTimer: 0,
  };
}

function circleRect(cx,cy,cr,rx,ry,rw,rh) {
  const nx=Math.max(rx,Math.min(cx,rx+rw)), ny=Math.max(ry,Math.min(cy,ry+rh));
  const dx=cx-nx, dy=cy-ny;
  return dx*dx+dy*dy < cr*cr;
}

function resolveWalls(p) {
  for (const w of mapData.walls) {
    if (circleRect(p.x,p.y,PLAYER_RADIUS,w.x,w.y,w.w,w.h)) {
      const cx=w.x+w.w/2, cy=w.y+w.h/2;
      const dx=p.x-cx, dy=p.y-cy;
      const ox=(w.w/2+PLAYER_RADIUS)-Math.abs(dx), oy=(w.h/2+PLAYER_RADIUS)-Math.abs(dy);
      if (ox<oy) p.x+=ox*Math.sign(dx); else p.y+=oy*Math.sign(dy);
    }
  }
}

function bulletHitsWall(b) {
  for (const w of mapData.walls) if (circleRect(b.x,b.y,BULLET_RADIUS,w.x,w.y,w.w,w.h)) return true;
  return false;
}

function tickGame() {
  const pList = Object.values(players).filter(p=>p.alive);

  // Zone
  zoneTimer++;
  if (zonePhase < ZONE_PHASES.length) {
    const ph = ZONE_PHASES[zonePhase];
    if (!zoneShrinking) {
      if (zoneTimer >= ph.wait) { zoneShrinking=true; zoneTimer=0; zoneStartRadius=zone.radius; zone.targetRadius=(MAP_W/2)*ph.scale; }
    } else {
      const t = Math.min(zoneTimer/ph.shrink, 1);
      zone.radius = zoneStartRadius + (zone.targetRadius - zoneStartRadius)*t;
      if (t>=1) { zoneShrinking=false; zoneTimer=0; zonePhase++; }
    }
  }

  for (const p of pList) {
    if (p.interactCooldown>0) p.interactCooldown--;

    let mx=0, my=0;
    if (p.inputs.up) my-=1;
    if (p.inputs.down) my+=1;
    if (p.inputs.left) mx-=1;
    if (p.inputs.right) mx+=1;
    if (mx&&my) { mx*=0.707; my*=0.707; }
    p.x+=mx*PLAYER_SPEED; p.y+=my*PLAYER_SPEED;
    p.angle=p.inputs.angle;
    resolveWalls(p);
    p.x=Math.max(PLAYER_RADIUS,Math.min(MAP_W-PLAYER_RADIUS,p.x));
    p.y=Math.max(PLAYER_RADIUS,Math.min(MAP_H-PLAYER_RADIUS,p.y));

    // Zone damage
    const dz=Math.sqrt((p.x-zone.x)**2+(p.y-zone.y)**2);
    if (dz>zone.radius) { p.hp-=0.6; if (p.hp<=0) killPlayer(p,null); }

    // Interact / pickup
    if (p.inputs.interact && p.interactCooldown===0) {
      for (const loot of mapData.loots) {
        if (loot.picked) continue;
        const dl=Math.sqrt((p.x-loot.x)**2+(p.y-loot.y)**2);
        if (dl<50) {
          const emptySlot = p.inventory.indexOf(null);
          if (emptySlot !== -1) {
            p.inventory[emptySlot] = loot.type;
            loot.picked = true;
            p.interactCooldown = 20;
            break;
          } else {
            const old = p.inventory[p.activeSlot];
            mapData.loots.push({ id:'drop_'+Date.now(), x:p.x, y:p.y, type:old, picked:false });
            p.inventory[p.activeSlot] = loot.type;
            loot.picked = true;
            p.interactCooldown = 20;
            break;
          }
        }
      }
    }

    // Slot switch
    if (p.inputs.slot >= 0 && p.inputs.slot <= 2) {
      if (p.inventory[p.inputs.slot] !== null) p.activeSlot = p.inputs.slot;
    }

    const weaponId = p.inventory[p.activeSlot];
    if (!weaponId) continue;
    const w = WEAPONS[weaponId];

    if (p.fireCooldown>0) p.fireCooldown--;

    // Burst handling
    if (w.burstCount && p.burstLeft>0) {
      p.burstTimer--;
      if (p.burstTimer<=0 && p.ammo[weaponId]>0) {
        fireBullet(p, weaponId, w);
        p.burstLeft--;
        p.burstTimer = w.burstDelay;
        p.ammo[weaponId]--;
      }
    }

    if (p.inputs.shoot && p.fireCooldown===0 && p.alive) {
      if (p.ammo[weaponId]>0) {
        if (w.burstCount && p.burstLeft===0) {
          p.burstLeft = w.burstCount;
          p.burstTimer = 0;
        } else if (!w.burstCount) {
          const pellets = w.pellets||1;
          for (let i=0;i<pellets;i++) fireBullet(p,weaponId,w);
          p.ammo[weaponId]-=1;
        }
        p.fireCooldown = w.fireRate;
      }
    }

    // Auto-pickup ammo (heal boxes scattered)
    for (const loot of mapData.loots) {
      if (loot.picked || loot.type !== 'medkit') continue;
      const dl = Math.sqrt((p.x-loot.x)**2+(p.y-loot.y)**2);
      if (dl < 40) { p.hp = Math.min(p.maxHp, p.hp+30); loot.picked=true; }
    }
  }

  // Bullets
  bullets = bullets.filter(b => {
    b.x+=b.vx; b.y+=b.vy; b.life--;
    b.dist = (b.dist||0) + Math.sqrt(b.vx**2+b.vy**2);
    if (b.life<=0 || b.dist>b.range) { if(b.explosive) doExplosion(b.x,b.y,b.explosionRadius,b.damage,b.owner); return false; }
    if (bulletHitsWall(b)) { if(b.explosive) doExplosion(b.x,b.y,b.explosionRadius,b.damage,b.owner); return false; }
    if (b.x<0||b.x>MAP_W||b.y<0||b.y>MAP_H) return false;
    for (const p of Object.values(players).filter(p=>p.alive)) {
      if (p.id===b.owner) continue;
      const dx=b.x-p.x, dy=b.y-p.y;
      if (dx*dx+dy*dy < (PLAYER_RADIUS+BULLET_RADIUS)**2) {
        if (b.explosive) { doExplosion(b.x,b.y,b.explosionRadius,b.damage,b.owner); return false; }
        applyDamage(p, b.damage, b.owner);
        return false;
      }
    }
    return true;
  });

  // Explosions
  explosions = explosions.filter(e => { e.life--; return e.life>0; });

  checkWin();
  broadcast({
    type:'gameState',
    players: serializePlayers(),
    bullets: bullets.map(b=>({id:b.id,x:Math.round(b.x),y:Math.round(b.y),color:b.color,explosive:b.explosive})),
    explosions: explosions.map(e=>({x:Math.round(e.x),y:Math.round(e.y),r:e.radius,life:e.life,maxLife:e.maxLife})),
    zone:{x:Math.round(zone.x),y:Math.round(zone.y),radius:Math.round(zone.radius)},
    loots: mapData.loots.filter(l=>!l.picked),
  });
}

function fireBullet(p, weaponId, w) {
  const spread = (Math.random()-0.5)*w.spread*2;
  const ang = p.angle+spread;
  bullets.push({
    id:bulletId++, owner:p.id,
    x:p.x+Math.cos(ang)*28, y:p.y+Math.sin(ang)*28,
    vx:Math.cos(ang)*w.bulletSpeed, vy:Math.sin(ang)*w.bulletSpeed,
    damage:w.damage, life:120, dist:0, range:w.range,
    color:w.color, explosive:!!w.explosive, explosionRadius:w.explosionRadius||0,
  });
}

function doExplosion(x,y,radius,damage,ownerId) {
  explosions.push({x,y,radius,life:20,maxLife:20});
  for (const p of Object.values(players).filter(p=>p.alive)) {
    if (p.id===ownerId) continue;
    const d=Math.sqrt((p.x-x)**2+(p.y-y)**2);
    if (d<radius) applyDamage(p, damage*(1-d/radius), ownerId);
  }
}

function applyDamage(p, dmg, killerId) {
  if (p.shield>0) {
    const sd=Math.min(p.shield,dmg); p.shield-=sd; dmg-=sd;
  }
  p.hp-=dmg;
  if (p.hp<=0) {
    const k=players[killerId]; if(k) k.kills++;
    killPlayer(p, killerId);
  }
}

function killPlayer(p, killerId) {
  if (!p.alive) return;
  p.alive=false; p.hp=0;
  const aliveCount=Object.values(players).filter(q=>q.alive).length;
  p.rank=aliveCount+1;
  p.inventory.filter(Boolean).forEach(wtype => {
    mapData.loots.push({id:'drop_'+Date.now()+'_'+Math.random(),x:p.x+(Math.random()-0.5)*60,y:p.y+(Math.random()-0.5)*60,type:wtype,picked:false});
  });
  broadcast({type:'playerDied',id:p.id,name:p.name,killerId,killerName:killerId?players[killerId]?.name:null,rank:p.rank});
}

function checkWin() {
  const alive=Object.values(players).filter(p=>p.alive);
  if (alive.length<=1&&Object.keys(players).length>1) {
    if(alive.length===1) alive[0].rank=1;
    clearInterval(gameLoop); gameLoop=null; gameState='ended';
    broadcast({type:'gameOver',winner:alive[0]?{id:alive[0].id,name:alive[0].name,color:alive[0].color,kills:alive[0].kills}:null});
  }
}

function serializePlayers() {
  return Object.values(players).map(p=>({
    id:p.id,name:p.name,color:p.color,
    x:Math.round(p.x),y:Math.round(p.y),angle:p.angle,
    hp:Math.max(0,Math.round(p.hp)),shield:Math.round(p.shield),
    alive:p.alive,inventory:p.inventory,activeSlot:p.activeSlot,
    ammo:p.ammo,kills:p.kills,
  }));
}

function startGame() {
  gameState='playing';
  mapData=generateMap();
  zone={x:MAP_W/2,y:MAP_H/2,radius:MAP_W*0.68};
  zonePhase=0;zoneTimer=0;zoneShrinking=false;zoneStartRadius=MAP_W*0.68;
  bullets=[];explosions=[];
  let idx=0;
  for (const id of Object.keys(players)) {
    const name=players[id].name;
    players[id]=makePlayer(id,name,idx++);
  }
  gameLoop=setInterval(tickGame,1000/TICK);
  broadcast({type:'gameStart',map:{walls:mapData.walls,buildings:mapData.buildings,loots:mapData.loots,w:MAP_W,h:MAP_H}});
}

function broadcast(msg) {
  const data=JSON.stringify(msg);
  wss.clients.forEach(ws=>{if(ws.readyState===WebSocket.OPEN)ws.send(data);});
}

let colorIdx=0;
wss.on('connection',ws=>{
  let playerId=null;
  ws.send(JSON.stringify({type:'init',gameState,playerCount:Object.keys(players).length}));

  ws.on('message',raw=>{
    let msg; try{msg=JSON.parse(raw);}catch{return;}

    if (msg.type==='join') {
      if (Object.keys(players).length>=MAX_PLAYERS){ws.send(JSON.stringify({type:'error',msg:'Plein !'}));return;}
      const name=(msg.name||'Joueur').slice(0,16);
      playerId='p_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
      players[playerId]=makePlayer(playerId,name,colorIdx++%MAX_PLAYERS);
      ws.playerId=playerId;
      ws.send(JSON.stringify({type:'joined',id:playerId,color:players[playerId].color}));
      broadcast({type:'lobby',players:Object.values(players).map(p=>({id:p.id,name:p.name,color:p.color})),gameState});
    }
    if (msg.type==='startGame'&&gameState==='lobby') startGame();
    if (msg.type==='restart'&&gameState==='ended'){
      gameState='lobby';colorIdx=0;players={};bullets=[];explosions=[];
      broadcast({type:'lobby',players:[],gameState:'lobby'});
    }
    if (msg.type==='inputs'&&playerId&&players[playerId]) {
      Object.assign(players[playerId].inputs,msg.inputs);
    }
  });

  ws.on('close',()=>{
    if (playerId&&players[playerId]){
      delete players[playerId];
      broadcast({type:'lobby',players:Object.values(players).map(p=>({id:p.id,name:p.name,color:p.color})),gameState});
      if(gameState==='playing')checkWin();
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>{
  const{networkInterfaces}=require('os');
  const nets=networkInterfaces();
  let ip='localhost';
  for(const n of Object.keys(nets))for(const net of nets[n])if(net.family==='IPv4'&&!net.internal)ip=net.address;
  console.log(`\n🎮  BattleJS v2 lancé !\n👉  http://${ip}:${PORT}\n`);
});

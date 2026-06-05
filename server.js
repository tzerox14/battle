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

const wss = new WebSocket.Server({ server, maxPayload: 50 * 1024 * 1024 });

// Keepalive ping every 25s to prevent Railway proxy from dropping connections
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

const TICK = 60;
const MAP_SIZE = 4800;
const MAX_PLAYERS = 10;
const PLAYER_SPEED = 4;
const PLAYER_RADIUS = 20;
const BULLET_RADIUS = 5;
const FIST_DAMAGE = 25;
const FIST_RANGE = 55;
const FIST_COOLDOWN = 30;

// ── NAME FILTER ────────────────────────────────────────────────
function filterName(name) {
  return name.replace(/[ée]mi?[ey]/gi, 'buns');
}

// ── WEAPONS ───────────────────────────────────────────────────
const WEAPONS = {
  pistol:   { name:'Pistolet',     emoji:'🔫', damage:22, fireRate:18, bulletSpeed:13, spread:0.04, ammo:24, maxAmmo:24, range:600,  pellets:1, color:'#95a5a6', rarity:'common' },
  smg:      { name:'Mitraillette', emoji:'⚡', damage:11, fireRate:5,  bulletSpeed:14, spread:0.13, ammo:36, maxAmmo:36, range:400,  pellets:1, color:'#e74c3c', rarity:'common' },
  shotgun:  { name:'Shotgun',      emoji:'💥', damage:18, fireRate:50, bulletSpeed:11, spread:0.28, ammo:8,  maxAmmo:8,  range:250,  pellets:6, color:'#e67e22', rarity:'uncommon' },
  rifle:    { name:'Fusil',        emoji:'🎯', damage:70, fireRate:90, bulletSpeed:22, spread:0.005,ammo:5,  maxAmmo:5,  range:1200, pellets:1, color:'#3498db', rarity:'rare' },
  burst:    { name:'Rafale',       emoji:'🔥', damage:20, fireRate:8,  bulletSpeed:15, spread:0.06, ammo:21, maxAmmo:21, range:550,  pellets:1, color:'#9b59b6', rarity:'uncommon', burstCount:3, burstDelay:4 },
  rocket:   { name:'Roquette',     emoji:'🚀', damage:80, fireRate:120,bulletSpeed:8,  spread:0.01, ammo:3,  maxAmmo:3,  range:800,  pellets:1, color:'#e74c3c', rarity:'epic', explosive:true, explosionRadius:120 },
  minigun:  { name:'Minigun',      emoji:'🌀', damage:8,  fireRate:3,  bulletSpeed:13, spread:0.18, ammo:80, maxAmmo:80, range:450,  pellets:1, color:'#f1c40f', rarity:'epic' },
};

const LOOT_TYPES = {
  ...Object.fromEntries(Object.entries(WEAPONS).map(([k,v])=>[k,{...v,category:'weapon'}])),
  bandage:     { name:'Bandage',        emoji:'🩹', category:'heal',   healHp:25,  healShield:0,  rarity:'common',   color:'#e74c3c' },
  medkit:      { name:'Kit médical',    emoji:'🏥', category:'heal',   healHp:75,  healShield:0,  rarity:'uncommon', color:'#e74c3c' },
  shield_sm:   { name:'Mini bouclier',  emoji:'🔵', category:'shield', healHp:0,   healShield:25, rarity:'common',   color:'#3498db' },
  shield_lg:   { name:'Bouclier max',   emoji:'🛡️', category:'shield', healHp:0,   healShield:75, rarity:'rare',     color:'#3498db' },
  ammo_light:  { name:'Munitions',      emoji:'🟡', category:'ammo', weapons:['pistol','smg','burst'], count:30, rarity:'common', color:'#f1c40f' },
  ammo_heavy:  { name:'Munitions +',    emoji:'🔴', category:'ammo', weapons:['shotgun','rifle'],      count:15, rarity:'common', color:'#e67e22' },
  ammo_special:{ name:'Muni. spéc.',    emoji:'🟣', category:'ammo', weapons:['rocket','minigun'],     count:10, rarity:'uncommon', color:'#9b59b6' },
};

const PLAYER_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#cddc39'];
const RARITY_COLORS = { common:'#95a5a6', uncommon:'#2ecc71', rare:'#3498db', epic:'#9b59b6' };

// ── MAP THEMES ─────────────────────────────────────────────────
const MAP_THEMES = {
  city: {
    name:'🏙️ Ville',
    ground:['#3a3a3a','#404040'],
    road:'#2a2a2a',
    roadMark:'rgba(255,255,200,0.12)',
    rock:['#555','#777'],
    buildingThemes:[
      {wall:'#c0392b',roof:'#922b21',win:'#e8d5b7'},{wall:'#2980b9',roof:'#1a5276',win:'#d6eaf8'},
      {wall:'#27ae60',roof:'#1e8449',win:'#d5f5e3'},{wall:'#8e44ad',roof:'#6c3483',win:'#e8daef'},
      {wall:'#d35400',roof:'#a04000',win:'#fad7a0'},{wall:'#17a589',roof:'#0e6655',win:'#d1f2eb'},
    ],
    bushColor:'#27ae60', bushDark:'#1e8449',
    fogColor:'rgba(40,40,40,0.18)',
  },
  desert: {
    name:'🏜️ Désert',
    ground:['#c9a96e','#d4b483'],
    road:'#b8965a',
    roadMark:'rgba(255,240,200,0.15)',
    rock:['#b8965a','#d4aa70'],
    buildingThemes:[
      {wall:'#d4a96a',roof:'#b8835a',win:'#fff8e1'},{wall:'#bcaaa4',roof:'#8d6e63',win:'#fbe9e7'},
      {wall:'#e0c080',roof:'#c4a060',win:'#fff9c4'},{wall:'#a08050',roof:'#806030',win:'#fff8e1'},
      {wall:'#c8a070',roof:'#a08050',win:'#fff3e0'},{wall:'#d4b896',roof:'#b89070',win:'#fbe9e7'},
    ],
    bushColor:'#8fbc4a', bushDark:'#6a8f35',
    fogColor:'rgba(210,180,100,0.15)',
  },
  tokyo: {
    name:'🌆 Tokyo Néon',
    ground:['#0a0a1a','#0e0e22'],
    road:'#050510',
    roadMark:'rgba(0,200,255,0.25)',
    rock:['#1a1a3a','#2a2a5a'],
    buildingThemes:[
      {wall:'#0d0d2b',roof:'#050515',win:'#00ffff'},{wall:'#1a0a2e',roof:'#0d0520',win:'#ff00ff'},
      {wall:'#0a1a2e',roof:'#050d1e',win:'#00ff88'},{wall:'#2e0a1a',roof:'#1e0510',win:'#ff4488'},
      {wall:'#0a2e1a',roof:'#051e0d',win:'#44ffaa'},{wall:'#1a1a0a',roof:'#0d0d05',win:'#ffee00'},
    ],
    bushColor:'#004444', bushDark:'#002222',
    fogColor:'rgba(0,0,30,0.25)',
  },
};

// ── MAP GENERATOR ──────────────────────────────────────────────
function generateLoot(MAP_W, MAP_H) {
  const loots = [];
  for (let x=250;x<MAP_W-250;x+=200) {
    for (let y=250;y<MAP_H-250;y+=200) {
      if (Math.random() < 0.6) {
        const px = x+(Math.random()-0.5)*80, py = y+(Math.random()-0.5)*80;
        const rnd = Math.random();
        let type;
        if      (rnd<0.16) type='bandage';
        else if (rnd<0.23) type='medkit';
        else if (rnd<0.30) type='shield_sm';
        else if (rnd<0.34) type='shield_lg';
        else if (rnd<0.45) type='ammo_light';
        else if (rnd<0.52) type='ammo_heavy';
        else if (rnd<0.55) type='ammo_special';
        else if (rnd<0.65) type='pistol';
        else if (rnd<0.75) type='smg';
        else if (rnd<0.82) type='shotgun';
        else if (rnd<0.87) type='burst';
        else if (rnd<0.91) type='rifle';
        else if (rnd<0.96) type='minigun';
        else                type='rocket';
        loots.push({id:'l'+(x*1000+y),x:px,y:py,type,picked:false});
      }
    }
  }
  return loots;
}

function generateBushes(MAP_W, MAP_H, walls) {
  const bushes = [];
  for (let i=0; i<320; i++) {
    const x = 150 + Math.random()*(MAP_W-300);
    const y = 150 + Math.random()*(MAP_H-300);
    // Don't place inside walls
    let blocked = false;
    for (const w of walls) {
      if (x>w.x-30&&x<w.x+w.w+30&&y>w.y-30&&y<w.y+w.h+30) { blocked=true; break; }
    }
    if (!blocked) bushes.push({id:'b'+i, x, y, r:22+Math.random()*18});
  }
  return bushes;
}

function generateMap(themeKey) {
  const MAP_W = MAP_SIZE, MAP_H = MAP_SIZE;
  const T = 40;
  const walls = [], buildingMeta = [];

  // Border walls
  walls.push({x:0,y:0,w:MAP_W,h:T,type:'border'});
  walls.push({x:0,y:MAP_H-T,w:MAP_W,h:T,type:'border'});
  walls.push({x:0,y:0,w:T,h:MAP_H,type:'border'});
  walls.push({x:MAP_W-T,y:0,w:T,h:MAP_H,type:'border'});

  let buildingDefs = [];

  if (themeKey === 'city') {
    // Dense city grid — lots of buildings
    const grid = [];
    for (let gx=0;gx<5;gx++) for (let gy=0;gy<5;gy++) {
      const bx = 300+gx*880+(Math.random()-0.5)*80;
      const by = 300+gy*880+(Math.random()-0.5)*80;
      const bw = 140+Math.floor(Math.random()*160);
      const bh = 120+Math.floor(Math.random()*180);
      grid.push({x:bx,y:by,w:bw,h:bh});
    }
    // Extra buildings
    for (let i=0;i<20;i++) grid.push({
      x:200+Math.random()*4300, y:200+Math.random()*4300,
      w:100+Math.random()*180, h:100+Math.random()*160
    });
    buildingDefs = grid;
  } else if (themeKey === 'desert') {
    // Sparse — ruins, long walls, open space
    for (let i=0;i<18;i++) {
      const x = 300+Math.random()*4100, y = 300+Math.random()*4100;
      const side = Math.random();
      if (side < 0.5) {
        buildingDefs.push({x,y,w:200+Math.random()*300,h:40});
        buildingDefs.push({x,y,w:40,h:150+Math.random()*200});
      } else {
        buildingDefs.push({x,y,w:160+Math.random()*200,h:160+Math.random()*200});
      }
    }
    for (let i=0;i<15;i++) buildingDefs.push({
      x:250+Math.random()*4300, y:250+Math.random()*4300,
      w:80+Math.random()*120, h:80+Math.random()*120
    });
  } else if (themeKey === 'tokyo') {
    // Dense cyberpunk — tall narrow buildings, neon corridors
    for (let gx=0;gx<6;gx++) for (let gy=0;gy<6;gy++) {
      const bx = 250+gx*740+(Math.random()-0.5)*60;
      const by = 250+gy*740+(Math.random()-0.5)*60;
      const bw = 100+Math.floor(Math.random()*140);
      const bh = 100+Math.floor(Math.random()*140);
      buildingDefs.push({x:bx,y:by,w:bw,h:bh});
    }
    for (let i=0;i<25;i++) buildingDefs.push({
      x:200+Math.random()*4400, y:200+Math.random()*4400,
      w:60+Math.random()*120, h:60+Math.random()*120
    });
  }

  const theme = MAP_THEMES[themeKey];
  buildingDefs.forEach((b,i) => {
    const t = theme.buildingThemes[i%theme.buildingThemes.length];
    buildingMeta.push({...b,theme:t,type:'building',mapTheme:themeKey});
    const isThin = b.w<=50||b.h<=50;
    const wt = T*0.6;
    if (isThin) {
      walls.push({x:b.x,y:b.y,w:b.w,h:b.h,type:'wall',theme:t});
    } else {
      walls.push({x:b.x,y:b.y,w:b.w,h:wt,type:'wall',theme:t});
      walls.push({x:b.x,y:b.y+b.h-wt,w:b.w,h:wt,type:'wall',theme:t});
      walls.push({x:b.x,y:b.y,w:wt,h:b.h,type:'wall',theme:t});
      walls.push({x:b.x+b.w-wt,y:b.y,w:wt,h:b.h,type:'wall',theme:t});
    }
  });

  // Rocks
  for (let i=0;i<60;i++) {
    const rx = 200+Math.random()*(MAP_W-400), ry = 200+Math.random()*(MAP_H-400);
    walls.push({x:rx,y:ry,w:45+Math.random()*35,h:40+Math.random()*30,type:'rock'});
  }

  const loots = generateLoot(MAP_W, MAP_H);
  const bushes = generateBushes(MAP_W, MAP_H, walls);

  return { walls, loots, buildings:buildingMeta, bushes, theme:themeKey, themeName:theme.name, w:MAP_W, h:MAP_H };
}

// ── BUS ────────────────────────────────────────────────────────
function makeBus(MAP_W, MAP_H) {
  // Bus flies horizontally across top of map (random Y), then diagonal
  const angle = (Math.random() * 0.4 + 0.1) * Math.PI; // roughly diagonal
  const startX = -100;
  const startY = 400 + Math.random() * (MAP_H - 800);
  const endX = MAP_W + 100;
  const endY = startY + (Math.random() - 0.5) * MAP_H * 0.5;
  return {
    x: startX, y: startY,
    startX, startY, endX, endY,
    progress: 0,
    speed: 0.00045, // slower = more time to choose where to drop
    phase: 'flying',
  };
}

// ── GAME STATE ─────────────────────────────────────────────────
let mapData = generateMap('city');
let players = {};
let bullets = [];
let explosions = [];
let bulletId = 0;
let gameState = 'lobby';
let gameLoop = null;
let bus = null;
let zone = { x:MAP_SIZE/2, y:MAP_SIZE/2, radius:MAP_SIZE*0.68 };
let zonePhase=0, zoneTimer=0, zoneShrinking=false, zoneStartRadius=MAP_SIZE*0.68;

// Zones much longer — parties ~15 minutes
const ZONE_PHASES = [
  {wait:60*70, shrink:60*45, scale:0.52},  // ~2min wait, ~45s shrink
  {wait:60*55, shrink:60*40, scale:0.30},  // ~55s wait
  {wait:60*45, shrink:60*35, scale:0.15},
  {wait:60*35, shrink:60*30, scale:0.06},
  {wait:60*20, shrink:60*25, scale:0.02},
];

let mapThemeIndex = 0;
const THEME_KEYS = Object.keys(MAP_THEMES);

// ── VOTE SYSTEM ───────────────────────────────────────────────
let mapVotes = {}; // playerId -> themeKey

function getVoteCounts() {
  const counts = {};
  THEME_KEYS.forEach(k => counts[k] = 0);
  Object.values(mapVotes).forEach(v => { if (counts[v] !== undefined) counts[v]++; });
  return counts;
}

function getWinningMap() {
  const counts = getVoteCounts();
  let best = THEME_KEYS[0], bestCount = -1;
  THEME_KEYS.forEach(k => { if (counts[k] > bestCount) { bestCount = counts[k]; best = k; } });
  return best;
}

function broadcastVotes() {
  broadcast({ type: 'voteUpdate', votes: getVoteCounts(), playerVotes: mapVotes });
}

function makePlayer(id, name, colorIdx) {
  return {
    id, name,
    color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length],
    x: MAP_SIZE/2, y: MAP_SIZE/2,
    angle: 0,
    hp: 100, maxHp: 100,
    shield: 0, maxShield: 75,
    alive: true,
    inBus: true,       // starts in bus
    dropped: false,    // has jumped from bus
    inventory: [null, null, null, null],
    activeSlot: 0,
    ammo: Object.fromEntries(Object.keys(WEAPONS).map(k=>[k,0])),
    fireCooldown: 0,
    fistCooldown: 0,
    fistAnim: 0,       // frames of fist animation
    burstLeft: 0, burstTimer: 0,
    kills: 0,
    inputs: { up:false, down:false, left:false, right:false, shoot:false, angle:0, slot:-1, interact:false, drop:false, fist:false, jumpFromBus:false },
    interactCooldown: 0,
    isMoving: false,
    inBush: false,
    sounds: [],
    rank: 0,
  };
}

function circleRect(cx,cy,cr,rx,ry,rw,rh){
  const nx=Math.max(rx,Math.min(cx,rx+rw)),ny=Math.max(ry,Math.min(cy,ry+rh));
  return (cx-nx)**2+(cy-ny)**2<cr*cr;
}
function resolveWalls(p){
  for(const w of mapData.walls){
    if(circleRect(p.x,p.y,PLAYER_RADIUS,w.x,w.y,w.w,w.h)){
      const cx=w.x+w.w/2,cy=w.y+w.h/2,dx=p.x-cx,dy=p.y-cy;
      const ox=(w.w/2+PLAYER_RADIUS)-Math.abs(dx),oy=(w.h/2+PLAYER_RADIUS)-Math.abs(dy);
      if(ox<oy)p.x+=ox*Math.sign(dx);else p.y+=oy*Math.sign(dy);
    }
  }
}
function bulletHitsWall(b){
  for(const w of mapData.walls)if(circleRect(b.x,b.y,BULLET_RADIUS,w.x,w.y,w.w,w.h))return true;
  return false;
}

function checkBushes(p) {
  p.inBush = mapData.bushes.some(b => Math.sqrt((p.x-b.x)**2+(p.y-b.y)**2) < b.r * 0.8);
}

function tickGame() {
  // Bus
  if (bus && bus.phase === 'flying') {
    bus.progress = Math.min(1, bus.progress + bus.speed);
    bus.x = bus.startX + (bus.endX - bus.startX) * bus.progress;
    bus.y = bus.startY + (bus.endY - bus.startY) * bus.progress;
    if (bus.progress >= 1) {
      bus.phase = 'done';
      // Force drop anyone still in bus
      Object.values(players).forEach(p => {
        if (p.inBus) { p.inBus = false; p.dropped = true; p.x = bus.x; p.y = bus.y; }
      });
    }
  }

  // Zone
  zoneTimer++;
  if (zonePhase < ZONE_PHASES.length) {
    const ph = ZONE_PHASES[zonePhase];
    if (!zoneShrinking) {
      if (zoneTimer >= ph.wait) { zoneShrinking=true; zoneTimer=0; zoneStartRadius=zone.radius; zone.targetRadius=(MAP_SIZE/2)*ph.scale; }
    } else {
      const t = Math.min(zoneTimer/ph.shrink,1);
      zone.radius = zoneStartRadius+(zone.targetRadius-zoneStartRadius)*t;
      if (t>=1) { zoneShrinking=false; zoneTimer=0; zonePhase++; }
    }
  }

  const pList = Object.values(players);

  for (const p of pList) {
    p.sounds = [];

    // Bus logic
    if (p.inBus) {
      p.x = bus.x + (Math.random()-0.5)*10;
      p.y = bus.y + (Math.random()-0.5)*10;
      if (p.inputs.jumpFromBus) {
        p.inBus = false;
        p.dropped = true;
        p.x = bus.x;
        p.y = bus.y;
        p.sounds.push('jump_bus');
      }
      continue;
    }

    if (!p.alive) continue;
    if (p.interactCooldown>0) p.interactCooldown--;

    let mx=0,my=0;
    if (p.inputs.up) my-=1;
    if (p.inputs.down) my+=1;
    if (p.inputs.left) mx-=1;
    if (p.inputs.right) mx+=1;
    if (mx&&my){mx*=0.707;my*=0.707;}
    p.isMoving=!!(mx||my);

    // Velocity-based movement with acceleration and friction for smooth feel
    const ACCEL = 1.2;
    const FRICTION = 0.72;
    const MAX_SPEED = PLAYER_SPEED;
    if (!p.vx) p.vx = 0;
    if (!p.vy) p.vy = 0;
    p.vx = (p.vx + mx * ACCEL) * FRICTION;
    p.vy = (p.vy + my * ACCEL) * FRICTION;
    // Cap speed
    const spd = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
    if (spd > MAX_SPEED) { p.vx = p.vx/spd*MAX_SPEED; p.vy = p.vy/spd*MAX_SPEED; }
    p.x += p.vx; p.y += p.vy;

    p.angle=p.inputs.angle;
    resolveWalls(p);
    p.x=Math.max(PLAYER_RADIUS,Math.min(MAP_SIZE-PLAYER_RADIUS,p.x));
    p.y=Math.max(PLAYER_RADIUS,Math.min(MAP_SIZE-PLAYER_RADIUS,p.y));

    checkBushes(p);

    // Zone damage
    const dz=Math.sqrt((p.x-zone.x)**2+(p.y-zone.y)**2);
    if(dz>zone.radius){p.hp-=0.6;if(p.hp<=0)killPlayer(p,null);}

    // Fist animation countdown
    if (p.fistAnim > 0) p.fistAnim--;
    if (p.fistCooldown > 0) p.fistCooldown--;
    if (p.fireCooldown > 0) p.fireCooldown--;

    // Slot switch
    if (p.inputs.slot>=0&&p.inputs.slot<=3) {
      if (p.inventory[p.inputs.slot]!==null) p.activeSlot=p.inputs.slot;
    }

    // Drop weapon
    if (p.inputs.drop && p.interactCooldown===0) {
      const item=p.inventory[p.activeSlot];
      if (item && LOOT_TYPES[item.type]?.category==='weapon') {
        mapData.loots.push({id:'drop_'+Date.now()+Math.random(),x:p.x+Math.cos(p.angle)*40,y:p.y+Math.sin(p.angle)*40,type:item.type,picked:false});
        p.inventory[p.activeSlot]=null;
        for(let i=0;i<4;i++){if(p.inventory[i]){p.activeSlot=i;break;}}
        p.interactCooldown=15;
      }
    }

    // Interact / pickup
    if (p.inputs.interact && p.interactCooldown===0) {
      for (const loot of mapData.loots) {
        if (loot.picked) continue;
        const dl=Math.sqrt((p.x-loot.x)**2+(p.y-loot.y)**2);
        if (dl>55) continue;
        const info=LOOT_TYPES[loot.type];
        if (!info) continue;
        if (info.category==='heal' && p.hp<p.maxHp) {
          p.hp=Math.min(p.maxHp,p.hp+info.healHp); loot.picked=true; p.sounds.push('heal'); p.interactCooldown=30; break;
        } else if (info.category==='shield' && p.shield<p.maxShield) {
          p.shield=Math.min(p.maxShield,p.shield+info.healShield); loot.picked=true; p.sounds.push('shield'); p.interactCooldown=30; break;
        } else if (info.category==='ammo') {
          info.weapons.forEach(wt=>{p.ammo[wt]=Math.min((p.ammo[wt]||0)+info.count,WEAPONS[wt].maxAmmo*3);});
          loot.picked=true; p.sounds.push('ammo'); p.interactCooldown=15; break;
        } else if (info.category==='weapon') {
          const baseAmmo=WEAPONS[loot.type].ammo;
          const maxAmmo=WEAPONS[loot.type].maxAmmo*3;
          const empty=p.inventory.indexOf(null);
          if (empty!==-1) {
            p.inventory[empty]={type:loot.type};
            p.ammo[loot.type]=Math.min((p.ammo[loot.type]||0)+baseAmmo,maxAmmo);
          } else {
            const old=p.inventory[p.activeSlot];
            if (old) mapData.loots.push({id:'swap_'+Date.now(),x:p.x+(Math.random()-0.5)*30,y:p.y+(Math.random()-0.5)*30,type:old.type,picked:false});
            p.inventory[p.activeSlot]={type:loot.type};
            p.ammo[loot.type]=Math.min((p.ammo[loot.type]||0)+baseAmmo,maxAmmo);
          }
          loot.picked=true; p.sounds.push('pickup_weapon'); p.interactCooldown=15; break;
        }
      }
    }

    // Fist attack (when no weapon in active slot)
    const activeItem = p.inventory[p.activeSlot];
    if (p.inputs.fist && p.fistCooldown===0) {
      p.fistCooldown = FIST_COOLDOWN;
      p.fistAnim = 12;
      p.sounds.push('fist');
      // Hit nearby players
      for (const other of pList) {
        if (other.id===p.id||!other.alive) continue;
        const dist=Math.sqrt((other.x-p.x)**2+(other.y-p.y)**2);
        const angleTo=Math.atan2(other.y-p.y,other.x-p.x);
        const diff=Math.abs(((angleTo-p.angle)+Math.PI*3)%(Math.PI*2)-Math.PI);
        if (dist<FIST_RANGE && diff<Math.PI/2) {
          applyDamage(other,FIST_DAMAGE,p.id);
          other.sounds.push('hit_taken');
        }
      }
    }

    // Shooting
    if (activeItem && WEAPONS[activeItem.type]) {
      const w=WEAPONS[activeItem.type];
      if (w.burstCount && p.burstLeft>0) {
        p.burstTimer--;
        if (p.burstTimer<=0 && p.ammo[activeItem.type]>0) {
          fireBullet(p,activeItem.type,w); p.burstLeft--; p.burstTimer=w.burstDelay; p.ammo[activeItem.type]--;
        }
      }
      if (p.inputs.shoot && p.fireCooldown===0) {
        if (p.ammo[activeItem.type]>0) {
          if (w.burstCount && p.burstLeft===0) { p.burstLeft=w.burstCount; p.burstTimer=0; }
          else if (!w.burstCount) { for(let i=0;i<(w.pellets||1);i++)fireBullet(p,activeItem.type,w); p.ammo[activeItem.type]--; }
          p.fireCooldown=w.fireRate; p.sounds.push('shoot_'+activeItem.type);
        } else { p.sounds.push('empty'); }
      }
    }
  }

  // Bullets
  bullets=bullets.filter(b=>{
    b.x+=b.vx; b.y+=b.vy; b.life--;
    b.dist=(b.dist||0)+Math.sqrt(b.vx**2+b.vy**2);
    if(b.life<=0||b.dist>b.range){if(b.explosive)doExplosion(b.x,b.y,b.explosionRadius,b.damage,b.owner);return false;}
    if(bulletHitsWall(b)){if(b.explosive)doExplosion(b.x,b.y,b.explosionRadius,b.damage,b.owner);return false;}
    if(b.x<0||b.x>MAP_SIZE||b.y<0||b.y>MAP_SIZE)return false;
    for(const p of pList.filter(p=>p.alive&&!p.inBus)){
      if(p.id===b.owner)continue;
      if((p.x-b.x)**2+(p.y-b.y)**2<(PLAYER_RADIUS+BULLET_RADIUS)**2){
        if(b.explosive){doExplosion(b.x,b.y,b.explosionRadius,b.damage,b.owner);return false;}
        applyDamage(p,b.damage,b.owner); return false;
      }
    }
    return true;
  });

  explosions=explosions.filter(e=>{e.life--;return e.life>0;});
  checkWin();

  const allSounds=[];
  pList.forEach(p=>{if(p.sounds&&p.sounds.length)allSounds.push(...p.sounds.map(s=>({sound:s,x:Math.round(p.x),y:Math.round(p.y),pid:p.id})));});

  broadcast({
    type:'gameState',
    players:serializePlayers(),
    bullets:bullets.map(b=>({id:b.id,x:Math.round(b.x),y:Math.round(b.y),color:b.color,explosive:b.explosive})),
    explosions:explosions.map(e=>({x:Math.round(e.x),y:Math.round(e.y),r:e.radius,life:e.life,maxLife:e.maxLife})),
    zone:{x:Math.round(zone.x),y:Math.round(zone.y),radius:Math.round(zone.radius)},
    loots:mapData.loots.filter(l=>!l.picked),
    bus:bus?{x:Math.round(bus.x),y:Math.round(bus.y),progress:+bus.progress.toFixed(3),phase:bus.phase}:null,
    sounds:allSounds,
  });
}

function fireBullet(p,weaponId,w){
  const spread=(Math.random()-0.5)*w.spread*2;
  const ang=p.angle+spread;
  bullets.push({id:bulletId++,owner:p.id,x:p.x+Math.cos(ang)*30,y:p.y+Math.sin(ang)*30,vx:Math.cos(ang)*w.bulletSpeed,vy:Math.sin(ang)*w.bulletSpeed,damage:w.damage,life:120,dist:0,range:w.range,color:w.color,explosive:!!w.explosive,explosionRadius:w.explosionRadius||0});
}
function doExplosion(x,y,radius,damage,ownerId){
  explosions.push({x,y,radius,life:25,maxLife:25});
  for(const p of Object.values(players).filter(p=>p.alive&&!p.inBus)){
    if(p.id===ownerId)continue;
    const d=Math.sqrt((p.x-x)**2+(p.y-y)**2);
    if(d<radius)applyDamage(p,damage*(1-d/radius),ownerId);
  }
}
function applyDamage(p,dmg,killerId){
  if(p.shield>0){const sd=Math.min(p.shield,dmg);p.shield-=sd;dmg-=sd;}
  p.hp-=dmg;
  if(p.hp<=0){const k=players[killerId];if(k)k.kills++;killPlayer(p,killerId);}
}
function killPlayer(p,killerId){
  if(!p.alive)return;
  p.alive=false;p.hp=0;
  const ac=Object.values(players).filter(q=>q.alive&&!q.inBus).length;
  p.rank=ac+1;
  p.inventory.filter(Boolean).forEach(item=>{
    mapData.loots.push({id:'drop_'+Date.now()+'_'+Math.random(),x:p.x+(Math.random()-0.5)*80,y:p.y+(Math.random()-0.5)*80,type:item.type,picked:false});
  });
  broadcast({type:'playerDied',id:p.id,name:p.name,killerId,killerName:killerId?players[killerId]?.name:null,rank:p.rank});
}
function checkWin(){
  const alive=Object.values(players).filter(p=>p.alive&&!p.inBus);
  const total=Object.values(players).filter(p=>!p.inBus);
  if(alive.length<=1&&total.length>1){
    if(alive.length===1)alive[0].rank=1;
    clearInterval(gameLoop);gameLoop=null;gameState='ended';
    broadcast({type:'gameOver',winner:alive[0]?{id:alive[0].id,name:alive[0].name,color:alive[0].color,kills:alive[0].kills}:null});
  }
}
function serializePlayers(){
  return Object.values(players).map(p=>({
    id:p.id,name:p.name,color:p.color,
    x:Math.round(p.x),y:Math.round(p.y),angle:p.angle,
    hp:Math.max(0,Math.round(p.hp)),shield:Math.round(p.shield),
    alive:p.alive,inBus:p.inBus,inventory:p.inventory,activeSlot:p.activeSlot,
    ammo:p.ammo,kills:p.kills,isMoving:p.isMoving,inBush:p.inBush,fistAnim:p.fistAnim,
  }));
}

function startGame(){
  if(Object.keys(players).length===0)return;
  try{
  gameState='playing';
  const themeKey = getWinningMap();
  mapVotes = {};
  mapData=generateMap(themeKey);
  zone={x:MAP_SIZE/2,y:MAP_SIZE/2,radius:MAP_SIZE*0.68};
  zonePhase=0;zoneTimer=0;zoneShrinking=false;zoneStartRadius=MAP_SIZE*0.68;
  bullets=[];explosions=[];
  bus=makeBus(MAP_SIZE,MAP_SIZE);
  let idx=0;
  for(const id of Object.keys(players)){const name=players[id].name;players[id]=makePlayer(id,name,idx++);}
  if(gameLoop){clearInterval(gameLoop);gameLoop=null;}
  gameLoop=setInterval(tickGame,1000/TICK);
  broadcast({type:'gameStart',map:{walls:mapData.walls,buildings:mapData.buildings,loots:mapData.loots,bushes:mapData.bushes,w:MAP_SIZE,h:MAP_SIZE,theme:themeKey,themeName:mapData.themeName}});
  }catch(e){console.error('startGame error:',e);gameState='lobby';}
}

function broadcast(msg){
  const data=JSON.stringify(msg);
  wss.clients.forEach(ws=>{if(ws.readyState===WebSocket.OPEN)ws.send(data);});
}

let colorIdx=0;
wss.on('connection',ws=>{
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let playerId=null;
  ws.send(JSON.stringify({type:'init',gameState,playerCount:Object.keys(players).length}));
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw);}catch{return;}
    if(msg.type==='ping'){ws.isAlive=true;return;}
    if(msg.type==='join'){
      if(Object.keys(players).length>=MAX_PLAYERS){ws.send(JSON.stringify({type:'error',msg:'Plein !'}));return;}
      const name=filterName((msg.name||'Joueur').slice(0,16));
      playerId='p_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
      players[playerId]=makePlayer(playerId,name,colorIdx++%MAX_PLAYERS);
      ws.playerId=playerId;
      ws.send(JSON.stringify({type:'joined',id:playerId,color:players[playerId].color}));
      broadcast({type:'lobby',players:Object.values(players).map(p=>({id:p.id,name:p.name,color:p.color})),gameState});
      broadcastVotes();
    }
    if(msg.type==='voteMap'&&playerId&&gameState==='lobby'){
      if(THEME_KEYS.includes(msg.theme)){
        mapVotes[playerId]=msg.theme;
        broadcastVotes();
      }
    }
    if(msg.type==='startGame'&&gameState==='lobby')startGame();
    if(msg.type==='restart'&&gameState==='ended'){
      gameState='lobby';colorIdx=0;players={};bullets=[];explosions=[];bus=null;mapVotes={};
      broadcast({type:'lobby',players:[],gameState:'lobby'});
      broadcastVotes();
    }
    if(msg.type==='inputs'&&playerId&&players[playerId])Object.assign(players[playerId].inputs,msg.inputs);
  });
  ws.on('close',()=>{
    if(playerId&&players[playerId]){
      delete players[playerId];
      delete mapVotes[playerId];
      broadcast({type:'lobby',players:Object.values(players).map(p=>({id:p.id,name:p.name,color:p.color})),gameState});
      broadcastVotes();
      if(gameState==='playing')checkWin();
    }
  });
});

const PORT=process.env.PORT||8080;
server.listen(PORT,'0.0.0.0',()=>{
  const{networkInterfaces}=require('os');
  const nets=networkInterfaces();let ip='localhost';
  for(const n of Object.keys(nets))for(const net of nets[n])if(net.family==='IPv4'&&!net.internal)ip=net.address;
  console.log(`\n🎮  BattleJS v5\n👉  http://${ip}:${PORT}\n`);
});

/* ============================================================
   STEEL FRONT — WAR MODULE v2.0
   Full strategic layer: multi-continent conquest, 3 difficulties,
   emergency aid, daily rewards, nuclear strikes, supply lines.
   ============================================================ */
(function(){
'use strict';
if (window.__WAR_MODULE_V2__) return;
window.__WAR_MODULE_V2__ = true;

var VERSION = '2.0';
var STORAGE_KEY = 'steel_front_war_v2';
var GRID = 4, SECTOR_COUNT = 16;
var TICK_INTERVAL = 150000;
var BATTLE_INTERVAL = 45000;

var CONTINENTS = [
  { id:'europe',    nm:'EUROPE',       ic:'EU', unlocked:true,  enemyMult:1.0, reward:{industry:200} },
  { id:'asia',      nm:'ASIA',         ic:'AS', unlocked:false, enemyMult:1.4, reward:{industry:400, fuel:200} },
  { id:'africa',    nm:'AFRICA',       ic:'AF', unlocked:false, enemyMult:1.8, reward:{industry:600, ammo:300} },
  { id:'americas',  nm:'THE AMERICAS', ic:'AM', unlocked:false, enemyMult:2.4, reward:{industry:1000, fuel:500, ammo:500} },
  { id:'australia', nm:'AUSTRALIA',    ic:'AU', unlocked:false, enemyMult:3.0, reward:{industry:2000, fuel:1000, ammo:1000} }
];

var DIFFICULTIES = {
  easy:   { nm:'EASY',   startSectors:4, enemyCount:2, startRes:{ fuel:200, ammo:200, industry:200 } },
  normal: { nm:'NORMAL', startSectors:3, enemyCount:3, startRes:{ fuel:100, ammo:100, industry:100 } },
  hard:   { nm:'HARD',   startSectors:1, enemyCount:4, startRes:{ fuel:100, ammo:100, industry:100 } }
};

var TYPES = {
  fuel:     { label:'F', name:'FUEL' },
  ammo:     { label:'A', name:'AMMO' },
  industry: { label:'I', name:'INDUSTRY' },
  empty:    { label:'-', name:'EMPTY' }
};

var UNIT_TYPES = {
  infantry:  { ic:'S', nm:'INFANTRY',   cost:{ ammo:40 },                         power:1,  hp:10, desc:'Light scout' },
  artillery: { ic:'A', nm:'ARTILLERY',  cost:{ ammo:80, industry:30 },            power:3,  hp:8,  desc:'Heavy damage' },
  tank:      { ic:'T', nm:'TANK SQUAD', cost:{ industry:100, fuel:40 },           power:5,  hp:20, desc:'Armored unit' },
  airforce:  { ic:'P', nm:'AIR FORCE',  cost:{ industry:200, fuel:100, ammo:50 }, power:10, hp:15, desc:'Airstrikes' }
};

var COMMANDER_TYPES = {
  ironfist: { ic:'X', nm:'IRON FIST', cost:{ industry:200, ammo:100 },            unit:'infantry',  boost:2.0, desc:'2x Infantry power' },
  thunder:  { ic:'T', nm:'THUNDER',   cost:{ ammo:300, fuel:150 },                unit:'artillery', boost:2.5, desc:'2.5x Artillery power' },
  hammer:   { ic:'H', nm:'HAMMER',    cost:{ industry:400, fuel:200 },            unit:'tank',      boost:3.0, desc:'3x Tank power' },
  storm:    { ic:'S', nm:'STORM',     cost:{ industry:600, fuel:300, ammo:200 },  unit:'airforce',  boost:3.5, desc:'3.5x Air Force power' }
};

var FORT_COST = { industry: 60, ammo: 40 };
var NUKE_COST = { industry: 300, fuel: 150, ammo: 150 };
var AID_COOLDOWN = 3600000;

var UPGRADE_MAX = 5;
var UPGRADE_COST_MULT = 0.6;
var EVENT_INTERVAL = 180000;
var EVENTS = [
  { id:'recon',    nm:'RECON INTEL',     txt:'+200 Industry',           color:'bwin',  reward:{industry:200} },
  { id:'supply',   nm:'SUPPLY DROP',     txt:'+150 Ammo, +100 Fuel',    color:'bwin',  reward:{ammo:150, fuel:100} },
  { id:'boost',    nm:'WAR PRODUCTION',  txt:'+300 Industry',           color:'bwin',  reward:{industry:300} },
  { id:'sabotage', nm:'SABOTAGE',        txt:'-100 Fuel',               color:'blose', penalty:{fuel:100} },
  { id:'strike',   nm:'ENEMY AIRSTRIKE', txt:'-150 Ammo, -50 Industry', color:'blose', penalty:{ammo:150, industry:50} },
  { id:'mutiny',   nm:'MUTINY',          txt:'All units -1',            color:'blose' }
];
  // 1 hour
var AID_PACKAGE = { fuel: 100, ammo: 100, industry: 200 };

var PERK_DEFS = [
  { id:'hp',  ic:'+', nm:'ARMOR', stat:'industry', baseCost:50 },
  { id:'spd', ic:'>', nm:'SPEED', stat:'fuel',     baseCost:50 },
  { id:'dmg', ic:'*', nm:'DAMAGE', stat:'ammo',    baseCost:60 }
];

/* ============ STATE ============ */
function defaults() {
  return {
    v: VERSION,
    continent: 'europe',
    unlockedContinents: ['europe'],
    difficulty: 'normal',
    sectors: [],
    fuel: 100, ammo: 100, industry: 100,
    perks: { hp:0, spd:0, dmg:0 },
    army: {
      infantry:  { count:0, deployed:{}, level:1 },
      artillery: { count:0, deployed:{}, level:1 },
      tank:      { count:0, deployed:{}, level:1 },
      airforce:  { count:0, deployed:{}, level:1 }
    },
    commanders: { unlocked:[], assigned:{} },
    forts: {},
    nukesReady: 0,
    nukeTimer: 0,
    lastEvent: 0,
    eventsLog: [],
    log: [],
    lastProd: 0,
    lastEnemy: 0,
    lastBattle: 0,
    graceUntil: 0,
    lastAid: 0,
    dailySector: null,
    dailyDate: '',
    victory: {}
  };
}

function genSectors(difficulty, continent) {
  var cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  var cont = CONTINENTS.find(function(c){ return c.id === continent; }) || CONTINENTS[0];
  var pool = ['fuel','fuel','ammo','ammo','industry','industry','empty','empty'];
  var s = [];
  for (var i = 0; i < SECTOR_COUNT; i++) {
    s.push({
      id: i,
      type: pool[Math.floor(Math.random() * pool.length)],
      owner: 'neutral',
      level: 1 + Math.floor(Math.random() * 3),
      fortified: false
    });
  }
  // Player sectors from bottom-left
  var playerPositions = {
    easy:   [12, 15, 14, 11],
    normal: [12, 15, 14],
    hard:   [12]
  };
  var pPos = playerPositions[difficulty] || playerPositions.normal;
  for (var j = 0; j < pPos.length; j++) {
    var idx = pPos[j];
    s[idx].owner = 'player';
    s[idx].level = 1;
    if (s[idx].type === 'empty') s[idx].type = 'industry';
  }
  // Enemy sectors from top-right
  var enemyPositions = [0, 1, 3, 4, 7, 8];
  var n = cfg.enemyCount;
  for (var k = 0; k < n; k++) {
    var eIdx = enemyPositions[k];
    s[eIdx].owner = 'enemy';
    s[eIdx].level = Math.max(1, Math.floor(1 + Math.random() * 2));
  }
  return s;
}

var S = null;

function load() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      S = JSON.parse(raw);
      if (!S.sectors || S.sectors.length !== SECTOR_COUNT) throw new Error('bad');
      if (!S.army) S.army = defaults().army;
for (var _au in S.army) if (S.army[_au].level == null) S.army[_au].level = 1;
      if (!S.eventsLog) S.eventsLog = [];
      if (S.lastEvent == null) S.lastEvent = Date.now();
      if (!S.commanders) S.commanders = { unlocked:[], assigned:{} };
      if (!S.perks) S.perks = { hp:0, spd:0, dmg:0 };
      if (!S.unlockedContinents) S.unlockedContinents = ['europe'];
      if (S.nukesReady == null) S.nukesReady = 0;
      if (S.graceUntil == null) S.graceUntil = 0;
      if (!S.victory) S.victory = {};
    } else {
      S = defaults();
      S.sectors = genSectors(S.difficulty, S.continent);
      S.lastProd = S.lastEnemy = S.lastBattle = Date.now();
      save();
    }
  } catch (e) {
    S = defaults();
    S.sectors = genSectors(S.difficulty, S.continent);
    S.lastProd = S.lastEnemy = S.lastBattle = Date.now();
    save();
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (e) {}
}

function resetWar(diff, cont) {
  S = defaults();
  S.difficulty = diff || 'normal';
  S.continent = cont || 'europe';
  S.sectors = genSectors(S.difficulty, S.continent);
  S.lastProd = S.lastEnemy = S.lastBattle = Date.now();
  S.graceUntil = Date.now() + 90000;
  save();
}

/* ============ HELPERS ============ */
function canAfford(cost) {
  for (var k in cost) if ((S[k] || 0) < cost[k]) return false;
  return true;
}
function spend(cost) {
  for (var k in cost) S[k] = (S[k] || 0) - cost[k];
}
function log(text, cls) {
  S.log.unshift({ t: text, c: cls || '', ts: Date.now() });
  if (S.log.length > 40) S.log.length = 40;
  save();
}
function neighbors(idx) {
  var x = idx % GRID, y = Math.floor(idx / GRID);
  var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  var r = [];
  for (var d = 0; d < 4; d++) {
    var nx = x + dirs[d][0], ny = y + dirs[d][1];
    if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
    r.push(ny * GRID + nx);
  }
  return r;
}
function canAttack(idx) {
  if (S.sectors[idx].owner === 'player') return false;
  var ns = neighbors(idx);
  for (var i = 0; i < ns.length; i++) if (S.sectors[ns[i]].owner === 'player') return true;
  return false;
}
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function countSectors(owner) {
  var n = 0;
  for (var i = 0; i < SECTOR_COUNT; i++) if (S.sectors[i].owner === owner) n++;
  return n;
}
function playerOwnsAll() {
  var count = 0;
  for (var i = 0; i < SECTOR_COUNT; i++) if (S.sectors[i].owner === 'player') count++;
  return count >= 8;
}

/* ============ CSS ============ */
function injectCSS() {
  if (document.getElementById('war-css')) return;
  var css = document.createElement('style');
  css.id = 'war-css';
  css.textContent = [
    '#warmap-screen{position:fixed;inset:0;background:radial-gradient(circle,rgba(20,30,60,.98),rgba(5,5,15,.99));z-index:100;display:none;flex-direction:column;align-items:center;padding:14px;overflow-y:auto;font-family:system-ui,Arial,sans-serif;color:#fff;direction:ltr}',
    '#warmap-screen.on{display:flex}',
    '#warmap-screen h1{font-size:22px;letter-spacing:8px;font-weight:900;color:#4ecdc4;margin:0 0 4px;text-shadow:0 0 30px rgba(78,205,196,.6)}',
    '#warmap-screen .wsub{color:rgba(100,180,255,.8);letter-spacing:5px;font-size:9px;margin-bottom:8px;text-align:center}',
    '.war-topbar{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;justify-content:center;align-items:center}',
    '.war-cont{background:rgba(100,180,255,.1);border:1px solid rgba(100,180,255,.35);border-radius:14px;padding:4px 12px;font-size:10px;font-weight:900;letter-spacing:2px;color:#ffd600;cursor:pointer}',
    '.war-cont.locked{opacity:.35;pointer-events:none}',
    '.war-diff{background:rgba(255,214,0,.15);border:1px solid rgba(255,214,0,.4);border-radius:14px;padding:4px 12px;font-size:9px;font-weight:900;letter-spacing:2px;color:#ffd600}',
    '.war-tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;justify-content:center}',
    '.war-tab{padding:6px 12px;background:rgba(100,180,255,.08);border:1px solid rgba(100,180,255,.25);border-radius:14px;font-size:10px;font-weight:800;letter-spacing:1.5px;cursor:pointer;color:rgba(100,180,255,.7);font-family:inherit}',
    '.war-tab.on{background:rgba(255,214,0,.2);border-color:#ffd600;color:#ffd600}',
    '#war-res{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;justify-content:center}',
    '.wres{background:rgba(100,180,255,.08);border:1px solid rgba(100,180,255,.3);border-radius:10px;padding:6px 10px;text-align:center;min-width:60px}',
    '.wres .ric{font-size:14px;font-weight:900;color:#4ecdc4}',
    '.wres .rv{font-size:14px;font-weight:900;color:#ffd600;margin-top:2px}',
    '.wres .rl{font-size:6px;color:rgba(100,180,255,.7);letter-spacing:2px}',
    '.war-actions{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;justify-content:center;width:min(440px,92vw)}',
    '.war-act{flex:1;min-width:90px;padding:8px 10px;border:1px solid rgba(100,180,255,.35);border-radius:10px;background:rgba(100,180,255,.08);color:#fff;font-size:9px;font-weight:900;letter-spacing:1px;cursor:pointer;font-family:inherit}',
    '.war-act.green{background:linear-gradient(135deg,#4ecdc4,#00897b);border:none;color:#000}',
    '.war-act.red{background:linear-gradient(135deg,#ff5252,#b71c1c);border:none;color:#fff}',
    '.war-act.gold{background:linear-gradient(135deg,#ffd600,#ff6d00);border:none;color:#000}',
    '.war-act:disabled{opacity:.4;cursor:not-allowed}',
    '#war-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:min(440px,92vw);margin-bottom:12px}',
    '.wsec{aspect-ratio:1;background:rgba(100,180,255,.06);border:2px solid rgba(100,180,255,.25);border-radius:10px;padding:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;position:relative}',
    '.wsec.owned{background:rgba(0,200,83,.18);border-color:#69f0ae}',
    '.wsec.enemy{background:rgba(255,50,50,.18);border-color:#ff5252}',
    '.wsec.ready{animation:wPulse 1.4s infinite}',
    '.wsec.targetable{border-color:#ffd600!important;box-shadow:0 0 16px rgba(255,214,0,.95);animation:wPulse .7s infinite}',
    '.wunit .upgrade{background:linear-gradient(135deg,#c084fc,#7c3aed);color:#fff}',
    '.wsec.daily{border-color:#ffd600;animation:wDaily 1.2s infinite}',
    '@keyframes wPulse{0%,100%{box-shadow:0 0 6px rgba(255,214,0,.5)}50%{box-shadow:0 0 20px rgba(255,214,0,1)}}',
    '@keyframes wDaily{0%,100%{box-shadow:0 0 8px rgba(255,214,0,.8)}50%{box-shadow:0 0 24px rgba(255,214,0,1)}}',
    '.wsec .sic{font-size:20px;font-weight:900;color:#4ecdc4}',
    '.wsec .snm{font-size:7px;font-weight:900;color:#ffd600;margin-top:2px}',
    '.wsec .slv{font-size:6px;color:rgba(255,255,255,.55)}',
    '.wsec .sfort{position:absolute;top:2px;left:2px;background:#4ecdc4;color:#000;font-size:9px;width:14px;height:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900}',
    '.wsec .supg{position:absolute;top:-5px;right:-5px;background:#69f0ae;color:#000;font-size:11px;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900}',
    '.wsec .daily-tag{position:absolute;bottom:2px;right:2px;background:#ffd600;color:#000;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:900}',
    '#war-perks{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:min(440px,92vw);margin-bottom:12px}',
    '.wperk{background:rgba(100,180,255,.06);border:1px solid rgba(100,180,255,.25);border-radius:10px;padding:8px;text-align:center;cursor:pointer}',
    '.wperk.off{opacity:.4;pointer-events:none}',
    '.wperk .pic{font-size:16px;font-weight:900;color:#4ecdc4}',
    '.wperk .pnm{font-size:9px;font-weight:900;color:#4ecdc4;margin-top:3px}',
    '.wperk .plv{font-size:9px;color:#ffd600;margin-top:2px}',
    '.wperk .pcs{font-size:7px;color:rgba(255,255,255,.6);margin-top:2px}',
    '#war-units{display:none;grid-template-columns:repeat(2,1fr);gap:8px;width:min(440px,92vw);margin-bottom:12px}',
    '#war-units.on{display:grid}',
    '.wunit{background:rgba(100,180,255,.06);border:1px solid rgba(100,180,255,.25);border-radius:10px;padding:10px}',
    '.wunit .uic{font-size:22px;font-weight:900;color:#4ecdc4}',
    '.wunit .unm{font-size:10px;font-weight:900;color:#ffd600;letter-spacing:1px;margin-top:3px}',
    '.wunit .ust{font-size:8px;color:rgba(255,255,255,.6);margin-top:3px;line-height:1.4}',
    '.wunit .uac{display:flex;gap:4px;margin-top:6px}',
    '.wunit .btn2{flex:1;padding:5px;font-size:9px;font-weight:900;border:none;border-radius:6px;cursor:pointer;font-family:inherit;letter-spacing:1px}',
    '.wunit .recruit{background:linear-gradient(135deg,#4ecdc4,#00897b);color:#000}',
    '.wunit .deploy{background:linear-gradient(135deg,#ffd600,#ff6d00);color:#000}',
    '.wunit .btn2:disabled{opacity:.35;cursor:not-allowed}',
    '#war-commanders,#war-forts{display:none;width:min(440px,92vw);margin-bottom:12px}',
    '#war-commanders.on,#war-forts.on{display:block}',
    '.commander{background:linear-gradient(135deg,rgba(168,85,247,.15),rgba(100,50,200,.15));border:1px solid rgba(168,85,247,.5);border-radius:10px;padding:10px;margin-bottom:6px}',
    '.commander.assigned{border-color:#69f0ae;background:linear-gradient(135deg,rgba(0,200,83,.15),rgba(0,80,30,.15))}',
    '.commander .chdr{display:flex;justify-content:space-between;align-items:center}',
    '.commander .cnm{font-size:11px;font-weight:900;color:#c084fc;letter-spacing:1px}',
    '.commander .clv{font-size:9px;color:#ffd600;font-weight:900}',
    '.commander .cds{font-size:8px;color:rgba(255,255,255,.6);margin-top:4px;line-height:1.4}',
    '.commander .cac{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}',
    '.commander .btn3{flex:1;padding:5px;font-size:8px;font-weight:900;border:none;border-radius:6px;cursor:pointer;font-family:inherit;background:linear-gradient(135deg,#c084fc,#7c3aed);color:#fff;min-width:50px}',
    '.commander .btn3:disabled{opacity:.35;cursor:not-allowed}',
    '#war-battle-log{width:min(440px,92vw);max-height:160px;overflow-y:auto;background:rgba(0,0,0,.5);border:1px solid rgba(100,180,255,.2);border-radius:8px;padding:8px 12px;font-size:9px;color:rgba(255,255,255,.7);line-height:1.7;margin-bottom:10px;font-family:monospace;display:none}',
    '#war-battle-log.on{display:block}',
    '#war-battle-log .bwin{color:#69f0ae}',
    '#war-battle-log .blose{color:#ff5252}',
    '#war-battle-log .bneu{color:#ffd600}',
    '#war-threat{background:linear-gradient(135deg,rgba(255,50,50,.15),rgba(200,0,0,.15));border:1px solid rgba(255,80,80,.5);border-radius:10px;padding:8px 14px;width:min(440px,92vw);margin-bottom:10px;display:none}',
    '#war-threat.on{display:block}',
    '#war-threat .tlbl{color:#ff5252;font-size:9px;font-weight:900;letter-spacing:2px}',
    '#war-threat .ttxt{color:#fff;font-size:11px;margin-top:3px}',
    '#war-victory{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:150;display:none;flex-direction:column;align-items:center;justify-content:center;padding:20px}',
    '#war-victory.on{display:flex}',
    '#war-victory h2{color:#ffd600;font-size:32px;letter-spacing:8px;font-weight:900;margin-bottom:8px;text-shadow:0 0 40px rgba(255,214,0,.8)}',
    '#war-victory p{color:#fff;font-size:12px;letter-spacing:2px;margin-bottom:16px;text-align:center;line-height:1.6}',
    '#war-victory .rew{color:#69f0ae;font-size:14px;font-weight:900;letter-spacing:2px;margin-bottom:20px}',
    '.war-backbtn{margin-top:6px;padding:12px 32px;font-size:12px;font-weight:900;letter-spacing:3px;border:1px solid rgba(100,180,255,.4);background:rgba(100,180,255,.12);color:#7fb8ff;border-radius:20px;cursor:pointer;font-family:inherit}',
      '.war-toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);z-index:250;background:rgba(5,10,25,.96);border:2px solid #4ecdc4;border-radius:12px;padding:10px 20px;min-width:200px;max-width:88vw;text-align:center;box-shadow:0 6px 30px rgba(0,0,0,.8);opacity:0;pointer-events:none;transition:opacity .25s, transform .25s}',
    '.war-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}',
    '.war-toast .wt-t{color:#4ecdc4;font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase}',
    '.war-toast .wt-s{color:#fff;font-size:10px;margin-top:4px;letter-spacing:1px}',
    '.war-toast.warn{border-color:#ffd600}',
    '.war-toast.warn .wt-t{color:#ffd600}',
    '.war-toast.err{border-color:#ff5252}',
    '.war-toast.err .wt-t{color:#ff5252}',
].join('\n');
  document.head.appendChild(css);
}

/* ============ WAR MODULE I18N ============ */
var WARI18N = {
en: {youwin:"You are winning! Enemy has only {e} sectors left.",fzd:"Fortified — 60% attack resistance",cap:"Capture a sector first",wm:"WAR MAP",sc:"STRATEGIC CONQUEST",nm:"NORMAL",ez:"EASY",hd:"HARD",fl:"FUEL",am:"AMMO",in:"INDUS",eu:"EU",en:"ENEMY",nu:"NEUTRAL",nk:"NUKES",mp:"MAP",ar:"ARMY",cm:"COMMANDERS",ft:"FORTS",lg:"LOG",aid:"EMERGENCY AID",aidm:"AID {m}m",cd:"CLAIM DAILY",cdd:"DAILY CLAIMED",ns:"NUCLEAR STRIKE",sur:"SURRENDER",ct:"X CANCEL TARGET",et:"ENEMY THREAT",ett:"Enemy {e} sectors vs your {p}. Defend!",ys:"YOUR SECTORS",sec:"SECTOR",unp:"Unprotected",bf:"BUILD FORT",rf:"REMOVE FORT",il:"INDUSTRY",flv:"FUEL",al:"AMMO",el:"EMPTY",inf:"INFANTRY",art:"ARTILLERY",tank:"TANK SQUAD",air:"AIR FORCE",rec:"RECRUIT",dep:"DEP",upg:"UPG",pwr:"PWR",hp:"HP",lv:"LV",own:"Owned",dept:"Dep",ls:"Light scout",hvd:"Heavy damage",au:"Armored unit",as:"Airstrikes",if_:"IRON FIST",th:"THUNDER",hm:"HAMMER",st:"STORM",ifd:"2x Infantry power",thd:"2.5x Artillery power",hmd:"3x Tank power",std:"3.5x Air Force power",lk:"LOCKED",rd:"READY",sel:"SELECT TARGET",taps:"Tap a HIGHLIGHTED sector",tapr:"Tap a RED enemy sector",cxl:"CANCELLED",depd:"DEPLOYED",nsr:"NUCLEAR STRIKE",sh:"Sector {n} hit",surd:"SURRENDERED",nmg:"New map generated",ar_:"AID RECEIVED",ac:"AID COOLDOWN",ne:"NOT ENOUGH",ml:"MAX LEVEL",nu_:"NO UNITS",nt:"NO TARGET",nn:"NO NUKES READY",nrd:"NUCLEAR READY",sc_:"Strike capacity: {n}",cj:"COMMANDER JOINED",fb:"FORT BUILT",ay:"ALREADY YOURS",na:"NOT ADJACENT",pe:"PICK ENEMY SECTOR",dm:"DAILY SECTOR MARKED",ts:"Tap sector {n} to claim",acl:"ALREADY CLAIMED",cbt:"Come back tomorrow",nsa:"NO SECTOR AVAILABLE",wv:"WAR VICTORY",wd:"WAR DEFEAT",vc:"VICTORY",nc:"NEXT CONTINENT",lkd:"LOCKED",cpc:"Clear previous continent",net:"NO ENEMY TARGETS",net2:"NO ENEMY TARGET",dct:"DAILY CLAIMED",gm:"NEW GAME",rst:"RESET"},
de: {youwin:"Du gewinnst! Der Gegner hat nur noch {e} Sektoren.",fzd:"Befestigt — 60% Angriffswiderstand",cap:"Erobere zuerst einen Sektor",wm:"KRIEGSKARTE",sc:"STRATEGISCHE EROBERUNG",nm:"NORMAL",ez:"LEICHT",hd:"SCHWER",fl:"TREIBSTOFF",am:"MUNITION",in:"INDUSTRIE",eu:"EU",en:"GEGNER",nu:"NEUTRAL",nk:"ATOMWAFFEN",mp:"KARTE",ar:"ARMEE",cm:"KOMMANDANTEN",ft:"FESTUNGEN",lg:"PROTOKOLL",aid:"NOTHILFE",aidm:"HILFE {m}m",cd:"TÄGLICH ABHOLEN",cdd:"TÄGLICH ABGEHOLT",ns:"ATOMSCHLAG",sur:"AUFGEBEN",ct:"X ZIEL ABBRECHEN",et:"FEINDLICHE BEDROHUNG",ett:"Gegner {e} Sektoren gegen deine {p}. Verteidige!",ys:"DEINE SEKTOREN",sec:"SEKTOR",unp:"Ungeschützt",bf:"FESTUNG BAUEN",rf:"FESTUNG ENTFERNEN",il:"INDUSTRIE",flv:"TREIBSTOFF",al:"MUNITION",el:"LEER",inf:"INFANTERIE",art:"ARTILLERIE",tank:"PANZERZUG",air:"LUFTWAFFE",rec:"REKRUT",dep:"EINS",upg:"AUFW",pwr:"STK",hp:"LP",lv:"ST",own:"Anzahl",dept:"Eingesetzt",ls:"Leichter Späher",hvd:"Schwerer Schaden",au:"Gepanzerte Einheit",as:"Luftschläge",if_:"EISENFAUST",th:"DONNER",hm:"HAMMER",st:"STURM",ifd:"2x Infanterie-Stärke",thd:"2.5x Artillerie-Stärke",hmd:"3x Panzer-Stärke",std:"3.5x Luftwaffen-Stärke",lk:"GESPERRT",rd:"BEREIT",sel:"ZIEL WÄHLEN",taps:"Tippe einen MARKIERTEN Sektor",tapr:"Tippe einen ROTEN Feindsektor",cxl:"ABGEBROCHEN",depd:"EINGESETZT",nsr:"ATOMSCHLAG",sh:"Sektor {n} getroffen",surd:"AUFGEGEBEN",nmg:"Neue Karte erstellt",ar_:"NOTHILFE ERHALTEN",ac:"HILFE-PAUSE",ne:"NICHT GENUG",ml:"MAX STUFE",nu_:"KEINE EINHEITEN",nt:"KEIN ZIEL",nn:"KEINE ATOMWAFFEN",nrd:"ATOMWAFFE BEREIT",sc_:"Schlagkapazität: {n}",cj:"KOMMANDANT BEIGETRETEN",fb:"FESTUNG GEBAUT",ay:"BEREITS DEIN",na:"NICHT BENACHBART",pe:"FEINDSEKTOR WÄHLEN",dm:"TAGESSEKTOR MARKIERT",ts:"Tippe Sektor {n}",acl:"BEREITS ABGEHOLT",cbt:"Komm morgen wieder",nsa:"KEIN SEKTOR VERFÜGBAR",wv:"KRIEGSSIEG",wd:"KRIEGSNIEDERLAGE",vc:"SIEG",nc:"NÄCHSTER KONTINENT",lkd:"GESPERRT",cpc:"Vorherigen Kontinent räumen",net:"KEINE FEINDZIELE",net2:"KEIN FEINDZIEL",dct:"TÄGLICH ABGEHOLT",gm:"NEUES SPIEL",rst:"ZURÜCKSETZEN"},
ru: {youwin:"Вы побеждаете! У врага осталось {e} секторов.",fzd:"Укреплён — 60% сопротивление атаке",cap:"Сначала захватите сектор",wm:"КАРТА ВОЙНЫ",sc:"СТРАТЕГИЧЕСКОЕ ЗАВОЕВАНИЕ",nm:"НОРМАЛЬНО",ez:"ЛЕГКО",hd:"СЛОЖНО",fl:"ТОПЛИВО",am:"БОЕПРИПАСЫ",in:"ПРОМЫШЛЕННОСТЬ",eu:"ЕС",en:"ВРАГ",nu:"НЕЙТРАЛЬНО",nk:"ЯДЕРНЫЕ",mp:"КАРТА",ar:"АРМИЯ",cm:"КОМАНДИРЫ",ft:"ФОРТЫ",lg:"ЖУРНАЛ",aid:"ЭКСТРЕННАЯ ПОМОЩЬ",aidm:"ПОМОЩЬ {m}мин",cd:"ЕЖЕДНЕВНАЯ НАГРАДА",cdd:"НАГРАДА ПОЛУЧЕНА",ns:"ЯДЕРНЫЙ УДАР",sur:"КАПИТУЛЯЦИЯ",ct:"X ОТМЕНИТЬ ЦЕЛЬ",et:"УГРОЗА ПРОТИВНИКА",ett:"Враг {e} секторов против {p} ваших. Держитесь!",ys:"ВАШИ СЕКТОРА",sec:"СЕКТОР",unp:"Незащищён",bf:"ПОСТРОИТЬ ФОРТ",rf:"УБРАТЬ ФОРТ",il:"ПРОМЫШЛЕННОСТЬ",flv:"ТОПЛИВО",al:"БОЕПРИПАСЫ",el:"ПУСТО",inf:"ПЕХОТА",art:"АРТИЛЛЕРИЯ",tank:"ТАНКОВЫЙ ВЗВОД",air:"АВИАЦИЯ",rec:"НАБРАТЬ",dep:"РАЗВ",upg:"АПГР",pwr:"СИЛА",hp:"ОЗ",lv:"УР",own:"Есть",dept:"Развёрнуто",ls:"Лёгкий разведчик",hvd:"Тяжёлый урон",au:"Бронированная часть",as:"Авиаудары",if_:"ЖЕЛЕЗНЫЙ КУЛАК",th:"ГРОМ",hm:"МОЛОТ",st:"ШТОРМ",ifd:"2x сила пехоты",thd:"2.5x сила артиллерии",hmd:"3x сила танков",std:"3.5x сила авиации",lk:"ЗАКРЫТО",rd:"ГОТОВ",sel:"ВЫБЕРИТЕ ЦЕЛЬ",taps:"Нажмите ПОДСВЕЧЕННЫЙ сектор",tapr:"Нажмите КРАСНЫЙ сектор врага",cxl:"ОТМЕНЕНО",depd:"РАЗВЁРНУТО",nsr:"ЯДЕРНЫЙ УДАР",sh:"Сектор {n} поражён",surd:"КАПИТУЛЯЦИЯ",nmg:"Новая карта создана",ar_:"ПОМОЩЬ ПОЛУЧЕНА",ac:"ПАУЗА ПОМОЩИ",ne:"НЕДОСТАТОЧНО",ml:"МАКС УРОВЕНЬ",nu_:"НЕТ ВОЙСК",nt:"НЕТ ЦЕЛИ",nn:"НЕТ ЯДЕРНЫХ",nrd:"ЯДЕРНАЯ ГОТОВА",sc_:"Ёмкость удара: {n}",cj:"КОМАНДИР ПРИБЫЛ",fb:"ФОРТ ПОСТРОЕН",ay:"УЖЕ ВАШ",na:"НЕ ПО СОСЕДСТВУ",pe:"ВЫБЕРИТЕ СЕКТОР ВРАГА",dm:"СЕКТОР ДНЯ ОТМЕЧЕН",ts:"Нажмите сектор {n}",acl:"УЖЕ ПОЛУЧЕНО",cbt:"Возвращайтесь завтра",nsa:"НЕТ ДОСТУПНЫХ СЕКТОРОВ",wv:"ПОБЕДА В ВОЙНЕ",wd:"ПОРАЖЕНИЕ",vc:"ПОБЕДА",nc:"СЛЕДУЮЩИЙ КОНТИНЕНТ",lkd:"ЗАКРЫТО",cpc:"Очистите предыдущий континент",net:"НЕТ ВРАЖЕСКИХ ЦЕЛЕЙ",net2:"НЕТ ВРАЖЕСКОЙ ЦЕЛИ",dct:"НАГРАДА ПОЛУЧЕНА",gm:"НОВАЯ ИГРА",rst:"СБРОС"},
ar: {youwin:"أنت تفوز! لم يبقَ للعدو سوى {e} قطاعات.",fzd:"محصَّن — مقاومة هجوم 60%",cap:"احتلال قطاع أولاً",wm:"خريطة الحرب",sc:"الغزو الاستراتيجي",nm:"عادي",ez:"سهل",hd:"صعب",fl:"الوقود",am:"الذخيرة",in:"الصناعة",eu:"أوروبا",en:"العدو",nu:"محايد",nk:"نووي",mp:"الخريطة",ar:"الجيش",cm:"القادة",ft:"الحصون",lg:"السجل",aid:"مساعدة طارئة",aidm:"مساعدة {m}د",cd:"استلم اليومية",cdd:"استُلمت اليومية",ns:"ضربة نووية",sur:"استسلام",ct:"X إلغاء الهدف",et:"تهديد العدو",ett:"العدو {e} قطاعات مقابل {p} لك. دافع!",ys:"قطاعاتك",sec:"قطاع",unp:"غير محمي",bf:"ابنِ حصناً",rf:"أزل الحصن",il:"صناعة",flv:"وقود",al:"ذخيرة",el:"فارغ",inf:"مشاة",art:"مدفعية",tank:"فرقة دبابات",air:"قوات جوية",rec:"جنّد",dep:"انشر",upg:"طوّر",pwr:"قوة",hp:"صحة",lv:"مستوى",own:"مملوك",dept:"منشور",ls:"استطلاع خفيف",hvd:"ضرر ثقيل",au:"وحدة مدرعة",as:"ضربات جوية",if_:"القبضة الحديدية",th:"الرعد",hm:"المطرقة",st:"العاصفة",ifd:"قوة مشاة ×2",thd:"قوة مدفعية ×2.5",hmd:"قوة دبابات ×3",std:"قوة جوية ×3.5",lk:"مقفل",rd:"جاهز",sel:"اختر الهدف",taps:"اضغط قطاعاً مُضاءً",tapr:"اضغط قطاع عدو أحمر",cxl:"أُلغي",depd:"نُشر",nsr:"ضربة نووية",sh:"القطاع {n} أصيب",surd:"استسلمت",nmg:"تم توليد خريطة جديدة",ar_:"استُلمت المساعدة",ac:"فترة انتظار",ne:"لا يكفي",ml:"أقصى مستوى",nu_:"لا وحدات",nt:"لا هدف",nn:"لا أسلحة نووية",nrd:"النووي جاهز",sc_:"القدرة: {n}",cj:"انضم القائد",fb:"بُني الحصن",ay:"ملكك بالفعل",na:"غير مجاور",pe:"اختر قطاع عدو",dm:"تم تعليم قطاع اليوم",ts:"اضغط القطاع {n}",acl:"تم الاستلام",cbt:"عد غداً",nsa:"لا قطاعات متاحة",wv:"نصر الحرب",wd:"هزيمة",vc:"نصر",nc:"القارة التالية",lkd:"مقفل",cpc:"أكمل القارة السابقة",net:"لا أهداف معادية",net2:"لا هدف معادي",dct:"استُلمت اليومية",gm:"لعبة جديدة",rst:"إعادة تعيين"}
};
function warLang() {
  var l = (document.documentElement.lang || 'en').slice(0,2);
  return WARI18N[l] ? l : 'en';
}
function warT(k, vars) {
  var lang = warLang();
  var s = WARI18N[lang][k] || WARI18N.en[k] || k;
  if (vars) for (var key in vars) s = s.replace('{' + key + '}', vars[key]);
  return s;
}
function warIsRTL() {
  return warLang() === 'ar';
}
var __warLastLang = null;
function warCheckLangChange() {
  var cur = warLang();
  if (__warLastLang === null) { __warLastLang = cur; return false; }
  if (cur !== __warLastLang) { __warLastLang = cur; return true; }
  return false;
}

/* ============ SCREEN ============ */
function injectScreen() {
  if (document.getElementById('warmap-screen')) return;
  var scr = document.createElement('div');
  scr.id = 'warmap-screen';
  scr.innerHTML =
    '<h1>' + warT('wm') + '</h1>' +
    '<div class="wsub">' + warT('sc') + '</div>' +
    '<div class="war-topbar" id="war-topbar"></div>' +
    '<div class="war-tabs">' +
      '<button class="war-tab on" data-tab="map">' + warT('mp') + '</button>' +
      '<button class="war-tab" data-tab="army">' + warT('ar') + '</button>' +
      '<button class="war-tab" data-tab="commanders">' + warT('cm') + '</button>' +
      '<button class="war-tab" data-tab="forts">' + warT('ft') + '</button>' +
      '<button class="war-tab" data-tab="log">' + warT('lg') + '</button>' +
    '</div>' +
    '<div id="war-res"></div>' +
    '<div class="war-actions" id="war-actions"></div>' +
    '<div id="war-threat"><div class="tlbl">' + warT('et') + '</div><div class="ttxt" id="war-threat-txt"></div></div>' +
    '<div id="war-grid"></div>' +
    '<div id="war-perks"></div>' +
    '<div id="war-units"></div>' +
    '<div id="war-commanders"></div>' +
    '<div id="war-forts"></div>' +
    '<div id="war-battle-log"></div>' +
    '<button class="war-backbtn" id="btn-war-close">BACK</button>' +
    '<div id="war-victory">' +
      '<h2>' + warT('vc') + '</h2>' +
      '<p id="war-victory-txt">Continent liberated!</p>' +
      '<div class="rew" id="war-victory-rew"></div>' +
      '<button class="war-backbtn" id="btn-war-next">' + warT('nc') + '</button>' +
    '</div>';
  document.body.appendChild(scr);

  // Wire close + next
  scr.addEventListener('click', function(e) {
    var t = e.target;
    if (t.id === 'btn-war-close') { e.preventDefault(); closeWarMap(); }
    if (t.id === 'btn-war-next') { e.preventDefault(); goNextContinent(); }
  });
}

/* ============ BUTTON INJECTION ============ */
function tryInjectButton() {
  var existing = document.getElementById('btn-war');
  if (existing) {
    if (!existing.__warBound) {
      existing.__warBound = true;
      existing.addEventListener('click', function(e) {
        e.preventDefault();
        openWarMap();
      });
    }
    return true;
  }
  var menu = document.getElementById('menu');
  if (!menu) return false;
  var btn = document.createElement('button');
  btn.id = 'btn-war';
  btn.className = 'btn ghost sm';
  btn.style.cssText = 'background:linear-gradient(135deg,#4ecdc4,#00897b);color:#000;border:none;font-weight:900';
  btn.textContent = 'WAR MAP';
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    openWarMap();
  });
  var container = menu.querySelector('#menu-buttons');
  if (container) { container.insertBefore(btn, container.firstChild); return true; }
  var firstBtn = menu.querySelector('button.btn');
  if (firstBtn && firstBtn.parentNode) { firstBtn.parentNode.insertBefore(btn, firstBtn); return true; }
  menu.appendChild(btn);
  return true;
}

/* ============ BANNER TOAST ============ */
function banner(title, text) {
  try {
    var el = document.getElementById('war-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'war-toast';
      el.className = 'war-toast';
      el.innerHTML = '<div class="wt-t"></div><div class="wt-s"></div>';
      document.body.appendChild(el);
    }
    var cls = 'war-toast';
    var t = String(title || '');
    if (/NO |NOT |MAX|LOCKED|DEFEAT|COOLDOWN|ALREADY|CANCEL/i.test(t)) cls += ' warn';
    if (/SURRENDER|NUCLEAR|STRIKE|VICTORY/i.test(t)) cls += ' err';
    el.className = cls;
    el.querySelector('.wt-t').textContent = title || '';
    el.querySelector('.wt-s').textContent = text || '';
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(el.__warT);
    el.__warT = setTimeout(function() { el.classList.remove('on'); }, 2200);
  } catch (e) { console.log('[banner]', title, text); }
}

/* ============ RENDER ============ */
function render() {
  if (!S) return;
  warCheckLangChange();
  tickProduction();
  tickEnemy();
  tickBattles();
  renderTop();
  renderRes();
  renderActions();
  renderThreat();
  renderGrid();
  renderPerks();
  renderUnits();
  renderCommanders();
  renderForts();
  renderLog();
}

function renderTop() {
  var el = document.getElementById('war-topbar');
  if (!el) return;
  var html = '';
  for (var i = 0; i < CONTINENTS.length; i++) {
    var c = CONTINENTS[i];
    var unlocked = S.unlockedContinents.indexOf(c.id) >= 0;
    var active = S.continent === c.id;
    html += '<div class="war-cont' + (!unlocked ? ' locked' : '') + '" data-cont="' + c.id + '"' +
      (active ? ' style="border-color:#ffd600"' : '') + '>' + c.ic + ' ' + c.nm + '</div>';
  }
  html += '<div class="war-diff">' + (DIFFICULTIES[S.difficulty] ? DIFFICULTIES[S.difficulty].nm : 'NORMAL') + '</div>';
  el.innerHTML = html;
}

function renderRes() {
  var el = document.getElementById('war-res');
  if (!el) return;
  var cont = CONTINENTS.find(function(c){ return c.id === S.continent; });
  var my = countSectors('player'), en = countSectors('enemy'), nt = countSectors('neutral');
  el.innerHTML =
    '<div class="wres"><div class="ric">F</div><div class="rv">' + S.fuel + '</div><div class="rl">' + warT('fl') + '</div></div>' +
    '<div class="wres"><div class="ric">A</div><div class="rv">' + S.ammo + '</div><div class="rl">' + warT('am') + '</div></div>' +
    '<div class="wres"><div class="ric">I</div><div class="rv">' + S.industry + '</div><div class="rl">' + warT('in') + '</div></div>' +
    '<div class="wres"><div class="ric">P</div><div class="rv">' + my + '/' + SECTOR_COUNT + '</div><div class="rl">' + (cont ? cont.ic : 'MAP') + '</div></div>' +
    '<div class="wres"><div class="ric">E</div><div class="rv">' + en + '</div><div class="rl">' + warT('en') + '</div></div>' +
    '<div class="wres"><div class="ric">N</div><div class="rv">' + nt + '</div><div class="rl">' + warT('nu') + '</div></div>' +
    (S.nukesReady > 0 ? '<div class="wres" style="border-color:#ff5252"><div class="ric" style="color:#ff5252">N</div><div class="rv">' + S.nukesReady + '</div><div class="rl">' + warT('nk') + '</div></div>' : '');
}

function renderActions() {
  var el = document.getElementById('war-actions');
  if (!el) return;
  var now = Date.now();
  var aidReady = (now - (S.lastAid || 0)) >= AID_COOLDOWN;
  var mins = aidReady ? 0 : Math.ceil((AID_COOLDOWN - (now - S.lastAid)) / 60000);
  var nukeReady = S.nukesReady > 0;
  var dailyReady = S.dailyDate !== todayStr() && S.dailySector == null;

  var cancelBtn = pendingTarget
    ? '<button class="war-act red" data-cancel-target style="flex-basis:100%;animation:wPulse .7s infinite">' + warT('ct') + '</button>'
    : '';

  el.innerHTML = cancelBtn +
    '<button class="war-act green" data-act="aid"' + (aidReady ? '' : ' disabled') + '>' +
      (aidReady ? warT('aid') : warT('aidm', {m: mins})) +
    '</button>' +
    '<button class="war-act gold" data-act="daily"' + (dailyReady ? '' : ' disabled') + '>' +
      (dailyReady ? warT('cd') : warT('cdd')) +
    '</button>' +
    '<button class="war-act ' + (nukeReady ? 'red' : '') + '" data-act="nuke"' + (nukeReady ? '' : ' disabled') + '>' + warT('ns') + '</button>' +
    '<button class="war-act red" data-act="surrender">' + warT('sur') + '</button>';
}

function renderThreat() {
  var el = document.getElementById('war-threat');
  var txt = document.getElementById('war-threat-txt');
  if (!el || !txt) return;
  var my = countSectors('player'), en = countSectors('enemy');
  if (en >= my + 1) {
    el.classList.add('on');
    txt.textContent = warT('ett', {e: en, p: my});
  } else if (my >= en + 3) {
    el.classList.add('on');
    el.style.background = 'linear-gradient(135deg,rgba(0,200,83,.15),rgba(0,80,30,.15))';
    el.style.borderColor = 'rgba(105,240,174,.5)';
    txt.textContent = warT('youwin', {e: en});
  } else {
    el.classList.remove('on');
    el.style.background = '';
    el.style.borderColor = '';
  }
}

function renderGrid() {
  var el = document.getElementById('war-grid');
  if (!el) return;
  var html = '';
  for (var i = 0; i < SECTOR_COUNT; i++) {
    var sec = S.sectors[i];
    var cls = 'wsec';
    if (sec.owner === 'player') cls += ' owned';
    else if (sec.owner === 'enemy') cls += ' enemy';
    if (canAttack(i)) cls += ' ready';
      if (pendingTarget) {
        if (pendingTarget.type === 'deploy' && sec.owner !== 'player' && canAttack(i)) cls += ' targetable';
        if (pendingTarget.type === 'nuke' && sec.owner === 'enemy') cls += ' targetable';
      }
    if (S.dailySector != null && S.dailySector === i) cls += ' daily';
    var t = TYPES[sec.type];
    var typeLabel = warT(sec.type === 'fuel' ? 'flv' : sec.type === 'ammo' ? 'al' : sec.type === 'industry' ? 'il' : 'el');
    var fort = S.forts[i] ? '<div class="sfort">F</div>' : '';
    var upg = '';
    if (sec.owner === 'player' && sec.level < 5) {
      var cost = 30 * sec.level;
      if (S.industry >= cost) upg = '<div class="supg">+</div>';
    }
    var dailyTag = (S.dailySector != null && S.dailySector === i) ? '<div class="daily-tag">+200</div>' : '';
    html += '<div class="' + cls + '" data-sec="' + i + '">' +
      fort + upg + dailyTag +
      '<div class="sic">' + t.label + '</div>' +
      '<div class="snm">' + typeLabel + '</div>' +
      '<div class="slv">LV ' + sec.level + '</div>' +
    '</div>';
  }
  el.innerHTML = html;
}

function renderPerks() {
  var el = document.getElementById('war-perks');
  if (!el) return;
  var html = '';
  for (var i = 0; i < PERK_DEFS.length; i++) {
    var p = PERK_DEFS[i];
    var lvl = S.perks[p.id] || 0;
    var cost = (lvl + 1) * p.baseCost;
    var can = (S[p.stat] || 0) >= cost;
    html += '<div class="wperk' + (can ? '' : ' off') + '" data-perk="' + p.id + '">' +
      '<div class="pic">' + p.ic + '</div>' +
      '<div class="pnm">' + p.nm + '</div>' +
      '<div class="plv">LV ' + lvl + '</div>' +
      '<div class="pcs">' + cost + ' ' + p.stat.toUpperCase() + '</div>' +
    '</div>';
  }
  el.innerHTML = html;
}

function renderUnits() {
  var el = document.getElementById('war-units');
  if (!el) return;
  var html = '';
  for (var uid in UNIT_TYPES) {
    var u = UNIT_TYPES[uid];
    var st = S.army[uid];
    var deployed = 0;
    for (var k in st.deployed) deployed += st.deployed[k];
    var costStr = '';
    for (var c in u.cost) costStr += u.cost[c] + c.charAt(0).toUpperCase() + ' ';
    var canRec = canAfford(u.cost);
    var canDep = st.count > 0;
    html += '<div class="wunit">' +
      '<div class="uic">' + u.ic + '</div>' +
      '<div class="unm">' + u.nm + '</div>' +
      '<div class="ust">' + u.desc + ' · PWR ' + u.power + ' · HP ' + u.hp + '</div>' +
      '<div class="ust" style="color:#4ecdc4">' + warT('own') + ' ' + st.count + (deployed > 0 ? ' · ' + warT('dept') + ' ' + deployed : '') + '</div>' +
      '<div class="ust" style="color:#ffd600">' + warT('lv') + ' ' + (st.level||1) + '/' + UPGRADE_MAX + ' · ' + warT('pwr') + ' ' + (u.power * Math.pow(1.2, (st.level||1)-1)).toFixed(1) + '</div>' +
      '<div class="uac">' +
        '<button class="btn2 recruit" data-recruit="' + uid + '"' + (canRec ? '' : ' disabled') + '>' + warT('rec') + '</button>' +
        '<button class="btn2 deploy" data-deploy="' + uid + '"' + (canDep ? '' : ' disabled') + '>' + warT('dep') + '</button>' +
        '<button class="btn2 upgrade" data-upgrade="' + uid + '"' + ((st.level||1) >= UPGRADE_MAX ? ' disabled' : '') + '>' + warT('upg') + '</button>' +
      '</div></div>';
  }
  el.innerHTML = html;
}

function renderCommanders() {
  var el = document.getElementById('war-commanders');
  if (!el) return;
  var html = '';
  for (var cid in COMMANDER_TYPES) {
    var c = COMMANDER_TYPES[cid];
    var unlocked = S.commanders.unlocked.indexOf(cid) >= 0;
    var assignedTo = null;
    for (var u in S.commanders.assigned) if (S.commanders.assigned[u] === cid) assignedTo = u;
    var costStr = '';
    for (var k in c.cost) costStr += c.cost[k] + k.charAt(0).toUpperCase() + ' ';
    var canA = canAfford(c.cost);
    html += '<div class="commander' + (assignedTo ? ' assigned' : '') + '">' +
      '<div class="chdr"><div class="cnm">' + c.ic + ' ' + c.nm + '</div>' +
      '<div class="clv">' + (unlocked ? (assignedTo ? '→ ' + assignedTo.toUpperCase() : warT('rd')) : warT('lk')) + '</div></div>' +
      '<div class="cds">' + c.desc + '</div>';
    if (unlocked) {
      html += '<div class="cac">';
      for (var uid in UNIT_TYPES) {
        var sel = assignedTo === uid;
        html += '<button class="btn3" data-assign-cmd="' + cid + '" data-unit="' + uid + '">' + (sel ? '✓ ' : '') + uid.slice(0,3).toUpperCase() + '</button>';
      }
      if (assignedTo) html += '<button class="btn3" data-unassign="' + cid + '" style="background:rgba(255,50,50,.7)">X</button>';
      html += '</div>';
    } else {
      html += '<div class="cac">' +
        '<button class="btn3" data-recruit-cmd="' + cid + '"' + (canA ? '' : ' disabled') + '>RECRUIT · ' + costStr + '</button>' +
      '</div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

function renderForts() {
  var el = document.getElementById('war-forts');
  if (!el) return;
  var html = '<div style="color:#4ecdc4;font-size:10px;font-weight:900;letter-spacing:2px;margin-bottom:8px;text-align:center">' + warT('ys') + '</div>';
  var any = false;
  for (var i = 0; i < SECTOR_COUNT; i++) {
    if (S.sectors[i].owner !== 'player') continue;
    any = true;
    var f = !!S.forts[i];
    var sec = S.sectors[i];
    var cost = FORT_COST.industry + 'I ' + FORT_COST.ammo + 'A';
    html += '<div class="commander' + (f ? ' assigned' : '') + '">' +
      '<div class="chdr"><div class="cnm">' + warT('sec') + ' ' + i + '</div>' +
      '<div class="clv">' + warT(sec.type === 'fuel' ? 'flv' : sec.type === 'ammo' ? 'al' : sec.type === 'industry' ? 'il' : 'el') + ' · ' + warT('lv') + ' ' + sec.level + '</div></div>' +
      '<div class="cds">' + (f ? warT('fzd') : warT('unp')) + '</div>' +
      '<div class="cac">' +
        (f
          ? '<button class="btn3" data-fort-remove="' + i + '" style="background:rgba(255,50,50,.7)">' + warT('rf') + '</button>'
          : '<button class="btn3" data-fort-build="' + i + '">' + warT('bf') + ' · ' + cost + '</button>') +
      '</div></div>';
  }
  if (!any) html += '<div style="text-align:center;opacity:.5;padding:16px;font-size:11px">' + warT('cap') + '</div>';
  el.innerHTML = html;
}

function renderLog() {
  var el = document.getElementById('war-battle-log');
  if (!el) return;
  var rows = (S.log || []).slice(0, 25).map(function(l) {
    var t = new Date(l.ts).toLocaleTimeString();
    return '<div class="' + (l.c || '') + '">[' + t + '] ' + l.t + '</div>';
  });
  el.innerHTML = rows.join('') || '<div style="opacity:.5">No events yet</div>';
}

/* ============ TABS ============ */
var currentTab = 'map';
function switchTab(name) {
  currentTab = name;
  var tabs = document.querySelectorAll('.war-tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].dataset.tab === name);
  var map = document.getElementById('war-grid');
  var perks = document.getElementById('war-perks');
  var units = document.getElementById('war-units');
  var cmd = document.getElementById('war-commanders');
  var forts = document.getElementById('war-forts');
  var logEl = document.getElementById('war-battle-log');
  var threat = document.getElementById('war-threat');

  if (map) map.style.display = name === 'map' ? 'grid' : 'none';
  if (perks) perks.style.display = name === 'map' ? 'grid' : 'none';
  if (units) units.style.display = name === 'army' ? 'grid' : 'none';
  if (cmd) cmd.style.display = name === 'commanders' ? 'block' : 'none';
  if (forts) forts.style.display = name === 'forts' ? 'block' : 'none';
  if (logEl) logEl.classList.toggle('on', name === 'log');
  if (threat) threat.style.display = name === 'map' ? '' : 'none';
}

/* ============ TICKS ============ */
function tickProduction() {
  var now = Date.now();
  var min = Math.floor((now - S.lastProd) / 60000);
  if (min < 1) return;
  var add = { fuel:0, ammo:0, industry:0 };
  for (var i = 0; i < SECTOR_COUNT; i++) {
    var sec = S.sectors[i];
    if (sec.owner !== 'player' || sec.type === 'empty') continue;
    add[sec.type] += sec.level;
  }
  var cap = Math.min(min, 60);
  S.fuel += add.fuel * cap;
  S.ammo += add.ammo * cap;
  S.industry += add.industry * cap;
  S.lastProd = now;
  save();
}

function tickEnemy() {
  var now = Date.now();
  if (S.graceUntil && now < S.graceUntil) return;
  if (now - S.lastEnemy < TICK_INTERVAL) return;
  S.lastEnemy = now;
  var cont = CONTINENTS.find(function(c){ return c.id === S.continent; }) || CONTINENTS[0];
  var mult = cont.enemyMult || 1.0;
  var playerS = [], enemyS = [];
  for (var i = 0; i < SECTOR_COUNT; i++) {
    if (S.sectors[i].owner === 'player') playerS.push(i);
    else if (S.sectors[i].owner === 'enemy') enemyS.push(i);
  }
  if (playerS.length > 0 && Math.random() < 0.20 * mult) {
    var weighted = playerS.slice().sort(function(a, b) {
      var sa = S.sectors[a], sb = S.sectors[b];
      var va = (sa.type === 'industry' ? 3 : sa.type !== 'empty' ? 2 : 0) + sa.level;
      var vb = (sb.type === 'industry' ? 3 : sb.type !== 'empty' ? 2 : 0) + sb.level;
      return vb - va;
    });
    var t = weighted[Math.floor(Math.random() * Math.min(3, weighted.length))];
    var fortBonus = S.forts[t] ? 0.4 : 1.0;
    if (Math.random() * fortBonus > 0.4 / mult) {
      S.sectors[t].owner = 'enemy';
      S.sectors[t].level = Math.max(1, S.sectors[t].level - 1);
      delete S.forts[t];
      log('ENEMY CAPTURED SECTOR ' + t, 'blose');
    } else {
      log('DEFENSE HELD AT SECTOR ' + t, 'bwin');
    }
  }
  if (enemyS.length > 0 && Math.random() < 0.35) {
    var from = enemyS[Math.floor(Math.random() * enemyS.length)];
    var ns = neighbors(from);
    var best = -1, bestVal = -1;
    for (var n = 0; n < ns.length; n++) {
      if (S.sectors[ns[n]].owner !== 'neutral') continue;
      var val = S.sectors[ns[n]].type === 'industry' ? 3 : S.sectors[ns[n]].type !== 'empty' ? 2 : 1;
      if (val > bestVal) { bestVal = val; best = ns[n]; }
    }
    if (best >= 0) {
      S.sectors[best].owner = 'enemy';
      log('ENEMY EXPANDED TO ' + best, 'blose');
    }
  }
  save();
}

function tickBattles() {
  var now = Date.now();
  if (now - S.lastBattle < BATTLE_INTERVAL) return;
  S.lastBattle = now;

  for (var uid in UNIT_TYPES) {
    var u = UNIT_TYPES[uid];
    var dep = S.army[uid].deployed;
    var cmdId = S.commanders.assigned[uid];
    var boost = 1;
    if (cmdId && COMMANDER_TYPES[cmdId] && COMMANDER_TYPES[cmdId].unit === uid) boost = COMMANDER_TYPES[cmdId].boost;
    for (var ss in dep) {
      var sector = parseInt(ss, 10);
      var count = dep[ss];
      if (count <= 0) { delete dep[ss]; continue; }
      var sec = S.sectors[sector];
      if (!sec) { delete dep[ss]; continue; }
      if (sec.owner === 'player') {
        S.army[uid].count += count;
        delete dep[ss];
        continue;
      }
      var our = u.power * count * boost + Math.random() * 3;
      var en = sec.level * 2 + (sec.owner === 'enemy' ? 4 : 0) + Math.random() * 3;
      if (our > en) {
        var lost = Math.min(count, Math.max(1, Math.floor(count * Math.min(0.7, en / our))));
        sec.owner = 'player';
        var sv = count - lost;
        if (sv > 0) dep[ss] = sv;
        else delete dep[ss];
        log(warT('sec') + ' ' + sector + ' CAPTURED · -' + lost + ' ' + u.nm, 'bwin');
      } else {
        delete dep[ss];
        log('FAILED AT ' + sector + ' · -' + count + ' ' + u.nm, 'blose');
      }
    }
  }
  save();
  // Check victory
  if (playerOwnsAll()) checkVictory();
}

/* ============ VICTORY ============ */
function checkVictory() {
  var cont = CONTINENTS.find(function(c){ return c.id === S.continent; });
  if (!cont) return;
  if (S.victory[cont.id]) return;
  S.victory[cont.id] = Date.now();
  // Reward
  if (cont.reward) {
    for (var k in cont.reward) S[k] = (S[k] || 0) + cont.reward[k];
  }
  // Unlock next continent
  var idx = CONTINENTS.findIndex(function(c){ return c.id === cont.id; });
  if (idx >= 0 && idx < CONTINENTS.length - 1) {
    var next = CONTINENTS[idx + 1];
    if (S.unlockedContinents.indexOf(next.id) < 0) S.unlockedContinents.push(next.id);
  }
  save();
  showVictory(cont);
}

function showVictory(cont) {
  var v = document.getElementById('war-victory');
  var t = document.getElementById('war-victory-txt');
  var r = document.getElementById('war-victory-rew');
  if (!v) return;
  var idx = CONTINENTS.findIndex(function(c){ return c.id === cont.id; });
  var next = idx < CONTINENTS.length - 1 ? CONTINENTS[idx + 1] : null;
  if (t) t.textContent = cont.nm + ' has been fully liberated!';
  if (r) {
    var rw = '';
    for (var k in (cont.reward || {})) rw += cont.reward[k] + ' ' + k.toUpperCase() + '  ';
    r.textContent = next ? ('Unlocked: ' + next.nm + '  ·  Reward: ' + rw) : ('All continents liberated! Reward: ' + rw);
  }
  v.classList.add('on');
}

function goNextContinent() {
  var v = document.getElementById('war-victory');
  if (v) v.classList.remove('on');
  var idx = CONTINENTS.findIndex(function(c){ return c.id === S.continent; });
  if (idx >= 0 && idx < CONTINENTS.length - 1) {
    S.continent = CONTINENTS[idx + 1].id;
    S.sectors = genSectors(S.difficulty, S.continent);
    S.lastProd = S.lastEnemy = S.lastBattle = Date.now();
    save();
    render();
  }
}

/* ============ ACTIONS ============ */
var currentAttack = null;

var pendingTarget = null;
function startTargeting(type, data) {
  pendingTarget = Object.assign({ type: type }, data || {});
  switchTab('map');
  banner(warT('sel'), type === 'nuke' ? warT('tapr') : warT('taps'));
  render();
}
function cancelTargeting() { pendingTarget = null; banner(warT('cxl'), ''); render(); }
function executePendingTarget(idx) {
  if (!pendingTarget) return false;
  var sec = S.sectors[idx];
  if (!sec) { cancelTargeting(); return true; }
  if (pendingTarget.type === 'deploy') {
    var uid = pendingTarget.unitId;
    if (!uid || !S.army[uid] || S.army[uid].count <= 0) { cancelTargeting(); return true; }
    if (sec.owner === 'player') { banner(warT('ay'), ''); return true; }
    if (!canAttack(idx)) { banner(warT('na'), ''); return true; }
    S.army[uid].count--;
    S.army[uid].deployed[idx] = (S.army[uid].deployed[idx] || 0) + 1;
    log('DEPLOYED ' + UNIT_TYPES[uid].nm + ' -> ' + idx, 'bneu');
    banner(warT('depd'), warT('sec') + ' ' + idx);
    try { SFX.rankUp && SFX.rankUp(); } catch (er) {}
    pendingTarget = null; save(); render(); return true;
  }
  if (pendingTarget.type === 'nuke') {
    if (S.nukesReady <= 0) { cancelTargeting(); return true; }
    if (sec.owner !== 'enemy') { banner(warT('pe'), ''); return true; }
    S.nukesReady--;
    sec.owner = 'neutral'; sec.level = 1;
    delete S.forts[idx];
    log('NUKE ON SECTOR ' + idx, 'bwin');
    banner(warT('nsr'), warT('sh', {n: idx}));
    try { SFX.explode && SFX.explode(); } catch (er) {}
    pendingTarget = null; save(); render(); return true;
  }
  pendingTarget = null; return true;
}
function upgradeUnit(uid) {
  var st = S.army[uid]; if (!st) return;
  var lv = st.level || 1;
  if (lv >= UPGRADE_MAX) { banner(warT('ml'), ''); return; }
  var base = UNIT_TYPES[uid].cost, cost = {};
  for (var k in base) cost[k] = Math.floor(base[k] * (1 + UPGRADE_COST_MULT * lv));
  if (!canAfford(cost)) {
    var s = ''; for (var c in cost) s += cost[c] + c.charAt(0).toUpperCase() + ' ';
    banner(warT('ne'), s.trim()); return;
  }
  spend(cost); st.level = lv + 1;
  log('UPGRADED ' + UNIT_TYPES[uid].nm + ' -> LV ' + st.level, 'bwin');
  banner(warT('lv') + ' ' + st.level, '');
  try { SFX.rankUp && SFX.rankUp(); } catch (er) {}
  save(); render();
}

function handleClick(e) {
  var t = e.target;
  if (!t || !t.closest) return;

  var tab = t.closest('.war-tab');
  if (tab) { e.preventDefault(); switchTab(tab.dataset.tab); return; }

  var cont = t.closest('[data-cont]');
  if (cont) {
    e.preventDefault();
    var cid = cont.dataset.cont;
    if (S.unlockedContinents.indexOf(cid) < 0) { banner(warT('lkd'), warT('cpc')); return; }
    if (S.continent === cid) return;
    S.continent = cid;
    if (!S.victory[cid]) {
      S.sectors = genSectors(S.difficulty, cid);
      S.lastProd = S.lastEnemy = S.lastBattle = Date.now();
    }
    save();
    render();
    return;
  }

  var act = t.closest('[data-act]');
  if (act) {
    e.preventDefault();
    var a = act.dataset.act;
    if (a === 'aid') { doEmergencyAid(); return; }
    if (a === 'daily') { doClaimDaily(); return; }
    if (a === 'nuke') {
      if (S.nukesReady <= 0) { banner(warT('nn'), ''); return; }
      var hasE = false;
      for (var ni = 0; ni < SECTOR_COUNT; ni++) if (S.sectors[ni].owner === 'enemy') { hasE = true; break; }
      if (!hasE) { banner(warT('net'), ''); return; }
      startTargeting('nuke', {});
      return;
    }
    if (a === 'surrender') { doSurrender(); return; }
  }

  var sec = t.closest('[data-sec]');
  if (sec) {
    e.preventDefault();
    var idx = parseInt(sec.dataset.sec, 10);
    if (pendingTarget) { executePendingTarget(idx); return; }
    var s = S.sectors[idx];
    if (s.owner === 'player') {
      // Check for daily sector claim
      if (S.dailySector === idx) {
        S.industry += 200;
        S.fuel += 100;
        S.ammo += 100;
        log('DAILY SECTOR CLAIMED +200I +100F +100A', 'bwin');
        banner(warT('cdd'), '+200I +100F +100A');
        S.dailySector = null;
        S.dailyDate = todayStr();
        save();
        render();
        return;
      }
      // Upgrade
      if (s.level >= 5) { banner(warT('ml'), ''); return; }
      var cost = 30 * s.level;
      if (S.industry < cost) { banner(warT('ne') + ' ' + cost, ''); return; }
      S.industry -= cost;
      s.level++;
      log('UPGRADED SECTOR ' + idx + ' TO LV ' + s.level, 'bneu');
      try { SFX.rankUp && SFX.rankUp(); } catch (er) {}
      save();
      render();
    } else {
      // Attack
      if (!canAttack(idx)) { banner(warT('na'), ''); return; }
      currentAttack = idx;
      var scr = document.getElementById('warmap-screen');
      if (scr) scr.classList.remove('on');
      var mn = document.getElementById('menu');
      if (mn) mn.classList.remove('on');
      setTimeout(function() {
        var play = document.getElementById('btn-play') || document.getElementById('play-btn');
        if (play) play.click();
      }, 100);
    }
    return;
  }

  var perk = t.closest('[data-perk]');
  if (perk) {
    e.preventDefault();
    var pid = perk.dataset.perk;
    for (var i = 0; i < PERK_DEFS.length; i++) {
      if (PERK_DEFS[i].id === pid) {
        var p = PERK_DEFS[i];
        var lvl = S.perks[pid] || 0;
        var cost = (lvl + 1) * p.baseCost;
        if (S[p.stat] < cost) { banner(warT('ne'), ''); return; }
        S[p.stat] -= cost;
        S.perks[pid] = lvl + 1;
        log('PERK ' + p.nm + ' → LV ' + (lvl + 1), 'bneu');
        try { SFX.rankUp && SFX.rankUp(); } catch (er) {}
        save();
        render();
        return;
      }
    }
  }

  var rec = t.closest('[data-recruit]');
  if (rec) {
    e.preventDefault();
    var uid = rec.dataset.recruit;
    var u = UNIT_TYPES[uid];
    if (!u || !canAfford(u.cost)) { banner(warT('ne'), ''); return; }
    spend(u.cost);
    S.army[uid].count++;
    log('RECRUITED ' + u.nm, 'bneu');
    try { SFX.rankUp && SFX.rankUp(); } catch (er) {}
    save();
    render();
    return;
  }

  var dep = t.closest('[data-deploy]');
  if (dep) {
    e.preventDefault();
    var uid2 = dep.dataset.deploy;
    if (S.army[uid2].count <= 0) { banner(warT('nu_'), ''); return; }
    var anyT = false;
    for (var ti = 0; ti < SECTOR_COUNT; ti++) if (canAttack(ti) && S.sectors[ti].owner !== 'player') { anyT = true; break; }
    if (!anyT) { banner(warT('nt'), ''); return; }
    startTargeting('deploy', { unitId: uid2 });
    return;
  }

  var upgB = t.closest('[data-upgrade]');
  if (upgB) { e.preventDefault(); upgradeUnit(upgB.dataset.upgrade); return; }

  var cxlB = t.closest('[data-cancel-target]');
  if (cxlB) { e.preventDefault(); cancelTargeting(); return; }

  var cmdRec = t.closest('[data-recruit-cmd]');
  if (cmdRec) {
    e.preventDefault();
    var cid2 = cmdRec.dataset.recruitCmd;
    var c = COMMANDER_TYPES[cid2];
    if (!c) return;
    if (S.commanders.unlocked.indexOf(cid2) >= 0) return;
    if (!canAfford(c.cost)) { banner('NOT ENOUGH', ''); return; }
    spend(c.cost);
    S.commanders.unlocked.push(cid2);
    log('COMMANDER ' + c.nm + ' JOINED', 'bneu');
    banner(warT('cj'), c.nm);
    try { SFX.rankUp && SFX.rankUp(); } catch (er) {}
    save();
    render();
    return;
  }

  var cmdAs = t.closest('[data-assign-cmd]');
  if (cmdAs) {
    e.preventDefault();
    var cid3 = cmdAs.dataset.assignCmd;
    var unit2 = cmdAs.dataset.unit;
    for (var u2 in S.commanders.assigned) if (S.commanders.assigned[u2] === cid3) delete S.commanders.assigned[u2];
    S.commanders.assigned[unit2] = cid3;
    log('COMMANDER → ' + unit2.toUpperCase(), 'bneu');
    save();
    render();
    return;
  }

  var cmdUn = t.closest('[data-unassign]');
  if (cmdUn) {
    e.preventDefault();
    var cid4 = cmdUn.dataset.unassign;
    for (var u3 in S.commanders.assigned) if (S.commanders.assigned[u3] === cid4) delete S.commanders.assigned[u3];
    save();
    render();
    return;
  }

  var fB = t.closest('[data-fort-build]');
  if (fB) {
    e.preventDefault();
    var fi = parseInt(fB.dataset.fortBuild, 10);
    if (S.forts[fi]) return;
    if (!canAfford(FORT_COST)) { banner('NOT ENOUGH', ''); return; }
    spend(FORT_COST);
    S.forts[fi] = { built: Date.now() };
    log('FORT BUILT AT ' + fi, 'bwin');
    banner(warT('fb'), warT('sec') + ' ' + fi);
    try { SFX.rankUp && SFX.rankUp(); } catch (er) {}
    save();
    render();
    return;
  }

  var fR = t.closest('[data-fort-remove]');
  if (fR) {
    e.preventDefault();
    var fi2 = parseInt(fR.dataset.fortRemove, 10);
    delete S.forts[fi2];
    log('FORT REMOVED ' + fi2, 'bneu');
    save();
    render();
    return;
  }
}

/* ============ SPECIAL ACTIONS ============ */
function doEmergencyAid() {
  var now = Date.now();
  if (now - (S.lastAid || 0) < AID_COOLDOWN) {
    var mins = Math.ceil((AID_COOLDOWN - (now - S.lastAid)) / 60000);
    banner(warT('ac'), mins + 'm');
    return;
  }
  S.lastAid = now;
  S.fuel += AID_PACKAGE.fuel;
  S.ammo += AID_PACKAGE.ammo;
  S.industry += AID_PACKAGE.industry;
  log('EMERGENCY AID RECEIVED +' + AID_PACKAGE.industry + 'I +' + AID_PACKAGE.fuel + 'F +' + AID_PACKAGE.ammo + 'A', 'bwin');
  banner(warT('ar_'), '+' + AID_PACKAGE.industry + 'I +' + AID_PACKAGE.fuel + 'F +' + AID_PACKAGE.ammo + 'A');
  try { SFX.rankUp && SFX.rankUp(); } catch (e) {}
  save();
  render();
}

function doClaimDaily() {
  var today = todayStr();
  if (S.dailyDate === today && S.dailySector == null) {
    banner(warT('acl'), warT('cbt'));
    return;
  }
  // Find a neutral or player sector
  var candidates = [];
  for (var i = 0; i < SECTOR_COUNT; i++) {
    if (S.sectors[i].owner === 'player') candidates.push(i);
  }
  if (candidates.length === 0) {
    // Find any neutral sector
    for (var j = 0; j < SECTOR_COUNT; j++) {
      if (S.sectors[j].owner === 'neutral') candidates.push(j);
    }
  }
  if (candidates.length === 0) {
    banner(warT('nsa'), '');
    return;
  }
  S.dailySector = candidates[Math.floor(Math.random() * candidates.length)];
  S.dailyDate = today;
  log('DAILY SECTOR TARGET: ' + S.dailySector, 'bneu');
  banner(warT('dm'), warT('ts', {n: S.dailySector}));
  save();
  render();
}

function doNuclearStrike() {
  if (S.nukesReady <= 0) {
    banner(warT('nn'), '');
    return;
  }
  // Target enemy sector closest to player
  var best = -1, bestDist = 999;
  for (var i = 0; i < SECTOR_COUNT; i++) {
    if (S.sectors[i].owner !== 'enemy') continue;
    var ns = neighbors(i);
    for (var n = 0; n < ns.length; n++) {
      if (S.sectors[ns[n]].owner === 'player') {
        best = i;
        bestDist = 0;
        break;
      }
    }
    if (best >= 0) break;
  }
  if (best < 0) {
    banner(warT('net2'), '');
    return;
  }
  S.nukesReady--;
  S.sectors[best].owner = 'neutral';
  S.sectors[best].level = 1;
  log('☢️ NUCLEAR STRIKE ON SECTOR ' + best, 'bwin');
  banner(warT('nsr'), warT('sh', {n: best}));
  try { SFX.explode && SFX.explode(); } catch (e) {}
  save();
  render();
}

function doSurrender() {
  if (!confirm('Surrender this continent? All progress on this map will be lost.')) return;
  S.sectors = genSectors(S.difficulty, S.continent);
  S.lastProd = S.lastEnemy = S.lastBattle = Date.now();
  S.graceUntil = Date.now() + 90000;
  log('SURRENDERED — MAP RESET', 'blose');
  banner(warT('surd'), warT('nmg'));
  save();
  render();
}

/* ============ TICK NUKE BUILDUP ============ */
function tickNuke() {
  var now = Date.now();
  if (!S.nukeTimer) S.nukeTimer = now;
  if (now - S.nukeTimer > 180000) {
    if (S.industry >= NUKE_COST.industry && S.fuel >= NUKE_COST.fuel && S.ammo >= NUKE_COST.ammo) {
      spend(NUKE_COST);
      S.nukesReady = (S.nukesReady || 0) + 1;
      log('NUCLEAR WARHEAD PRODUCED', 'bneu');
      banner(warT('nrd'), warT('sc_', {n: S.nukesReady}));
    }
    S.nukeTimer = now;
    save();
  }
}

function tickEvents() {
  var now = Date.now();
  if (!S.lastEvent) S.lastEvent = now;
  if (now - S.lastEvent < EVENT_INTERVAL) return;
  S.lastEvent = now;
  var evt = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  if (evt.reward) for (var r in evt.reward) S[r] = (S[r] || 0) + evt.reward[r];
  if (evt.penalty) for (var p in evt.penalty) S[p] = Math.max(0, (S[p] || 0) - evt.penalty[p]);
  if (evt.id === 'mutiny') for (var u in S.army) S.army[u].count = Math.max(0, S.army[u].count - 1);
  S.eventsLog = S.eventsLog || [];
  S.eventsLog.unshift({ t: evt.nm, txt: evt.txt, c: evt.color || '', ts: now });
  if (S.eventsLog.length > 20) S.eventsLog.length = 20;
  log('EVENT: ' + evt.nm + ' - ' + evt.txt, evt.color || '');
  banner(evt.nm, evt.txt);
  save();
}

/* ============ OPEN / CLOSE ============ */
function openWarMap() {
  var scr = document.getElementById('warmap-screen');
  if (!scr) return;
  var mn = document.getElementById('menu');
  if (mn) mn.classList.remove('on');
  scr.classList.add('on');
  render();
  switchTab('map');
}
function closeWarMap() {
  pendingTarget = null;
  var scr = document.getElementById('warmap-screen');
  if (scr) scr.classList.remove('on');
  try {
    if (typeof showMenu === 'function') showMenu();
    else { var m = document.getElementById('menu'); if (m) m.classList.add('on'); }
  } catch (e) {}
}

/* ============ BATTLE INTEGRATION ============ */
var lastRunning = false;
var lastPlayer = null;

function pollGame() {
  if (typeof window.G === 'undefined') return;
  var isRun = !!window.G.running;
  if (lastRunning && !isRun && currentAttack != null) {
    var won = !!(window.G.player && window.G.player.hp > 0);
    if (won) {
      var sec = S.sectors[currentAttack];
      if (sec) {
        sec.owner = 'player';
        if (sec.type !== 'empty') S[sec.type] = (S[sec.type] || 0) + sec.level * 20;
        log('WAR VICTORY AT ' + currentAttack + ' +' + sec.level * 20 + ' ' + sec.type, 'bwin');
        banner(warT('wv'), warT('sec') + ' ' + currentAttack);
      }
    } else {
      log(warT('wd') + ' ' + currentAttack, 'blose');
    }
    currentAttack = null;
    save();
    if (playerOwnsAll()) checkVictory();
  }
  lastRunning = isRun;
  var p = window.G.player;
  if (p && p !== lastPlayer) {
    lastPlayer = p;
    try {
      var hpBoost = 1 + (S.perks.hp || 0) * 0.05;
      var spdBoost = 1 + (S.perks.spd || 0) * 0.04;
      var dmgBoost = 1 + (S.perks.dmg || 0) * 0.06;
      if (p.maxHp) p.maxHp = Math.floor(p.maxHp * hpBoost);
      if (p.hp && p.maxHp) p.hp = p.maxHp;
      if (p.data && p.data.spd) { p.data = Object.assign({}, p.data); p.data.spd = Math.floor(p.data.spd * spdBoost); }
      if (p.data && p.data.dmg) { p.data = Object.assign({}, p.data); p.data.dmg = Math.floor(p.data.dmg * dmgBoost); }
      window.__WAR_DMG_BOOST__ = dmgBoost;
    } catch (e) {}
  }
}

/* ============ INIT ============ */
function init() {
  injectCSS();
  injectScreen();
  var tries = 0;
  var interval = setInterval(function() {
    tries++;
    if (tryInjectButton()) clearInterval(interval);
    else if (tries > 50) clearInterval(interval);
  }, 200);
  document.addEventListener('click', function(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (!t.closest('#warmap-screen') && !t.closest('#btn-war')) return;
    handleClick(e);
  }, false);
  setInterval(function() {
    if (document.getElementById('warmap-screen').classList.contains('on') && warCheckLangChange()) render();
  }, 500);
  setInterval(pollGame, 500);
  setInterval(function() { if (document.getElementById('warmap-screen').classList.contains('on')) render(); }, 8000);
  setInterval(tickNuke, 60000);
  setInterval(tickEvents, 30000);
  console.log('[War Module v' + VERSION + '] ready');
}

load();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();

'use strict';
// ============================================================
// NEON SWARM — Vampire Survivors-style auto-battler
// ============================================================

const C = document.getElementById('game');
const ctx = C.getContext('2d');
let W, H;
function resize() { W = C.width = innerWidth; H = C.height = innerHeight; }
addEventListener('resize', resize); resize();

const PI = Math.PI, TAU = PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Find N nearest entities — O(n*k), much faster than sort for small k
function findNearest(arr, from, k) {
    if (k <= 1) {
        let best = null, bd = Infinity;
        for (const e of arr) { let d = dist(e, from); if (d < bd) { bd = d; best = e; } }
        return best ? [best] : [];
    }
    let res = [], used = new Set();
    for (let c = 0; c < k; c++) {
        let best = null, bd = Infinity;
        for (const e of arr) { if (used.has(e)) continue; let d = dist(e, from); if (d < bd) { bd = d; best = e; } }
        if (!best) break;
        res.push(best); used.add(best);
    }
    return res;
}

// ============================================================
// WEAPON DEFINITIONS (5 levels each, index 0-4)
// ============================================================
const WDEFS = {
    orbiter:   { name:'Orbiters',   desc:'Spinning blades orbit you',    icon:'⚔', col:'#22d3ee',
        dmg:[10,16,24,34,48], cnt:[3,4,5,6,8], rad:[55,62,72,82,95], spd:[0.035,0.04,0.048,0.055,0.065] },
    bolt:      { name:'Bolt Gun',   desc:'Auto-fires at nearest enemy',  icon:'◆', col:'#f472b6',
        dmg:[18,28,40,55,75], cnt:[1,1,2,2,3], spd:[8,9,9,10,11], cd:[32,28,24,20,15] },
    nova:      { name:'Nova Burst', desc:'Periodic AoE explosion',       icon:'✸', col:'#fbbf24',
        dmg:[25,40,58,80,110], rad:[100,120,145,170,200], cd:[160,140,115,95,72] },
    lightning: { name:'Lightning',  desc:'Chain lightning between foes',  icon:'⚡', col:'#a78bfa',
        dmg:[15,24,36,50,70], chains:[3,4,5,7,9], cd:[85,72,60,48,36] },
    missile:   { name:'Missiles',   desc:'Homing missiles seek enemies', icon:'◈', col:'#34d399',
        dmg:[30,45,64,88,120], cnt:[1,2,2,3,4], spd:[3.2,3.6,4,4.5,5], cd:[100,85,70,55,40] }
};

// ============================================================
// ENEMY DEFINITIONS
// ============================================================
const EDEFS = {
    walker:   { hp:28, spd:1.0, r:11, dmg:8,  xp:1, col:'#ef4444' },
    sprinter: { hp:16, spd:2.4, r:8,  dmg:5,  xp:1, col:'#fb923c' },
    brute:    { hp:100,spd:0.5, r:20, dmg:18, xp:3, col:'#b91c1c' },
    exploder: { hp:24, spd:1.3, r:13, dmg:12, xp:2, col:'#facc15' },
    boss:     { hp:800,spd:0.55,r:36, dmg:28, xp:35,col:'#8b5cf6' }
};

// ============================================================
// GAME STATE
// ============================================================
let state = 'menu'; // menu, play, dead
let frame = 0, gt = 0, spawnAcc = 0, nextBoss = 60;
let score = 0, kills = 0, best = +(localStorage.getItem('ns_best') || 0);
let shake = 0, flashAlpha = 0, freezeFrames = 0;
let cam = { x: 0, y: 0 };

// Player & collections
let P, weapons;
let enemies, projs, gems, parts, dmgNums, lightFx, novaFx, healthOrbs, powerUps;
let nextPowerUp = 20, scoreMult = 1, scoreMultTimer = 0;
let combo = 0, comboTimer = 0, maxCombo = 0, lastScore = 0, heartbeatTimer = 0;
let scoreMilestones = [1000, 2500, 5000, 10000, 25000, 50000, 100000];

// ============================================================
// DOM REFS
// ============================================================
const $hud = document.getElementById('hud');
const $hpBar = document.getElementById('hp-bar');
const $hpText = document.getElementById('hp-text');
const $score = document.getElementById('score-display');
const $bestScore = document.getElementById('best-score');
const $scoreMult = document.getElementById('score-mult');
const $timer = document.getElementById('timer');
const $kills = document.getElementById('kill-count');
const $wIcons = document.getElementById('weapon-icons');
const $startScreen = document.getElementById('start-screen');
const $gameoverScreen = document.getElementById('gameover-screen');
const $finalStats = document.getElementById('final-stats');
const $bossWarn = document.getElementById('boss-warning');
const $comboDisplay = document.getElementById('combo-display');
const $comboCount = document.querySelector('#combo-display .combo-count');
const $comboFill = document.querySelector('#combo-display .combo-fill');

// ============================================================
// INPUT
// ============================================================
let keys = {};
let joy = { active:false, id:-1, sx:0, sy:0, dx:0, dy:0 };

addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

C.addEventListener('touchstart', e => {
    if (state !== 'play') return;
    e.preventDefault();
    const t = e.changedTouches[0];
    joy.active = true; joy.id = t.identifier;
    joy.sx = t.clientX; joy.sy = t.clientY; joy.dx = 0; joy.dy = 0;
}, { passive: false });

C.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
        if (t.identifier === joy.id) {
            let dx = t.clientX - joy.sx, dy = t.clientY - joy.sy;
            let d = Math.hypot(dx, dy), maxD = 50;
            if (d > maxD) { dx = dx/d*maxD; dy = dy/d*maxD; }
            joy.dx = dx / maxD; joy.dy = dy / maxD;
        }
    }
}, { passive: false });

C.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
        if (t.identifier === joy.id) { joy.active = false; joy.dx = 0; joy.dy = 0; }
    }
});

// ============================================================
// AUDIO (Web Audio API)
// ============================================================
let actx;
function ac() { if (!actx) actx = new (AudioContext || webkitAudioContext)(); return actx; }

function playTone(freq, dur, type='sine', vol=0.06, freqEnd=null) {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.connect(g); g.connect(a.destination);
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (freqEnd != null) o.frequency.linearRampToValueAtTime(freqEnd, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.linearRampToValueAtTime(0, a.currentTime + dur);
    o.start(); o.stop(a.currentTime + dur);
}

const sndHit    = () => playTone(200 + rand(0,100), 0.08, 'square', 0.05, 80);
const sndKill   = () => { playTone(400, 0.12, 'square', 0.05, 100); playTone(500+rand(0,200), 0.06, 'sine', 0.03, 800); };
const sndXP     = () => playTone(600 + rand(0,300), 0.04, 'sine', 0.03, 900);
const sndBoss   = () => { playTone(80, 0.5, 'sawtooth', 0.12, 30); setTimeout(() => playTone(60, 0.4, 'sawtooth', 0.1, 25), 250); setTimeout(() => playTone(45, 0.3, 'sawtooth', 0.08, 20), 500); };
const sndNova   = () => { playTone(300, 0.25, 'sawtooth', 0.06, 50); playTone(150, 0.3, 'sine', 0.04, 30); };
const sndZap    = () => { playTone(800, 0.1, 'square', 0.04, 200); playTone(1200, 0.06, 'sine', 0.02, 400); };
const sndCombo  = (n) => { let base = 300 + Math.min(n, 20) * 30; playTone(base, 0.1, 'sine', 0.05, base*1.5); };
const sndHurt   = () => { playTone(150, 0.15, 'sawtooth', 0.08, 60); playTone(100, 0.2, 'square', 0.04, 40); };
const sndDeath  = () => { [200,150,100,60].forEach((f,i) => setTimeout(() => playTone(f, 0.3, 'sawtooth', 0.1, f*0.3), i*120)); };
const sndHeartbeat = () => { playTone(50, 0.15, 'sine', 0.06, 45); setTimeout(() => playTone(55, 0.12, 'sine', 0.05, 48), 180); };
const sndMilestone = () => { [400,500,600,750,900,1100].forEach((f,i) => setTimeout(() => playTone(f, 0.12, 'sine', 0.06, f*1.2), i*60)); };
function sndLevelUp() {
    [500,600,750,900].forEach((f,i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.07), i * 80));
}

// Ambient drone (low volume background)
let ambDrone = null;
function startAmbientDrone() {
    if (ambDrone) return;
    const a = ac();
    const o1 = a.createOscillator(), o2 = a.createOscillator();
    const g = a.createGain();
    o1.type = 'sine'; o1.frequency.value = 55;
    o2.type = 'sine'; o2.frequency.value = 82.5;
    o1.connect(g); o2.connect(g); g.connect(a.destination);
    g.gain.value = 0.015;
    o1.start(); o2.start();
    ambDrone = { o1, o2, g };
}
function stopAmbientDrone() {
    if (ambDrone) { ambDrone.o1.stop(); ambDrone.o2.stop(); ambDrone = null; }
}

// ============================================================
// INIT
// ============================================================
function initGame() {
    P = { x:0, y:0, vx:0, vy:0, r:14, spd:2.8, hp:100, maxHp:100,
           magnet:80, dmgMult:1, invuln:0 };
    weapons = [{ type:'orbiter', lv:0, timer:0, angle:0 }];
    enemies = []; projs = []; gems = []; parts = []; dmgNums = [];
    lightFx = []; novaFx = []; healthOrbs = []; powerUps = [];
    frame = 0; gt = 0; spawnAcc = 0; nextBoss = 60;
    score = 0; kills = 0; shake = 0; flashAlpha = 0; freezeFrames = 0;
    cam.x = 0; cam.y = 0;
    nextPowerUp = 20; scoreMult = 1; scoreMultTimer = 0;
    combo = 0; comboTimer = 0; maxCombo = 0; lastScore = 0; heartbeatTimer = 0;
}

// ============================================================
// START / RESTART
// ============================================================
function startGame() {
    initGame();
    state = 'play';
    $startScreen.style.display = 'none';
    $gameoverScreen.style.display = 'none';
    $hud.style.display = '';
    $bestScore.textContent = 'BEST: ' + best.toLocaleString();
    startAmbientDrone();
    if (actx && actx.state === 'suspended') actx.resume();
}
document.getElementById('play-btn').onclick = startGame;
document.getElementById('retry-btn').onclick = startGame;

// ============================================================
// PLAYER UPDATE
// ============================================================
function updatePlayer() {
    // Movement input
    let mx = 0, my = 0;
    if (keys['w'] || keys['arrowup'])    my -= 1;
    if (keys['s'] || keys['arrowdown'])  my += 1;
    if (keys['a'] || keys['arrowleft'])  mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;
    if (joy.active) { mx = joy.dx; my = joy.dy; }

    let len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }

    P.vx = lerp(P.vx, mx * P.spd, 0.2);
    P.vy = lerp(P.vy, my * P.spd, 0.2);
    P.x += P.vx; P.y += P.vy;

    // Invulnerability countdown
    if (P.invuln > 0) P.invuln--;

    // Camera smooth follow
    cam.x = lerp(cam.x, P.x - W/2, 0.08);
    cam.y = lerp(cam.y, P.y - H/2, 0.08);
}

// ============================================================
// WEAPON SYSTEM
// ============================================================
function updateWeapons() {
    for (const w of weapons) {
        const def = WDEFS[w.type];
        const lv = w.lv;

        switch (w.type) {
            case 'orbiter':
                w.angle += def.spd[lv];
                // Damage check handled in collision section
                break;

            case 'bolt':
                w.timer--;
                if (w.timer <= 0) {
                    w.timer = def.cd[lv];
                    const cnt = def.cnt[lv];
                    // Find nearest enemies
                    let nearest = findNearest(enemies, P, cnt);
                    for (let i = 0; i < nearest.length; i++) {
                        let e = nearest[i];
                        let a = Math.atan2(e.y - P.y, e.x - P.x);
                        projs.push({ x:P.x, y:P.y, vx:Math.cos(a)*def.spd[lv], vy:Math.sin(a)*def.spd[lv],
                            dmg: def.dmg[lv] * P.dmgMult, r:5, col:def.col, life:80, pierce: lv >= 2 ? (lv >= 4 ? 2 : 1) : 0, type:'bolt' });
                    }
                    if (sorted.length > 0) sndHit();
                }
                break;

            case 'nova':
                w.timer--;
                if (w.timer <= 0) {
                    w.timer = def.cd[lv];
                    const rad = def.rad[lv];
                    const dmg = def.dmg[lv] * P.dmgMult;
                    novaFx.push({ x:P.x, y:P.y, r:0, maxR:rad, col:def.col });
                    sndNova();
                    // Damage all enemies in radius
                    for (const e of enemies) {
                        if (dist(e, P) < rad + e.r) {
                            damageEnemy(e, dmg);
                        }
                    }
                    // If level >= 3, double pulse
                    if (lv >= 3) {
                        setTimeout(() => {
                            novaFx.push({ x:P.x, y:P.y, r:0, maxR:rad*0.7, col:def.col });
                            for (const e of enemies) {
                                if (dist(e, P) < rad*0.7 + e.r) damageEnemy(e, dmg * 0.5);
                            }
                        }, 200);
                    }
                }
                break;

            case 'lightning':
                w.timer--;
                if (w.timer <= 0 && enemies.length > 0) {
                    w.timer = def.cd[lv];
                    const chains = def.chains[lv];
                    const dmg = def.dmg[lv] * P.dmgMult;
                    // Start from nearest enemy to player
                    let hit = new Set();
                    let current = { x: P.x, y: P.y };
                    let chain = [];
                    chain.push({ x: P.x, y: P.y });
                    for (let i = 0; i < chains; i++) {
                        let best = null, bestD = 300;
                        for (const e of enemies) {
                            if (hit.has(e)) continue;
                            let d = dist(e, current);
                            if (d < bestD) { bestD = d; best = e; }
                        }
                        if (!best) break;
                        hit.add(best);
                        damageEnemy(best, dmg);
                        chain.push({ x: best.x, y: best.y });
                        current = best;
                    }
                    if (chain.length > 1) {
                        lightFx.push({ points: chain, life: 15, col: def.col });
                        sndZap();
                    }
                }
                break;

            case 'missile':
                w.timer--;
                if (w.timer <= 0 && enemies.length > 0) {
                    w.timer = def.cd[lv];
                    const cnt = def.cnt[lv];
                    let nearest = findNearest(enemies, P, cnt);
                    for (let i = 0; i < cnt; i++) {
                        let target = nearest[i % nearest.length];
                        let a = rand(0, TAU);
                        projs.push({ x:P.x, y:P.y, vx:Math.cos(a)*2, vy:Math.sin(a)*2, target,
                            dmg: def.dmg[lv] * P.dmgMult, r:6, col:def.col, life:180, spd:def.spd[lv], type:'missile' });
                    }
                }
                break;
        }
    }
}

// ============================================================
// ENEMY SPAWNING
// ============================================================
function spawnEnemy(type) {
    const def = EDEFS[type];
    const timeScale = 1 + gt / 120;
    const a = rand(0, TAU);
    const d = Math.max(W, H) / 2 + 80;
    enemies.push({
        x: P.x + Math.cos(a) * d,
        y: P.y + Math.sin(a) * d,
        hp: def.hp * timeScale,
        maxHp: def.hp * timeScale,
        spd: def.spd * (1 + gt / 250),
        r: def.r, dmg: def.dmg * (1 + gt / 300), xp: def.xp,
        col: def.col, type, hit: 0
    });
}

function updateSpawning(dt) {
    // Spawn rate increases over time
    let rate = 0.8 + gt / 40;
    spawnAcc += rate * dt;

    // Cap max enemies for performance
    if (enemies.length >= 150) spawnAcc = 0;

    while (spawnAcc >= 1) {
        spawnAcc -= 1;
        // Pick enemy type based on time
        let roll = rand(0, 1);
        if (gt < 30) {
            spawnEnemy('walker');
        } else if (gt < 60) {
            spawnEnemy(roll < 0.6 ? 'walker' : 'sprinter');
        } else if (gt < 120) {
            if (roll < 0.4) spawnEnemy('walker');
            else if (roll < 0.7) spawnEnemy('sprinter');
            else if (roll < 0.9) spawnEnemy('brute');
            else spawnEnemy('exploder');
        } else {
            if (roll < 0.25) spawnEnemy('walker');
            else if (roll < 0.45) spawnEnemy('sprinter');
            else if (roll < 0.65) spawnEnemy('brute');
            else if (roll < 0.85) spawnEnemy('exploder');
            else { spawnEnemy('brute'); spawnEnemy('sprinter'); }
        }
    }

    // Boss spawn
    if (gt >= nextBoss) {
        spawnEnemy('boss');
        sndBoss();
        shake = 25;
        $bossWarn.style.display = '';
        setTimeout(() => { $bossWarn.style.display = 'none'; }, 2000);
        nextBoss += Math.max(30, 60 - Math.floor(gt / 30)); // bosses come faster over time
    }

    // Health orb spawning — every 25-40 seconds, more often when low HP
    let hpRatio = P.hp / P.maxHp;
    let healthInterval = hpRatio < 0.3 ? 18 : (hpRatio < 0.5 ? 28 : 38);
    if (gt > 10 && Math.floor((gt - dt) / healthInterval) < Math.floor(gt / healthInterval)) {
        spawnHealthOrb();
    }
}

// ============================================================
// ENEMY UPDATE
// ============================================================
function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        // Move toward player
        let dx = P.x - e.x, dy = P.y - e.y;
        let d = Math.hypot(dx, dy);
        if (d > 1) { e.x += dx / d * e.spd; e.y += dy / d * e.spd; }

        // Hit flash
        if (e.hit > 0) e.hit--;

        // Damage player on contact
        if (d < e.r + P.r && P.invuln <= 0) {
            P.hp -= e.dmg;
            P.invuln = 30;
            shake = 10;
            flashAlpha = 0.3;
            sndHurt();
            combo = 0; // reset combo on hit
            // Knockback
            if (d > 0) { P.vx -= dx/d * 5; P.vy -= dy/d * 5; }
            // Spawn hurt particles
            for (let j = 0; j < 4; j++) {
                let a = rand(0, TAU);
                parts.push({ x:P.x, y:P.y, vx:Math.cos(a)*rand(2,5), vy:Math.sin(a)*rand(2,5), life:25, col:'#ef4444', r:3 });
            }
            if (P.hp <= 0) { die(); return; }
        }

        // Cull far enemies
        if (dist(e, P) > 1200) { enemies.splice(i, 1); continue; }

        // Death check
        if (e.hp <= 0) {
            onEnemyDeath(e);
            enemies.splice(i, 1);
        }
    }
}

// ============================================================
// DAMAGE & DEATH
// ============================================================
function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hit = 6;
    // Damage number
    dmgNums.push({ x: e.x + rand(-10,10), y: e.y - e.r, val: Math.round(dmg), life: 40, col: '#fff' });
    // Hit particle
    let _ha = rand(0, TAU);
    parts.push({ x:e.x, y:e.y, vx:Math.cos(_ha)*rand(1,3), vy:Math.sin(_ha)*rand(1,3), life:15, col:e.col, r:2 });
}

function onEnemyDeath(e) {
    kills++;
    combo++;
    comboTimer = 180; // 3 seconds to maintain combo
    if (combo > maxCombo) maxCombo = combo;
    let comboBonus = Math.min(combo, 30);
    score += (e.xp * 10 + comboBonus) * scoreMult;
    if (combo > 2) sndCombo(combo);
    sndKill();

    // Death particles (reduced for perf)
    let count = e.type === 'boss' ? 20 : 6;
    for (let i = 0; i < count; i++) {
        let a = rand(0, TAU), spd = rand(1, e.type === 'boss' ? 7 : 4);
        parts.push({ x:e.x, y:e.y, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd, life:rand(20,40), col:e.col, r:rand(2,5) });
    }

    // Exploder: AoE damage to nearby enemies
    if (e.type === 'exploder') {
        shake = 8;
        novaFx.push({ x:e.x, y:e.y, r:0, maxR:80, col:e.col });
        for (const other of enemies) {
            if (other !== e && dist(other, e) < 80) damageEnemy(other, 30);
        }
    }

    // Boss death: extra effects
    if (e.type === 'boss') {
        shake = 20;
        freezeFrames = 8;
        flashAlpha = 0.5;
    }

    // Drop XP gems
    let gemCount = e.type === 'boss' ? 15 : (e.xp >= 3 ? 3 : 1);
    for (let i = 0; i < gemCount; i++) {
        let a = rand(0, TAU), d = rand(5, 20);
        gems.push({ x:e.x + Math.cos(a)*d, y:e.y + Math.sin(a)*d, xp:Math.ceil(e.xp/gemCount), r:4, pulse:rand(0,TAU) });
    }

    // Chance to drop health orb (brutes 15%, bosses 100%, others 3%)
    let hpDropChance = e.type === 'boss' ? 1 : (e.type === 'brute' ? 0.15 : (e.type === 'exploder' ? 0.06 : 0.03));
    if (Math.random() < hpDropChance) {
        let a = rand(0, TAU), d = rand(5, 15);
        let healAmt = e.type === 'boss' ? 40 : (e.type === 'brute' ? 25 : 15);
        healthOrbs.push({ x:e.x+Math.cos(a)*d, y:e.y+Math.sin(a)*d, heal:healAmt, r:7, pulse:rand(0,TAU), life:900 });
    }
}

// ============================================================
// PROJECTILE UPDATE
// ============================================================
function updateProjectiles() {
    for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        p.life--;
        if (p.life <= 0) { projs.splice(i, 1); continue; }

        if (p.type === 'missile' && p.target) {
            // Homing
            let t = p.target;
            if (t.hp <= 0 || !enemies.includes(t)) {
                // Find new target
                t = enemies.length > 0 ? enemies.reduce((a,b) => dist(a,p) < dist(b,p) ? a : b) : null;
                p.target = t;
            }
            if (t) {
                let a = Math.atan2(t.y - p.y, t.x - p.x);
                let ca = Math.atan2(p.vy, p.vx);
                let da = a - ca;
                while (da > PI) da -= TAU; while (da < -PI) da += TAU;
                ca += da * 0.08; // turn rate
                let sp = p.spd;
                p.vx = Math.cos(ca) * sp;
                p.vy = Math.sin(ca) * sp;
            }
        }

        p.x += p.vx; p.y += p.vy;

        // Trail particles for missiles
        if (p.type === 'missile' && frame % 2 === 0) {
            parts.push({ x:p.x, y:p.y, vx:rand(-0.5,0.5), vy:rand(-0.5,0.5), life:12, col:p.col, r:2 });
        }

        // Hit enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (dist(p, e) < p.r + e.r) {
                damageEnemy(e, p.dmg);
                sndHit();
                if (p.pierce > 0) {
                    p.pierce--;
                    p.dmg *= 0.7; // reduced damage on pierce
                } else {
                    projs.splice(i, 1);
                    break;
                }
            }
        }
    }
}

// ============================================================
// ORBITER COLLISION
// ============================================================
function checkOrbiters() {
    for (const w of weapons) {
        if (w.type !== 'orbiter') continue;
        const def = WDEFS.orbiter;
        const lv = w.lv;
        const cnt = def.cnt[lv];
        const rad = def.rad[lv];
        const dmg = def.dmg[lv] * P.dmgMult;

        for (let i = 0; i < cnt; i++) {
            let a = w.angle + (TAU / cnt) * i;
            let bx = P.x + Math.cos(a) * rad;
            let by = P.y + Math.sin(a) * rad;

            for (const e of enemies) {
                if (Math.hypot(bx - e.x, by - e.y) < 12 + e.r) {
                    // Only damage every 10 frames to prevent instant kill
                    if (!e._orbHit || frame - e._orbHit > 10) {
                        damageEnemy(e, dmg);
                        e._orbHit = frame;
                        // Spark effect
                        for (let j = 0; j < 2; j++) {
                            let pa = rand(0, TAU);
                            parts.push({ x:bx, y:by, vx:Math.cos(pa)*rand(2,4), vy:Math.sin(pa)*rand(2,4), life:10, col:def.col, r:2 });
                        }
                    }
                }
            }
        }
    }
}

// ============================================================
// XP GEMS
// ============================================================
function updateGems() {
    for (let i = gems.length - 1; i >= 0; i--) {
        const g = gems[i];
        g.pulse += 0.1;
        let d = dist(g, P);

        // Magnet pull
        if (d < P.magnet) {
            let pull = (1 - d / P.magnet) * 6;
            let a = Math.atan2(P.y - g.y, P.x - g.x);
            g.x += Math.cos(a) * pull;
            g.y += Math.sin(a) * pull;
        }

        // Collect
        if (d < P.r + g.r) {
            score += g.xp * 10 * scoreMult;
            sndXP();
            gems.splice(i, 1);

            // Sparkle
            for (let j = 0; j < 2; j++) {
                let a = rand(0, TAU);
                parts.push({ x:g.x, y:g.y, vx:Math.cos(a)*rand(1,3), vy:Math.sin(a)*rand(1,3), life:15, col:'#34d399', r:2 });
            }
        }
    }
}

// ============================================================
// HEALTH ORBS
// ============================================================
function spawnHealthOrb() {
    // Spawn at random position near the edge of screen, closer to player
    let a = rand(0, TAU);
    let d = rand(200, 400);
    healthOrbs.push({
        x: P.x + Math.cos(a) * d,
        y: P.y + Math.sin(a) * d,
        heal: 15 + Math.floor(gt / 30),
        r: 8, pulse: rand(0, TAU), life: 600 // 10 seconds at 60fps
    });
}

const sndHeal = () => {
    playTone(500, 0.12, 'sine', 0.06, 700);
    setTimeout(() => playTone(700, 0.15, 'sine', 0.05, 900), 60);
};

function updateHealthOrbs() {
    for (let i = healthOrbs.length - 1; i >= 0; i--) {
        const h = healthOrbs[i];
        h.pulse += 0.08;
        h.life--;

        // Expire
        if (h.life <= 0) {
            // Fade-out particles
            for (let j = 0; j < 3; j++) {
                let a = rand(0, TAU);
                parts.push({ x:h.x, y:h.y, vx:Math.cos(a)*rand(0.5,2), vy:Math.sin(a)*rand(0.5,2)-1, life:18, col:'#ef4444', r:2 });
            }
            healthOrbs.splice(i, 1);
            continue;
        }

        let d = dist(h, P);

        // Magnet pull (slightly less range than XP gems)
        if (d < P.magnet * 0.6) {
            let pull = (1 - d / (P.magnet * 0.6)) * 4;
            let a = Math.atan2(P.y - h.y, P.x - h.x);
            h.x += Math.cos(a) * pull;
            h.y += Math.sin(a) * pull;
        }

        // Collect
        if (d < P.r + h.r) {
            let healed = Math.min(h.heal, P.maxHp - P.hp);
            P.hp = Math.min(P.hp + h.heal, P.maxHp);
            sndHeal();
            healthOrbs.splice(i, 1);

            // Heal number
            dmgNums.push({ x:P.x, y:P.y - P.r - 10, val: '+' + Math.round(healed > 0 ? healed : h.heal), life:50, col:'#34d399', isHeal:true });

            // Green heal particles
            for (let j = 0; j < 6; j++) {
                let a = rand(0, TAU);
                parts.push({ x:P.x, y:P.y, vx:Math.cos(a)*rand(1,4), vy:Math.sin(a)*rand(1,4), life:22, col:'#ef4444', r:2.5 });
            }
            // Flash green briefly
            flashAlpha = 0.15;
        }
    }
}

function drawHealthOrbs() {
    for (const h of healthOrbs) {
        let sx = h.x - cam.x, sy = h.y - cam.y;
        if (sx < -20 || sx > W+20 || sy < -20 || sy > H+20) continue;

        let pulse = 1 + Math.sin(h.pulse) * 0.15;
        let r = h.r * pulse;
        let dying = h.life < 120; // flash when about to expire
        if (dying && Math.floor(h.life / 6) % 2 === 0) continue;

        // Ground glow — simple
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(sx, sy, r * 3, 0, TAU); ctx.fill();
        ctx.restore();

        ctx.save();

        // Outer circle
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();

        // Inner bright
        ctx.fillStyle = '#fca5a5';
        ctx.beginPath(); ctx.arc(sx, sy, r*0.7, 0, TAU); ctx.fill();

        // White cross
        ctx.fillStyle = '#fff';
        let cw = r * 0.35, ch = r * 0.9;
        ctx.fillRect(sx - cw/2, sy - ch/2, cw, ch);
        ctx.fillRect(sx - ch/2, sy - cw/2, ch, cw);

        // Floating + text above
        ctx.globalAlpha = 0.6 + Math.sin(h.pulse * 1.5) * 0.3;
        ctx.font = "bold 10px 'Orbitron', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fca5a5';
        ctx.fillText('+' + h.heal, sx, sy - r - 6);

        ctx.restore();
    }
}

// ============================================================
// POWER-UPS (spawn on map, collect by walking over)
// ============================================================
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        let j = randInt(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

const sndPowerUp = () => {
    [500,650,800,1000].forEach((f,i) => setTimeout(() => playTone(f, 0.12, 'sine', 0.07), i * 60));
};

function generatePowerUpItem() {
    let pool = [];

    // New weapons (weighted higher)
    let owned = new Set(weapons.map(w => w.type));
    for (let key in WDEFS) {
        if (!owned.has(key)) {
            const def = WDEFS[key];
            pool.push({ kind:'new', weapon:key, label:def.name, icon:def.icon, col:def.col, rarity:'epic' });
            pool.push({ kind:'new', weapon:key, label:def.name, icon:def.icon, col:def.col, rarity:'epic' });
        }
    }

    // Upgrade existing weapons
    for (const w of weapons) {
        if (w.lv < 4) {
            const def = WDEFS[w.type];
            pool.push({ kind:'upgrade', weapon:w.type, label:def.name+' ↑', icon:def.icon, col:def.col, rarity:'rare' });
        }
    }

    // Stat boosts
    pool.push({ kind:'stat', stat:'maxHp', label:'+HP', icon:'❤', col:'#ef4444', rarity:'common' });
    pool.push({ kind:'stat', stat:'spd', label:'+SPD', icon:'⚡', col:'#38bdf8', rarity:'common' });
    pool.push({ kind:'stat', stat:'dmgMult', label:'+DMG', icon:'💪', col:'#f97316', rarity:'common' });
    pool.push({ kind:'stat', stat:'magnet', label:'+MAG', icon:'🧲', col:'#a855f7', rarity:'common' });

    // Score multiplier
    pool.push({ kind:'score', label:'x2 PTS', icon:'💰', col:'#fbbf24', rarity:'rare' });

    shuffle(pool);
    return pool[0];
}

function spawnPowerUp() {
    let item = generatePowerUpItem();
    let a = rand(0, TAU);
    let d = rand(180, 380);
    powerUps.push({
        ...item,
        x: P.x + Math.cos(a) * d,
        y: P.y + Math.sin(a) * d,
        r: 16, pulse: rand(0, TAU),
        life: 1200, maxLife: 1200,
        bobY: 0
    });
}

function applyPowerUp(pu) {
    if (pu.kind === 'new') {
        weapons.push({ type:pu.weapon, lv:0, timer:0, angle:0 });
    } else if (pu.kind === 'upgrade') {
        const w = weapons.find(w => w.type === pu.weapon);
        if (w) w.lv++;
    } else if (pu.kind === 'stat') {
        switch(pu.stat) {
            case 'maxHp': P.maxHp += 15; P.hp = Math.min(P.hp + 15, P.maxHp); break;
            case 'spd': P.spd *= 1.06; break;
            case 'dmgMult': P.dmgMult *= 1.05; break;
            case 'magnet': P.magnet *= 1.15; break;
        }
    } else if (pu.kind === 'score') {
        scoreMult = 2;
        scoreMultTimer = 900; // 15 seconds
    }
    score += 100 * scoreMult;
}

function updatePowerUps() {
    // Spawn timer
    if (gt >= nextPowerUp) {
        spawnPowerUp();
        nextPowerUp = gt + rand(20, 35);
    }

    // Score multiplier timer
    if (scoreMultTimer > 0) {
        scoreMultTimer--;
        if (scoreMultTimer <= 0) scoreMult = 1;
    }

    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        pu.pulse += 0.06;
        pu.bobY = Math.sin(pu.pulse * 1.5) * 6;
        pu.life--;

        // Expire
        if (pu.life <= 0) {
            for (let j = 0; j < 4; j++) {
                let a = rand(0, TAU);
                parts.push({ x:pu.x, y:pu.y, vx:Math.cos(a)*rand(1,3), vy:Math.sin(a)*rand(1,3)-1, life:20, col:pu.col, r:3 });
            }
            powerUps.splice(i, 1);
            continue;
        }

        // Collect on contact
        let d = dist(pu, P);
        if (d < P.r + pu.r + 4) {
            applyPowerUp(pu);
            sndPowerUp();
            flashAlpha = 0.25;
            powerUps.splice(i, 1);

            // Collect burst particles
            for (let j = 0; j < 8; j++) {
                let a = rand(0, TAU);
                parts.push({ x:pu.x, y:pu.y, vx:Math.cos(a)*rand(2,6), vy:Math.sin(a)*rand(2,6), life:28, col:pu.col, r:rand(2,4) });
            }
            // Show label
            dmgNums.push({ x:P.x, y:P.y - P.r - 20, val:pu.label, life:60, col:pu.col, isHeal:true });
        }
    }
}

function drawPowerUps() {
    for (const pu of powerUps) {
        let sx = pu.x - cam.x, sy = pu.y - cam.y + pu.bobY;
        if (sx < -40 || sx > W+40 || sy < -40 || sy > H+40) continue;

        let dying = pu.life < 180;
        if (dying && Math.floor(pu.life / 8) % 2 === 0) continue;

        let pulse = 1 + Math.sin(pu.pulse) * 0.12;
        let r = pu.r * pulse;

        ctx.save();

        // Ground ring
        ctx.globalAlpha = 0.15 + Math.sin(pu.pulse) * 0.05;
        ctx.strokeStyle = pu.col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sx, pu.y - cam.y + 12, r * 1.8, r * 0.6, 0, 0, TAU);
        ctx.stroke();

        // Ground glow — simple circle
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = pu.col;
        ctx.beginPath(); ctx.arc(sx, sy, r * 2.5, 0, TAU); ctx.fill();

        // Light beam upward
        ctx.globalAlpha = 0.06 + Math.sin(pu.pulse * 2) * 0.03;
        ctx.fillStyle = pu.col;
        ctx.beginPath();
        ctx.moveTo(sx - 3, sy - 60);
        ctx.lineTo(sx + 3, sy - 60);
        ctx.lineTo(sx + r * 0.8, sy + 8);
        ctx.lineTo(sx - r * 0.8, sy + 8);
        ctx.fill();

        // Main orb
        ctx.globalAlpha = 1;

        ctx.fillStyle = pu.col;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();

        // Inner bright core
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx - 2, sy - 2, r * 0.4, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;

        // Icon
        ctx.shadowBlur = 0;
        ctx.font = `${Math.round(r * 1.1)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pu.icon, sx, sy);

        // Label below
        ctx.font = "bold 9px 'Orbitron', sans-serif";
        ctx.fillStyle = pu.col;
        ctx.globalAlpha = 0.8;
        ctx.fillText(pu.label, sx, sy + r + 14);

        // Epic rarity sparkles
        if (pu.rarity === 'epic') {
            ctx.globalAlpha = 0.3 + Math.sin(pu.pulse * 3) * 0.2;
            for (let i = 0; i < 4; i++) {
                let sa = pu.pulse + (TAU / 4) * i;
                let sr = r * 1.5;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(sx + Math.cos(sa) * sr, sy + Math.sin(sa) * sr, 1.5, 0, TAU);
                ctx.fill();
            }
        }

        ctx.restore();
    }
}

// ============================================================
// PARTICLES, EFFECTS
// ============================================================
function updateParticles() {
    for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.95; p.vy *= 0.95;
        p.life--;
        if (p.life <= 0) parts.splice(i, 1);
    }
    // Limit particle count
    if (parts.length > 200) parts.splice(0, parts.length - 200);
}

function updateDmgNums() {
    for (let i = dmgNums.length - 1; i >= 0; i--) {
        const d = dmgNums[i];
        d.y -= 1.2;
        d.life--;
        if (d.life <= 0) dmgNums.splice(i, 1);
    }
}

function updateNovaFx() {
    for (let i = novaFx.length - 1; i >= 0; i--) {
        const n = novaFx[i];
        n.r += (n.maxR - n.r) * 0.15 + 2;
        if (n.r >= n.maxR) novaFx.splice(i, 1);
    }
}

function updateLightFx() {
    for (let i = lightFx.length - 1; i >= 0; i--) {
        lightFx[i].life--;
        if (lightFx[i].life <= 0) lightFx.splice(i, 1);
    }
}

// ============================================================
// DEATH
// ============================================================
function die() {
    state = 'dead';
    P.hp = 0;
    shake = 25;
    freezeFrames = 15;
    sndDeath();
    stopAmbientDrone();

    // Death explosion
    for (let i = 0; i < 20; i++) {
        let a = rand(0, TAU), spd = rand(1, 8);
        parts.push({ x:P.x, y:P.y, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
            life:rand(30, 60), col:['#22d3ee','#f472b6','#fbbf24','#a78bfa','#ef4444'][randInt(0,4)], r:rand(2,6) });
    }

    // Record best
    let isNewBest = false;
    if (score > best) { best = score; localStorage.setItem('ns_best', best); isNewBest = true; }

    // Show game over after freeze frames
    setTimeout(() => {
        $hud.style.display = 'none';
        $gameoverScreen.style.display = '';
        let min = Math.floor(gt / 60), sec = Math.floor(gt % 60);
        $finalStats.innerHTML = `
            <div class="stat-row"><span class="stat-label">SCORE</span><span class="stat-value ${isNewBest?'new-best':''}" style="font-size:22px">${score.toLocaleString()}${isNewBest?' ★ NEW BEST':''}</span></div>
            <div class="stat-row"><span class="stat-label">Time Survived</span><span class="stat-value">${min}:${String(sec).padStart(2,'0')}</span></div>
            <div class="stat-row"><span class="stat-label">Enemies Killed</span><span class="stat-value">${kills}</span></div>
            <div class="stat-row"><span class="stat-label">Max Combo</span><span class="stat-value">${maxCombo}x</span></div>
            <div class="stat-row"><span class="stat-label">Best Score</span><span class="stat-value">${best.toLocaleString()}</span></div>
        `;
    }, 800);
}

// ============================================================
// DRAWING
// ============================================================
function drawGrid() {
    const GRID = 50;
    let sx = ((-cam.x % GRID) + GRID) % GRID;
    let sy = ((-cam.y % GRID) + GRID) % GRID;

    // Main grid — subtle
    ctx.strokeStyle = 'rgba(34,211,238,0.04)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = sx; x < W; x += GRID) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = sy; y < H; y += GRID) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Major grid lines every 4 cells
    const MAJ = GRID * 4;
    let mx = ((-cam.x % MAJ) + MAJ) % MAJ;
    let my = ((-cam.y % MAJ) + MAJ) % MAJ;
    ctx.strokeStyle = 'rgba(34,211,238,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = mx; x < W; x += MAJ) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = my; y < H; y += MAJ) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Grid glow near player
    let px = P.x - cam.x, py = P.y - cam.y;
    let grad = ctx.createRadialGradient(px, py, 0, px, py, 160);
    grad.addColorStop(0, 'rgba(34,211,238,0.06)');
    grad.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - 160, py - 160, 320, 320);
}

function drawPlayer() {
    let sx = P.x - cam.x, sy = P.y - cam.y;

    // Invuln flash
    if (P.invuln > 0 && Math.floor(P.invuln / 3) % 2 === 0) return;

    let speed = Math.hypot(P.vx, P.vy);
    let angle = Math.atan2(P.vy, P.vx);

    // Engine trail
    if (speed > 0.5) {
        ctx.save();
        let trailLen = speed * 6;
        let tx = sx - Math.cos(angle) * trailLen;
        let ty = sy - Math.sin(angle) * trailLen;
        let grad = ctx.createLinearGradient(sx, sy, tx, ty);
        grad.addColorStop(0, 'rgba(34,211,238,0.3)');
        grad.addColorStop(0.4, 'rgba(139,92,246,0.15)');
        grad.addColorStop(1, 'rgba(139,92,246,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = P.r * 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.restore();
    }

    // Outer energy ring
    ctx.save();
    ctx.globalAlpha = 0.12 + Math.sin(frame*0.08)*0.05;
    let ringR = P.r + 8 + Math.sin(frame*0.12)*3;
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 15;
    ctx.beginPath(); ctx.arc(sx, sy, ringR, 0, TAU); ctx.stroke();
    ctx.restore();

    // Speed aura
    if (speed > 1) {
        ctx.save();
        let aGrad = ctx.createRadialGradient(sx, sy, P.r, sx, sy, P.r + 18);
        aGrad.addColorStop(0, 'rgba(34,211,238,0.15)');
        aGrad.addColorStop(1, 'rgba(34,211,238,0)');
        ctx.fillStyle = aGrad;
        ctx.beginPath(); ctx.arc(sx, sy, P.r + 18, 0, TAU); ctx.fill();
        ctx.restore();
    }

    // Body glow
    ctx.save();
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 30;
    let bGrad = ctx.createRadialGradient(sx - 3, sy - 3, 0, sx, sy, P.r);
    bGrad.addColorStop(0, '#fff');
    bGrad.addColorStop(0.3, '#67e8f9');
    bGrad.addColorStop(0.6, '#22d3ee');
    bGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = bGrad;
    ctx.beginPath(); ctx.arc(sx, sy, P.r, 0, TAU); ctx.fill();
    // Inner highlight
    ctx.globalAlpha = 0.35;
    let hGrad = ctx.createRadialGradient(sx-3, sy-4, 1, sx, sy, P.r*0.7);
    hGrad.addColorStop(0, '#fff');
    hGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = hGrad;
    ctx.beginPath(); ctx.arc(sx, sy, P.r*0.7, 0, TAU); ctx.fill();
    ctx.restore();

    // Eyes (direction indicator)
    ctx.fillStyle = '#060612';
    for (let s = -1; s <= 1; s += 2) {
        let ex = sx + Math.cos(angle + s * 0.4) * 6;
        let ey = sy + Math.sin(angle + s * 0.4) * 6;
        ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, TAU); ctx.fill();
        // Eye highlight
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(ex + 0.8, ey - 0.8, 1, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#060612';
    }
}

function drawOrbiters() {
    for (const w of weapons) {
        if (w.type !== 'orbiter') continue;
        const def = WDEFS.orbiter;
        const lv = w.lv;
        const cnt = def.cnt[lv];
        const rad = def.rad[lv];

        // Draw orbit path
        let px = P.x - cam.x, py = P.y - cam.y;
        ctx.save();
        ctx.globalAlpha = 0.06;
        ctx.strokeStyle = def.col;
        ctx.lineWidth = 1;
        ctx.setLineDash([4,6]);
        ctx.beginPath(); ctx.arc(px, py, rad, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        for (let i = 0; i < cnt; i++) {
            let a = w.angle + (TAU / cnt) * i;
            let bx = P.x + Math.cos(a) * rad - cam.x;
            let by = P.y + Math.sin(a) * rad - cam.y;

            // Blade trail
            ctx.save();
            ctx.globalAlpha = 0.15;
            let prevA = a - def.spd[lv] * 5;
            let pbx = P.x + Math.cos(prevA) * rad - cam.x;
            let pby = P.y + Math.sin(prevA) * rad - cam.y;
            ctx.strokeStyle = def.col;
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(pbx, pby); ctx.lineTo(bx, by); ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(a + frame * 0.15);
            ctx.shadowColor = def.col;
            ctx.shadowBlur = 18;
            // Blade glow
            ctx.fillStyle = def.col;
            ctx.beginPath();
            ctx.moveTo(0, -12);
            ctx.lineTo(6, 0);
            ctx.lineTo(0, 12);
            ctx.lineTo(-6, 0);
            ctx.closePath();
            ctx.fill();
            // Bright center
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
            ctx.restore();
        }
    }
}

function drawEnemies() {
    for (const e of enemies) {
        let sx = e.x - cam.x, sy = e.y - cam.y;
        if (sx < -60 || sx > W+60 || sy < -60 || sy > H+60) continue;

        ctx.save();

        let r = e.r;

        // Threat aura for brutes/bosses — simple ring
        if (e.type === 'boss' || e.type === 'brute') {
            ctx.globalAlpha = 0.12;
            ctx.strokeStyle = e.col;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(sx,sy,r*2,0,TAU); ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Hit flash — only boss gets shadowBlur for perf
        if (e.type === 'boss') {
            ctx.shadowColor = e.hit > 0 ? '#fff' : e.col;
            ctx.shadowBlur = e.hit > 0 ? 18 : 8;
        }

        if (e.type === 'boss') r += Math.sin(frame * 0.05) * 3;

        // Body — solid fill (perf optimized)
        ctx.fillStyle = e.hit > 0 ? '#fff' : e.col;
        ctx.beginPath();

        if (e.type === 'sprinter') {
            let a = Math.atan2(P.y - e.y, P.x - e.x);
            ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
            ctx.lineTo(sx + Math.cos(a + 2.3) * r, sy + Math.sin(a + 2.3) * r);
            ctx.lineTo(sx + Math.cos(a - 2.3) * r, sy + Math.sin(a - 2.3) * r);
            ctx.closePath();
        } else if (e.type === 'brute') {
            // Rounded square
            let rr = 3;
            ctx.moveTo(sx-r+rr,sy-r);
            ctx.lineTo(sx+r-rr,sy-r); ctx.arcTo(sx+r,sy-r,sx+r,sy-r+rr,rr);
            ctx.lineTo(sx+r,sy+r-rr); ctx.arcTo(sx+r,sy+r,sx+r-rr,sy+r,rr);
            ctx.lineTo(sx-r+rr,sy+r); ctx.arcTo(sx-r,sy+r,sx-r,sy+r-rr,rr);
            ctx.lineTo(sx-r,sy-r+rr); ctx.arcTo(sx-r,sy-r,sx-r+rr,sy-r,rr);
            ctx.closePath();
        } else if (e.type === 'exploder') {
            for (let j = 0; j < 8; j++) {
                let a = (TAU / 8) * j + frame * 0.04;
                let rr = j % 2 === 0 ? r : r * 0.55;
                if (j === 0) ctx.moveTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
                else ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
            }
            ctx.closePath();
        } else if (e.type === 'boss') {
            for (let j = 0; j < 8; j++) {
                let a = (TAU / 8) * j + frame*0.008;
                if (j === 0) ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
                else ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
            }
            ctx.closePath();
        } else {
            ctx.arc(sx, sy, r, 0, TAU);
        }
        ctx.fill();

        // Inner highlight — simple dot
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx - r*0.2, sy - r*0.2, r*0.3, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;

        // Eyes for walker and sprinter
        if (e.type === 'walker' || e.type === 'sprinter') {
            let ea = Math.atan2(P.y-e.y, P.x-e.x);
            ctx.fillStyle = '#fff';
            for (let s = -1; s <= 1; s += 2) {
                let ex = sx + Math.cos(ea + s*0.5) * r*0.4;
                let ey = sy + Math.sin(ea + s*0.5) * r*0.4;
                ctx.beginPath(); ctx.arc(ex, ey, r*0.18, 0, TAU); ctx.fill();
            }
            ctx.fillStyle = '#000';
            for (let s = -1; s <= 1; s += 2) {
                let ex = sx + Math.cos(ea + s*0.5) * r*0.5;
                let ey = sy + Math.sin(ea + s*0.5) * r*0.5;
                ctx.beginPath(); ctx.arc(ex, ey, r*0.1, 0, TAU); ctx.fill();
            }
        }

        // Boss: HP bar + rotating ring
        if (e.type === 'boss') {
            // Rotating ring
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = e.col;
            ctx.lineWidth = 2;
            let ba = frame * 0.02;
            ctx.beginPath(); ctx.arc(sx, sy, r+10, ba, ba+PI*1.2); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx, sy, r+10, ba+PI, ba+PI*2.2); ctx.stroke();
            ctx.restore();
            // HP bar
            let bw = 70, bh = 7;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.roundRect(sx - bw/2, sy - r - 18, bw, bh, 3);
            ctx.fill();
            let hpPct = clamp(e.hp/e.maxHp, 0, 1);
            let barCol = hpPct > 0.5 ? e.col : (hpPct > 0.25 ? '#f97316' : '#ef4444');
            ctx.fillStyle = barCol;
            ctx.shadowColor = barCol;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.roundRect(sx - bw/2 + 1, sy - r - 17, (bw-2)*hpPct, bh-2, 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

function drawProjectiles() {
    for (const p of projs) {
        let sx = p.x - cam.x, sy = p.y - cam.y;
        if (sx < -20 || sx > W+20 || sy < -20 || sy > H+20) continue;

        ctx.save();
        ctx.fillStyle = p.col;

        if (p.type === 'missile') {
            let a = Math.atan2(p.vy, p.vx);
            ctx.translate(sx, sy);
            ctx.rotate(a);
            // Engine glow
            ctx.globalAlpha = 0.25;
            let eGrad = ctx.createRadialGradient(-6, 0, 0, -6, 0, 10);
            eGrad.addColorStop(0, p.col);
            eGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = eGrad;
            ctx.beginPath(); ctx.arc(-6, 0, 10, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = p.col;
            ctx.beginPath();
            ctx.moveTo(9, 0);
            ctx.lineTo(-5, -5);
            ctx.lineTo(-3, 0);
            ctx.lineTo(-5, 5);
            ctx.closePath();
            ctx.fill();
            // White tip
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 0.6;
            ctx.beginPath(); ctx.arc(4, 0, 2, 0, TAU); ctx.fill();
        } else {
            // Bolt — elongated towards direction
            let a = Math.atan2(p.vy, p.vx);
            ctx.translate(sx, sy);
            ctx.rotate(a);
            ctx.scale(1.5, 1);
            ctx.beginPath();
            ctx.arc(0, 0, p.r, 0, TAU);
            ctx.fill();
            // Core
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(0, 0, p.r*0.4, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }
}

function drawGems() {
    for (const g of gems) {
        let sx = g.x - cam.x, sy = g.y - cam.y;
        if (sx < -15 || sx > W+15 || sy < -15 || sy > H+15) continue;

        let pulse = 1 + Math.sin(g.pulse) * 0.25;
        let r = g.r * pulse;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(g.pulse * 0.5);

        // Diamond shape
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.moveTo(0, -r*1.2);
        ctx.lineTo(r*0.7, 0);
        ctx.lineTo(0, r*1.2);
        ctx.lineTo(-r*0.7, 0);
        ctx.closePath();
        ctx.fill();

        // Inner bright
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#a7f3d0';
        ctx.beginPath();
        ctx.moveTo(0, -r*0.6);
        ctx.lineTo(r*0.35, 0);
        ctx.lineTo(0, r*0.6);
        ctx.lineTo(-r*0.35, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

function drawParticles() {
    for (const p of parts) {
        let sx = p.x - cam.x, sy = p.y - cam.y;
        if (sx < -10 || sx > W+10 || sy < -10 || sy > H+10) continue;
        let t = p.life / 40;
        let alpha = clamp(t, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(sx, sy, p.r * alpha, 0, TAU);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawDmgNums() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of dmgNums) {
        let sx = d.x - cam.x, sy = d.y - cam.y;
        let t = d.life / 40;
        let alpha = t > 0.8 ? (1-t)/0.2 : (t < 0.3 ? t/0.3 : 1);
        let bounce = t > 0.7 ? 1 + (1-t)*2 : 1;
        let isHeal = d.isHeal;
        let size = isHeal ? 16 : (d.val >= 50 ? 17 : (d.val >= 20 ? 14 : 11));
        let col = isHeal ? '#34d399' : (d.val >= 80 ? '#f472b6' : (d.val >= 50 ? '#fbbf24' : (d.val >= 20 ? '#fde68a' : '#e2e8f0')));
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.font = `bold ${Math.round(size*bounce)}px 'Orbitron', sans-serif`;
        ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 3;
        let text = typeof d.val === 'string' ? d.val : d.val;
        ctx.strokeText(text, sx, sy);
        ctx.fillText(text, sx, sy);
        ctx.restore();
    }
}

function drawLightning() {
    for (const l of lightFx) {
        let alpha = l.life / 15;
        ctx.save();
        // Thick glow layer
        ctx.globalAlpha = alpha * 0.3;
        ctx.strokeStyle = l.col;
        ctx.shadowColor = l.col;
        ctx.shadowBlur = 25;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < l.points.length; i++) {
            let sx = l.points[i].x - cam.x, sy = l.points[i].y - cam.y;
            if (i === 0) ctx.moveTo(sx, sy);
            else {
                let px = l.points[i-1].x - cam.x, py = l.points[i-1].y - cam.y;
                let mx = (px + sx) / 2 + rand(-15, 15), my = (py + sy) / 2 + rand(-15, 15);
                ctx.lineTo(mx, my); ctx.lineTo(sx, sy);
            }
        }
        ctx.stroke();
        // Sharp core layer
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < l.points.length; i++) {
            let sx = l.points[i].x - cam.x, sy = l.points[i].y - cam.y;
            if (i === 0) ctx.moveTo(sx, sy);
            else {
                let px = l.points[i-1].x - cam.x, py = l.points[i-1].y - cam.y;
                let mx = (px + sx) / 2 + rand(-10, 10), my = (py + sy) / 2 + rand(-10, 10);
                ctx.lineTo(mx, my); ctx.lineTo(sx, sy);
            }
        }
        ctx.stroke();
        // Impact circles at each point
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillStyle = l.col;
        for (let i = 1; i < l.points.length; i++) {
            let sx = l.points[i].x - cam.x, sy = l.points[i].y - cam.y;
            ctx.beginPath(); ctx.arc(sx, sy, 8*alpha, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }
}

function drawNovas() {
    for (const n of novaFx) {
        let alpha = 1 - n.r / n.maxR;
        let sx = n.x - cam.x, sy = n.y - cam.y;
        ctx.save();
        // Filled shockwave
        ctx.globalAlpha = alpha * 0.12;
        let nGrad = ctx.createRadialGradient(sx, sy, n.r*0.7, sx, sy, n.r);
        nGrad.addColorStop(0, 'transparent');
        nGrad.addColorStop(1, n.col);
        ctx.fillStyle = nGrad;
        ctx.beginPath(); ctx.arc(sx, sy, n.r, 0, TAU); ctx.fill();
        // Ring
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = n.col;
        ctx.shadowColor = n.col;
        ctx.shadowBlur = 25;
        ctx.lineWidth = 4 * alpha + 1;
        ctx.beginPath(); ctx.arc(sx, sy, n.r, 0, TAU); ctx.stroke();
        // Inner bright ring
        ctx.globalAlpha = alpha * 0.6;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, n.r * 0.7, 0, TAU); ctx.stroke();
        ctx.restore();
    }
}

function drawJoystick() {
    if (!joy.active) return;
    // Base
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(joy.sx, joy.sy, 50, 0, TAU);
    ctx.stroke();
    // Stick
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(joy.sx + joy.dx * 50, joy.sy + joy.dy * 50, 18, 0, TAU);
    ctx.fill();
    ctx.restore();
}

function drawMagnetRange() {
    let px = P.x - cam.x, py = P.y - cam.y;
    ctx.save();
    // Soft gradient instead of dashed line
    let mg = ctx.createRadialGradient(px, py, P.magnet * 0.7, px, py, P.magnet);
    mg.addColorStop(0, 'rgba(52,211,153,0)');
    mg.addColorStop(1, 'rgba(52,211,153,0.04)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(px, py, P.magnet, 0, TAU); ctx.fill();
    // Subtle rotating arcs
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1;
    let ra = frame * 0.01;
    ctx.beginPath(); ctx.arc(px, py, P.magnet, ra, ra + PI*0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, P.magnet, ra + PI, ra + PI*1.6); ctx.stroke();
    ctx.restore();
}

// ============================================================
// HUD UPDATE
// ============================================================
function updateHUD() {
    // HP bar
    let hpPct = Math.max(0, P.hp / P.maxHp * 100);
    $hpBar.style.width = hpPct + '%';
    $hpText.textContent = Math.ceil(P.hp) + ' / ' + P.maxHp;

    // Low HP warning color
    if (hpPct < 25) {
        $hpBar.style.background = 'linear-gradient(90deg,#991b1b,#dc2626,#ef4444)';
        $hpBar.style.animation = 'hpShimmer 0.5s linear infinite';
    } else {
        $hpBar.style.background = '';
        $hpBar.style.animation = '';
    }

    // Score with bump animation
    $score.textContent = score.toLocaleString();
    if (score !== lastScore) {
        $score.classList.add('score-bump');
        setTimeout(() => $score.classList.remove('score-bump'), 150);
        lastScore = score;
    }

    let min = Math.floor(gt / 60), sec = Math.floor(gt % 60);
    $timer.textContent = min + ':' + String(sec).padStart(2, '0');
    $kills.textContent = '💀 ' + kills;

    // Score milestones
    for (let i = scoreMilestones.length - 1; i >= 0; i--) {
        if (score >= scoreMilestones[i]) {
            sndMilestone();
            shake = 8;
            // Floating milestone text
            let el = document.createElement('div');
            el.className = 'score-fly';
            el.style.top = '35%';
            el.style.left = '50%';
            el.style.transform = 'translateX(-50%)';
            el.style.fontSize = '24px';
            el.style.color = '#fbbf24';
            el.textContent = '★ ' + scoreMilestones[i].toLocaleString() + ' POINTS! ★';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 1200);
            scoreMilestones.splice(i, 1);
            break;
        }
    }

    // Score multiplier
    if (scoreMult > 1) {
        $scoreMult.style.display = '';
        $scoreMult.textContent = 'x' + scoreMult + ' SCORE • ' + Math.ceil(scoreMultTimer / 60) + 's';
    } else {
        $scoreMult.style.display = 'none';
    }

    // Combo display
    if (comboTimer > 0) {
        comboTimer--;
        if (comboTimer <= 0) combo = 0;
    }
    if (combo >= 3) {
        $comboDisplay.style.opacity = '1';
        $comboCount.textContent = combo + 'x';
        $comboCount.style.color = combo >= 20 ? '#f472b6' : (combo >= 10 ? '#fbbf24' : '#22d3ee');
        $comboFill.style.width = (comboTimer / 180 * 100) + '%';
    } else {
        $comboDisplay.style.opacity = '0';
    }

    // Heartbeat at low HP
    if (P.hp > 0 && P.hp < P.maxHp * 0.25) {
        heartbeatTimer--;
        if (heartbeatTimer <= 0) {
            sndHeartbeat();
            heartbeatTimer = 50;
        }
    }

    // Weapon icons
    let html = '';
    for (const w of weapons) {
        const def = WDEFS[w.type];
        html += `<div class="weapon-icon" style="border-color:${def.col};box-shadow:0 0 10px ${def.col}33">${def.icon}<span class="wlv">${w.lv+1}</span></div>`;
    }
    $wIcons.innerHTML = html;
}

// ============================================================
// MAIN UPDATE
// ============================================================
function update() {
    if (state !== 'play') return;

    // Freeze frames (hit stop effect)
    if (freezeFrames > 0) { freezeFrames--; return; }

    let dt = 1/60;
    gt += dt;
    frame++;

    updatePlayer();
    updateWeapons();
    updateSpawning(dt);
    updateEnemies();
    updateProjectiles();
    checkOrbiters();
    updateGems();
    updateHealthOrbs();
    updatePowerUps();
    updateParticles();
    updateDmgNums();
    updateNovaFx();
    updateLightFx();

    // Screen shake decay
    shake *= 0.88;
    if (shake < 0.5) shake = 0;

    // Flash decay
    if (flashAlpha > 0) flashAlpha -= 0.02;

    // Update HUD every 3 frames
    if (frame % 3 === 0) updateHUD();
}

// ============================================================
// MAIN RENDER
// ============================================================
function render() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    // Screen shake offset
    ctx.save();
    if (shake > 0.5) {
        ctx.translate(rand(-shake, shake), rand(-shake, shake));
    }

    drawGrid();
    drawMagnetRange();
    drawGems();
    drawNovas();
    drawLightning();
    drawEnemies();
    drawProjectiles();
    drawOrbiters();
    drawParticles();
    drawDmgNums();
    drawPlayer();

    ctx.restore();

    // Joystick overlay (not affected by shake)
    drawJoystick();

    // Damage flash
    if (flashAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = P.hp > 0 ? '#fbbf24' : '#ef4444';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    // Enemy count indicator at edges
    drawEdgeIndicators();
}

function drawEdgeIndicators() {
    // Show arrows pointing to off-screen enemies (bosses only)
    for (const e of enemies) {
        if (e.type !== 'boss') continue;
        let sx = e.x - cam.x, sy = e.y - cam.y;
        if (sx > 20 && sx < W-20 && sy > 20 && sy < H-20) continue;

        let a = Math.atan2(sy - H/2, sx - W/2);
        let ex = W/2 + Math.cos(a) * Math.min(W/2 - 30, H/2 - 30);
        let ey = H/2 + Math.sin(a) * Math.min(W/2 - 30, H/2 - 30);
        ex = clamp(ex, 30, W-30);
        ey = clamp(ey, 30, H-30);

        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = e.col;
        ctx.shadowColor = e.col;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-6, -7);
        ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

// ============================================================
// BACKGROUND STARS + NEBULAE + AMBIENT PARTICLES
// ============================================================
let bgStars = [], nebulae = [], ambientParts = [];
function initBgStars() {
    bgStars = [];
    for (let i = 0; i < 180; i++) {
        let cols = ['#fff','#fff','#fff','#a5b4fc','#c4b5fd','#67e8f9','#fde68a','#fca5a5'];
        bgStars.push({ x:rand(0,1), y:rand(0,1), r:rand(0.4,2.2), a:rand(0.15,0.55),
            speed:rand(0.08,0.4), col:cols[randInt(0,cols.length-1)], twinkle:rand(0,TAU) });
    }
    nebulae = [];
    let nebCols = ['rgba(139,92,246,','rgba(34,211,238,','rgba(244,114,182,','rgba(251,191,36,','rgba(52,211,153,','rgba(99,102,241,'];
    for (let i = 0; i < 8; i++) {
        nebulae.push({ x:rand(0,1), y:rand(0,1), r:rand(200,500), col:nebCols[i%nebCols.length],
            a:rand(0.015,0.04), speed:rand(0.03,0.12), phase:rand(0,TAU) });
    }
    ambientParts = [];
    for (let i = 0; i < 60; i++) {
        ambientParts.push({ x:rand(0,1),y:rand(0,1),spd:rand(0.05,0.2),r:rand(0.5,1.5),a:rand(0.1,0.3),phase:rand(0,TAU)});
    }
}
initBgStars();

function drawBgStars() {
    // Nebulae
    for (const n of nebulae) {
        let x = ((n.x*W*4 - cam.x*n.speed) % W + W) % W;
        let y = ((n.y*H*4 - cam.y*n.speed) % H + H) % H;
        let breathe = 1 + Math.sin(frame*0.005 + n.phase)*0.15;
        let grad = ctx.createRadialGradient(x, y, 0, x, y, n.r*breathe);
        grad.addColorStop(0, n.col+(n.a*1.5)+')');
        grad.addColorStop(0.5, n.col+(n.a*0.5)+')');
        grad.addColorStop(1, n.col+'0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x-n.r*breathe, y-n.r*breathe, n.r*2*breathe, n.r*2*breathe);
    }
    // Stars
    for (const s of bgStars) {
        let x = ((s.x * W * 3 - cam.x * s.speed) % W + W) % W;
        let y = ((s.y * H * 3 - cam.y * s.speed) % H + H) % H;
        s.twinkle += 0.03;
        let alpha = s.a + Math.sin(s.twinkle) * 0.15;
        if (alpha < 0.05) continue;
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, TAU);
        ctx.fill();
        // Cross sparkle for bright stars
        if (s.r > 1.5) {
            ctx.globalAlpha = alpha * 0.3;
            ctx.strokeStyle = s.col;
            ctx.lineWidth = 0.5;
            let cr = s.r * 4;
            ctx.beginPath(); ctx.moveTo(x-cr,y); ctx.lineTo(x+cr,y);
            ctx.moveTo(x,y-cr); ctx.lineTo(x,y+cr); ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
    // Floating dust
    for (const d of ambientParts) {
        let x = ((d.x*W*3 - cam.x*d.spd)%W+W)%W;
        let y = ((d.y*H*3 - cam.y*d.spd)%H+H)%H;
        d.phase += 0.015;
        let a = d.a + Math.sin(d.phase)*0.1;
        ctx.fillStyle = `rgba(167,139,250,${clamp(a,0,0.4)})`;
        ctx.beginPath(); ctx.arc(x, y, d.r, 0, TAU); ctx.fill();
    }
}

// Override render to add bg stars first
const _origRender = render;
function renderFull() {
    ctx.fillStyle = '#060612';
    ctx.fillRect(0, 0, W, H);
    drawBgStars();

    ctx.save();
    if (shake > 0.5) {
        ctx.translate(rand(-shake, shake), rand(-shake, shake));
    }

    drawGrid();
    drawMagnetRange();
    drawPowerUps();
    drawHealthOrbs();
    drawGems();
    drawNovas();
    drawLightning();
    drawEnemies();
    drawProjectiles();
    drawOrbiters();
    drawParticles();
    drawDmgNums();
    drawPlayer();

    ctx.restore();

    drawJoystick();

    // Damage flash
    if (flashAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        // Green flash on heal, orange on hit
        let flashCol = P.hp >= P.maxHp * 0.95 && flashAlpha < 0.2 ? '#34d399' : (P.hp > 0 ? '#fbbf24' : '#ef4444');
        ctx.fillStyle = flashCol;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    // Dynamic vignette — more red when low HP
    if (P.hp > 0) {
        let hpRatio = clamp(P.hp / P.maxHp, 0, 1);
        if (hpRatio < 0.4) {
            ctx.save();
            let vAlpha = (0.4 - hpRatio) * 0.6;
            let vGrad = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.8);
            vGrad.addColorStop(0, 'transparent');
            vGrad.addColorStop(1, `rgba(239,68,68,${vAlpha})`);
            ctx.fillStyle = vGrad;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
    }

    drawEdgeIndicators();

    // Enemy count badge (bottom-left)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.font = "11px 'Orbitron', sans-serif";
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`${enemies.length} enemies`, 16, H - 14);
    ctx.restore();

    // Kill streak effect
    if (kills > 0 && kills % 50 === 0 && frame % 60 < 45) {
        let t = (frame % 60) / 45;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = "bold 32px 'Orbitron', sans-serif";
        let streakCol = kills >= 200 ? '#f472b6' : (kills >= 100 ? '#a78bfa' : '#fbbf24');
        ctx.fillStyle = streakCol;
        ctx.shadowColor = streakCol;
        ctx.shadowBlur = 25;
        ctx.globalAlpha = 1 - t;
        let yOff = -t * 30;
        ctx.fillText(`${kills} KILLS!`, W/2, H/2 + 60 + yOff);
        ctx.restore();
    }
}

// ============================================================
// GAME LOOP
// ============================================================
function gameLoop() {
    update();

    if (state === 'menu') {
        ctx.fillStyle = '#060612';
        ctx.fillRect(0, 0, W, H);
        drawBgStars();
        // Floating demo enemies on menu
        frame++;
    } else if (state === 'play' || state === 'dead') {
        renderFull();
    }

    requestAnimationFrame(gameLoop);
}

// Start loop
initGame();
gameLoop();

'use strict';
// ╔══════════════════════════════════════════════════════════════╗
// ║  NEON SWARM — Vampire Survivors-style auto-battler          ║
// ║  Pure HTML5 Canvas + Vanilla JS — Zero dependencies         ║
// ╚══════════════════════════════════════════════════════════════╝

// ─── CRAZYGAMES SDK ──────────────────────────────────────────
let cgSDK = null;

(async function initCrazyGamesSDK() {
    try {
        if (typeof window.CrazyGames !== 'undefined' && window.CrazyGames.SDK) {
            cgSDK = window.CrazyGames.SDK;
            await cgSDK.init();
            console.log('[CG SDK] Initialized');
            updateDeviceDetection();

            // Listen for SDK pause/resume (e.g. during ads) to mute/unmute audio
            cgSDK.game.addEventListener('pause', () => {
                if (actx && actx.state === 'running') actx.suspend();
            });
            cgSDK.game.addEventListener('resume', () => {
                if (actx && actx.state === 'suspended') actx.resume();
            });
        } else {
            console.warn('[CG SDK] Not available (local/non-CrazyGames environment)');
        }
    } catch (e) {
        console.warn('[CG SDK] Init failed:', e);
    }
})();

// ─── MOBILE DETECTION ────────────────────────────────────────
// Prefer CrazyGames system info if available, fallback to heuristics
let isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
              || ('ontouchstart' in window && innerWidth < 1400)
              || (navigator.maxTouchPoints > 1 && innerWidth < 1400);

// Force mobile for iPhone/iPad regardless of other checks
if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    isMobile = true;
}

// Upgrade detection once CrazyGames SDK is ready
function updateDeviceDetection() {
    if (cgSDK) {
        try {
            const info = cgSDK.system.info;
            if (info && info.device) {
                const sdkMobile = info.device.type === 'mobile' || info.device.type === 'tablet';
                isMobile = sdkMobile || isMobile; // Keep true if either detection says mobile
                console.log('[Mobile Detection] SDK type:', info.device.type, '| isMobile:', isMobile);
            }
        } catch (_) {}
    }
    console.log('[Mobile Detection] Final isMobile:', isMobile, '| UA:', navigator.userAgent.substring(0, 50));
}

// ─── SKIN COLORS ─────────────────────────────────────────────
const SKINS = [
    { name: 'Cyan',   body: '#22d3ee', light: '#67e8f9', dark: '#0284c7', glow: '#22d3ee' },
    { name: 'Pink',   body: '#f472b6', light: '#f9a8d4', dark: '#be185d', glow: '#f472b6' },
    { name: 'Gold',   body: '#fbbf24', light: '#fde68a', dark: '#b45309', glow: '#fbbf24' },
    { name: 'Green',  body: '#34d399', light: '#6ee7b7', dark: '#059669', glow: '#34d399' },
    { name: 'Purple', body: '#a78bfa', light: '#c4b5fd', dark: '#6d28d9', glow: '#a78bfa' },
    { name: 'Red',    body: '#ef4444', light: '#fca5a5', dark: '#991b1b', glow: '#ef4444' },
];
let selectedSkin = +(localStorage.getItem('ns_skin') || 0);
let hasPickedSkin = localStorage.getItem('ns_skinPicked') === '1';

// ─── CONFIG ──────────────────────────────────────────────────
// All tunable game constants in one place for easy balancing.
const CFG = {
    // Player
    PLAYER_RADIUS:     14,
    PLAYER_SPEED:      2.8,
    PLAYER_HP:         100,
    PLAYER_MAGNET:     80,
    INVULN_FRAMES:     30,
    KNOCKBACK_FORCE:   5,
    CAM_LERP:          0.08,

    // Spawning
    BASE_SPAWN_RATE:   0.8,
    SPAWN_RATE_SCALE:  40,      // rate = BASE + gt / this
    MAX_ENEMIES:       isMobile ? 60 : 150,
    ENEMY_CULL_DIST:   isMobile ? 900 : 1200,
    FIRST_BOSS_TIME:   60,
    MIN_BOSS_INTERVAL: 30,

    // Enemy scaling over time
    HP_TIME_SCALE:     120,     // enemy hp  *= 1 + gt / this
    SPD_TIME_SCALE:    250,     // enemy spd *= 1 + gt / this
    DMG_TIME_SCALE:    300,     // enemy dmg *= 1 + gt / this

    // Power-ups
    FIRST_POWERUP:     20,
    POWERUP_MIN_CD:    20,
    POWERUP_MAX_CD:    35,
    POWERUP_LIFETIME:  1200,
    STAT_HP_BONUS:     15,
    STAT_SPD_MULT:     1.06,
    STAT_DMG_MULT:     1.05,
    STAT_MAG_MULT:     1.15,
    SCORE_MULT_DUR:    900,     // 15 seconds at 60 fps

    // Health orbs
    HEALTH_ORB_BASE:   15,
    HEALTH_ORB_SCALE:  30,      // heal = base + gt / this
    HEALTH_ORB_LIFE:   600,     // 10 seconds
    HEALTH_ORB_SPAWN_LOW:  18,  // interval (s) when < 30 % HP
    HEALTH_ORB_SPAWN_MID:  28,  // interval (s) when < 50 % HP
    HEALTH_ORB_SPAWN_HIGH: 38,  // interval (s) when > 50 % HP
    DROP_CHANCE_BOSS:      1.0,
    DROP_CHANCE_BRUTE:     0.15,
    DROP_CHANCE_EXPLODER:  0.06,
    DROP_CHANCE_DEFAULT:   0.03,

    // Particles
    MAX_PARTICLES:     isMobile ? 60 : 200,
    PARTS_HIT:         isMobile ? 0  : 1,
    PARTS_DEATH:       isMobile ? 3  : 6,
    PARTS_BOSS_DEATH:  isMobile ? 10 : 20,
    PARTS_PLAYER_DEATH: isMobile ? 10 : 20,
    PARTS_HURT:        isMobile ? 2  : 4,
    PARTS_COLLECT_GEM: isMobile ? 1  : 2,
    PARTS_COLLECT_PU:  isMobile ? 4  : 8,
    PARTS_EXPIRE_PU:   isMobile ? 2  : 4,
    PARTS_HEAL:        isMobile ? 3  : 6,
    PARTS_ORB_EXPIRE:  isMobile ? 1  : 3,

    // Combo
    COMBO_WINDOW:      180,     // 3 seconds at 60 fps
    COMBO_MAX_BONUS:   30,

    // Effects
    SHAKE_DECAY:       0.88,
    FLASH_DECAY:       0.02,
    HEARTBEAT_INTERVAL: 50,

    // Visual
    BG_STAR_COUNT:     isMobile ? 50  : 180,
    NEBULA_COUNT:      isMobile ? 2   : 8,
    DUST_COUNT:        isMobile ? 15  : 60,
};

// ─── CANVAS & UTILITIES ─────────────────────────────────────
const C   = document.getElementById('game');
const ctx = C.getContext('2d');
let W, H;

// On mobile, cap DPR to 1 to avoid rendering millions of extra pixels.
// On desktop, use native 1:1 (canvas already matches CSS pixels).
const DPR = isMobile ? Math.min(devicePixelRatio, 1) : 1;

function resize() {
    W = innerWidth;
    H = innerHeight;
    // On mobile, ensure we don't exceed viewport
    if (isMobile && window.visualViewport) {
        H = Math.min(H, window.visualViewport.height);
    }
    C.width  = W * DPR;
    C.height = H * DPR;
    C.style.width  = W + 'px';
    C.style.height = H + 'px';
    ctx.imageSmoothingEnabled = !isMobile;
    if (DPR !== 1) ctx.scale(DPR, DPR);
}
addEventListener('resize', resize);
resize();

const PI    = Math.PI;
const TAU   = PI * 2;
const rand  = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const dist  = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function resetCtxState() {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([]);
}
function hexRgba(hex, a) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
}

/** Find the k nearest entities in `arr` relative to `from` — O(n·k). */
function findNearest(arr, from, k) {
    if (k <= 1) {
        let best = null, bd = Infinity;
        for (const e of arr) {
            const d = dist(e, from);
            if (d < bd) { bd = d; best = e; }
        }
        return best ? [best] : [];
    }
    const res = [], used = new Set();
    for (let c = 0; c < k; c++) {
        let best = null, bd = Infinity;
        for (const e of arr) {
            if (used.has(e)) continue;
            const d = dist(e, from);
            if (d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        res.push(best);
        used.add(best);
    }
    return res;
}

/** Spawn `count` particles in a radial burst at (x, y). */
function spawnBurst(x, y, count, col, opts = {}) {
    const spdMin = opts.spdMin ?? 1;
    const spdMax = opts.spdMax ?? 4;
    const life   = opts.life   ?? 20;
    const r      = opts.r      ?? 2;
    for (let i = 0; i < count; i++) {
        const a   = rand(0, TAU);
        const spd = rand(spdMin, spdMax);
        parts.push({
            x, y,
            vx: Math.cos(a) * spd + (opts.vxBias ?? 0),
            vy: Math.sin(a) * spd + (opts.vyBias ?? 0),
            life: typeof life === 'function' ? life() : life,
            col:  typeof col  === 'function' ? col()  : col,
            r:    typeof r    === 'function' ? r()    : r,
        });
    }
}

/** Shuffle array in-place (Fisher-Yates). */
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = randInt(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

/** Draw a geometric icon shape on canvas (replaces unreliable Unicode). */
function drawIconShape(x, y, type, r, col) {
    ctx.save();
    ctx.fillStyle = col || '#fff';
    ctx.strokeStyle = col || '#fff';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (type) {
        case 'orbiter': // crossed swords → spinning X
            ctx.beginPath();
            ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
            ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y, r * 0.25, 0, TAU); ctx.fill();
            break;
        case 'bolt': // diamond
            ctx.beginPath();
            ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.6, y);
            ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.6, y);
            ctx.closePath(); ctx.fill();
            break;
        case 'nova': // starburst
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (TAU / 8) * i - PI / 2;
                const rr = i % 2 === 0 ? r : r * 0.45;
                i === 0 ? ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
                        : ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
            }
            ctx.closePath(); ctx.fill();
            break;
        case 'lightning': // zigzag bolt
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - r * 0.2, y - r);
            ctx.lineTo(x + r * 0.4, y - r * 0.2);
            ctx.lineTo(x - r * 0.15, y + r * 0.1);
            ctx.lineTo(x + r * 0.3, y + r);
            ctx.stroke();
            break;
        case 'missile': // arrow/rocket
            ctx.beginPath();
            ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.5, y + r * 0.4);
            ctx.lineTo(x + r * 0.15, y + r * 0.2);
            ctx.lineTo(x + r * 0.15, y + r);
            ctx.lineTo(x - r * 0.15, y + r);
            ctx.lineTo(x - r * 0.15, y + r * 0.2);
            ctx.lineTo(x - r * 0.5, y + r * 0.4);
            ctx.closePath(); ctx.fill();
            break;
        case 'scatter': // three dots spread
            for (let i = -1; i <= 1; i++) {
                ctx.beginPath();
                ctx.arc(x + i * r * 0.55, y + Math.abs(i) * r * 0.3, r * 0.25, 0, TAU);
                ctx.fill();
            }
            break;
        case 'pierce': // right-pointing triangle
            ctx.beginPath();
            ctx.moveTo(x + r, y); ctx.lineTo(x - r * 0.6, y - r * 0.7);
            ctx.lineTo(x - r * 0.6, y + r * 0.7); ctx.closePath(); ctx.fill();
            break;
        case 'rapid': // triple dots
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(x, y + (i - 1) * r * 0.65, r * 0.25, 0, TAU); ctx.fill();
            }
            break;
        case 'hp': // heart
            ctx.beginPath();
            const hr = r * 0.55;
            ctx.moveTo(x, y + r * 0.6);
            ctx.bezierCurveTo(x - r, y, x - r, y - r * 0.7, x, y - r * 0.3);
            ctx.bezierCurveTo(x + r, y - r * 0.7, x + r, y, x, y + r * 0.6);
            ctx.fill();
            break;
        case 'spd': // speed arrows
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - r * 0.4, y + r * 0.3); ctx.lineTo(x + r * 0.5, y); ctx.lineTo(x - r * 0.4, y - r * 0.3);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x - r * 0.8, y + r * 0.3); ctx.lineTo(x + r * 0.1, y); ctx.lineTo(x - r * 0.8, y - r * 0.3);
            ctx.stroke();
            break;
        case 'dmg': // up arrow (power)
            ctx.beginPath();
            ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.6, y + r * 0.1);
            ctx.lineTo(x + r * 0.2, y + r * 0.1); ctx.lineTo(x + r * 0.2, y + r);
            ctx.lineTo(x - r * 0.2, y + r); ctx.lineTo(x - r * 0.2, y + r * 0.1);
            ctx.lineTo(x - r * 0.6, y + r * 0.1);
            ctx.closePath(); ctx.fill();
            break;
        case 'magnet': // U-shape magnet
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(x, y + r * 0.1, r * 0.5, PI, 0);
            ctx.moveTo(x + r * 0.5, y + r * 0.1); ctx.lineTo(x + r * 0.5, y - r * 0.6);
            ctx.moveTo(x - r * 0.5, y + r * 0.1); ctx.lineTo(x - r * 0.5, y - r * 0.6);
            ctx.stroke();
            break;
        case 'score': // coin / dollar
            ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, TAU); ctx.fill();
            ctx.fillStyle = '#060612'; ctx.font = `bold ${Math.round(r)}px 'Orbitron',sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('$', x, y + 1);
            break;
        default: // fallback circle
            ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
}

/** Draw icon on a small HUD canvas (separate context). */
function drawIconOnMini(mCtx, type, x, y, r, col) {
    mCtx.clearRect(0, 0, 28, 28);
    mCtx.fillStyle = col;
    mCtx.strokeStyle = col;
    mCtx.lineWidth = 1.5;
    mCtx.lineCap = 'round';
    mCtx.lineJoin = 'round';
    const T = Math.PI * 2;
    switch (type) {
        case 'orbiter':
            mCtx.beginPath();
            mCtx.moveTo(x - r, y - r); mCtx.lineTo(x + r, y + r);
            mCtx.moveTo(x + r, y - r); mCtx.lineTo(x - r, y + r);
            mCtx.stroke();
            mCtx.beginPath(); mCtx.arc(x, y, r * 0.25, 0, T); mCtx.fill();
            break;
        case 'bolt':
            mCtx.beginPath();
            mCtx.moveTo(x, y - r); mCtx.lineTo(x + r * 0.6, y);
            mCtx.lineTo(x, y + r); mCtx.lineTo(x - r * 0.6, y);
            mCtx.closePath(); mCtx.fill();
            break;
        case 'nova':
            mCtx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (T / 8) * i - Math.PI / 2;
                const rr = i % 2 === 0 ? r : r * 0.45;
                i === 0 ? mCtx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
                        : mCtx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
            }
            mCtx.closePath(); mCtx.fill();
            break;
        case 'lightning':
            mCtx.lineWidth = 2;
            mCtx.beginPath();
            mCtx.moveTo(x - r * 0.2, y - r);
            mCtx.lineTo(x + r * 0.4, y - r * 0.2);
            mCtx.lineTo(x - r * 0.15, y + r * 0.1);
            mCtx.lineTo(x + r * 0.3, y + r);
            mCtx.stroke();
            break;
        case 'missile':
            mCtx.beginPath();
            mCtx.moveTo(x, y - r); mCtx.lineTo(x + r * 0.5, y + r * 0.4);
            mCtx.lineTo(x + r * 0.15, y + r * 0.2); mCtx.lineTo(x + r * 0.15, y + r);
            mCtx.lineTo(x - r * 0.15, y + r); mCtx.lineTo(x - r * 0.15, y + r * 0.2);
            mCtx.lineTo(x - r * 0.5, y + r * 0.4);
            mCtx.closePath(); mCtx.fill();
            break;
        case 'scatter':
            for (let i = -1; i <= 1; i++) {
                mCtx.beginPath();
                mCtx.arc(x + i * r * 0.55, y + Math.abs(i) * r * 0.3, r * 0.25, 0, T);
                mCtx.fill();
            }
            break;
        case 'pierce':
            mCtx.beginPath();
            mCtx.moveTo(x + r, y); mCtx.lineTo(x - r * 0.6, y - r * 0.7);
            mCtx.lineTo(x - r * 0.6, y + r * 0.7); mCtx.closePath(); mCtx.fill();
            break;
        case 'rapid':
            for (let i = 0; i < 3; i++) {
                mCtx.beginPath();
                mCtx.arc(x, y + (i - 1) * r * 0.65, r * 0.25, 0, T); mCtx.fill();
            }
            break;
        default:
            mCtx.beginPath(); mCtx.arc(x, y, r * 0.5, 0, T); mCtx.fill();
    }
}

// ─── WEAPON DEFINITIONS (5 levels each, index 0-4) ──────────
const WDEFS = {
    orbiter: {
        name: 'Orbiters', desc: 'Spinning blades orbit you', icon: '⚔', col: '#22d3ee',
        dmg: [10, 16, 24, 34, 48], cnt: [3, 4, 5, 6, 8],
        rad: [55, 62, 72, 82, 95], spd: [0.035, 0.04, 0.048, 0.055, 0.065],
    },
    bolt: {
        name: 'Bolt Gun', desc: 'Auto-fires at nearest enemy', icon: '◆', col: '#f472b6',
        dmg: [18, 28, 40, 55, 75], cnt: [1, 1, 2, 2, 3],
        spd: [8, 9, 9, 10, 11],    cd: [32, 28, 24, 20, 15],
    },
    nova: {
        name: 'Nova Burst', desc: 'Periodic AoE explosion', icon: '✸', col: '#fbbf24',
        dmg: [25, 40, 58, 80, 110], rad: [100, 120, 145, 170, 200],
        cd: [160, 140, 115, 95, 72],
    },
    lightning: {
        name: 'Lightning', desc: 'Chain lightning between foes', icon: '⚡', col: '#a78bfa',
        dmg: [15, 24, 36, 50, 70], chains: [3, 4, 5, 7, 9],
        cd: [85, 72, 60, 48, 36],
    },
    missile: {
        name: 'Missiles', desc: 'Homing missiles seek enemies', icon: '◈', col: '#34d399',
        dmg: [30, 45, 64, 88, 120], cnt: [1, 2, 2, 3, 4],
        spd: [3.2, 3.6, 4, 4.5, 5], cd: [100, 85, 70, 55, 40],
    },
    scatter: {
        name: 'Scatter Shot', desc: 'Fires bolts in a spread', icon: '✦', col: '#fb923c',
        dmg: [10, 15, 22, 30, 42], cnt: [3, 4, 5, 5, 7],
        spd: [7, 8, 8, 9, 10], cd: [40, 35, 30, 25, 20], spread: 0.35,
    },
    pierce: {
        name: 'Pierce Bolt', desc: 'Bolts pierce through enemies', icon: '▸', col: '#818cf8',
        dmg: [22, 35, 50, 68, 90], cnt: [1, 1, 2, 2, 3],
        spd: [10, 11, 12, 13, 14], cd: [45, 40, 35, 30, 25],
    },
    rapid: {
        name: 'Rapid Fire', desc: 'Very fast low-damage bolts', icon: '●', col: '#4ade80',
        dmg: [8, 12, 16, 20, 26], cnt: [1, 2, 2, 3, 3],
        spd: [9, 10, 11, 12, 13], cd: [12, 10, 8, 7, 6],
    },
};

// ─── ENEMY DEFINITIONS ──────────────────────────────────────
const EDEFS = {
    walker:   { hp: 28,  spd: 1.0,  r: 11, dmg: 8,  xp: 1,  col: '#ef4444' },
    sprinter: { hp: 16,  spd: 2.4,  r: 8,  dmg: 5,  xp: 1,  col: '#fb923c' },
    brute:    { hp: 100, spd: 0.5,  r: 20, dmg: 18, xp: 3,  col: '#b91c1c' },
    exploder: { hp: 24,  spd: 1.3,  r: 13, dmg: 12, xp: 2,  col: '#facc15' },
    boss:     { hp: 800, spd: 0.55, r: 36, dmg: 28, xp: 35, col: '#8b5cf6' },
};

// ─── GAME STATE ─────────────────────────────────────────────
let state = 'menu'; // 'menu' | 'lobby' | 'play' | 'paused' | 'dead'
let frame = 0, gt = 0, spawnAcc = 0, nextBoss = CFG.FIRST_BOSS_TIME;
let score = 0, kills = 0, best = +(localStorage.getItem('ns_best') || 0);
let shake = 0, flashAlpha = 0, freezeFrames = 0;
let cam = { x: 0, y: 0 };

let P, weapons;
let enemies, projs, gems, parts, dmgNums, lightFx, novaFx, healthOrbs, powerUps;
let nextPowerUp    = CFG.FIRST_POWERUP;
let scoreMult      = 1;
let scoreMultTimer = 0;
let combo = 0, comboTimer = 0, maxCombo = 0;
let lastScore = 0, heartbeatTimer = 0;
let scoreMilestones = [1000, 2500, 5000, 10000, 25000, 50000, 100000];

// ─── DOM REFS ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $hud            = $('hud');
const $hpBar          = $('hp-bar');
const $hpText         = $('hp-text');
const $score          = $('score-display');
const $bestScore      = $('best-score');
const $scoreMult      = $('score-mult');
const $timer          = $('timer');
const $kills          = $('kill-count');
const $wIcons         = $('weapon-icons');
const $startScreen    = $('start-screen');
const $gameoverScreen = $('gameover-screen');
const $finalStats     = $('final-stats');
const $bossWarn       = $('boss-warning');
const $lobbyScreen    = $('lobby-screen');
const $pauseScreen    = $('pause-screen');
const $skinPicker     = $('skin-picker');
const $comboDisplay   = $('combo-display');
const $comboCount     = document.querySelector('#combo-display .combo-count');
const $comboFill      = document.querySelector('#combo-display .combo-fill');

// ─── INPUT ──────────────────────────────────────────────────
const keys = {};
const joy  = { active: false, id: -1, sx: 0, sy: 0, dx: 0, dy: 0 };

addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    // CrazyGames: ESC exits fullscreen, so use P for pause instead
    if (e.key.toLowerCase() === 'p' || e.key === 'Escape') {
        if (state === 'play') togglePause(true);
        else if (state === 'paused') togglePause(false);
    }
    // Space / Enter to skip screens quickly
    if ((e.key === ' ' || e.key === 'Enter') && state === 'menu') {
        e.preventDefault();
        showLobby();
    }
});
addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

C.addEventListener('touchstart', e => {
    if (state !== 'play') return;
    e.preventDefault();
    const t = e.changedTouches[0];
    joy.active = true;
    joy.id = t.identifier;
    joy.sx = t.clientX;
    joy.sy = t.clientY;
    joy.dx = 0;
    joy.dy = 0;
}, { passive: false });

C.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
        if (t.identifier !== joy.id) continue;
        let dx = t.clientX - joy.sx;
        let dy = t.clientY - joy.sy;
        const d = Math.hypot(dx, dy), maxD = 50;
        if (d > maxD) { dx = dx / d * maxD; dy = dy / d * maxD; }
        joy.dx = dx / maxD;
        joy.dy = dy / maxD;
    }
}, { passive: false });

C.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
        if (t.identifier === joy.id) {
            joy.active = false;
            joy.dx = 0;
            joy.dy = 0;
        }
    }
});

// ─── AUDIO (Web Audio — all procedurally generated) ─────────
let actx;
function ac() {
    if (!actx) actx = new (AudioContext || webkitAudioContext)();
    return actx;
}

function playTone(freq, dur, type = 'sine', vol = 0.06, freqEnd = null) {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.connect(g);
    g.connect(a.destination);
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (freqEnd != null) o.frequency.linearRampToValueAtTime(freqEnd, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.linearRampToValueAtTime(0, a.currentTime + dur);
    o.start();
    o.stop(a.currentTime + dur);
}

/** Play a sequence of tones with delays. */
function playSequence(notes, type = 'sine', vol = 0.06) {
    notes.forEach(([freq, dur, delay, freqEnd]) => {
        setTimeout(() => playTone(freq, dur, type, vol, freqEnd ?? null), delay);
    });
}

const sndHit       = () => playTone(200 + rand(0, 100), 0.08, 'square', 0.05, 80);
const sndKill      = () => { playTone(400, 0.12, 'square', 0.05, 100); playTone(500 + rand(0, 200), 0.06, 'sine', 0.03, 800); };
const sndXP        = () => playTone(600 + rand(0, 300), 0.04, 'sine', 0.03, 900);
const sndNova      = () => { playTone(300, 0.25, 'sawtooth', 0.06, 50); playTone(150, 0.3, 'sine', 0.04, 30); };
const sndZap       = () => { playTone(800, 0.1, 'square', 0.04, 200); playTone(1200, 0.06, 'sine', 0.02, 400); };
const sndCombo     = n  => { const b = 300 + Math.min(n, 20) * 30; playTone(b, 0.1, 'sine', 0.05, b * 1.5); };
const sndHurt      = () => { playTone(150, 0.15, 'sawtooth', 0.08, 60); playTone(100, 0.2, 'square', 0.04, 40); };
const sndHeartbeat = () => { playTone(50, 0.15, 'sine', 0.06, 45); setTimeout(() => playTone(55, 0.12, 'sine', 0.05, 48), 180); };
const sndHeal      = () => { playTone(500, 0.12, 'sine', 0.06, 700); setTimeout(() => playTone(700, 0.15, 'sine', 0.05, 900), 60); };

const sndBoss = () => playSequence(
    [[80, 0.5, 0, 30], [60, 0.4, 250, 25], [45, 0.3, 500, 20]], 'sawtooth', 0.1
);

const sndDeath = () => playSequence(
    [[200, 0.3, 0], [150, 0.3, 120], [100, 0.3, 240], [60, 0.3, 360]]
        .map(([f, d, t]) => [f, d, t, f * 0.3]),
    'sawtooth', 0.1
);

const sndMilestone = () => playSequence(
    [400, 500, 600, 750, 900, 1100].map((f, i) => [f, 0.12, i * 60, f * 1.2]),
    'sine', 0.06
);

const sndPowerUp = () => playSequence(
    [500, 650, 800, 1000].map((f, i) => [f, 0.12, i * 60, null]),
    'sine', 0.07
);

// Ambient drone
let ambDrone = null;

function startAmbientDrone() {
    if (ambDrone) return;
    const a = ac();
    const o1 = a.createOscillator(), o2 = a.createOscillator();
    const g = a.createGain();
    o1.type = 'sine'; o1.frequency.value = 55;
    o2.type = 'sine'; o2.frequency.value = 82.5;
    o1.connect(g);
    o2.connect(g);
    g.connect(a.destination);
    g.gain.value = 0.015;
    o1.start();
    o2.start();
    ambDrone = { o1, o2, g };
}

function stopAmbientDrone() {
    if (!ambDrone) return;
    ambDrone.o1.stop();
    ambDrone.o2.stop();
    ambDrone = null;
}

// ─── INIT & START ───────────────────────────────────────────
function initGame() {
    P = {
        x: 0, y: 0, vx: 0, vy: 0,
        r: CFG.PLAYER_RADIUS,
        spd: CFG.PLAYER_SPEED,
        hp: CFG.PLAYER_HP,
        maxHp: CFG.PLAYER_HP,
        magnet: CFG.PLAYER_MAGNET,
        dmgMult: 1,
        invuln: 0,
    };
    weapons    = [{ type: 'orbiter', lv: 0, timer: 0, angle: 0 }];
    // First 30s hook: start with bolt gun so player sees action immediately
    weapons.push({ type: 'bolt', lv: 0, timer: 0, angle: 0 });
    enemies    = [];
    projs      = [];
    gems       = [];
    parts      = [];
    dmgNums    = [];
    lightFx    = [];
    novaFx     = [];
    healthOrbs = [];
    powerUps   = [];

    frame = 0; gt = 0; spawnAcc = 0;
    nextBoss = CFG.FIRST_BOSS_TIME;
    score = 0; kills = 0;
    shake = 0; flashAlpha = 0; freezeFrames = 0;
    cam.x = 0; cam.y = 0;

    nextPowerUp    = CFG.FIRST_POWERUP;
    scoreMult      = 1;
    scoreMultTimer = 0;
    combo = 0; comboTimer = 0; maxCombo = 0;
    lastScore = 0; heartbeatTimer = 0;

    // First 30s hook: spawn initial wave immediately so action starts instantly
    for (let i = 0; i < 5; i++) spawnEnemy('walker');
}

function showLobby() {
    // If player already picked a skin before, skip lobby entirely
    if (hasPickedSkin) {
        startGame();
        return;
    }
    state = 'lobby';
    $startScreen.style.display = 'none';
    $gameoverScreen.style.display = 'none';
    $lobbyScreen.style.display = '';
    buildSkinPicker();
}

function startGame() {
    // Persist skin choice
    localStorage.setItem('ns_skin', selectedSkin);
    localStorage.setItem('ns_skinPicked', '1');
    hasPickedSkin = true;

    initGame();
    state = 'play';
    accumulator = 0;          // reset timestep accumulator for clean start
    lastTimestamp = 0;        // will be set on next rAF callback
    $lobbyScreen.style.display = 'none';
    $startScreen.style.display = 'none';
    $gameoverScreen.style.display = 'none';
    $pauseScreen.style.display = 'none';
    $hud.style.display = '';
    $wIcons.style.display = '';
    $bestScore.textContent = 'BEST: ' + best.toLocaleString();

    // In-game onboarding: show controls briefly
    showOnboarding();
    startAmbientDrone();
    if (actx && actx.state === 'suspended') actx.resume();

    // Notify CrazyGames SDK that gameplay has started
    if (cgSDK) try { cgSDK.game.gameplayStart(); } catch (_) {}
}

function togglePause(pause) {
    if (pause && state === 'play') {
        state = 'paused';
        $pauseScreen.style.display = '';
        if ($('pause-skin-picker')) buildPauseSkinPicker();
    } else if (!pause && state === 'paused') {
        state = 'play';
        $pauseScreen.style.display = 'none';
    }
}

function buildSkinPicker() {
    let html = '';
    SKINS.forEach((skin, i) => {
        const sel = i === selectedSkin ? ' selected' : '';
        const r = parseInt(skin.body.slice(1,3),16), g = parseInt(skin.body.slice(3,5),16), b = parseInt(skin.body.slice(5,7),16);
        const glow = `rgba(${r},${g},${b},0.35)`;
        html += `<div class="skin-opt${sel}" data-skin="${i}" style="--skin-col:${skin.body};--skin-glow:${glow}">
            <div class="skin-ring"><div class="skin-circle" style="background:radial-gradient(circle at 35% 35%, #fff, ${skin.light}, ${skin.body}, ${skin.dark})"></div></div>
            <span class="skin-name">${skin.name}</span>
        </div>`;
    });
    $skinPicker.innerHTML = html;
    $skinPicker.querySelectorAll('.skin-opt').forEach(el => {
        el.onclick = () => {
            selectedSkin = +el.dataset.skin;
            $skinPicker.querySelectorAll('.skin-opt').forEach(e => e.classList.remove('selected'));
            el.classList.add('selected');
        };
    });
}

$('play-btn').onclick   = showLobby;
$('retry-btn').onclick  = () => startGame(); // instant restart — no lobby
$('start-btn').onclick  = startGame;
$('resume-btn').onclick = () => togglePause(false);
$('pause-btn').onclick  = () => { if (state === 'play') togglePause(true); else if (state === 'paused') togglePause(false); };
$('quit-btn').onclick   = () => {
    state = 'menu';
    $pauseScreen.style.display = 'none';
    $hud.style.display = 'none';
    $wIcons.style.display = 'none';
    $startScreen.style.display = '';
};

function buildPauseSkinPicker() {
    const container = $('pause-skin-picker');
    if (!container) return;
    let html = '';
    SKINS.forEach((skin, i) => {
        const sel = i === selectedSkin ? ' selected' : '';
        html += `<div class="pause-skin${sel}" data-skin="${i}" style="background:${skin.body};color:${skin.body}" title="${skin.name}"></div>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.pause-skin').forEach(el => {
        el.onclick = () => {
            selectedSkin = +el.dataset.skin;
            localStorage.setItem('ns_skin', selectedSkin);
            container.querySelectorAll('.pause-skin').forEach(e => e.classList.remove('selected'));
            el.classList.add('selected');
        };
    });
}

// In-game onboarding — shows controls for 4s then fades
function showOnboarding() {
    const el = $('onboard-overlay');
    const txt = $('onboard-text');
    if (!el || !txt) return;
    if (isMobile) {
        txt.innerHTML = 'TOUCH & DRAG TO MOVE<br><small style="font-size:0.7em;opacity:0.6">weapons fire automatically</small>';
    } else {
        txt.innerHTML = '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> TO MOVE<br><small style="font-size:0.7em;opacity:0.6">weapons fire automatically &bull; <kbd>P</kbd> pause</small>';
    }
    el.style.display = '';
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3500);
    setTimeout(() => { el.style.display = 'none'; }, 4500);
}

// ─── PLAYER ─────────────────────────────────────────────────
function updatePlayer() {
    let mx = 0, my = 0;
    // WASD + Arrow Keys + AZERTY (ZQSD) support
    if (keys['w'] || keys['z'] || keys['arrowup'])    my -= 1;
    if (keys['s'] || keys['arrowdown'])                my += 1;
    if (keys['a'] || keys['q'] || keys['arrowleft'])   mx -= 1;
    if (keys['d'] || keys['arrowright'])                mx += 1;
    if (joy.active) { mx = joy.dx; my = joy.dy; }

    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }

    P.vx = lerp(P.vx, mx * P.spd, 0.2);
    P.vy = lerp(P.vy, my * P.spd, 0.2);
    P.x += P.vx;
    P.y += P.vy;

    if (P.invuln > 0) P.invuln--;

    cam.x = lerp(cam.x, P.x - W / 2, CFG.CAM_LERP);
    cam.y = lerp(cam.y, P.y - H / 2, CFG.CAM_LERP);
}

// ─── WEAPONS ────────────────────────────────────────────────
function updateWeapons() {
    for (const w of weapons) {
        const def = WDEFS[w.type];
        const lv  = w.lv;

        switch (w.type) {
            case 'orbiter':
                w.angle += def.spd[lv];
                break;

            case 'bolt':
                if (--w.timer <= 0) {
                    w.timer = def.cd[lv];
                    const nearest = findNearest(enemies, P, def.cnt[lv]);
                    for (const e of nearest) {
                        const a = Math.atan2(e.y - P.y, e.x - P.x);
                        projs.push({
                            x: P.x, y: P.y,
                            vx: Math.cos(a) * def.spd[lv],
                            vy: Math.sin(a) * def.spd[lv],
                            dmg: def.dmg[lv] * P.dmgMult,
                            r: 5, col: def.col, life: 80,
                            pierce: lv >= 4 ? 2 : (lv >= 2 ? 1 : 0),
                            type: 'bolt',
                        });
                    }
                    if (nearest.length > 0) sndHit();
                }
                break;

            case 'nova':
                if (--w.timer <= 0) {
                    w.timer = def.cd[lv];
                    const rad = def.rad[lv];
                    const dmg = def.dmg[lv] * P.dmgMult;
                    novaFx.push({ x: P.x, y: P.y, r: 0, maxR: rad, col: def.col });
                    sndNova();
                    for (const e of enemies) {
                        if (dist(e, P) < rad + e.r) damageEnemy(e, dmg);
                    }
                    if (lv >= 3) {
                        setTimeout(() => {
                            novaFx.push({ x: P.x, y: P.y, r: 0, maxR: rad * 0.7, col: def.col });
                            for (const e of enemies) {
                                if (dist(e, P) < rad * 0.7 + e.r) damageEnemy(e, dmg * 0.5);
                            }
                        }, 200);
                    }
                }
                break;

            case 'lightning':
                if (--w.timer <= 0 && enemies.length > 0) {
                    w.timer = def.cd[lv];
                    const chains = def.chains[lv];
                    const dmg = def.dmg[lv] * P.dmgMult;
                    const hit = new Set();
                    const chain = [{ x: P.x, y: P.y }];
                    let current = chain[0];

                    for (let i = 0; i < chains; i++) {
                        let best = null, bestD = 300;
                        for (const e of enemies) {
                            if (hit.has(e)) continue;
                            const d = dist(e, current);
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
                if (--w.timer <= 0 && enemies.length > 0) {
                    w.timer = def.cd[lv];
                    const cnt = def.cnt[lv];
                    const nearest = findNearest(enemies, P, cnt);
                    for (let i = 0; i < cnt; i++) {
                        const target = nearest[i % nearest.length];
                        const a = rand(0, TAU);
                        projs.push({
                            x: P.x, y: P.y,
                            vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
                            target,
                            dmg: def.dmg[lv] * P.dmgMult,
                            r: 6, col: def.col, life: 180,
                            spd: def.spd[lv], type: 'missile',
                        });
                    }
                }
                break;

            case 'scatter':
                if (--w.timer <= 0 && enemies.length > 0) {
                    w.timer = def.cd[lv];
                    const tgt = findNearest(enemies, P, 1)[0];
                    if (tgt) {
                        const baseA = Math.atan2(tgt.y - P.y, tgt.x - P.x);
                        const cnt = def.cnt[lv];
                        const half = (cnt - 1) / 2;
                        for (let i = 0; i < cnt; i++) {
                            const a = baseA + (i - half) * def.spread;
                            projs.push({
                                x: P.x, y: P.y,
                                vx: Math.cos(a) * def.spd[lv],
                                vy: Math.sin(a) * def.spd[lv],
                                dmg: def.dmg[lv] * P.dmgMult,
                                r: 4, col: def.col, life: 60,
                                pierce: 0, type: 'bolt',
                            });
                        }
                        sndHit();
                    }
                }
                break;

            case 'pierce':
                if (--w.timer <= 0 && enemies.length > 0) {
                    w.timer = def.cd[lv];
                    const nearest = findNearest(enemies, P, def.cnt[lv]);
                    for (const e of nearest) {
                        const a = Math.atan2(e.y - P.y, e.x - P.x);
                        projs.push({
                            x: P.x, y: P.y,
                            vx: Math.cos(a) * def.spd[lv],
                            vy: Math.sin(a) * def.spd[lv],
                            dmg: def.dmg[lv] * P.dmgMult,
                            r: 5, col: def.col, life: 100,
                            pierce: 3 + lv, type: 'bolt',
                        });
                    }
                    if (nearest.length > 0) sndHit();
                }
                break;

            case 'rapid':
                if (--w.timer <= 0 && enemies.length > 0) {
                    w.timer = def.cd[lv];
                    const nearest = findNearest(enemies, P, def.cnt[lv]);
                    for (const e of nearest) {
                        const a = Math.atan2(e.y - P.y, e.x - P.x);
                        projs.push({
                            x: P.x, y: P.y,
                            vx: Math.cos(a) * def.spd[lv],
                            vy: Math.sin(a) * def.spd[lv],
                            dmg: def.dmg[lv] * P.dmgMult,
                            r: 3, col: def.col, life: 55,
                            pierce: 0, type: 'bolt',
                        });
                    }
                    if (nearest.length > 0) sndHit();
                }
                break;
        }
    }
}

// ─── ORBITER COLLISION ──────────────────────────────────────
function checkOrbiters() {
    for (const w of weapons) {
        if (w.type !== 'orbiter') continue;
        const def = WDEFS.orbiter;
        const lv  = w.lv;
        const cnt = def.cnt[lv];
        const rad = def.rad[lv];
        const dmg = def.dmg[lv] * P.dmgMult;

        for (let i = 0; i < cnt; i++) {
            const a  = w.angle + (TAU / cnt) * i;
            const bx = P.x + Math.cos(a) * rad;
            const by = P.y + Math.sin(a) * rad;

            for (const e of enemies) {
                if (Math.hypot(bx - e.x, by - e.y) < 12 + e.r) {
                    if (!e._orbHit || frame - e._orbHit > 10) {
                        damageEnemy(e, dmg);
                        e._orbHit = frame;
                        spawnBurst(bx, by, 2, def.col, { spdMin: 2, spdMax: 4, life: 10 });
                    }
                }
            }
        }
    }
}

// ─── ENEMIES ────────────────────────────────────────────────
function spawnEnemy(type) {
    const def = EDEFS[type];
    const timeScale = 1 + gt / CFG.HP_TIME_SCALE;
    const a = rand(0, TAU);
    const d = Math.max(W, H) / 2 + 80;

    enemies.push({
        x: P.x + Math.cos(a) * d,
        y: P.y + Math.sin(a) * d,
        hp:    def.hp * timeScale,
        maxHp: def.hp * timeScale,
        spd:   def.spd * (1 + gt / CFG.SPD_TIME_SCALE),
        r: def.r,
        dmg: def.dmg * (1 + gt / CFG.DMG_TIME_SCALE),
        xp: def.xp,
        col: def.col,
        type,
        hit: 0,
    });
}

function updateSpawning(dt) {
    const rate = CFG.BASE_SPAWN_RATE + gt / CFG.SPAWN_RATE_SCALE;
    spawnAcc += rate * dt;

    if (enemies.length >= CFG.MAX_ENEMIES) spawnAcc = 0;

    while (spawnAcc >= 1) {
        spawnAcc -= 1;
        const roll = rand(0, 1);

        if (gt < 30) {
            spawnEnemy('walker');
        } else if (gt < 60) {
            spawnEnemy(roll < 0.6 ? 'walker' : 'sprinter');
        } else if (gt < 120) {
            if      (roll < 0.4) spawnEnemy('walker');
            else if (roll < 0.7) spawnEnemy('sprinter');
            else if (roll < 0.9) spawnEnemy('brute');
            else                 spawnEnemy('exploder');
        } else {
            if      (roll < 0.25) spawnEnemy('walker');
            else if (roll < 0.45) spawnEnemy('sprinter');
            else if (roll < 0.65) spawnEnemy('brute');
            else if (roll < 0.85) spawnEnemy('exploder');
            else { spawnEnemy('brute'); spawnEnemy('sprinter'); }
        }
    }

    // Boss timer
    if (gt >= nextBoss) {
        spawnEnemy('boss');
        sndBoss();
        shake = 25;
        $bossWarn.style.display = '';
        setTimeout(() => { $bossWarn.style.display = 'none'; }, 2000);
        nextBoss += Math.max(CFG.MIN_BOSS_INTERVAL, 60 - Math.floor(gt / 30));
    }

    // Health-orb timer
    const hpRatio = P.hp / P.maxHp;
    const healthInterval = hpRatio < 0.3 ? CFG.HEALTH_ORB_SPAWN_LOW
                         : hpRatio < 0.5 ? CFG.HEALTH_ORB_SPAWN_MID
                         : CFG.HEALTH_ORB_SPAWN_HIGH;

    if (gt > 10 && Math.floor((gt - dt) / healthInterval) < Math.floor(gt / healthInterval)) {
        spawnHealthOrb();
    }
}

function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e  = enemies[i];
        const dx = P.x - e.x;
        const dy = P.y - e.y;
        const d  = Math.hypot(dx, dy);

        if (d > 1) {
            e.x += dx / d * e.spd;
            e.y += dy / d * e.spd;
        }

        if (e.hit > 0) e.hit--;

        // Damage player on contact
        if (d < e.r + P.r && P.invuln <= 0) {
            P.hp -= e.dmg;
            P.invuln = CFG.INVULN_FRAMES;
            shake = 10;
            flashAlpha = 0.3;
            sndHurt();
            combo = 0;

            if (d > 0) {
                P.vx -= dx / d * CFG.KNOCKBACK_FORCE;
                P.vy -= dy / d * CFG.KNOCKBACK_FORCE;
            }
            spawnBurst(P.x, P.y, CFG.PARTS_HURT, '#ef4444', { spdMin: 2, spdMax: 5, life: 25, r: 3 });

            if (P.hp <= 0) { die(); return; }
        }

        // Cull far-away enemies
        if (dist(e, P) > CFG.ENEMY_CULL_DIST) {
            enemies.splice(i, 1);
            continue;
        }

        if (e.hp <= 0) {
            onEnemyDeath(e);
            enemies.splice(i, 1);
        }
    }
}

// ─── DAMAGE & DEATH ─────────────────────────────────────────
function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hit = 6;
    dmgNums.push({ x: e.x + rand(-10, 10), y: e.y - e.r, val: Math.round(dmg), life: 40, col: '#fff' });

    const a = rand(0, TAU);
    parts.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * rand(1, 3),
        vy: Math.sin(a) * rand(1, 3),
        life: 15, col: e.col, r: 2,
    });
}

function onEnemyDeath(e) {
    kills++;
    combo++;
    comboTimer = CFG.COMBO_WINDOW;
    if (combo > maxCombo) maxCombo = combo;

    const comboBonus = Math.min(combo, CFG.COMBO_MAX_BONUS);
    score += (e.xp * 10 + comboBonus) * scoreMult;
    if (combo > 2) sndCombo(combo);
    sndKill();

    // Death particles
    const isBoss = e.type === 'boss';
    spawnBurst(e.x, e.y, isBoss ? CFG.PARTS_BOSS_DEATH : CFG.PARTS_DEATH, e.col, {
        spdMin: 1, spdMax: isBoss ? 7 : 4,
        life: () => rand(20, 40),
        r:    () => rand(2, 5),
    });

    // Exploder chain reaction
    if (e.type === 'exploder') {
        shake = 8;
        novaFx.push({ x: e.x, y: e.y, r: 0, maxR: 80, col: e.col });
        for (const other of enemies) {
            if (other !== e && dist(other, e) < 80) damageEnemy(other, 30);
        }
    }

    if (isBoss) {
        shake = 20;
        freezeFrames = 8;
        flashAlpha = 0.5;
    }

    // Drop XP gems
    const gemCount = isBoss ? 15 : (e.xp >= 3 ? 3 : 1);
    for (let i = 0; i < gemCount; i++) {
        const a = rand(0, TAU), d = rand(5, 20);
        gems.push({
            x: e.x + Math.cos(a) * d,
            y: e.y + Math.sin(a) * d,
            xp: Math.ceil(e.xp / gemCount),
            r: 4, pulse: rand(0, TAU),
        });
    }

    // Chance to drop health orb
    const chance = isBoss               ? CFG.DROP_CHANCE_BOSS
                 : e.type === 'brute'   ? CFG.DROP_CHANCE_BRUTE
                 : e.type === 'exploder' ? CFG.DROP_CHANCE_EXPLODER
                 : CFG.DROP_CHANCE_DEFAULT;

    if (Math.random() < chance) {
        const a = rand(0, TAU), d = rand(5, 15);
        const heal = isBoss ? 40 : (e.type === 'brute' ? 25 : 15);
        healthOrbs.push({
            x: e.x + Math.cos(a) * d,
            y: e.y + Math.sin(a) * d,
            heal, r: 7, pulse: rand(0, TAU), life: 900,
        });
    }
}

function die() {
    state = 'dead';
    P.hp = 0;
    shake = 25;
    freezeFrames = 15;
    sndDeath();
    stopAmbientDrone();

    // Notify CrazyGames SDK that gameplay has stopped
    if (cgSDK) try { cgSDK.game.gameplayStop(); } catch (_) {}

    const deathColors = ['#22d3ee', '#f472b6', '#fbbf24', '#a78bfa', '#ef4444'];
    spawnBurst(P.x, P.y, CFG.PARTS_PLAYER_DEATH, () => deathColors[randInt(0, 4)], {
        spdMin: 1, spdMax: 8,
        life: () => rand(30, 60),
        r:    () => rand(2, 6),
    });

    const isNewBest = score > best;
    if (isNewBest) { best = score; localStorage.setItem('ns_best', best); }

    setTimeout(() => {
        $hud.style.display = 'none';
        $wIcons.style.display = 'none';
        $gameoverScreen.style.display = '';
        const min = Math.floor(gt / 60);
        const sec = Math.floor(gt % 60);
        $finalStats.innerHTML = `
            <div class="stat-row"><span class="stat-label">SCORE</span><span class="stat-value ${isNewBest ? 'new-best' : ''}" style="font-size:22px">${score.toLocaleString()}${isNewBest ? ' ★ NEW BEST' : ''}</span></div>
            <div class="stat-row"><span class="stat-label">Time Survived</span><span class="stat-value">${min}:${String(sec).padStart(2, '0')}</span></div>
            <div class="stat-row"><span class="stat-label">Enemies Killed</span><span class="stat-value">${kills}</span></div>
            <div class="stat-row"><span class="stat-label">Max Combo</span><span class="stat-value">${maxCombo}x</span></div>
            <div class="stat-row"><span class="stat-label">Best Score</span><span class="stat-value">${best.toLocaleString()}</span></div>
        `;
    }, 800);
}

// ─── PROJECTILES ────────────────────────────────────────────
function updateProjectiles() {
    for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        if (--p.life <= 0) { projs.splice(i, 1); continue; }

        // Homing for missiles
        if (p.type === 'missile' && p.target) {
            let t = p.target;
            if (t.hp <= 0 || !enemies.includes(t)) {
                t = enemies.length > 0
                    ? enemies.reduce((a, b) => dist(a, p) < dist(b, p) ? a : b)
                    : null;
                p.target = t;
            }
            if (t) {
                const desired = Math.atan2(t.y - p.y, t.x - p.x);
                let current = Math.atan2(p.vy, p.vx);
                let da = desired - current;
                while (da > PI) da -= TAU;
                while (da < -PI) da += TAU;
                current += da * 0.08;
                p.vx = Math.cos(current) * p.spd;
                p.vy = Math.sin(current) * p.spd;
            }
        }

        p.x += p.vx;
        p.y += p.vy;

        // Missile trail
        if (p.type === 'missile' && frame % (isMobile ? 4 : 2) === 0) {
            parts.push({ x: p.x, y: p.y, vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), life: 12, col: p.col, r: 2 });
        }

        // Hit enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (dist(p, e) < p.r + e.r) {
                damageEnemy(e, p.dmg);
                sndHit();
                if (p.pierce > 0) {
                    p.pierce--;
                    p.dmg *= 0.7;
                } else {
                    projs.splice(i, 1);
                    break;
                }
            }
        }
    }
}

// ─── COLLECTIBLES ───────────────────────────────────────────

// --- XP Gems ---
function updateGems() {
    for (let i = gems.length - 1; i >= 0; i--) {
        const g = gems[i];
        g.pulse += 0.1;
        const d = dist(g, P);

        if (d < P.magnet) {
            const pull = (1 - d / P.magnet) * 6;
            const a = Math.atan2(P.y - g.y, P.x - g.x);
            g.x += Math.cos(a) * pull;
            g.y += Math.sin(a) * pull;
        }

        if (d < P.r + g.r) {
            score += g.xp * 10 * scoreMult;
            sndXP();
            gems.splice(i, 1);
            spawnBurst(g.x, g.y, CFG.PARTS_COLLECT_GEM, '#34d399', { spdMin: 1, spdMax: 3, life: 15 });
        }
    }
}

// --- Health Orbs ---
function spawnHealthOrb() {
    const a = rand(0, TAU);
    const d = rand(200, 400);
    healthOrbs.push({
        x: P.x + Math.cos(a) * d,
        y: P.y + Math.sin(a) * d,
        heal: CFG.HEALTH_ORB_BASE + Math.floor(gt / CFG.HEALTH_ORB_SCALE),
        r: 8, pulse: rand(0, TAU),
        life: CFG.HEALTH_ORB_LIFE,
    });
}

function updateHealthOrbs() {
    for (let i = healthOrbs.length - 1; i >= 0; i--) {
        const h = healthOrbs[i];
        h.pulse += 0.08;
        h.life--;

        if (h.life <= 0) {
            spawnBurst(h.x, h.y, CFG.PARTS_ORB_EXPIRE, '#ef4444', { spdMin: 0.5, spdMax: 2, vyBias: -1, life: 18 });
            healthOrbs.splice(i, 1);
            continue;
        }

        const d = dist(h, P);

        if (d < P.magnet * 0.6) {
            const pull = (1 - d / (P.magnet * 0.6)) * 4;
            const a = Math.atan2(P.y - h.y, P.x - h.x);
            h.x += Math.cos(a) * pull;
            h.y += Math.sin(a) * pull;
        }

        if (d < P.r + h.r) {
            const healed = Math.min(h.heal, P.maxHp - P.hp);
            P.hp = Math.min(P.hp + h.heal, P.maxHp);
            sndHeal();
            healthOrbs.splice(i, 1);

            dmgNums.push({
                x: P.x, y: P.y - P.r - 10,
                val: '+' + Math.round(healed > 0 ? healed : h.heal),
                life: 50, col: '#34d399', isHeal: true,
            });
            spawnBurst(P.x, P.y, CFG.PARTS_HEAL, '#ef4444', { spdMin: 1, spdMax: 4, life: 22, r: 2.5 });
            flashAlpha = 0.15;
        }
    }
}

// --- Power-Ups ---
function generatePowerUpItem() {
    const pool  = [];
    const owned = new Set(weapons.map(w => w.type));

    // New weapons (weighted higher — added twice)
    for (const key in WDEFS) {
        if (!owned.has(key)) {
            const def  = WDEFS[key];
            const item = { kind: 'new', weapon: key, label: def.name, col: def.col, rarity: 'epic' };
            pool.push(item, { ...item });
        }
    }

    // Upgrade existing weapons
    for (const w of weapons) {
        if (w.lv < 4) {
            const def = WDEFS[w.type];
            pool.push({ kind: 'upgrade', weapon: w.type, label: def.name + ' ↑', col: def.col, rarity: 'rare' });
        }
    }

    // Stat boosts
    pool.push(
        { kind: 'stat', stat: 'maxHp',   label: '+HP',  iconType: 'hp',     col: '#ef4444', rarity: 'common' },
        { kind: 'stat', stat: 'spd',     label: '+SPD', iconType: 'spd',    col: '#38bdf8', rarity: 'common' },
        { kind: 'stat', stat: 'dmgMult', label: '+DMG', iconType: 'dmg',    col: '#f97316', rarity: 'common' },
        { kind: 'stat', stat: 'magnet',  label: '+MAG', iconType: 'magnet', col: '#a855f7', rarity: 'common' },
    );

    // Score multiplier
    pool.push({ kind: 'score', label: 'x2 PTS', iconType: 'score', col: '#fbbf24', rarity: 'rare' });

    shuffle(pool);
    return pool[0];
}

function spawnPowerUp() {
    const item = generatePowerUpItem();
    const a = rand(0, TAU);
    const d = rand(180, 380);
    powerUps.push({
        ...item,
        x: P.x + Math.cos(a) * d,
        y: P.y + Math.sin(a) * d,
        r: 16, pulse: rand(0, TAU),
        life: CFG.POWERUP_LIFETIME,
        maxLife: CFG.POWERUP_LIFETIME,
        bobY: 0,
    });
}

function applyPowerUp(pu) {
    if (pu.kind === 'new') {
        weapons.push({ type: pu.weapon, lv: 0, timer: 0, angle: 0 });
    } else if (pu.kind === 'upgrade') {
        const w = weapons.find(w => w.type === pu.weapon);
        if (w) w.lv++;
    } else if (pu.kind === 'stat') {
        switch (pu.stat) {
            case 'maxHp':   P.maxHp += CFG.STAT_HP_BONUS; P.hp = Math.min(P.hp + CFG.STAT_HP_BONUS, P.maxHp); break;
            case 'spd':     P.spd *= CFG.STAT_SPD_MULT; break;
            case 'dmgMult': P.dmgMult *= CFG.STAT_DMG_MULT; break;
            case 'magnet':  P.magnet *= CFG.STAT_MAG_MULT; break;
        }
    } else if (pu.kind === 'score') {
        scoreMult = 2;
        scoreMultTimer = CFG.SCORE_MULT_DUR;
    }
    score += 100 * scoreMult;
}

function updatePowerUps() {
    if (gt >= nextPowerUp) {
        spawnPowerUp();
        nextPowerUp = gt + rand(CFG.POWERUP_MIN_CD, CFG.POWERUP_MAX_CD);
    }

    if (scoreMultTimer > 0) {
        scoreMultTimer--;
        if (scoreMultTimer <= 0) scoreMult = 1;
    }

    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        pu.pulse += 0.06;
        pu.bobY = Math.sin(pu.pulse * 1.5) * 6;
        pu.life--;

        if (pu.life <= 0) {
            spawnBurst(pu.x, pu.y, CFG.PARTS_EXPIRE_PU, pu.col, { spdMin: 1, spdMax: 3, vyBias: -1, life: 20, r: 3 });
            powerUps.splice(i, 1);
            continue;
        }

        const d = dist(pu, P);
        if (d < P.r + pu.r + 4) {
            applyPowerUp(pu);
            sndPowerUp();
            flashAlpha = 0.25;
            powerUps.splice(i, 1);

            spawnBurst(pu.x, pu.y, CFG.PARTS_COLLECT_PU, pu.col, { spdMin: 2, spdMax: 6, life: 28, r: () => rand(2, 4) });
            dmgNums.push({ x: P.x, y: P.y - P.r - 20, val: pu.label, life: 60, col: pu.col, isHeal: true });
        }
    }
}

// ─── PARTICLES & EFFECTS ────────────────────────────────────
function updateParticles() {
    for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        if (--p.life <= 0) parts.splice(i, 1);
    }
    if (parts.length > CFG.MAX_PARTICLES) {
        parts.splice(0, parts.length - CFG.MAX_PARTICLES);
    }
}

function updateDmgNums() {
    for (let i = dmgNums.length - 1; i >= 0; i--) {
        dmgNums[i].y -= 1.2;
        if (--dmgNums[i].life <= 0) dmgNums.splice(i, 1);
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
        if (--lightFx[i].life <= 0) lightFx.splice(i, 1);
    }
}

// ─── HUD ────────────────────────────────────────────────────
function updateHUD() {
    // HP bar
    const hpPct = Math.max(0, P.hp / P.maxHp * 100);
    $hpBar.style.width = hpPct + '%';
    $hpText.textContent = Math.ceil(P.hp) + ' / ' + P.maxHp;

    if (hpPct < 25) {
        $hpBar.style.background = 'linear-gradient(90deg,#991b1b,#dc2626,#ef4444)';
        $hpBar.style.animation = 'hpShimmer 0.5s linear infinite';
    } else {
        $hpBar.style.background = '';
        $hpBar.style.animation = '';
    }

    // Score
    $score.textContent = score.toLocaleString();
    if (score !== lastScore) {
        $score.classList.add('score-bump');
        setTimeout(() => $score.classList.remove('score-bump'), 150);
        lastScore = score;
    }

    // Timer & kills
    const min = Math.floor(gt / 60);
    const sec = Math.floor(gt % 60);
    $timer.textContent = min + ':' + String(sec).padStart(2, '0');
    $kills.textContent = '💀 ' + kills;

    // Score milestones
    for (let i = scoreMilestones.length - 1; i >= 0; i--) {
        if (score >= scoreMilestones[i]) {
            sndMilestone();
            shake = 8;
            const el = document.createElement('div');
            el.className = 'score-fly';
            Object.assign(el.style, { top: '35%', left: '50%', transform: 'translateX(-50%)', fontSize: '24px', color: '#fbbf24' });
            el.textContent = '★ ' + scoreMilestones[i].toLocaleString() + ' POINTS! ★';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 1200);
            scoreMilestones.splice(i, 1);
            break;
        }
    }

    // Score multiplier indicator
    if (scoreMult > 1) {
        $scoreMult.style.display = '';
        $scoreMult.textContent = 'x' + scoreMult + ' SCORE • ' + Math.ceil(scoreMultTimer / 60) + 's';
    } else {
        $scoreMult.style.display = 'none';
    }

    // Combo bar
    if (comboTimer > 0) {
        comboTimer--;
        if (comboTimer <= 0) combo = 0;
    }
    if (combo >= 3) {
        $comboDisplay.style.opacity = '1';
        $comboCount.textContent = combo + 'x';
        $comboCount.style.color = combo >= 20 ? '#f472b6' : (combo >= 10 ? '#fbbf24' : '#22d3ee');
        $comboFill.style.width = (comboTimer / CFG.COMBO_WINDOW * 100) + '%';
    } else {
        $comboDisplay.style.opacity = '0';
    }

    // Heartbeat at low HP
    if (P.hp > 0 && P.hp < P.maxHp * 0.25) {
        if (--heartbeatTimer <= 0) {
            sndHeartbeat();
            heartbeatTimer = CFG.HEARTBEAT_INTERVAL;
        }
    }

    // Weapon icons (canvas-based SVG inline)
    let html = '';
    for (const w of weapons) {
        const def = WDEFS[w.type];
        const glowStyle = isMobile ? '' : `box-shadow:0 0 10px ${def.col}33`;
        html += `<div class="weapon-icon" style="border-color:${def.col};${glowStyle}"><canvas class="wicon-cvs" data-type="${w.type}" data-col="${def.col}" width="28" height="28"></canvas><span class="wlv">${w.lv + 1}</span></div>`;
    }
    $wIcons.innerHTML = html;
    // Draw icons on mini canvases
    $wIcons.querySelectorAll('.wicon-cvs').forEach(cvs => {
        const mCtx = cvs.getContext('2d');
        const t = cvs.dataset.type, c = cvs.dataset.col;
        drawIconOnMini(mCtx, t, 14, 14, 9, c);
    });
}

// ─── MAIN UPDATE ────────────────────────────────────────────
function update() {
    if (state !== 'play') return;
    if (freezeFrames > 0) { freezeFrames--; return; }

    const dt = 1 / 60;
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

    shake *= CFG.SHAKE_DECAY;
    if (shake < 0.5) shake = 0;
    if (flashAlpha > 0) flashAlpha -= CFG.FLASH_DECAY;

    if (frame % 3 === 0) updateHUD();
}

// ═══════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════

// ─── Background (stars, nebulae, dust) ──────────────────────
let bgStars = [], nebulae = [], ambientParts = [];

function initBgStars() {
    const starCols = ['#fff', '#fff', '#fff', '#a5b4fc', '#c4b5fd', '#67e8f9', '#fde68a', '#fca5a5'];
    bgStars = [];
    for (let i = 0; i < CFG.BG_STAR_COUNT; i++) {
        bgStars.push({
            x: rand(0, 1), y: rand(0, 1),
            r: rand(0.4, 2.2), a: rand(0.15, 0.55),
            speed: rand(0.08, 0.4),
            col: starCols[randInt(0, starCols.length - 1)],
            twinkle: rand(0, TAU),
        });
    }

    const nebCols = ['rgba(139,92,246,', 'rgba(34,211,238,', 'rgba(244,114,182,', 'rgba(251,191,36,', 'rgba(52,211,153,', 'rgba(99,102,241,'];
    nebulae = [];
    for (let i = 0; i < CFG.NEBULA_COUNT; i++) {
        nebulae.push({
            x: rand(0, 1), y: rand(0, 1),
            r: rand(200, 500), col: nebCols[i % nebCols.length],
            a: rand(0.015, 0.04), speed: rand(0.03, 0.12),
            phase: rand(0, TAU),
        });
    }

    ambientParts = [];
    for (let i = 0; i < CFG.DUST_COUNT; i++) {
        ambientParts.push({
            x: rand(0, 1), y: rand(0, 1),
            spd: rand(0.05, 0.2), r: rand(0.5, 1.5),
            a: rand(0.1, 0.3), phase: rand(0, TAU),
        });
    }
}
initBgStars();

function drawBgStars() {
    // Nebulae (skip on mobile — gradient-heavy)
    if (!isMobile) {
        for (const n of nebulae) {
            const x = ((n.x * W * 4 - cam.x * n.speed) % W + W) % W;
            const y = ((n.y * H * 4 - cam.y * n.speed) % H + H) % H;
            const breathe = 1 + Math.sin(frame * 0.005 + n.phase) * 0.15;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, n.r * breathe);
            grad.addColorStop(0,   n.col + (n.a * 1.5) + ')');
            grad.addColorStop(0.5, n.col + (n.a * 0.5) + ')');
            grad.addColorStop(1,   n.col + '0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x - n.r * breathe, y - n.r * breathe, n.r * 2 * breathe, n.r * 2 * breathe);
        }
    }

    // Stars
    for (const s of bgStars) {
        const x = ((s.x * W * 3 - cam.x * s.speed) % W + W) % W;
        const y = ((s.y * H * 3 - cam.y * s.speed) % H + H) % H;
        s.twinkle += 0.03;
        const alpha = s.a + Math.sin(s.twinkle) * 0.15;
        if (alpha < 0.05) continue;

        if (isMobile) {
            // Mobile: solid fill, no alpha blending
            ctx.fillStyle = s.col;
            ctx.fillRect(x - s.r, y - s.r, s.r * 2, s.r * 2);
        } else {
            // Desktop: full effect
            ctx.globalAlpha = clamp(alpha, 0, 1);
            ctx.fillStyle = s.col;
            ctx.beginPath();
            ctx.arc(x, y, s.r, 0, TAU);
            ctx.fill();

            // Cross flare on bright stars
            if (s.r > 1.5) {
                ctx.globalAlpha = alpha * 0.3;
                ctx.strokeStyle = s.col;
                ctx.lineWidth = 0.5;
                const cr = s.r * 4;
                ctx.beginPath();
                ctx.moveTo(x - cr, y); ctx.lineTo(x + cr, y);
                ctx.moveTo(x, y - cr); ctx.lineTo(x, y + cr);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
    }

    // Floating dust (skip on mobile)
    if (!isMobile) {
        for (const d of ambientParts) {
            const x = ((d.x * W * 3 - cam.x * d.spd) % W + W) % W;
            const y = ((d.y * H * 3 - cam.y * d.spd) % H + H) % H;
            d.phase += 0.015;
            const a = d.a + Math.sin(d.phase) * 0.1;
            ctx.fillStyle = `rgba(167,139,250,${clamp(a, 0, 0.4)})`;
            ctx.beginPath();
            ctx.arc(x, y, d.r, 0, TAU);
            ctx.fill();
        }
    }
}

// ─── Grid ───────────────────────────────────────────────────
function drawGrid() {
    // On mobile, only draw major grid lines (much fewer draw calls)
    if (isMobile) {
        const MAJ = 200;
        const mx = ((-cam.x % MAJ) + MAJ) % MAJ;
        const my = ((-cam.y % MAJ) + MAJ) % MAJ;
        ctx.strokeStyle = 'rgba(34,211,238,0.05)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = mx; x < W; x += MAJ) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let y = my; y < H; y += MAJ) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
        return;
    }

    const GRID = 50;
    const sx = ((-cam.x % GRID) + GRID) % GRID;
    const sy = ((-cam.y % GRID) + GRID) % GRID;

    ctx.strokeStyle = 'rgba(34,211,238,0.04)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = sx; x < W; x += GRID) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = sy; y < H; y += GRID) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    const MAJ = GRID * 4;
    const mx = ((-cam.x % MAJ) + MAJ) % MAJ;
    const my = ((-cam.y % MAJ) + MAJ) % MAJ;
    ctx.strokeStyle = 'rgba(34,211,238,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = mx; x < W; x += MAJ) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = my; y < H; y += MAJ) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Grid glow near player
    const px = P.x - cam.x, py = P.y - cam.y;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, 160);
    grad.addColorStop(0, 'rgba(34,211,238,0.06)');
    grad.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - 160, py - 160, 320, 320);
}

// ─── Player ─────────────────────────────────────────────────
function drawPlayer() {
    const sx = P.x - cam.x, sy = P.y - cam.y;
    if (P.invuln > 0 && Math.floor(P.invuln / 3) % 2 === 0) return;

    const speed = Math.hypot(P.vx, P.vy);
    const angle = Math.atan2(P.vy, P.vx);
    const skin = SKINS[selectedSkin];

    if (isMobile) {
        // ── MOBILE: ultra-minimal player (no trail, no ring, no aura, no gradients, no alpha) ──
        ctx.save();
        ctx.fillStyle = skin.body;
        ctx.beginPath(); ctx.arc(sx, sy, P.r, 0, TAU); ctx.fill();
        // Very small white dot for definition (solid, no alpha)
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx - 2, sy - 2, 2, 0, TAU); ctx.fill();
        ctx.restore();
        // Eyes
        ctx.fillStyle = '#060612';
        for (let s = -1; s <= 1; s += 2) {
            const ex = sx + Math.cos(angle + s * 0.4) * 6;
            const ey = sy + Math.sin(angle + s * 0.4) * 6;
            ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, TAU); ctx.fill();
        }
        return;
    }

    // ── DESKTOP: full visual fidelity ──
    // Engine trail
    if (speed > 0.5) {
        ctx.save();
        const trailLen = speed * 6;
        const tx = sx - Math.cos(angle) * trailLen;
        const ty = sy - Math.sin(angle) * trailLen;
        const grad = ctx.createLinearGradient(sx, sy, tx, ty);
        grad.addColorStop(0,   hexRgba(skin.body, 0.3));
        grad.addColorStop(0.4, 'rgba(139,92,246,0.15)');
        grad.addColorStop(1,   'rgba(139,92,246,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = P.r * 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.restore();
    }

    // Energy ring (desktop only)
    if (!isMobile) {
        ctx.save();
        ctx.globalAlpha = 0.12 + Math.sin(frame * 0.08) * 0.05;
        const ringR = P.r + 8 + Math.sin(frame * 0.12) * 3;
        ctx.strokeStyle = skin.glow;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = skin.glow; ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.arc(sx, sy, ringR, 0, TAU); ctx.stroke();
        ctx.restore();
    }

    // Speed aura (desktop only)
    if (!isMobile && speed > 1) {
        ctx.save();
        const aGrad = ctx.createRadialGradient(sx, sy, P.r, sx, sy, P.r + 18);
        aGrad.addColorStop(0, hexRgba(skin.body, 0.15));
        aGrad.addColorStop(1, hexRgba(skin.body, 0));
        ctx.fillStyle = aGrad;
        ctx.beginPath(); ctx.arc(sx, sy, P.r + 18, 0, TAU); ctx.fill();
        ctx.restore();
    }

    // Body
    ctx.save();
    if (!isMobile) { ctx.shadowColor = skin.glow; ctx.shadowBlur = 30; }
    const bGrad = ctx.createRadialGradient(sx - 3, sy - 3, 0, sx, sy, P.r);
    bGrad.addColorStop(0,   '#fff');
    bGrad.addColorStop(0.3, skin.light);
    bGrad.addColorStop(0.6, skin.body);
    bGrad.addColorStop(1,   skin.dark);
    ctx.fillStyle = bGrad;
    ctx.beginPath(); ctx.arc(sx, sy, P.r, 0, TAU); ctx.fill();

    if (!isMobile) {
        ctx.globalAlpha = 0.35;
        const hGrad = ctx.createRadialGradient(sx - 3, sy - 4, 1, sx, sy, P.r * 0.7);
        hGrad.addColorStop(0, '#fff');
        hGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = hGrad;
        ctx.beginPath(); ctx.arc(sx, sy, P.r * 0.7, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // Eyes
    ctx.fillStyle = '#060612';
    for (let s = -1; s <= 1; s += 2) {
        const ex = sx + Math.cos(angle + s * 0.4) * 6;
        const ey = sy + Math.sin(angle + s * 0.4) * 6;
        ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, TAU); ctx.fill();
        if (!isMobile) {
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(ex + 0.8, ey - 0.8, 1, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#060612';
        }
    }
}

// ─── Orbiters ───────────────────────────────────────────────
function drawOrbiters() {
    for (const w of weapons) {
        if (w.type !== 'orbiter') continue;
        const def = WDEFS.orbiter;
        const lv  = w.lv;
        const cnt = def.cnt[lv];
        const rad = def.rad[lv];
        const px  = P.x - cam.x, py = P.y - cam.y;

        // Orbit path (skip on mobile)
        if (!isMobile) {
            ctx.save();
            ctx.globalAlpha = 0.06;
            ctx.strokeStyle = def.col;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 6]);
            ctx.beginPath(); ctx.arc(px, py, rad, 0, TAU); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        for (let i = 0; i < cnt; i++) {
            const a  = w.angle + (TAU / cnt) * i;
            const bx = P.x + Math.cos(a) * rad - cam.x;
            const by = P.y + Math.sin(a) * rad - cam.y;

            // Motion trail (skip on mobile)
            if (!isMobile) {
                ctx.save();
                ctx.globalAlpha = 0.15;
                const prevA = a - def.spd[lv] * 5;
                const pbx = P.x + Math.cos(prevA) * rad - cam.x;
                const pby = P.y + Math.sin(prevA) * rad - cam.y;
                ctx.strokeStyle = def.col;
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(pbx, pby); ctx.lineTo(bx, by); ctx.stroke();
                ctx.restore();
            }

            // Diamond blade
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(a + frame * 0.15);
            if (!isMobile) { ctx.shadowColor = def.col; ctx.shadowBlur = 18; }
            ctx.fillStyle = def.col;
            ctx.beginPath();
            ctx.moveTo(0, -12); ctx.lineTo(6, 0); ctx.lineTo(0, 12); ctx.lineTo(-6, 0);
            ctx.closePath();
            ctx.fill();
            if (!isMobile) {
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
            }
            ctx.restore();
        }
    }
}

// ─── Enemies ────────────────────────────────────────────────
function drawEnemies() {
    for (const e of enemies) {
        if (!e.alive) continue;
        const sx = e.x - cam.x, sy = e.y - cam.y;
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;

        ctx.save();
        let r = e.r;

        // Threat aura (skip on mobile)
        if (!isMobile && (e.type === 'boss' || e.type === 'brute')) {
            ctx.globalAlpha = 0.12;
            ctx.strokeStyle = e.col;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(sx, sy, r * 2, 0, TAU); ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Boss glow
        if (e.type === 'boss') {
            if (!isMobile) { ctx.shadowColor = e.hit > 0 ? '#fff' : e.col; ctx.shadowBlur = e.hit > 0 ? 18 : 8; }
            r += Math.sin(frame * 0.05) * 3;
        }

        // Body shape
        ctx.fillStyle = e.hit > 0 ? '#fff' : e.col;
        ctx.beginPath();
        switch (e.type) {
            case 'sprinter': {
                const a = Math.atan2(P.y - e.y, P.x - e.x);
                ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
                ctx.lineTo(sx + Math.cos(a + 2.3) * r, sy + Math.sin(a + 2.3) * r);
                ctx.lineTo(sx + Math.cos(a - 2.3) * r, sy + Math.sin(a - 2.3) * r);
                ctx.closePath();
                break;
            }
            case 'brute': {
                const rr = 3;
                ctx.moveTo(sx - r + rr, sy - r);
                ctx.lineTo(sx + r - rr, sy - r); ctx.arcTo(sx + r, sy - r, sx + r, sy - r + rr, rr);
                ctx.lineTo(sx + r, sy + r - rr); ctx.arcTo(sx + r, sy + r, sx + r - rr, sy + r, rr);
                ctx.lineTo(sx - r + rr, sy + r); ctx.arcTo(sx - r, sy + r, sx - r, sy + r - rr, rr);
                ctx.lineTo(sx - r, sy - r + rr); ctx.arcTo(sx - r, sy - r, sx - r + rr, sy - r, rr);
                ctx.closePath();
                break;
            }
            case 'exploder':
                for (let j = 0; j < 8; j++) {
                    const a = (TAU / 8) * j + frame * 0.04;
                    const rr = j % 2 === 0 ? r : r * 0.55;
                    j === 0 ? ctx.moveTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr)
                            : ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
                }
                ctx.closePath();
                break;
            case 'boss':
                for (let j = 0; j < 8; j++) {
                    const a = (TAU / 8) * j + frame * 0.008;
                    j === 0 ? ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r)
                            : ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
                }
                ctx.closePath();
                break;
            default:
                ctx.arc(sx, sy, r, 0, TAU);
        }
        ctx.fill();

        // Highlight dot (skip on mobile)
        if (!isMobile) {
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(sx - r * 0.2, sy - r * 0.2, r * 0.3, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Eyes (walker & sprinter)
        if (e.type === 'walker' || e.type === 'sprinter') {
            const ea = Math.atan2(P.y - e.y, P.x - e.x);
            ctx.fillStyle = '#fff';
            for (let s = -1; s <= 1; s += 2) {
                ctx.beginPath();
                ctx.arc(sx + Math.cos(ea + s * 0.5) * r * 0.4, sy + Math.sin(ea + s * 0.5) * r * 0.4, r * 0.18, 0, TAU);
                ctx.fill();
            }
            ctx.fillStyle = '#000';
            for (let s = -1; s <= 1; s += 2) {
                ctx.beginPath();
                ctx.arc(sx + Math.cos(ea + s * 0.5) * r * 0.5, sy + Math.sin(ea + s * 0.5) * r * 0.5, r * 0.1, 0, TAU);
                ctx.fill();
            }
        }

        // Boss HP bar (skip decorative rings on mobile)
        if (e.type === 'boss') {
            if (!isMobile) {
                ctx.save();
                ctx.globalAlpha = 0.25;
                ctx.strokeStyle = e.col;
                ctx.lineWidth = 2;
                const ba = frame * 0.02;
                ctx.beginPath(); ctx.arc(sx, sy, r + 10, ba, ba + PI * 1.2); ctx.stroke();
                ctx.beginPath(); ctx.arc(sx, sy, r + 10, ba + PI, ba + PI * 2.2); ctx.stroke();
                ctx.restore();
            }

            const bw = 70, bh = 7;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath(); ctx.roundRect(sx - bw / 2, sy - r - 18, bw, bh, 3); ctx.fill();

            const hpPct = clamp(e.hp / e.maxHp, 0, 1);
            const barCol = hpPct > 0.5 ? e.col : (hpPct > 0.25 ? '#f97316' : '#ef4444');
            ctx.fillStyle = barCol;
            if (!isMobile) { ctx.shadowColor = barCol; ctx.shadowBlur = 8; }
            ctx.beginPath(); ctx.roundRect(sx - bw / 2 + 1, sy - r - 17, (bw - 2) * hpPct, bh - 2, 2); ctx.fill();
        }

        ctx.restore();
    }
}

// ─── Projectiles ────────────────────────────────────────────
function drawProjectiles() {
    for (const p of projs) {
        const sx = p.x - cam.x, sy = p.y - cam.y;
        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

        ctx.save();
        ctx.fillStyle = p.col;
        const a = Math.atan2(p.vy, p.vx);
        ctx.translate(sx, sy);
        ctx.rotate(a);

        if (p.type === 'missile') {
            // Engine glow (skip on mobile)
            if (!isMobile) {
                ctx.globalAlpha = 0.25;
                const eGrad = ctx.createRadialGradient(-6, 0, 0, -6, 0, 10);
                eGrad.addColorStop(0, p.col);
                eGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = eGrad;
                ctx.beginPath(); ctx.arc(-6, 0, 10, 0, TAU); ctx.fill();
            }

            ctx.globalAlpha = 1;
            ctx.fillStyle = p.col;
            ctx.beginPath();
            ctx.moveTo(9, 0); ctx.lineTo(-5, -5); ctx.lineTo(-3, 0); ctx.lineTo(-5, 5);
            ctx.closePath();
            ctx.fill();

            if (!isMobile) {
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.6;
                ctx.beginPath(); ctx.arc(4, 0, 2, 0, TAU); ctx.fill();
            }
        } else {
            // Bolt — simpler on mobile
            if (isMobile) {
                ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
            } else {
                ctx.scale(1.5, 1);
                ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.5;
                ctx.beginPath(); ctx.arc(0, 0, p.r * 0.4, 0, TAU); ctx.fill();
            }
        }
        ctx.restore();
    }
}

// ─── Gems ───────────────────────────────────────────────────
function drawGems() {
    for (const g of gems) {
        const sx = g.x - cam.x, sy = g.y - cam.y;
        if (sx < -15 || sx > W + 15 || sy < -15 || sy > H + 15) continue;

        const pulse = 1 + Math.sin(g.pulse) * 0.25;
        const r = g.r * pulse;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(g.pulse * 0.5);

        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.7, 0);
        ctx.lineTo(0, r * 1.2);  ctx.lineTo(-r * 0.7, 0);
        ctx.closePath();
        ctx.fill();

        // Highlight (skip alpha blend on mobile)
        if (!isMobile) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#a7f3d0';
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.35, 0);
            ctx.lineTo(0, r * 0.6);  ctx.lineTo(-r * 0.35, 0);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }
}

// ─── Health Orbs ────────────────────────────────────────────
function drawHealthOrbs() {
    for (const h of healthOrbs) {
        const sx = h.x - cam.x, sy = h.y - cam.y;
        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

        const pulse = 1 + Math.sin(h.pulse) * 0.15;
        const r = h.r * pulse;

        // Flash when expiring
        if (h.life < 120 && Math.floor(h.life / 6) % 2 === 0) continue;

        // Ground glow (skip on mobile)
        if (!isMobile) {
            ctx.save();
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.arc(sx, sy, r * 3, 0, TAU); ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();

        ctx.fillStyle = '#fca5a5';
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.7, 0, TAU); ctx.fill();

        // White cross
        ctx.fillStyle = '#fff';
        const cw = r * 0.35, ch = r * 0.9;
        ctx.fillRect(sx - cw / 2, sy - ch / 2, cw, ch);
        ctx.fillRect(sx - ch / 2, sy - cw / 2, ch, cw);

        // Heal amount
        if (!isMobile) {
            ctx.globalAlpha = 0.6 + Math.sin(h.pulse * 1.5) * 0.3;
            ctx.font = "bold 10px 'Orbitron', sans-serif";
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fca5a5';
            ctx.fillText('+' + h.heal, sx, sy - r - 6);
        }

        ctx.restore();
    }
}

// ─── Power-Ups ──────────────────────────────────────────────
function drawPowerUps() {
    for (const pu of powerUps) {
        const sx = pu.x - cam.x, sy = pu.y - cam.y + pu.bobY;
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;

        if (pu.life < 180 && Math.floor(pu.life / 8) % 2 === 0) continue;

        const pulse = 1 + Math.sin(pu.pulse) * 0.12;
        const r = pu.r * pulse;

        ctx.save();

        // Ground ring (skip on mobile)
        if (!isMobile) {
            ctx.globalAlpha = 0.15 + Math.sin(pu.pulse) * 0.05;
            ctx.strokeStyle = pu.col;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(sx, pu.y - cam.y + 12, r * 1.8, r * 0.6, 0, 0, TAU); ctx.stroke();
        }

        // Ground glow (skip on mobile)
        if (!isMobile) {
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = pu.col;
            ctx.beginPath(); ctx.arc(sx, sy, r * 2.5, 0, TAU); ctx.fill();
        }

        // Light beam (skip on mobile)
        if (!isMobile) {
            ctx.globalAlpha = 0.06 + Math.sin(pu.pulse * 2) * 0.03;
            ctx.fillStyle = pu.col;
            ctx.beginPath();
            ctx.moveTo(sx - 3, sy - 60); ctx.lineTo(sx + 3, sy - 60);
            ctx.lineTo(sx + r * 0.8, sy + 8); ctx.lineTo(sx - r * 0.8, sy + 8);
            ctx.fill();
        }

        // Orb
        ctx.globalAlpha = 1;
        ctx.fillStyle = pu.col;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();

        // Core highlight (skip on mobile)
        if (!isMobile) {
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(sx - 2, sy - 2, r * 0.4, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Icon (canvas-drawn shape)
        ctx.shadowBlur = 0;
        const iconType = pu.iconType || pu.weapon || 'default';
        drawIconShape(sx, sy, iconType, r * 0.55, '#fff');

        // Label
        ctx.font = "bold 9px 'Orbitron', sans-serif";
        ctx.fillStyle = pu.col;
        ctx.globalAlpha = 0.8;
        ctx.fillText(pu.label, sx, sy + r + 14);

        // Epic sparkles (skip on mobile)
        if (!isMobile && pu.rarity === 'epic') {
            ctx.globalAlpha = 0.3 + Math.sin(pu.pulse * 3) * 0.2;
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 4; i++) {
                const sa = pu.pulse + (TAU / 4) * i;
                ctx.beginPath();
                ctx.arc(sx + Math.cos(sa) * r * 1.5, sy + Math.sin(sa) * r * 1.5, 1.5, 0, TAU);
                ctx.fill();
            }
        }

        ctx.restore();
    }
}

// ─── Particles & Effects ────────────────────────────────────
function drawParticles() {
    if (isMobile) return; // Skip all particles on mobile to reduce alpha blending
    for (const p of parts) {
        const sx = p.x - cam.x, sy = p.y - cam.y;
        if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
        const t = p.life / 40;
        ctx.globalAlpha = clamp(t, 0, 1);
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(sx, sy, p.r * clamp(t, 0, 1), 0, TAU);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawDmgNums() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of dmgNums) {
        const sx = d.x - cam.x, sy = d.y - cam.y;
        const t = d.life / 40;
        const alpha = t > 0.8 ? (1 - t) / 0.2 : (t < 0.3 ? t / 0.3 : 1);
        const bounce = t > 0.7 ? 1 + (1 - t) * 2 : 1;
        const size = d.isHeal ? 16 : (d.val >= 50 ? 17 : (d.val >= 20 ? 14 : 11));
        const col  = d.isHeal ? '#34d399' : (d.val >= 80 ? '#f472b6' : (d.val >= 50 ? '#fbbf24' : (d.val >= 20 ? '#fde68a' : '#e2e8f0')));

        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.font = `bold ${Math.round(size * bounce)}px 'Orbitron', sans-serif`;
        ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 3;
        ctx.strokeText(d.val, sx, sy);
        ctx.fillText(d.val, sx, sy);
        ctx.restore();
    }
}

function drawLightning() {
    for (const l of lightFx) {
        const alpha = l.life / 15;
        ctx.save();

        if (isMobile) {
            // ── MOBILE: single thin core line only, no glow, no impact circles ──
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = l.col;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            for (let i = 0; i < l.points.length; i++) {
                const sx = l.points[i].x - cam.x, sy = l.points[i].y - cam.y;
                if (i === 0) { ctx.moveTo(sx, sy); continue; }
                ctx.lineTo(sx, sy);
            }
            ctx.stroke();
        } else {
            // ── DESKTOP: glow layer + core layer + impact circles ──
            // Glow layer
            ctx.globalAlpha = alpha * 0.3;
            ctx.strokeStyle = l.col;
            ctx.shadowColor = l.col; ctx.shadowBlur = 25;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            for (let i = 0; i < l.points.length; i++) {
                const sx = l.points[i].x - cam.x, sy = l.points[i].y - cam.y;
                if (i === 0) { ctx.moveTo(sx, sy); continue; }
                const px = l.points[i - 1].x - cam.x, py = l.points[i - 1].y - cam.y;
                ctx.lineTo((px + sx) / 2 + rand(-15, 15), (py + sy) / 2 + rand(-15, 15));
                ctx.lineTo(sx, sy);
            }
            ctx.stroke();

            // Core layer
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#fff';
            ctx.shadowBlur = 0;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < l.points.length; i++) {
                const sx = l.points[i].x - cam.x, sy = l.points[i].y - cam.y;
                if (i === 0) { ctx.moveTo(sx, sy); continue; }
                const px = l.points[i - 1].x - cam.x, py = l.points[i - 1].y - cam.y;
                ctx.lineTo((px + sx) / 2 + rand(-10, 10), (py + sy) / 2 + rand(-10, 10));
                ctx.lineTo(sx, sy);
            }
            ctx.stroke();

            // Impact circles
            ctx.globalAlpha = alpha * 0.4;
            ctx.fillStyle = l.col;
            for (let i = 1; i < l.points.length; i++) {
                const sx = l.points[i].x - cam.x, sy = l.points[i].y - cam.y;
                ctx.beginPath(); ctx.arc(sx, sy, 8 * alpha, 0, TAU); ctx.fill();
            }
        }
        ctx.restore();
    }
}

function drawNovas() {
    for (const n of novaFx) {
        const alpha = 1 - n.r / n.maxR;
        const sx = n.x - cam.x, sy = n.y - cam.y;

        ctx.save();

        if (isMobile) {
            // ── MOBILE: single expanding ring, no gradient fill ──
            ctx.globalAlpha = alpha * 0.8;
            ctx.strokeStyle = n.col;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(sx, sy, n.r, 0, TAU); ctx.stroke();
        } else {
            // ── DESKTOP: gradient fill + double ring ──
            ctx.globalAlpha = alpha * 0.12;
            const nGrad = ctx.createRadialGradient(sx, sy, n.r * 0.7, sx, sy, n.r);
            nGrad.addColorStop(0, 'transparent');
            nGrad.addColorStop(1, n.col);
            ctx.fillStyle = nGrad;
            ctx.beginPath(); ctx.arc(sx, sy, n.r, 0, TAU); ctx.fill();

            ctx.globalAlpha = alpha;
            ctx.strokeStyle = n.col;
            ctx.shadowColor = n.col; ctx.shadowBlur = 25;
            ctx.lineWidth = 4 * alpha + 1;
            ctx.beginPath(); ctx.arc(sx, sy, n.r, 0, TAU); ctx.stroke();

            ctx.globalAlpha = alpha * 0.6;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(sx, sy, n.r * 0.7, 0, TAU); ctx.stroke();
        }
        ctx.restore();
    }
}

// ─── Overlays ───────────────────────────────────────────────
function drawJoystick() {
    if (!joy.active) return;
    const baseR = Math.max(50, Math.min(W, H) * 0.07); // scale with screen
    const knobR = Math.max(18, baseR * 0.36);
    // Clamp joystick origin to safe screen edges
    const sx = clamp(joy.sx, baseR + 10, W - baseR - 10);
    const sy = clamp(joy.sy, baseR + 10, H - baseR - 10);
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, baseR, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx + joy.dx * baseR, sy + joy.dy * baseR, knobR, 0, TAU); ctx.fill();
    ctx.restore();
}

function drawMagnetRange() {
    if (isMobile) return; // skip decorative gradient on mobile
    const px = P.x - cam.x, py = P.y - cam.y;
    ctx.save();
    const mg = ctx.createRadialGradient(px, py, P.magnet * 0.7, px, py, P.magnet);
    mg.addColorStop(0, 'rgba(52,211,153,0)');
    mg.addColorStop(1, 'rgba(52,211,153,0.04)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(px, py, P.magnet, 0, TAU); ctx.fill();

    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1;
    const ra = frame * 0.01;
    ctx.beginPath(); ctx.arc(px, py, P.magnet, ra, ra + PI * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, P.magnet, ra + PI, ra + PI * 1.6); ctx.stroke();
    ctx.restore();
}

function drawEdgeIndicators() {
    for (const e of enemies) {
        if (e.type !== 'boss') continue;
        const sx = e.x - cam.x, sy = e.y - cam.y;
        if (sx > 20 && sx < W - 20 && sy > 20 && sy < H - 20) continue;

        const a  = Math.atan2(sy - H / 2, sx - W / 2);
        const bound = Math.min(W / 2 - 30, H / 2 - 30);
        const ex = clamp(W / 2 + Math.cos(a) * bound, 30, W - 30);
        const ey = clamp(H / 2 + Math.sin(a) * bound, 30, H - 30);

        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = e.col;
        if (!isMobile) { ctx.shadowColor = e.col; ctx.shadowBlur = 10; }
        ctx.beginPath();
        ctx.moveTo(12, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

// ─── MAIN RENDER ────────────────────────────────────────────
function render() {
    resetCtxState();
    ctx.fillStyle = '#060612';
    ctx.fillRect(0, 0, W, H);
    drawBgStars();
    if (isMobile) resetCtxState();

    ctx.save();
    if (shake > 0.5) ctx.translate(rand(-shake, shake), rand(-shake, shake));

    drawGrid();
    if (isMobile) resetCtxState();
    drawMagnetRange();
    if (isMobile) resetCtxState();
    drawPowerUps();
    if (isMobile) resetCtxState();
    drawHealthOrbs();
    if (isMobile) resetCtxState();
    drawGems();
    if (isMobile) resetCtxState();
    drawNovas();
    if (isMobile) resetCtxState();
    drawLightning();
    if (isMobile) resetCtxState();
    drawEnemies();
    if (isMobile) resetCtxState();
    drawProjectiles();
    if (isMobile) resetCtxState();
    drawOrbiters();
    if (isMobile) resetCtxState();
    drawParticles();
    if (isMobile) resetCtxState();
    drawDmgNums();
    if (isMobile) resetCtxState();
    drawPlayer();
    if (isMobile) resetCtxState();

    ctx.restore();

    drawJoystick();
    if (isMobile) resetCtxState();

    // Damage flash overlay (reduced on mobile)
    if (flashAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = isMobile ? flashAlpha * 0.5 : flashAlpha;
        const flashCol = P.hp >= P.maxHp * 0.95 && flashAlpha < 0.2
            ? '#34d399' : (P.hp > 0 ? '#fbbf24' : '#ef4444');
        ctx.fillStyle = flashCol;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    // Low-HP vignette (skip on mobile — radialGradient fill each frame is heavy)
    if (!isMobile && P.hp > 0) {
        const hpRatio = clamp(P.hp / P.maxHp, 0, 1);
        if (hpRatio < 0.4) {
            ctx.save();
            const vAlpha = (0.4 - hpRatio) * 0.6;
            const vGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.8);
            vGrad.addColorStop(0, 'transparent');
            vGrad.addColorStop(1, `rgba(239,68,68,${vAlpha})`);
            ctx.fillStyle = vGrad;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
    }

    drawEdgeIndicators();

    // Enemy count (debug)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.font = "11px 'Orbitron', sans-serif";
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`${enemies.length} enemies`, 16, H - 14);
    ctx.restore();

    // Kill streak notification
    if (kills > 0 && kills % 50 === 0 && frame % 60 < 45) {
        const t = (frame % 60) / 45;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = "bold 32px 'Orbitron', sans-serif";
        const col = kills >= 200 ? '#f472b6' : (kills >= 100 ? '#a78bfa' : '#fbbf24');
        ctx.fillStyle = col;
        if (!isMobile) { ctx.shadowColor = col; ctx.shadowBlur = 25; }
        ctx.globalAlpha = 1 - t;
        ctx.fillText(`${kills} KILLS!`, W / 2, H / 2 + 60 - t * 30);
        ctx.restore();
    }
}

// ─── GAME LOOP (Fixed timestep — consistent across 60/144/165Hz) ────
const FIXED_DT  = 1 / 60;      // logic always runs at 60 ticks/sec
const MAX_FRAME = 0.25;         // cap to prevent spiral of death after tab switch
let accumulator = 0;
let lastTimestamp = 0;

function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    let elapsed = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    // Cap elapsed to prevent huge catch-up after tab-away / focus loss
    if (elapsed > MAX_FRAME) elapsed = MAX_FRAME;

    if (state === 'menu' || state === 'lobby') {
        // Menu/lobby: just render background, no physics accumulation
        ctx.fillStyle = '#060612';
        ctx.fillRect(0, 0, W, H);
        drawBgStars();
        frame++;
    } else if (state === 'play' || state === 'dead' || state === 'paused') {
        // Accumulate real time, run fixed-step updates
        accumulator += elapsed;
        while (accumulator >= FIXED_DT) {
            update();
            accumulator -= FIXED_DT;
        }
        render();
    }

    requestAnimationFrame(gameLoop);
}

// Boot
initGame();
requestAnimationFrame(gameLoop);

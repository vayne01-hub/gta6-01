// main.js — Neon Bay boot, game loop, camera, input and screens.
// An original open-world crime game: on foot and by car, traffic and
// pedestrians, stealable cars, wanted levels and police, four story
// missions, combat, a HUD with minimap, and a localStorage save.
import * as THREE from 'three';
import { makeRng, buildWorld, buildProps } from './world.js';
import { createPlayer, updatePlayer, playerAttack, reloadWeapon } from './player.js';
import { createCars, nearestCar, enterCar, exitCar, updateDriving } from './vehicles.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPolice, updatePolice } from './police.js';
import { createMissions, updateMissions, updateEnemies } from './missions.js';
import { createHud, updateHud } from './hud.js';
import { createAudio } from './audio.js';
import { createSave } from './save.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10) || 7;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
camera.yaw = 0; camera.pitch = -0.32;

const G = {
  THREE, scene, camera, renderer,
  rng: makeRng(seed),
  input: { keys: new Set(), dragging: false, lastX: 0, lastY: 0 },
  state: {
    mode: 'menu', time: 0, cash: 250, wanted: 0,
    inCar: false, currentCar: null, storyDone: false,
  },
  enemies: [],
};
G.world = buildWorld(G);
buildProps(G, G.world);
G.player = createPlayer(G);
G.cars = createCars(G);
G.traffic = createTraffic(G);
G.police = createPolice(G);
G.missions = createMissions(G);
G.hud = createHud(G);
G.audio = createAudio();
G.save = createSave(G);
G.hud.updateWanted();
G.hud.setCash(G.state.cash);

// Camera: third-person follow, smoothed, mouse orbit.
// In the menu the camera holds whatever framing the screen preset set.
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (G.state.mode === 'menu') return;
  const focus = G.state.inCar && G.state.currentCar
    ? G.state.currentCar.pos : G.player.pos;
  const yaw = G.state.inCar && G.state.currentCar ? G.state.currentCar.angle + Math.PI : camera.yaw;
  const dist = G.state.inCar ? 11 : 8;
  const height = G.state.inCar ? 4.6 : 3.4;
  const tx = focus.x - Math.sin(yaw) * dist;
  const tz = focus.z - Math.cos(yaw) * dist;
  const ty = focus.y + height;
  camTarget.set(tx, ty, tz);
  camera.position.lerp(camTarget, Math.min(1, dt * 6));
  const look = new THREE.Vector3(focus.x, focus.y + 1.6, focus.z);
  camera.lookAt(look);
  camera.position.y += Math.sin(camera.pitch) * 2;
}

// ---- input: keyboard, mouse drag camera, click to attack ----
const input = G.input;
addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  input.keys.add(e.code);
  if (e.code === 'KeyM') {
    const muted = G.audio.toggleMute();
    G.hud.feed(muted ? 'Sound muted.' : 'Sound on.');
  }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyE') onInteract();
  if (e.code === 'Digit1') { G.player.weapon = 'fists'; G.hud.feed('Fists ready.'); }
  if (e.code === 'Digit2') {
    if (G.player.ammo > 0 || G.player.reserveAmmo > 0) {
      G.player.weapon = 'pistol'; G.hud.feed('Pistol drawn.');
    } else { G.hud.feed('No pistol ammo. Find ammo by taking down rivals (+$40 each).'); }
  }
  if (e.code === 'KeyR') reloadWeapon(G);
  if (e.code === 'Enter' && G.state.mode === 'menu') startGame(false);
  if ((e.code === 'KeyE' || e.code === 'Enter') && G.missions.dialogOpen) G.missions.showNextDialog();
});
addEventListener('keyup', (e) => input.keys.delete(e.code));
canvas.addEventListener('mousedown', (e) => {
  G.audio.ensure(); G.audio.resume();
  if (G.missions.dialogOpen) { G.missions.showNextDialog(); return; }
  if (G.state.mode !== 'playing') return;
  input.dragging = true; input.lastX = e.clientX; input.lastY = e.clientY;
  if (e.button === 0) playerAttack(G);
});
addEventListener('mouseup', () => { input.dragging = false; });
addEventListener('mousemove', (e) => {
  if (!input.dragging) return;
  camera.yaw -= (e.clientX - input.lastX) * 0.005;
  camera.pitch = Math.max(-0.9, Math.min(0.5, camera.pitch - (e.clientY - input.lastY) * 0.004));
  input.lastX = e.clientX; input.lastY = e.clientY;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- interactions: enter/exit car, talk to mission marker ----
function onInteract() {
  if (G.state.mode !== 'playing') return;
  if (G.missions.dialogOpen) return; // handled by the keydown path
  if (G.state.inCar) { exitCar(G); return; }
  const car = nearestCar(G, G.player.pos, 4.5);
  if (car) { enterCar(G, car); return; }
  if (G.missions.stage === 'idle' &&
    Math.hypot(G.player.pos.x - G.missions.target.x, G.player.pos.z - G.missions.target.z) < 6) {
    G.missions.start();
  }
}

// ---- screens: start, pause, resume ----
function startGame(fromSave) {
  G.audio.ensure(); G.audio.resume();
  if (fromSave) G.save.loadGame();
  G.state.mode = 'playing';
  G.hud.hideStart();
  G.hud.show();
  G.hud.feed('Welcome to Neon Bay. Follow the gold marker to the pier café.');
  document.getElementById('loading').classList.add('hidden');
}
function togglePause() {
  if (G.state.mode === 'playing') {
    G.state.mode = 'paused';
    G.hud.showPause();
  } else if (G.state.mode === 'paused') {
    G.state.mode = 'playing';
    G.hud.hidePause();
  }
}
document.getElementById('playbtn').addEventListener('click', () => startGame(false));
document.getElementById('continuebtn').addEventListener('click', () => startGame(true));
document.getElementById('loadbtn2').addEventListener('click', () => startGame(true));
document.getElementById('newbtn').addEventListener('click', () => {
  G.save.clearSave();
  G.state.cash = 250; G.missions.index = 0; G.missions.stage = 'idle';
  G.player.pos.set(0, 0, 78); G.player.health = 100;
  startGame(false);
});
document.getElementById('resumebtn').addEventListener('click', togglePause);
document.getElementById('savebtn').addEventListener('click', () => { G.save.saveGame(); });
document.getElementById('loadbtn').addEventListener('click', () => { G.save.loadGame(); togglePause(); });
document.getElementById('restartbtn').addEventListener('click', () => {
  G.save.clearSave();
  location.reload();
});

// ---- game loop ----
const clock = new THREE.Clock();
let hudTick = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.state.mode === 'playing') {
    G.state.time += dt;
    updatePlayer(G, dt);
    updateDriving(G, dt);
    updateTraffic(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    updateEnemies(G, dt);
    updateInteractPrompt();
    G.world.wheel.rotation.z += dt * 0.25;
    hudTick += dt;
    if (hudTick > 0.12) { hudTick = 0; updateHud(G); }
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

function updateInteractPrompt() {
  if (G.missions.dialogOpen) { G.hud.hidePrompt(); return; }
  if (G.state.inCar) { G.hud.showPrompt('E — Exit car'); return; }
  const car = nearestCar(G, G.player.pos, 4.5);
  if (car) {
    G.hud.showPrompt(car.stolen ? 'E — Get in car' : 'E — Steal car');
    return;
  }
  if (G.missions.stage === 'idle' &&
    Math.hypot(G.player.pos.x - G.missions.target.x, G.player.pos.z - G.missions.target.z) < 6) {
    G.hud.showPrompt('E — Talk to Mara, start the job');
    return;
  }
  G.hud.hidePrompt();
}

// ---- screenshot presets: real game states, chosen by ?shot= ----
// start  — the title screen over the city
// play   — on foot in the city with the HUD
// drive  — behind the wheel on a main road
// chase  — a 3-star police chase in progress
// mission— mission 1 briefing and objective on screen
function applyShotPreset() {
  const shot = params.get('shot');
  if (!shot) return;
  startGame(false);
  if (shot === 'start') {
    G.state.mode = 'menu';
    G.hud.hide();
    G.hud.showStart();
    camera.position.set(40, 26, 150);
    camera.lookAt(0, 8, 0);
    return;
  }
  if (shot === 'drive' || shot === 'chase') {
    const car = G.cars[0];
    G.player.pos.set(car.pos.x, 0, car.pos.z);
    enterCar(G, car);
    car.speed = 24;
    G.state.wanted = 0;
    if (shot === 'chase') {
      G.police.addHeat(3.0);
      G.police.cars.forEach((c, i) => {
        c.pos.set(car.pos.x - 18 - i * 8, 0, car.pos.z - 26 - i * 6);
      });
    }
  }
  if (shot === 'mission') {
    G.missions.start();
  }
  if (shot === 'play') {
    G.player.pos.set(0, 0, 40);
    G.player.group.position.copy(G.player.pos);
  }
}

// ---- hooks for automated play-testing (window.__NB) ----
window.__NB = {
  G,
  state: G.state,
  start: () => startGame(false),
  enterNearestCar: () => { const c = nearestCar(G, G.player.pos, 30); if (c) enterCar(G, c); return !!c; },
  setWanted: (n) => { G.police.heat = n; G.state.wanted = n; G.hud.updateWanted(); },
  startMission: () => G.missions.start(),
  mission: () => ({ index: G.missions.index, stage: G.missions.stage, sub: G.missions.sub }),
  teleport: (x, z) => { G.player.pos.set(x, 0, z); G.player.group.position.copy(G.player.pos); },
  snapshot: () => ({
    mode: G.state.mode, cash: G.state.cash, wanted: G.state.wanted,
    health: Math.round(G.player.health),
    inCar: G.state.inCar,
    carSpeed: G.state.currentCar ? Math.round(G.state.currentCar.speed * 3.6) : 0,
    player: { x: Math.round(G.player.pos.x), z: Math.round(G.player.pos.z) },
    police: G.police.cars.length,
    traffic: G.traffic.cars.length,
    peds: G.traffic.peds.filter((p) => !p.dead).length,
    missionIndex: G.missions.index, missionStage: G.missions.stage,
    enemies: G.enemies.filter((e) => !e.dead).length,
  }),
};

document.getElementById('loading').classList.add('hidden');
camera.position.set(60, 30, 170);
camera.lookAt(0, 10, 0);
G.hud.showStart();
applyShotPreset();
loop();

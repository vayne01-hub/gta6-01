// police.js — the wanted system and the Neon Bay PD.
// Heat rises with crimes and decays when you stay out of sight;
// police cars spawn at the city edge, chase, ram, and try to bust you.
import * as THREE from 'three';
import { buildCarMesh } from './vehicles.js';

export function createPolice(G) {
  return {
    heat: 0, // 0..5.6; wanted = floor(heat) capped at 5
    cars: [],
    bustedTimer: 0,
    sirenPhase: 0,
    addHeat(amount) {
      this.heat = Math.min(5.6, this.heat + amount);
      G.state.wanted = Math.min(5, Math.floor(this.heat));
      if (this.heat >= 1 && this.cars.length === 0) spawnPolice(G, 1);
      G.hud.updateWanted();
    },
    clearPolice() {
      for (const c of this.cars) { G.scene.remove(c.group); }
      this.cars = [];
    },
  };
}

function spawnPolice(G, n) {
  const P = G.police;
  const want = Math.min(1 + Math.floor(G.state.wanted / 2), 3);
  for (let i = 0; i < Math.max(n, want); i++) {
    const angle = G.rng() * Math.PI * 2;
    const r = 120 + G.rng() * 60;
    const spot = {
      x: G.player.pos.x + Math.cos(angle) * r,
      z: G.player.pos.z + Math.sin(angle) * r,
    };
    const mesh = buildCarMesh(G, 0x1a1a22, true);
    const car = {
      mesh, group: mesh.group, wheels: mesh.wheels,
      pos: new THREE.Vector3(spot.x, 0, spot.z),
      angle: 0, speed: 0, topSpeed: 30 + G.state.wanted * 3.5,
    };
    car.group.position.copy(car.pos);
    P.cars.push(car);
    G.audio.play('siren');
  }
}

export function updatePolice(G, dt) {
  const P = G.police;
  if (G.state.mode !== 'playing') return;
  const wanted = G.state.wanted;
  // Keep the chase sized to the wanted level.
  const desired = wanted === 0 ? 0 : Math.min(1 + Math.floor(wanted / 2), 3);
  if (wanted > 0 && P.cars.length < desired) spawnPolice(G, desired - P.cars.length);
  if (wanted === 0 && P.cars.length > 0) {
    // Give up one by one once the heat is gone.
    const gone = P.cars.pop();
    G.scene.remove(gone.group);
    if (P.cars.length === 0) G.hud.feed('The cops lost you. Breathe.');
  }
  // Heat decays only when no police car can see you up close.
  let nearest = Infinity;
  for (const c of P.cars) {
    nearest = Math.min(nearest, Math.hypot(c.pos.x - G.player.pos.x, c.pos.z - G.player.pos.z));
  }
  if (wanted > 0 && nearest > 55 && G.player.speed < 4 && !(G.state.currentCar && Math.abs(G.state.currentCar.speed) > 4)) {
    P.heat = Math.max(0, P.heat - dt * 0.35);
    const w = Math.min(5, Math.floor(P.heat));
    if (w !== G.state.wanted) { G.state.wanted = w; G.hud.updateWanted(); }
  }
  // Chase: steer toward the player, ram on contact, siren wails.
  for (const car of P.cars) {
    const dx = G.player.pos.x - car.pos.x, dz = G.player.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    car.speed = Math.min(car.topSpeed, car.speed + 22 * dt);
    if (d > 260) { // too far: respawn closer so the chase never dies of distance
      const a = G.rng() * Math.PI * 2;
      car.pos.set(G.player.pos.x + Math.cos(a) * 90, 0, G.player.pos.z + Math.sin(a) * 90);
      car.speed = 12;
    }
    car.pos.x += Math.sin(car.angle) * car.speed * dt;
    car.pos.z += Math.cos(car.angle) * car.speed * dt;
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.angle;
    const spin = car.speed * dt * 2.2;
    for (const w of car.wheels) w.rotation.x += spin;
    if (d < 3.4) {
      // Ram: shove the player's car, hurt the player on foot.
      if (G.state.currentCar) {
        G.state.currentCar.speed *= 0.55;
        G.state.currentCar.pos.x += Math.sin(car.angle) * 3 * dt * 10;
        G.state.currentCar.pos.z += Math.cos(car.angle) * 3 * dt * 10;
      }
      car.speed *= 0.5;
      G.audio.play('crash');
      G.hud.damageFlash();
      G.player.health = Math.max(1, G.player.health - 4 * dt * 10);
    }
  }
  // Busted: a police car sits on you while you crawl — the law wins.
  const playerSpeed = G.state.currentCar ? Math.abs(G.state.currentCar.speed) : G.player.speed;
  if (wanted > 0 && nearest < 4.5 && playerSpeed < 2.5) {
    P.bustedTimer += dt;
    if (P.bustedTimer > 1.2) {
      G.hud.showBusted('Busted by the Neon Bay PD. Fine: $200. The story continues…');
      G.audio.play('wasted');
      P.bustedTimer = 0;
      setTimeout(() => {
        G.state.cash = Math.max(0, G.state.cash - 200);
        P.heat = 0; G.state.wanted = 0; G.hud.updateWanted();
        P.clearPolice();
        G.hud.hideBusted();
        G.hud.feed('You paid the fine and walked out of the precinct. Lay low for a while.');
      }, 2200);
    }
  } else {
    P.bustedTimer = Math.max(0, P.bustedTimer - dt * 2);
  }
  P.sirenPhase += dt;
}

// traffic.js — traffic cars that follow the road grid and pedestrians
// who stroll the sidewalks and scatter when trouble comes.
import * as THREE from 'three';
import { randomRoadPoint, nearestRoadPoint, collidesWithBuildings } from './world.js';
import { buildCarMesh } from './vehicles.js';

const PED_COLORS = [0xe86a5a, 0x5a9ae8, 0x8ae85a, 0xe8d25a, 0xc25ae8, 0x5ae8d2, 0xe8e8e8];

export function createTraffic(G) {
  const T = { cars: [], peds: [] };
  for (let i = 0; i < 10; i++) {
    const spot = randomRoadPoint(G, G.world);
    const mesh = buildCarMesh(G, [0x9aa5b0, 0xb08a5a, 0x5a7a8a, 0x8a8a8a][i % 4], false);
    const car = {
      mesh, group: mesh.group, wheels: mesh.wheels,
      pos: new THREE.Vector3(spot.x, 0, spot.z),
      angle: 0, speed: 8 + G.rng() * 5, target: null, bumped: false,
    };
    car.target = pickTarget(G, car.pos);
    car.group.position.copy(car.pos);
    T.cars.push(car);
  }
  for (let i = 0; i < 14; i++) {
    const spot = randomRoadPoint(G, G.world);
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: PED_COLORS[i % PED_COLORS.length] });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.4), shirt);
    body.position.y = 0.95; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.MeshLambertMaterial({ color: 0xc89878 }));
    head.position.y = 1.65;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x333a44 }));
    leg.position.set(-0.16, 0.35, 0);
    const leg2 = leg.clone(); leg2.position.x = 0.16;
    group.add(body, head, leg, leg2);
    group.position.set(spot.x + 9, 0, spot.z + 9);
    G.scene.add(group);
    T.peds.push({
      group, leg, leg2,
      pos: new THREE.Vector3(spot.x + 9, 0, spot.z + 9),
      angle: G.rng() * Math.PI * 2, speed: 1.2 + G.rng() * 0.9,
      target: null, dead: false, swing: G.rng() * 6, fleeing: false,
    });
  }
  return T;
}

function pickTarget(G, from) {
  // A road point some distance away, on the same grid.
  for (let tries = 0; tries < 12; tries++) {
    const p = randomRoadPoint(G, G.world);
    if (Math.hypot(p.x - from.x, p.z - from.z) > 120) return new THREE.Vector3(p.x, 0, p.z);
  }
  return new THREE.Vector3(-from.x, 0, -from.z);
}

export function updateTraffic(G, dt) {
  if (G.state.mode !== 'playing') return;
  const playerPos = G.player.pos;
  for (const car of G.traffic.cars) {
    const to = car.target;
    const dx = to.x - car.pos.x, dz = to.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 6) { car.target = pickTarget(G, car.pos); continue; }
    const want = Math.atan2(dx, dz);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    // Slow down for the player car ahead, like a real driver would.
    let speed = car.speed;
    const pCar = G.state.currentCar;
    if (pCar) {
      const pd = Math.hypot(pCar.pos.x - car.pos.x, pCar.pos.z - car.pos.z);
      if (pd < 10) speed = 3;
    }
    car.pos.x += Math.sin(car.angle) * speed * dt;
    car.pos.z += Math.cos(car.angle) * speed * dt;
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.angle;
    const spin = speed * dt * 2.2;
    for (const w of car.wheels) w.rotation.x += spin;
  }
  for (const ped of G.traffic.peds) {
    if (ped.dead) continue;
    const dPlayer = Math.hypot(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
    const danger = G.state.wanted > 0 || (G.state.currentCar && Math.abs(G.state.currentCar.speed) > 10 && dPlayer < 14);
    ped.fleeing = danger && dPlayer < 26;
    if (!ped.target || Math.hypot(ped.target.x - ped.pos.x, ped.target.z - ped.pos.z) < 3) {
      const snap = nearestRoadPoint(G.world, ped.pos.x, ped.pos.z);
      const t = randomRoadPoint(G, G.world);
      ped.target = new THREE.Vector3(t.x + 9, 0, t.z + 9);
      if (ped.fleeing) {
        // Run away from the player, roughly.
        ped.target.set(ped.pos.x + (ped.pos.x - playerPos.x) * 2, 0, ped.pos.z + (ped.pos.z - playerPos.z) * 2);
      }
    }
    const speed = ped.fleeing ? ped.speed * 3.2 : ped.speed;
    const dx = ped.target.x - ped.pos.x, dz = ped.target.z - ped.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.1) {
      const want = Math.atan2(dx, dz);
      ped.angle = want;
      ped.pos.x += (dx / d) * speed * dt;
      ped.pos.z += (dz / d) * speed * dt;
      if (!collidesWithBuildings(G.world, ped.pos.x, ped.pos.z, 0.5)) {
        // keep walking
      } else {
        ped.target = null;
      }
    }
    ped.swing += speed * dt * 5;
    const sw = Math.sin(ped.swing) * 0.5;
    ped.leg.rotation.x = sw; ped.leg2.rotation.x = -sw;
    ped.group.position.copy(ped.pos);
    ped.group.rotation.y = ped.angle;
  }
}

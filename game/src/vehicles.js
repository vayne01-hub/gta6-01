// vehicles.js — stealable, drivable cars with simple arcade physics.
// Every car is built from boxes and cylinders; no model files, no assets.
import * as THREE from 'three';
import { collidesWithBuildings, clampToCity, randomRoadPoint } from './world.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8b93c, 0x3aa655, 0xe8e8e8, 0x22262c, 0x8a4ec2, 0xd86a1e];

export function buildCarMesh(G, color, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55; body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.7), paint);
  nose.position.set(0, 0.45, 2.3);
  group.add(body, cabin, nose);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    group.add(w);
    wheels.push(w);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    bar.position.set(0, 1.5, -0.2);
    group.add(bar);
    const lightR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.45),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    lightR.position.set(-0.28, 1.62, -0.2);
    const lightB = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.45),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    lightB.position.set(0.28, 1.62, -0.2);
    group.add(lightR, lightB);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  head.position.set(0, 0.6, 2.66);
  group.add(head);
  G.scene.add(group);
  return { group, wheels };
}

export function createCars(G) {
  const cars = [];
  // The player's own starter car, parked near the pier spawn.
  cars.push(spawnCar(G, { x: 6, z: 66 }, 0x2e6fc2, 'your own sedan'));
  for (let i = 0; i < 9; i++) {
    const spot = randomRoadPoint(G, G.world);
    cars.push(spawnCar(G, spot, CAR_COLORS[i % CAR_COLORS.length], 'parked car'));
  }
  return cars;
}

export function spawnCar(G, spot, color, label) {
  const mesh = buildCarMesh(G, color, false);
  const car = {
    mesh, group: mesh.group, wheels: mesh.wheels,
    pos: new THREE.Vector3(spot.x, 0, spot.z),
    angle: G.rng() * Math.PI * 2,
    speed: 0, steer: 0, color, label,
    parked: true, skid: 0,
  };
  car.group.position.copy(car.pos);
  car.group.rotation.y = car.angle;
  return car;
}

export function nearestCar(G, pos, maxD) {
  let best = null, bestD = maxD;
  for (const car of G.cars) {
    if (car === G.state.currentCar) continue;
    const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

export function enterCar(G, car) {
  G.state.inCar = true;
  G.state.currentCar = car;
  car.parked = false;
  G.player.group.visible = false;
  if (!car.stolen) {
    car.stolen = true;
    G.police.addHeat(1.0);
    G.hud.feed('You hot-wire the car. Somebody saw that — the cops are coming.');
    G.audio.play('alarm');
  } else {
    G.hud.feed('You slide into the driver’s seat.');
  }
  G.audio.play('door');
}

export function exitCar(G) {
  const car = G.state.currentCar;
  if (!car) return;
  car.speed = 0;
  const side = new THREE.Vector3(Math.cos(car.angle), 0, -Math.sin(car.angle));
  G.player.pos.set(car.pos.x + side.x * 2.2, 0, car.pos.z + side.z * 2.2);
  G.player.group.position.copy(G.player.pos);
  G.player.group.visible = true;
  G.player.angle = car.angle;
  G.state.inCar = false;
  G.state.currentCar = null;
  G.audio.play('door');
}

// ---- arcade driving: accelerate, brake, steer, drift a little ----
export function updateDriving(G, dt) {
  const car = G.state.currentCar;
  const input = G.input;
  if (!car || G.state.mode !== 'playing') return;
  const fwd = input.keys.has('KeyW') || input.keys.has('ArrowUp');
  const back = input.keys.has('KeyS') || input.keys.has('ArrowDown');
  const left = input.keys.has('KeyA') || input.keys.has('ArrowLeft');
  const right = input.keys.has('KeyD') || input.keys.has('ArrowRight');
  const topSpeed = 42;
  if (fwd) car.speed += 26 * dt;
  if (back) car.speed -= (car.speed > 0.5 ? 34 : 14) * dt;
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * 12 * dt;
  if (Math.abs(car.speed) < 0.2 && !fwd && !back) car.speed = 0;
  car.speed = Math.max(-12, Math.min(topSpeed, car.speed));
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const turnRate = car.steer * 1.9 * Math.min(1, Math.abs(car.speed) / 8);
  car.angle += turnRate * dt * Math.sign(car.speed || 1);
  const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
  const nx = car.pos.x + fx * car.speed * dt;
  const nz = car.pos.z + fz * car.speed * dt;
  if (collidesWithBuildings(G.world, nx, car.pos.z, 1.4)) {
    if (Math.abs(car.speed) > 8) { crashCar(G, car); }
    car.speed *= -0.25;
  } else {
    car.pos.x = nx;
  }
  if (collidesWithBuildings(G.world, car.pos.x, nz, 1.4)) {
    if (Math.abs(car.speed) > 8) { crashCar(G, car); }
    car.speed *= -0.25;
  } else {
    car.pos.z = nz;
  }
  const c = clampToCity(car.pos.x, car.pos.z);
  if (c.x !== car.pos.x || c.z !== car.pos.z) {
    car.pos.x = c.x; car.pos.z = c.z;
    car.speed *= 0.4;
  }
  // Wheels spin, body leans into corners, skids squeal at speed.
  const spin = car.speed * dt * 2.2;
  for (const w of car.wheels) w.rotation.x += spin;
  car.group.position.copy(car.pos);
  car.group.rotation.y = car.angle;
  car.group.rotation.z = -car.steer * Math.min(1, Math.abs(car.speed) / 20) * 0.05;
  car.skid = Math.abs(car.steer) > 0.7 && Math.abs(car.speed) > 18 ? car.skid + dt : 0;
  if (car.skid > 0.4) { G.audio.play('skid'); car.skid = 0; }
  // Running over a pedestrian or smashing traffic is a crime.
  for (const ped of G.traffic.peds) {
    if (!ped.dead && Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 2.2 && Math.abs(car.speed) > 6) {
      ped.dead = true;
      ped.group.visible = false;
      G.police.addHeat(1.2);
      G.hud.feed('You hit a pedestrian! The whole city just saw it.');
      G.audio.play('crash');
    }
  }
  for (const t of G.traffic.cars) {
    if (Math.hypot(t.pos.x - car.pos.x, t.pos.z - car.pos.z) < 3.2 && Math.abs(car.speed) > 5) {
      if (!t.bumped) {
        t.bumped = true;
        G.police.addHeat(0.7);
        G.hud.feed('You smashed into traffic. That will cost you.');
        G.audio.play('crash');
        car.speed *= 0.4;
        setTimeout(() => { t.bumped = false; }, 1500);
      }
    }
  }
  // The player rides along: on-foot position follows the car.
  G.player.pos.copy(car.pos);
  G.player.angle = car.angle;
  G.audio.engine(car.speed / topSpeed, !!car, G.state.wanted);
}

function crashCar(G, car) {
  G.audio.play('crash');
  G.hud.damageFlash();
  if (Math.abs(car.speed) > 18) {
    G.player.health = Math.max(1, G.player.health - 8);
    G.hud.feed('You slam into a building. Ouch.');
  }
}

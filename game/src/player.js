// player.js — on-foot third-person movement, camera, health and combat.
// The player is a simple built-from-boxes character: jacket, head, cap.
import * as THREE from 'three';
import { collidesWithBuildings, clampToCity } from './world.js';

export function createPlayer(G) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xd84a3a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3550 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.45), jacket);
  body.position.y = 1.05; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.85; head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.56),
    new THREE.MeshLambertMaterial({ color: 0x222222 }));
  cap.position.y = 2.14;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.36), pants);
  legL.position.set(-0.22, 0.4, 0);
  const legR = legL.clone(); legR.position.x = 0.22;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.28), jacket);
  armL.position.set(-0.56, 1.1, 0);
  const armR = armL.clone(); armR.position.x = 0.56;
  group.add(body, head, cap, legL, legR, armL, armR);
  G.scene.add(group);
  const p = {
    group, body, head, legL, legR, armL, armR,
    pos: new THREE.Vector3(0, 0, 78), angle: 0, vy: 0, grounded: true,
    health: 100, maxHealth: 100, speed: 0, walking: false,
    weapon: 'fists', ammo: 12, reserveAmmo: 48,
    punchCooldown: 0, shootCooldown: 0, muzzle: null, swing: 0,
  };
  group.position.copy(p.pos);
  return p;
}

export function updatePlayer(G, dt) {
  const p = G.player, input = G.input, W = G.world;
  if (G.state.mode !== 'playing' || G.state.inCar) return;
  const run = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const walkSpeed = run ? 11 : 5.5;
  let fx = 0, fz = 0;
  if (input.keys.has('KeyW')) fz -= 1;
  if (input.keys.has('KeyS')) fz += 1;
  if (input.keys.has('KeyA')) fx -= 1;
  if (input.keys.has('KeyD')) fx += 1;
  const moving = fx !== 0 || fz !== 0;
  p.walking = moving;
  const camYaw = G.camera.yaw;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  let mx = 0, mz = 0;
  if (moving) {
    const len = Math.hypot(fx, fz); fx /= len; fz /= len;
    mx = fx * cos - fz * sin;
    mz = fx * sin + fz * cos;
    p.speed = walkSpeed;
    p.angle = Math.atan2(mx, mz);
    const nx = p.pos.x + mx * walkSpeed * dt;
    const nz = p.pos.z + mz * walkSpeed * dt;
    if (!collidesWithBuildings(W, nx, p.pos.z, 0.6)) p.pos.x = nx;
    if (!collidesWithBuildings(W, p.pos.x, nz, 0.6)) p.pos.z = nz;
    const c = clampToCity(p.pos.x, p.pos.z);
    p.pos.x = c.x; p.pos.z = c.z;
  } else {
    p.speed = 0;
  }
  // Jump and gravity.
  if (input.keys.has('Space') && p.grounded) {
    p.vy = 7.5; p.grounded = false;
    G.audio.play('jump');
  }
  p.vy -= 22 * dt;
  p.pos.y += p.vy * dt;
  if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
  // Walk-cycle swing and facing.
  p.swing += (moving ? walkSpeed : 0) * dt * 1.6;
  const sw = moving ? Math.sin(p.swing) * 0.55 : 0;
  p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
  p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8;
  p.group.position.copy(p.pos);
  p.group.rotation.y = p.angle;
  // Slow health regen when calm.
  if (G.state.wanted === 0 && p.health < p.maxHealth) {
    p.health = Math.min(p.maxHealth, p.health + 2 * dt);
  }
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
}

// ---- combat: punch up close, pistol at range ----
export function playerAttack(G) {
  const p = G.player;
  if (G.state.mode !== 'playing' || G.state.inCar) return;
  if (p.weapon === 'pistol') { playerShoot(G); return; }
  if (p.punchCooldown > 0) return;
  p.punchCooldown = 0.45;
  p.armR.rotation.x = -2.2; // visible swing
  G.audio.play('punch');
  const range = 2.6, arc = 1.1;
  const fx = Math.sin(p.angle), fz = Math.cos(p.angle);
  let hitAny = false;
  for (const e of G.enemies) {
    if (e.health <= 0) continue;
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < range) {
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot > Math.cos(arc)) {
        damageEnemy(G, e, 34);
        hitAny = true;
      }
    }
  }
  if (!hitAny) G.hud.feed('You swing at the air.');
}

export function playerShoot(G) {
  const p = G.player;
  if (p.shootCooldown > 0) return;
  if (p.ammo <= 0) {
    G.audio.play('dryfire');
    G.hud.feed('Click — out of ammo. Press R to reload.');
    p.shootCooldown = 0.3;
    return;
  }
  p.ammo -= 1;
  p.shootCooldown = 0.28;
  G.audio.play('shot');
  showMuzzle(G);
  // Hitscan against enemies in a narrow cone ahead of the camera.
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  let best = null, bestD = 60;
  for (const e of G.enemies) {
    if (e.health <= 0) continue;
    const to = new THREE.Vector3(e.pos.x - p.pos.x, 1.4 - (p.pos.y + 1.5), e.pos.z - p.pos.z);
    const d = to.length();
    if (d > 60) continue;
    const ang = to.normalize().angleTo(dir);
    if (ang < 0.09 && d < bestD) { best = e; bestD = d; }
  }
  if (best) {
    damageEnemy(G, best, 34);
    spawnHitSpark(G, best.pos);
  }
  // Shooting in public is a crime — the city notices.
  G.police.addHeat(0.6);
}

export function showMuzzle(G) {
  const p = G.player;
  if (p.muzzle) G.scene.remove(p.muzzle);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe98a })
  );
  const fx = Math.sin(p.angle), fz = Math.cos(p.angle);
  flash.position.set(p.pos.x + fx * 0.9, p.pos.y + 1.5, p.pos.z + fz * 0.9);
  G.scene.add(flash);
  p.muzzle = flash;
  setTimeout(() => { if (p.muzzle === flash) { G.scene.remove(flash); p.muzzle = null; } }, 70);
}

export function spawnHitSpark(G, pos) {
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffdd55 })
  );
  spark.position.set(pos.x, pos.y + 1.4, pos.z);
  G.scene.add(spark);
  setTimeout(() => G.scene.remove(spark), 120);
}

export function damageEnemy(G, e, dmg) {
  e.health -= dmg;
  e.flash = 0.15;
  G.audio.play('hit');
  if (e.health <= 0) {
    e.health = 0;
    e.dead = true;
    e.group.visible = false;
    G.state.cash += 40;
    G.hud.feed('Rival down. +$40 lifted from his pockets.');
    G.police.addHeat(0.8);
    if (G.missions.onEnemyDown) G.missions.onEnemyDown(e);
  }
}

export function damagePlayer(G, dmg, source) {
  const p = G.player;
  if (G.state.mode !== 'playing' || p.health <= 0) return;
  p.health -= dmg;
  G.hud.damageFlash();
  G.audio.play('hurt');
  if (p.health <= 0) {
    p.health = 0;
    G.state.mode = 'wasted';
    G.state.cash = Math.max(0, G.state.cash - 150);
    G.hud.showWasted('The streets of Neon Bay chew you up… -$150 hospital bill.');
    G.audio.play('wasted');
    setTimeout(() => {
      if (G.state.mode !== 'wasted') return;
      p.health = 100;
      p.pos.set(0, 0, 78);
      p.group.position.copy(p.pos);
      G.state.wanted = 0; G.police.heat = 0;
      G.police.clearPolice();
      G.state.mode = 'playing';
      G.hud.hideWasted();
      G.hud.feed('You wake up at St. Lumen Hospital. The city is still out there.');
    }, 2600);
  }
}

export function reloadWeapon(G) {
  const p = G.player;
  if (p.weapon !== 'pistol') return;
  const need = 12 - p.ammo;
  const take = Math.min(need, p.reserveAmmo);
  if (take <= 0) { G.hud.feed('No reserve ammo left.'); return; }
  p.ammo += take; p.reserveAmmo -= take;
  G.audio.play('reload');
  G.hud.feed(`Reloaded. ${p.ammo}/12 in the mag, ${p.reserveAmmo} in reserve.`);
}

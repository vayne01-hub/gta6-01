// missions.js — four chained story jobs in Neon Bay.
// Each mission: briefing dialogue, an objective with a world marker,
// a completion check, and a cash reward. Progress saves after each one.
import * as THREE from 'three';

export const MISSION_DEFS = [
  {
    id: 'courier', title: 'JOB 1 — FIRST DELIVERY',
    giver: 'MARA — Pier Café',
    brief: 'Raka, you owe me one. A package at the diner on Coral Row needs to reach the marina — fast, no questions. Grab it, deliver it, and maybe I start trusting you with real work.',
    objective: 'Pick up the package at the diner, then deliver it to the marina.',
    reward: 150,
  },
  {
    id: 'getaway', title: 'JOB 2 — GETAWAY DRIVER',
    giver: 'MARA — Pier Café',
    brief: 'My crew hit a warehouse and the cops are already rolling. I need wheels and a driver with no fear. Steal a car if you have to — then get to the hideout on Sunset Strip before the PD boxes you in.',
    objective: 'Steal a car, then reach the hideout while the police chase you.',
    reward: 300,
  },
  {
    id: 'collector', title: 'JOB 3 — THE COLLECTION',
    giver: 'DARIO "THE LEDGER" — Warehouse',
    brief: 'Five of my parcels are stashed around the city, and the Harbor Rats are sniffing around them. Collect all five, watch your back — those rats carry pipes and grudges — then bring them to my warehouse.',
    objective: 'Collect 5 parcels around the city, then deliver them to the warehouse.',
    reward: 400,
  },
  {
    id: 'heatwave', title: 'JOB 4 — HEAT WAVE',
    giver: 'MARA — Pier Café',
    brief: 'Last job, Raka. The PD knows your face now — five stars, full heat. Survive the chase for a minute and slip into the old tunnel garage. Do that, and we are both out of this city for good.',
    objective: 'Survive at wanted level 4+ for 60 seconds, then reach the tunnel garage.',
    reward: 600,
  },
];

export function createMissions(G) {
  const M = {
    index: 0, stage: 'idle', // idle | brief | active | done
    target: new THREE.Vector3(0, 0, 66),
    targetLabel: 'Pier Café',
    parcels: [], enemiesSpawned: false,
    surviveTimer: 0, collected: 0,
    dialogQueue: [], dialogOpen: false,
    start() {
      const def = MISSION_DEFS[M.index];
      if (!def) return;
      M.stage = 'brief';
      M.dialogQueue = [
        { name: def.giver, text: def.brief },
        { name: 'OBJECTIVE', text: def.objective + ` Reward: $${def.reward}.` },
      ];
      M.showNextDialog();
      G.audio.play('mission');
    },
    showNextDialog() {
      const line = M.dialogQueue.shift();
      if (!line) {
        M.dialogOpen = false;
        G.hud.hideDialog();
        if (M.stage === 'brief') M.activate();
        return;
      }
      M.dialogOpen = true;
      G.hud.showDialog(line.name, line.text);
    },
    activate() {
      const def = MISSION_DEFS[M.index];
      M.stage = 'active';
      M.collected = 0;
      M.surviveTimer = 0;
      M.enemiesSpawned = false;
      if (def.id === 'courier') {
        M.target.set(132, 0, -132); M.targetLabel = 'Diner on Coral Row';
        M.sub = 'pickup';
      } else if (def.id === 'getaway') {
        M.target.set(-198, 0, 198); M.targetLabel = 'Hideout — Sunset Strip';
        M.sub = 'reach';
        G.police.addHeat(2.0);
      } else if (def.id === 'collector') {
        M.sub = 'collect';
        M.spawnParcels();
        M.target.copy(M.parcels[0].pos); M.targetLabel = 'Parcel 1 of 5';
      } else if (def.id === 'heatwave') {
        M.sub = 'survive';
        M.target.set(264, 0, -264); M.targetLabel = 'Tunnel garage';
        G.police.addHeat(4.2);
      }
      G.hud.setMission(def.title, def.objective);
      G.hud.feed(`New job: ${def.title}`);
      G.world.beacon.position.set(M.target.x, 45, M.target.z);
      G.world.marker.position.set(M.target.x, 12, M.target.z);
    },
    spawnParcels() {
      for (const p of M.parcels) G.scene.remove(p.mesh);
      M.parcels = [];
      const spots = [
        [132, 132], [-132, -132], [198, 66], [-66, 264], [66, -198],
      ];
      for (const [x, z] of spots) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4),
          new THREE.MeshLambertMaterial({ color: 0xffd23e }));
        mesh.position.set(x, 0.8, z);
        mesh.castShadow = true;
        G.scene.add(mesh);
        M.parcels.push({ pos: new THREE.Vector3(x, 0, z), mesh, taken: false });
      }
    },
    complete() {
      const def = MISSION_DEFS[M.index];
      G.state.cash += def.reward;
      G.audio.play('complete');
      G.hud.feed(`Job complete! +$${def.reward}.`);
      G.hud.setMission('NEON BAY', 'Job done. Walk to the next marker to start the next job.');
      M.stage = 'done';
      M.index += 1;
      G.save.saveGame();
      if (M.index >= MISSION_DEFS.length) {
        G.state.storyDone = true;
        G.hud.showDialog('MARA — Pier Café',
          'We did it, Raka. The tunnel, the boat, the open sea — Neon Bay is behind us now. You are not a courier any more. You are a legend. (Story complete — free roam!)');
        M.dialogOpen = true;
        G.world.beacon.visible = false;
        G.world.marker.visible = false;
        return;
      }
      // Next job starts at the pier café marker.
      M.target.set(0, 0, 66);
      M.targetLabel = 'Pier Café — next job';
      G.world.beacon.position.set(0, 45, 66);
      G.world.marker.position.set(0, 12, 66);
      G.world.beacon.visible = true;
      G.world.marker.visible = true;
    },
    onEnemyDown(e) {
      // Enemies only matter in the collector job; count is tracked by kills.
    },
  };
  return M;
}

// ---- per-frame mission logic: arrival checks, parcels, survival ----
export function updateMissions(G, dt) {
  const M = G.missions;
  if (G.state.mode !== 'playing') return;
  const p = G.player.pos;
  const distToTarget = Math.hypot(p.x - M.target.x, p.z - M.target.z);
  // Spinning beacon marker.
  if (G.world.marker.visible) {
    G.world.marker.rotation.y += dt * 2;
    G.world.marker.position.y = 12 + Math.sin(G.state.time * 2) * 1.5;
  }
  if (M.stage === 'idle') {
    // Standing at the pier café marker starts the next job.
    if (distToTarget < 6 && M.index < MISSION_DEFS.length) {
      M.start();
    }
    return;
  }
  if (M.stage !== 'active') return;
  const def = MISSION_DEFS[M.index];
  if (def.id === 'courier') {
    if (M.sub === 'pickup' && distToTarget < 6) {
      M.sub = 'deliver';
      M.target.set(-264, 0, -132); M.targetLabel = 'Marina drop-off';
      G.world.beacon.position.set(-264, 45, -132);
      G.world.marker.position.set(-264, 12, -132);
      G.hud.feed('Package secured. Now deliver it to the marina — and keep it quiet.');
      G.audio.play('pickup');
    } else if (M.sub === 'deliver' && distToTarget < 6) {
      M.complete();
    }
  } else if (def.id === 'getaway') {
    if (distToTarget < 8) M.complete();
  } else if (def.id === 'collector') {
    if (!M.enemiesSpawned && M.collected >= 2) {
      M.enemiesSpawned = true;
      spawnRivals(G, M.target);
      G.hud.feed('Harbor Rats! They want the parcels — fight them off.');
      G.audio.play('alarm');
    }
    for (const parcel of M.parcels) {
      if (parcel.taken) continue;
      parcel.mesh.rotation.y += dt;
      if (Math.hypot(p.x - parcel.pos.x, p.z - parcel.pos.z) < 3) {
        parcel.taken = true;
        G.scene.remove(parcel.mesh);
        M.collected += 1;
        G.audio.play('pickup');
        G.hud.feed(`Parcel ${M.collected} of 5 collected.`);
        const next = M.parcels.find((q) => !q.taken);
        if (next) {
          M.target.copy(next.pos);
          M.targetLabel = `Parcel ${M.collected + 1} of 5`;
          G.world.beacon.position.set(next.pos.x, 45, next.pos.z);
          G.world.marker.position.set(next.pos.x, 12, next.pos.z);
        } else {
          M.target.set(264, 0, 264); M.targetLabel = "Dario's warehouse";
          G.world.beacon.position.set(264, 45, 264);
          G.world.marker.position.set(264, 12, 264);
          G.hud.feed('All parcels collected. Bring them to Dario’s warehouse.');
        }
      }
    }
    if (M.collected >= 5 && distToTarget < 8) M.complete();
  } else if (def.id === 'heatwave') {
    if (G.state.wanted >= 4) {
      M.surviveTimer += dt;
      G.hud.setMission(def.title, `${def.objective} — survived ${Math.floor(M.surviveTimer)}s / 60s`);
      if (M.surviveTimer >= 60) {
        M.sub = 'escape';
        G.hud.feed('Sixty seconds of heat survived! Now slip into the tunnel garage.');
        G.audio.play('complete');
      }
    }
    if (M.sub === 'escape' && distToTarget < 8) M.complete();
  }
  G.hud.setDistance(distToTarget, M.targetLabel);
}

function spawnRivals(G, near) {
  for (let i = 0; i < 3; i++) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 0.45), shirt);
    body.position.y = 1.05; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xb08060 }));
    head.position.y = 1.85;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.56),
      new THREE.MeshLambertMaterial({ color: 0x8a1a1a }));
    band.position.y = 2.05;
    group.add(body, head, band);
    const x = near.x + (G.rng() - 0.5) * 24;
    const z = near.z + (G.rng() - 0.5) * 24;
    group.position.set(x, 0, z);
    G.scene.add(group);
    G.enemies.push({
      group, pos: new THREE.Vector3(x, 0, z), angle: 0,
      health: 100, dead: false, flash: 0, attackCooldown: 0, speed: 4.2,
    });
  }
}

export function updateEnemies(G, dt) {
  if (G.state.mode !== 'playing') return;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = G.player.pos.x - e.pos.x, dz = G.player.pos.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    e.flash = Math.max(0, e.flash - dt);
    if (d < 30) {
      // Chase the player and swing when close.
      const want = Math.atan2(dx, dz);
      e.angle = want;
      if (d > 2) {
        e.pos.x += (dx / d) * e.speed * dt;
        e.pos.z += (dz / d) * e.speed * dt;
      }
      e.attackCooldown -= dt;
      if (d < 2.4 && e.attackCooldown <= 0) {
        e.attackCooldown = 1.1;
        G.audio.play('punch');
        hurtPlayer(G, 12);
      }
    }
    e.group.position.copy(e.pos);
    e.group.rotation.y = e.angle;
  }
}

import { damagePlayer as hurtPlayer } from './player.js';

// world.js — Neon Bay: a procedural sun-soaked coastal city.
// Grid of roads and blocks, a beach and ocean on the west edge, palms,
// street lamps and a skyline of varied towers. Deterministic from a seed.
import * as THREE from 'three';

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITY = {
  block: 52, road: 14, half: 4, // blocks from -4..4 each way
  size: 520, // playable ground half-extent
  beachX: -300, // west of this is sand, then ocean
};

function windowTexture(rng) {
  // One canvas texture reused by every tower: lit windows on a facade.
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#a8adb5'; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 10) {
    for (let x = 5; x < 58; x += 9) {
      const lit = rng() < 0.42;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffe9b0' : '#cfeaff') : '#4a5058';
      g.fillRect(x, y, 6, 7);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PALETTE = [
  0x8a6f5c, 0x6f7f8f, 0x9a8a6a, 0x7a6a8a, 0x5c7a6f, 0xa08a7a,
  0x6a7a9a, 0x8f7a5c, 0x7a8a5c, 0x9a6a6a, 0x5c6a7a, 0xb09a7a,
];
const ROOFS = [0x3a4a5c, 0x4a3a3a, 0x2e3d4a, 0x54423a];

export function buildWorld(G) {
  const { scene, rng } = G;
  const W = { colliders: [], buildings: [], roadLines: [], lamps: [], palms: [] };
  const tex = windowTexture(rng);

  // Sky, fog and sun.
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 320, 900);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.5;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5c, 1.5));
  W.sun = sun;

  // Ground: grass-green city slab, sand beach, blue ocean.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size * 2 + 200, CITY.size * 2 + 200),
    new THREE.MeshLambertMaterial({ color: 0x5f8f5a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(120, CITY.size * 2 + 200),
    new THREE.MeshLambertMaterial({ color: 0xe8d49a })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.beachX - 60, 0.05, 0);
  sand.receiveShadow = true;
  scene.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(500, CITY.size * 2 + 200),
    new THREE.MeshLambertMaterial({ color: 0x1e6fa8 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(CITY.beachX - 320, 0.02, 0);
  scene.add(ocean);

  // Roads: dark asphalt strips on the grid, with pale centre dashes.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3238 });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8d8c8 });
  const span = CITY.size + 40;
  const lines = [];
  for (let i = -CITY.half; i <= CITY.half; i++) {
    const c = i * (CITY.block + CITY.road);
    lines.push(c);
    for (const vertical of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, CITY.road), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = vertical ? Math.PI / 2 : 0;
      road.position.set(vertical ? c : 0, 0.08, vertical ? 0 : c);
      road.receiveShadow = true;
      scene.add(road);
    }
    // Centre dashes along each road.
    for (let d = -span; d < span; d += 18) {
      for (const vertical of [true, false]) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = vertical ? Math.PI / 2 : 0;
        dash.position.set(vertical ? c : d, 0.1, vertical ? d : c);
        scene.add(dash);
      }
    }
  }
  W.roadLines = lines;

  // Buildings: one or two towers per block, kept off the roads.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let bx = -CITY.half; bx < CITY.half; bx++) {
    for (let bz = -CITY.half; bz < CITY.half; bz++) {
      const cx = bx * (CITY.block + CITY.road) + (CITY.block + CITY.road) / 2;
      const cz = bz * (CITY.block + CITY.road) + (CITY.block + CITY.road) / 2;
      if (cx < CITY.beachX + 40) continue; // beach blocks stay open
      const towers = rng() < 0.55 ? 2 : 1;
      for (let t = 0; t < towers; t++) {
        const w = 16 + rng() * 18, d = 16 + rng() * 18;
        const h = 12 + rng() * rng() * 70; // a few tall towers, mostly low
        const ox = towers === 2 ? (t === 0 ? -11 : 11) : 0;
        const oz = towers === 2 ? (t === 0 ? -8 : 8) : 0;
        const col = PALETTE[Math.floor(rng() * PALETTE.length)];
        const mat = new THREE.MeshLambertMaterial({ color: col, map: tex });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(cx + ox, h / 2, cz + oz);
        b.castShadow = true; b.receiveShadow = true;
        scene.add(b);
        const roof = new THREE.Mesh(roofGeo,
          new THREE.MeshLambertMaterial({ color: ROOFS[Math.floor(rng() * ROOFS.length)] }));
        roof.scale.set(w + 1, 1.2, d + 1);
        roof.position.set(cx + ox, h + 0.6, cz + oz);
        scene.add(roof);
        W.colliders.push({ x: cx + ox, z: cz + oz, hw: w / 2 + 0.5, hd: d / 2 + 0.5 });
        W.buildings.push(b);
        // Neon sign strip on some towers — the city's signature glow.
        if (rng() < 0.35) {
          const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.6, 0.4),
            new THREE.MeshBasicMaterial({ color: [0xff4e8a, 0x37e0ff, 0xffd23e][Math.floor(rng() * 3)] }));
          sign.position.set(cx + ox, Math.min(h - 3, 14 + rng() * 20), cz + oz + d / 2 + 0.3);
          scene.add(sign);
        }
      }
    }
  }
  return W;
}

// ---- street dressing: palms along the beach, lamps at intersections ----
export function buildProps(G, W) {
  const { scene, rng } = G;
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4a });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let z = -CITY.size; z < CITY.size; z += 44) {
    const x = CITY.beachX + 12 + rng() * 8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 9, 6), trunkMat);
    trunk.position.set(x, 4.5, z + rng() * 10);
    trunk.castShadow = true;
    scene.add(trunk);
    for (let l = 0; l < 5; l++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5, 5), leafMat);
      const a = (l / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.8, 9.6, trunk.position.z + Math.sin(a) * 1.8);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      scene.add(leaf);
    }
    W.palms.push(trunk);
  }
  for (const lx of W.roadLines) {
    for (const lz of W.roadLines) {
      if (rng() < 0.5) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7, 6), lampMat);
      pole.position.set(lx + 8, 3.5, lz + 8);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), bulbMat);
      bulb.position.set(lx + 8, 7.1, lz + 8);
      scene.add(bulb);
      W.lamps.push(pole);
    }
  }
  // The pier — story landmark on the west edge, jutting over the ocean.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(120, 1.2, 10), pierMat);
  pier.position.set(CITY.beachX - 70, 1.2, 60);
  pier.castShadow = true; pier.receiveShadow = true;
  scene.add(pier);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 6), pierMat);
    post.position.set(CITY.beachX - 20 - i * 20, 0.5, 56);
    scene.add(post);
    const post2 = post.clone(); post2.position.z = 64; scene.add(post2);
  }
  // A ferris wheel silhouette on the pier — pure geometry, no assets.
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0xff6a9a });
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(14, 0.7, 6, 24), wheelMat);
  wheel.add(rim);
  for (let s = 0; s < 8; s++) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4),
      new THREE.MeshLambertMaterial({ color: [0x37e0ff, 0xffd23e, 0x7dff9a][s % 3] }));
    const a = (s / 8) * Math.PI * 2;
    cab.position.set(Math.cos(a) * 14, Math.sin(a) * 14, 0);
    wheel.add(cab);
  }
  const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 28, 6), wheelMat);
  spoke.rotation.z = Math.PI / 2; wheel.add(spoke);
  const spoke2 = spoke.clone(); spoke2.rotation.z = 0; spoke2.rotation.x = Math.PI / 2; wheel.add(spoke2);
  wheel.position.set(CITY.beachX - 110, 22, 60);
  scene.add(wheel);
  W.wheel = wheel;
  // Mission beacon: a tall glowing pillar the player can always spot.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 90, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  beacon.position.set(0, 45, 0);
  scene.add(beacon);
  W.beacon = beacon;
  const marker = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  marker.rotation.x = Math.PI;
  marker.position.set(0, 12, 0);
  scene.add(marker);
  W.marker = marker;
}

// ---- collision + road helpers shared by every system ----
export function collidesWithBuildings(W, x, z, pad) {
  for (const c of W.colliders) {
    if (Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad) return true;
  }
  return false;
}

export function nearestRoadPoint(W, x, z) {
  // Snap a point onto the closest road centre line.
  let bx = W.roadLines[0], bz = W.roadLines[0];
  for (const l of W.roadLines) {
    if (Math.abs(l - x) < Math.abs(bx - x)) bx = l;
    if (Math.abs(l - z) < Math.abs(bz - z)) bz = l;
  }
  return Math.abs(bx - x) < Math.abs(bz - z) ? { x: bx, z, along: 'z' } : { x, z: bz, along: 'x' };
}

export function randomRoadPoint(G, W) {
  const l = W.roadLines[Math.floor(G.rng() * W.roadLines.length)];
  const t = (G.rng() * 2 - 1) * (CITY.size - 30);
  return G.rng() < 0.5 ? { x: l, z: t } : { x: t, z: l };
}

export function clampToCity(x, z) {
  const m = CITY.size + 20;
  return { x: Math.max(-m, Math.min(m, x)), z: Math.max(-m, Math.min(m, z)) };
}

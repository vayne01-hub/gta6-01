// hud.js — DOM HUD: health, cash, wanted stars, speed, mission tracker,
// feed messages, dialogue box, and the 2D top-down minimap canvas.
import { CITY } from './world.js';

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const H = {
    el: {
      hud: $('hud'), cash: $('cash'), stars: $('stars'),
      healthfill: $('healthfill'), ammoline: $('ammoline'),
      speednum: $('speednum'), carhint: $('carhint'),
      missiontitle: $('missiontitle'), missionobj: $('missionobj'), missiondist: $('missiondist'),
      feed: $('feed'), dialog: $('dialog'), dialogname: $('dialogname'), dialogtext: $('dialogtext'),
      prompt: $('prompt'), crosshair: $('crosshair'), damageflash: $('damageflash'),
      busted: $('busted'), bustedtext: $('bustedtext'),
      minimap: $('minimap'),
      startscreen: $('startscreen'), pausescreen: $('pausescreen'),
      status: $('status'),
    },
    show() { H.el.hud.classList.remove('hidden'); },
    hide() { H.el.hud.classList.add('hidden'); },
    setCash(v) { H.el.cash.textContent = '$' + v.toLocaleString('en-US'); },
    updateWanted() {
      const w = G.state.wanted;
      let s = '';
      for (let i = 0; i < 5; i++) {
        s += i < w ? '★' : '<span class="off">★</span>';
      }
      H.el.stars.innerHTML = s;
    },
    setMission(title, obj) {
      H.el.missiontitle.textContent = title;
      H.el.missionobj.textContent = obj;
    },
    setDistance(d, label) {
      H.el.missiondist.textContent = label ? `${label} — ${Math.round(d)}m` : '';
    },
    feed(text) {
      const div = document.createElement('div');
      div.textContent = text;
      H.el.feed.prepend(div);
      while (H.el.feed.children.length > 4) H.el.feed.removeChild(H.el.feed.lastChild);
      H.el.status.textContent = text;
      setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 9000);
    },
    showDialog(name, text) {
      H.el.dialogname.textContent = name;
      H.el.dialogtext.textContent = text;
      H.el.dialog.classList.remove('hidden');
    },
    hideDialog() { H.el.dialog.classList.add('hidden'); },
    showPrompt(text) {
      H.el.prompt.textContent = text;
      H.el.prompt.classList.remove('hidden');
    },
    hidePrompt() { H.el.prompt.classList.add('hidden'); },
    damageFlash() {
      H.el.damageflash.style.opacity = '1';
      setTimeout(() => { H.el.damageflash.style.opacity = '0'; }, 130);
    },
    showBusted(text) {
      H.el.bustedtext.textContent = text;
      H.el.busted.classList.remove('hidden');
    },
    hideBusted() { H.el.busted.classList.add('hidden'); },
    showWasted(text) {
      H.el.busted.querySelector('h1').textContent = 'WASTED';
      H.el.bustedtext.textContent = text;
      H.el.busted.classList.remove('hidden');
    },
    hideWasted() {
      H.el.busted.querySelector('h1').textContent = 'BUSTED';
      H.el.busted.classList.add('hidden');
    },
    showStart() { H.el.startscreen.classList.remove('hidden'); },
    hideStart() { H.el.startscreen.classList.add('hidden'); },
    showPause() { H.el.pausescreen.classList.remove('hidden'); },
    hidePause() { H.el.pausescreen.classList.add('hidden'); },
  };
  return H;
}

export function updateHud(G) {
  const H = G.hud;
  H.el.healthfill.style.width = Math.max(0, G.player.health) + '%';
  const speed = G.state.currentCar ? Math.abs(G.state.currentCar.speed) * 3.6 : G.player.speed * 3.6;
  H.el.speednum.textContent = Math.round(speed);
  const p = G.player;
  H.el.ammoline.textContent = p.weapon === 'pistol'
    ? `PISTOL — ${p.ammo}/12 mag · ${p.reserveAmmo} reserve (R reload)`
    : 'FISTS — press 2 for pistol';
  H.el.carhint.textContent = G.state.inCar
    ? 'E exit car · W/S drive · A/D steer'
    : 'E near a car to steal it';
  H.el.crosshair.classList.toggle('hidden', !(p.weapon === 'pistol' && !G.state.inCar));
  H.setCash(G.state.cash);
  drawMinimap(G);
}

// ---- minimap: top-down 2D view of roads, player, cars, police, marker ----
function drawMinimap(G) {
  const c = G.hud.el.minimap;
  const g = c.getContext('2d');
  const S = c.width, R = S / 2;
  const worldR = CITY.size + 60;
  const toMap = (x, z) => [R + (x / worldR) * R, R + (z / worldR) * R];
  g.clearRect(0, 0, S, S);
  // Sea on the west edge.
  g.fillStyle = '#1e6fa8';
  const beachX = toMap(-300, 0)[0];
  g.fillRect(0, 0, beachX, S);
  g.fillStyle = '#e8d49a';
  g.fillRect(beachX, 0, toMap(-260, 0)[0] - beachX, S);
  // Roads.
  g.strokeStyle = '#3a3f46';
  g.lineWidth = 4;
  for (const l of G.world.roadLines) {
    const [x1] = toMap(l, 0);
    g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, S); g.stroke();
    const [, z1] = toMap(0, l);
    g.beginPath(); g.moveTo(0, z1); g.lineTo(S, z1); g.stroke();
  }
  // Mission marker: pulsing gold diamond.
  if (G.world.marker.visible) {
    const [mx, my] = toMap(G.missions.target.x, G.missions.target.z);
    const pulse = 5 + Math.sin(G.state.time * 4) * 2;
    g.fillStyle = '#ffd23e';
    g.beginPath();
    g.moveTo(mx, my - pulse); g.lineTo(mx + pulse, my);
    g.lineTo(mx, my + pulse); g.lineTo(mx - pulse, my);
    g.closePath(); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
  }
  // Traffic cars: pale dots.
  g.fillStyle = '#cfd6dd';
  for (const car of G.traffic.cars) {
    const [x, y] = toMap(car.pos.x, car.pos.z);
    g.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  // Parked stealable cars: white dots.
  g.fillStyle = '#ffffff';
  for (const car of G.cars) {
    const [x, y] = toMap(car.pos.x, car.pos.z);
    g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill();
  }
  // Police: red flashing dots.
  if (Math.floor(G.state.time * 3) % 2 === 0) g.fillStyle = '#ff2222';
  else g.fillStyle = '#ff8888';
  for (const car of G.police.cars) {
    const [x, y] = toMap(car.pos.x, car.pos.z);
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
  }
  // Enemies: orange dots.
  g.fillStyle = '#ff8a1e';
  for (const e of G.enemies) {
    if (e.dead) continue;
    const [x, y] = toMap(e.pos.x, e.pos.z);
    g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
  }
  // Player: white arrow pointing where they face.
  const [px, py] = toMap(G.player.pos.x, G.player.pos.z);
  const a = G.state.inCar && G.state.currentCar ? G.state.currentCar.angle : G.player.angle;
  g.save();
  g.translate(px, py);
  g.rotate(Math.PI - a);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6);
  g.closePath(); g.fill(); g.stroke();
  g.restore();
  // North tick.
  g.fillStyle = '#fff';
  g.font = 'bold 10px sans-serif';
  g.fillText('N', R - 3, 12);
}

// save.js — localStorage save/load. One slot, plain JSON, no network.
export const SAVE_KEY = 'neon-bay-save-v1';

export function createSave(G) {
  return {
    saveGame() {
      try {
        const data = {
          v: 1,
          cash: G.state.cash,
          missionIndex: G.missions.index,
          missionStage: G.missions.stage,
          player: {
            x: G.player.pos.x, z: G.player.pos.z,
            health: G.player.health,
            weapon: G.player.weapon, ammo: G.player.ammo, reserveAmmo: G.player.reserveAmmo,
          },
          storyDone: !!G.state.storyDone,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        G.hud.feed('Game saved.');
        return true;
      } catch (e) {
        G.hud.feed('Save failed — browser storage is unavailable.');
        return false;
      }
    },
    loadGame() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) { G.hud.feed('No save found yet.'); return false; }
        const data = JSON.parse(raw);
        if (!data || data.v !== 1) { G.hud.feed('Save file is from an older version.'); return false; }
        G.state.cash = data.cash;
        G.missions.index = Math.min(data.missionIndex, 3);
        G.missions.stage = 'idle';
        G.player.pos.set(data.player.x, 0, data.player.z);
        G.player.group.position.copy(G.player.pos);
        G.player.health = data.player.health;
        G.player.weapon = data.player.weapon || 'fists';
        G.player.ammo = data.player.ammo || 0;
        G.player.reserveAmmo = data.player.reserveAmmo || 0;
        G.state.storyDone = !!data.storyDone;
        // Put the next-job marker back at the pier café.
        G.missions.target.set(0, 0, 66);
        G.missions.targetLabel = 'Pier Café — next job';
        G.world.beacon.position.set(0, 45, 66);
        G.world.marker.position.set(0, 12, 66);
        G.hud.setMission('NEON BAY', 'Walk to the pier café marker to start the next job.');
        G.hud.feed(`Save loaded — $${G.state.cash}, job ${G.missions.index + 1} of 4.`);
        return true;
      } catch (e) {
        G.hud.feed('Could not load the save.');
        return false;
      }
    },
    hasSave() {
      try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    },
    clearSave() {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    },
  };
}

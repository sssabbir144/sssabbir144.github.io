/* Ss Animation — studio logic.
   Phase A: shell, panels, modals, manual-payment flow, PWA.
   Phase B: real editor engine — canvas stage with draggable objects,
   part-based character factory, scenes + keyframe timeline with tweening,
   undo/redo, and projects saved in this browser (IndexedDB). */
"use strict";
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
let _uid = 1;
const nid = p => p + (_uid++) + Date.now().toString(36);

/* ---------------- IndexedDB ---------------- */
let _db = null;
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("ssanim", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", { keyPath: "name" });
      if (!d.objectStoreNames.contains("assets")) d.createObjectStore("assets", { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function db() { if (!_db) _db = await idbOpen(); return _db; }
async function idbPut(store, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, "readwrite");
    t.objectStore(store).put(val);
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}
async function idbGet(store, key) {
  const d = await db();
  return new Promise((res, rej) => {
    const q = d.transaction(store, "readonly").objectStore(store).get(key);
    q.onsuccess = () => res(q.result || null);
    q.onerror = () => rej(q.error);
  });
}
async function idbAll(store) {
  const d = await db();
  return new Promise((res, rej) => {
    const q = d.transaction(store, "readonly").objectStore(store).getAll();
    q.onsuccess = () => res(q.result || []);
    q.onerror = () => rej(q.error);
  });
}

/* ---------------- Presets: character factory + media ---------------- */
const CHAR_PRESETS = {
  "Hero Boy":   { skin: "#f2c094", hair: "#3a2a1c", hairStyle: "sweep", shirt: "#e74c3c", pants: "#2d4a7a" },
  "Hero Girl":  { skin: "#f6c9a0", hair: "#5a3a1a", hairStyle: "long",  shirt: "#e5639e", pants: "#7a3a5e", skirt: true },
  "Mother":     { skin: "#eebd90", hair: "#241a12", hairStyle: "bun",   shirt: "#3f9e63", pants: "#5e3a2d", skirt: true },
  "Father":     { skin: "#d99e6f", hair: "#191410", hairStyle: "short", shirt: "#3a6ea5", pants: "#33383e" },
  "Police Man": { skin: "#e8b184", hair: "#14100c", hairStyle: "cap",   shirt: "#2f5da8", pants: "#22314e", cap: "#24457a" },
  "Doctor":     { skin: "#f2c094", hair: "#4a3420", hairStyle: "short", shirt: "#f2f2f2", pants: "#4a5560" },
  "Teacher":    { skin: "#eebd90", hair: "#63422a", hairStyle: "bun",   shirt: "#7a4fd0", pants: "#2e2a33" },
  "Baby":       { skin: "#f8d3ae", hair: "#6b4423", hairStyle: "tuft",  shirt: "#ffd94d", pants: "#5ea8e7", baby: true }
};
const BG_LIST = [
  ["village", "Village"], ["city", "City Street"], ["forest", "Forest"],
  ["river", "River Side"], ["home", "Home Room"], ["school", "School"]];
const PROP_LIST = [
  ["📺", "TV"], ["🌀", "Fan"], ["🪑", "Chair"], ["🛋️", "Sofa"], ["🌳", "Tree"], ["🏠", "House"],
  ["🚗", "Car"], ["🚲", "Bike"], ["📱", "Mobile"], ["💡", "Lamp"], ["📚", "Book"], ["🪴", "Plant"]];
const VEHICLE_LIST = [["🚗", "Car"], ["🚲", "Bike"], ["🚌", "Bus"], ["🚑", "Ambulance"], ["🚓", "Police Car"], ["🛵", "Scooter"]];
const ANIMAL_LIST = [["🐶", "Dog"], ["🐱", "Cat"], ["🐦", "Bird"], ["🐴", "Horse"], ["🐰", "Bunny"], ["🐸", "Frog"]];

/* ---------------- Project state ---------------- */
function freshScene(name) { return { id: nid("sc"), name, duration: 5, bg: "village", objects: [], voiceAssetId: null }; }
function freshProject() { return { name: "Untitled Project", scenes: [freshScene("Scene 1")] }; }
let project = freshProject();
let curScene = 0, selId = null, playT = 0;
const scene = () => project.scenes[curScene];
const selObj = () => scene().objects.find(o => o.id === selId) || null;

function evalAt(o, t) {
  const base = { x: o.x, y: o.y, scale: o.scale, rot: o.rot, op: o.op };
  if (!o.keys || !o.keys.length) return base;
  const ks = o.keys;
  if (t <= ks[0].t) return { ...ks[0] };
  if (t >= ks[ks.length - 1].t) return { ...ks[ks.length - 1] };
  for (let i = 0; i < ks.length - 1; i++) {
    if (t >= ks[i].t && t <= ks[i + 1].t) {
      const k = (t - ks[i].t) / Math.max(0.0001, ks[i + 1].t - ks[i].t);
      const out = {};
      for (const f of ["x", "y", "scale", "rot", "op"]) out[f] = lerp(ks[i][f], ks[i + 1][f], k);
      return out;
    }
  }
  return base;
}
function objSize(o) {
  if (o.type === "char") return { w: 200, h: 350 };
  if (o.type === "image") return { w: o.w || 420, h: o.h || 300 };
  return { w: 120, h: 120 };
}

/* ---------------- Background painters ---------------- */
function paintBG(ctx, kind) {
  const W = 1280, H = 720;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  if (kind === "home" || kind === "school") {
    ctx.fillStyle = kind === "home" ? "#e8d9bd" : "#cfe3d8"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = kind === "home" ? "#b98d5f" : "#8a97a5"; ctx.fillRect(0, 520, W, 200);
    if (kind === "home") {
      ctx.fillStyle = "#9fd4ea"; ctx.fillRect(120, 90, 300, 240);
      ctx.strokeStyle = "#7a5c38"; ctx.lineWidth = 10; ctx.strokeRect(120, 90, 300, 240);
      ctx.fillStyle = "#c9563c"; ctx.fillRect(880, 300, 240, 220);
    } else {
      ctx.fillStyle = "#2e5d43"; ctx.fillRect(300, 70, 680, 300);
      ctx.strokeStyle = "#7a5c38"; ctx.lineWidth = 12; ctx.strokeRect(300, 70, 680, 300);
      ctx.fillStyle = "#e8f2ec"; ctx.font = "700 54px Archivo, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("SCHOOL", 640, 240);
    }
    return;
  }
  sky.addColorStop(0, "#8ec9e8"); sky.addColorStop(1, "#d9f0fb");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffd94d"; ctx.beginPath(); ctx.arc(1100, 110, 52, 0, 7); ctx.fill();
  if (kind === "city") {
    const cols = ["#7d8ca3", "#93a5bd", "#6b7c96", "#a7b6ca", "#8496ad"];
    let x = -10;
    for (let i = 0; x < W; i++) {
      const bw = 120 + (i * 53) % 90, bh = 240 + (i * 97) % 220;
      ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(x, 560 - bh, bw, bh + 160);
      ctx.fillStyle = "#ffe9a3";
      for (let wy = 560 - bh + 24; wy < 520; wy += 44)
        for (let wx = x + 16; wx < x + bw - 20; wx += 34) ctx.fillRect(wx, wy, 16, 22);
      x += bw + 14;
    }
    ctx.fillStyle = "#5b6470"; ctx.fillRect(0, 560, W, 160);
    ctx.fillStyle = "#f5c518"; for (let dx = 20; dx < W; dx += 90) ctx.fillRect(dx, 632, 46, 8);
    return;
  }
  ctx.fillStyle = "#69a856";
  ctx.beginPath(); ctx.moveTo(0, 470);
  ctx.quadraticCurveTo(320, 350, 640, 450); ctx.quadraticCurveTo(960, 540, 1280, 420);
  ctx.lineTo(1280, 720); ctx.lineTo(0, 720); ctx.fill();
  ctx.fillStyle = "#548c43"; ctx.fillRect(0, 580, W, 140);
  if (kind === "forest") {
    for (let i = 0; i < 9; i++) {
      const tx = 60 + i * 140, th = 150 + (i * 61) % 90;
      ctx.fillStyle = "#6e4f2c"; ctx.fillRect(tx - 9, 560 - th * 0.4, 18, th * 0.4);
      ctx.fillStyle = "#2f7a3d";
      ctx.beginPath(); ctx.arc(tx, 540 - th * 0.55, th * 0.42, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(tx - th * 0.25, 560 - th * 0.4, th * 0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(tx + th * 0.25, 560 - th * 0.4, th * 0.3, 0, 7); ctx.fill();
    }
  }
  if (kind === "river") {
    ctx.fillStyle = "#57b7d9"; ctx.beginPath();
    ctx.moveTo(0, 600); ctx.quadraticCurveTo(420, 540, 860, 610); ctx.quadraticCurveTo(1100, 650, 1280, 615);
    ctx.lineTo(1280, 720); ctx.lineTo(0, 720); ctx.fill();
    ctx.strokeStyle = "#bfeaff"; ctx.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(80 + i * 300, 640 + (i % 2) * 26);
      ctx.quadraticCurveTo(180 + i * 300, 625 + (i % 2) * 26, 280 + i * 300, 642 + (i % 2) * 26); ctx.stroke();
    }
  }
  if (kind === "village") {
    ctx.fillStyle = "#c9563c"; ctx.fillRect(150, 380, 190, 130);
    ctx.fillStyle = "#8a3a26"; ctx.beginPath(); ctx.moveTo(130, 380); ctx.lineTo(245, 300); ctx.lineTo(360, 380); ctx.fill();
    ctx.fillStyle = "#7a5c38"; ctx.fillRect(225, 440, 42, 70);
    ctx.fillStyle = "#2f7a3d"; ctx.beginPath(); ctx.arc(1010, 400, 90, 0, 7); ctx.fill();
    ctx.fillStyle = "#6e4f2c"; ctx.fillRect(1000, 460, 20, 80);
  }
}

/* ---------------- Character painter (part-based factory) ---------------- */
function drawChar(ctx, o, ev) {
  const p = o.params;
  ctx.save();
  ctx.translate(ev.x, ev.y);
  ctx.rotate(ev.rot * Math.PI / 180);
  ctx.scale(ev.scale * (o.flip ? -1 : 1), ev.scale);
  ctx.globalAlpha = ev.op;
  // legs + shoes
  ctx.fillStyle = p.pants;
  ctx.fillRect(-52, 40, 38, 105); ctx.fillRect(14, 40, 38, 105);
  ctx.fillStyle = "#26221f";
  ctx.fillRect(-58, 140, 48, 16); ctx.fillRect(10, 140, 48, 16);
  // skirt
  if (p.skirt) { ctx.fillStyle = p.shirt; ctx.beginPath(); ctx.moveTo(-58, 30); ctx.lineTo(58, 30); ctx.lineTo(76, 95); ctx.lineTo(-76, 95); ctx.fill(); }
  // arms
  ctx.fillStyle = p.shirt;
  ctx.fillRect(-84, -62, 26, 92); ctx.fillRect(58, -62, 26, 92);
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(-71, 40, 13, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(71, 40, 13, 0, 7); ctx.fill();
  // torso
  ctx.fillStyle = p.shirt;
  ctx.beginPath(); ctx.roundRect(-60, -70, 120, 122, 18); ctx.fill();
  // head
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(0, -118, 52, 0, 7); ctx.fill();
  // ears
  ctx.beginPath(); ctx.arc(-52, -116, 10, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(52, -116, 10, 0, 7); ctx.fill();
  // hair by style
  ctx.fillStyle = p.hair;
  if (p.hairStyle === "long") {
    ctx.fillRect(-58, -168, 116, 128);
    ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(0, -112, 47, 0, 7); ctx.fill();
    ctx.fillStyle = p.hair; ctx.beginPath(); ctx.arc(0, -152, 50, Math.PI, 0); ctx.fill();
  } else if (p.hairStyle === "bun") {
    ctx.beginPath(); ctx.arc(0, -176, 16, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -148, 52, Math.PI, 0); ctx.fill();
  } else if (p.hairStyle === "cap") {
    ctx.fillStyle = p.cap || "#24457a";
    ctx.beginPath(); ctx.arc(0, -140, 54, Math.PI, 0); ctx.fill();
    ctx.fillRect(-54, -142, 108, 10);
    ctx.fillStyle = "#f5c518"; ctx.beginPath(); ctx.arc(0, -152, 9, 0, 7); ctx.fill();
  } else if (p.hairStyle === "tuft") {
    ctx.beginPath(); ctx.arc(-10, -166, 10, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -168, 8, 0, 7); ctx.fill();
  } else { // sweep / short
    ctx.beginPath(); ctx.arc(0, -146, 52, Math.PI, 0); ctx.fill();
    if (p.hairStyle === "sweep") { ctx.beginPath(); ctx.ellipse(14, -158, 44, 20, -0.25, 0, 7); ctx.fill(); }
  }
  // face
  ctx.fillStyle = "#26221f";
  ctx.beginPath(); ctx.arc(-18, -118, 5.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(18, -118, 5.5, 0, 7); ctx.fill();
  ctx.strokeStyle = "#26221f"; ctx.lineWidth = 4; ctx.beginPath();
  ctx.arc(0, -102, 15, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.fillStyle = "rgba(240,120,110,.45)";
  ctx.beginPath(); ctx.arc(-34, -104, 8, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(34, -104, 8, 0, 7); ctx.fill();
  ctx.restore();
}

/* ---------------- Stage engine ---------------- */
const stageEl = $("#stageEl"), sctx = stageEl.getContext("2d");
const imgCache = {}; // assetId -> HTMLImageElement
function ensureImage(assetId) {
  if (imgCache[assetId]) return imgCache[assetId];
  const img = new Image();
  imgCache[assetId] = img;
  idbGet("assets", assetId).then(rec => {
    if (rec && rec.blob) { img.src = URL.createObjectURL(rec.blob); img.onload = () => drawStage(); }
  }).catch(() => {});
  return img;
}
function drawStage() {
  const sc = scene();
  sctx.clearRect(0, 0, 1280, 720);
  paintBG(sctx, sc.bg);
  for (const o of sc.objects) {
    const ev = evalAt(o, playT);
    if (o.type === "char") drawChar(sctx, o, ev);
    else if (o.type === "prop") {
      sctx.save();
      sctx.translate(ev.x, ev.y); sctx.rotate(ev.rot * Math.PI / 180);
      sctx.scale(ev.scale * (o.flip ? -1 : 1), ev.scale);
      sctx.globalAlpha = ev.op;
      sctx.font = "100px serif"; sctx.textAlign = "center"; sctx.textBaseline = "middle";
      sctx.fillText(o.emoji, 0, 0);
      sctx.restore();
    } else if (o.type === "image") {
      const img = ensureImage(o.assetId);
      if (img && img.complete && img.naturalWidth) {
        sctx.save();
        sctx.translate(ev.x, ev.y); sctx.rotate(ev.rot * Math.PI / 180);
        sctx.scale(ev.scale * (o.flip ? -1 : 1), ev.scale);
        sctx.globalAlpha = ev.op;
        sctx.drawImage(img, -(o.w / 2), -(o.h / 2), o.w, o.h);
        sctx.restore();
      }
    }
    if (o.id === selId) {
      const { w, h } = objSize(o);
      sctx.save();
      sctx.translate(ev.x, ev.y); sctx.rotate(ev.rot * Math.PI / 180);
      sctx.strokeStyle = "#F5C518"; sctx.lineWidth = 3; sctx.setLineDash([10, 7]);
      sctx.strokeRect(-w * ev.scale / 2 - 8, -h * ev.scale / 2 - 8, w * ev.scale + 16, h * ev.scale + 16);
      sctx.restore();
    }
  }
  $("#stageEmpty").style.display = sc.objects.length ? "none" : "";
  syncObjTools();
}
function stagePos(evt) {
  const r = stageEl.getBoundingClientRect();
  return { x: (evt.clientX - r.left) / r.width * 1280, y: (evt.clientY - r.top) / r.height * 720 };
}
function hitTest(pt) {
  const objs = scene().objects;
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i], ev = evalAt(o, playT), { w, h } = objSize(o);
    if (Math.abs(pt.x - ev.x) <= w * ev.scale / 2 + 6 && Math.abs(pt.y - ev.y) <= h * ev.scale / 2 + 6) return o;
  }
  return null;
}
let drag = null;
stageEl.addEventListener("pointerdown", (e) => {
  const pt = stagePos(e), o = hitTest(pt);
  selId = o ? o.id : null;
  if (o) {
    const ev = evalAt(o, playT);
    drag = { id: o.id, dx: pt.x - ev.x, dy: pt.y - ev.y, moved: false };
    stageEl.setPointerCapture(e.pointerId);
  }
  drawStage(); renderTracks();
});
stageEl.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const o = scene().objects.find(x => x.id === drag.id);
  if (!o) return;
  const pt = stagePos(e);
  o.x = clamp(pt.x - drag.dx, 40, 1240);
  o.y = clamp(pt.y - drag.dy, 60, 690);
  drag.moved = true;
  // if a keyframe sits at the playhead, it follows the drag
  const k = (o.keys || []).find(k => Math.abs(k.t - playT) < 0.02);
  if (k) { k.x = o.x; k.y = o.y; }
  drawStage();
});
stageEl.addEventListener("pointerup", () => {
  if (drag && drag.moved) pushHistory();
  drag = null;
});

/* ---------------- Object ops ---------------- */
function addObject(o) {
  o.id = nid("ob"); o.keys = o.keys || [];
  scene().objects.push(o); selId = o.id;
  pushHistory(); drawStage(); renderTracks();
  return o;
}
function addCharacter(name) {
  const p = CHAR_PRESETS[name];
  addObject({
    type: "char", name, params: { ...p },
    x: 640, y: 430, scale: p.baby ? 0.62 : 1, rot: 0, flip: false, op: 1
  });
  setNote(`${name} added to the scene — drag to move, ◆ Keyframe to animate.`);
}
function addProp(emoji, name) {
  addObject({ type: "prop", name, emoji, x: 640, y: 420, scale: 1, rot: 0, flip: false, op: 1 });
  setNote(`${name} added to the scene.`);
}
async function addImageFile(file) {
  const assetId = nid("as");
  await idbPut("assets", { id: assetId, blob: file, name: file.name, at: Date.now() });
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const w = 430, h = Math.round(430 * img.naturalHeight / img.naturalWidth);
    addObject({ type: "image", name: file.name, assetId, w, h, x: 640, y: 380, scale: 1, rot: 0, flip: false, op: 1 });
    setNote(`“${file.name}” is on your canvas.`);
  };
  img.src = url;
}
function syncObjTools() {
  const o = selObj(), box = $("#objTools");
  box.hidden = !o;
  if (o) $("#objName").textContent = o.name;
}
function mutateSel(fn, msg) {
  const o = selObj(); if (!o) return;
  fn(o); pushHistory(); drawStage(); renderTracks();
  if (msg) setNote(msg);
}
$("#objScaleUp").addEventListener("click", () => mutateSel(o => o.scale = clamp(o.scale * 1.15, 0.1, 4)));
$("#objScaleDown").addEventListener("click", () => mutateSel(o => o.scale = clamp(o.scale / 1.15, 0.1, 4)));
$("#objRotate").addEventListener("click", () => mutateSel(o => o.rot = (o.rot + 15) % 360));
$("#objFlip").addEventListener("click", () => mutateSel(o => o.flip = !o.flip));
$("#objFwd").addEventListener("click", () => mutateSel(o => {
  const a = scene().objects, i = a.indexOf(o);
  if (i < a.length - 1) { a.splice(i, 1); a.splice(i + 1, 0, o); }
}));
$("#objBack").addEventListener("click", () => mutateSel(o => {
  const a = scene().objects, i = a.indexOf(o);
  if (i > 0) { a.splice(i, 1); a.splice(i - 1, 0, o); }
}));
$("#objDup").addEventListener("click", () => {
  const o = selObj(); if (!o) return;
  const c = JSON.parse(JSON.stringify(o));
  c.x = clamp(c.x + 46, 40, 1240); c.y = clamp(c.y + 20, 60, 690);
  addObject(c); setNote(`${o.name} duplicated.`);
});
$("#objDel").addEventListener("click", () => {
  const o = selObj(); if (!o) return;
  scene().objects = scene().objects.filter(x => x.id !== o.id);
  selId = null; pushHistory(); drawStage(); renderTracks();
  setNote(`${o.name} removed.`);
});

/* ---------------- Undo / redo ---------------- */
let history = [], hIdx = -1;
let autoT = null, restoring = false;
function pushHistory() {
  history = history.slice(0, hIdx + 1);
  history.push(JSON.stringify(project));
  if (history.length > 60) history.shift();
  hIdx = history.length - 1;
  if (!restoring) { clearTimeout(autoT); autoT = setTimeout(autoSave, 1200); }
}
async function autoSave() {
  try {
    project.name = $("#projectName").value.trim() || "Untitled Project";
    const all = await idbAll("projects");
    if (!all.some(p => p.name === project.name) && all.length >= 2) return; // Free limit: no silent 3rd project
    await idbPut("projects", { ...JSON.parse(JSON.stringify(project)), savedAt: Date.now() });
    localStorage.setItem("ssanim_last", project.name);
    renderDashboard($("#projSearch") ? $("#projSearch").value : "");
  } catch { /* storage unavailable — manual save still offered */ }
}
function restoreHistory(json) {
  restoring = true;
  project = JSON.parse(json);
  curScene = clamp(curScene, 0, project.scenes.length - 1);
  selId = null; playT = 0;
  $("#projectName").value = project.name;
  renderScenes(); renderTracks(); drawStage(); drawPlayhead();
  restoring = false;
}
$("#undoBtn").addEventListener("click", () => {
  if (hIdx <= 0) { setNote("Nothing to undo yet."); return; }
  hIdx--; restoreHistory(history[hIdx]);
});
$("#redoBtn").addEventListener("click", () => {
  if (hIdx >= history.length - 1) { setNote("Nothing to redo yet."); return; }
  hIdx++; restoreHistory(history[hIdx]);
});

/* ---------------- Timeline ---------------- */
const fmt = s => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const totalDur = () => project.scenes.reduce((a, s) => a + s.duration, 0);
function globalT() {
  let g = playT;
  for (let i = 0; i < curScene; i++) g += project.scenes[i].duration;
  return g;
}
function drawPlayhead() {
  const sc = scene(), tracks = $("#timelineTracks");
  const x = 80 + (playT / sc.duration) * Math.max(60, tracks.clientWidth - 100);
  $("#playhead").style.left = x + "px";
  $("#timeDisplay").textContent = `${fmt(globalT())} / ${fmt(totalDur())}`;
}
function renderScenes() {
  const strip = $("#sceneStrip");
  $$(".scene-chip", strip).forEach(c => c.remove());
  project.scenes.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "scene-chip" + (i === curScene ? " active" : "");
    b.type = "button";
    b.innerHTML = `${s.name} <span class="sc-dur">${s.duration}s</span>`;
    b.addEventListener("click", () => { curScene = i; playT = 0; selId = null; renderScenes(); renderTracks(); drawStage(); drawPlayhead(); });
    strip.insertBefore(b, $("#addSceneBtn"));
  });
}
function renderTracks() {
  const wrap = $("#trackRows");
  wrap.innerHTML = "";
  const sc = scene();
  for (const o of sc.objects) {
    const row = document.createElement("div");
    row.className = "track-row";
    row.innerHTML = `<span class="track-name" title="${o.name}">${o.name}</span>`;
    const lane = document.createElement("div");
    lane.className = "track-lane";
    lane.addEventListener("click", (e) => {
      if (e.target.classList.contains("kf")) return;
      const r = lane.getBoundingClientRect();
      playT = clamp((e.clientX - r.left) / r.width, 0, 1) * sc.duration;
      drawStage(); drawPlayhead();
    });
    for (const k of o.keys || []) {
      const d = document.createElement("button");
      d.className = "kf"; d.type = "button"; d.title = `Keyframe at ${k.t.toFixed(1)}s`;
      d.style.left = (k.t / sc.duration * 100) + "%";
      d.addEventListener("click", () => { selId = o.id; playT = k.t; drawStage(); drawPlayhead(); renderTracks(); });
      lane.appendChild(d);
    }
    row.appendChild(lane);
    wrap.appendChild(row);
  }
  const vrow = document.createElement("div");
  vrow.className = "track-row";
  vrow.innerHTML = `<span class="track-name">Voice</span>`;
  const vlane = document.createElement("div");
  vlane.className = "track-lane";
  if (sc.voiceAssetId) vlane.innerHTML = `<span style="position:absolute;left:8px;top:3px;font-size:12px;color:var(--accent)">🔊 Voice clip — plays with this scene</span>`;
  vrow.appendChild(vlane);
  wrap.appendChild(vrow);
  drawPlayhead();
}
/* transport + playback */
let playing = false, rafId = null, lastTs = 0, voiceAudio = null;
function stopPlayback() {
  playing = false; cancelAnimationFrame(rafId);
  $("#playBtn").textContent = "▶";
  if (voiceAudio) { voiceAudio.pause(); voiceAudio = null; }
}
function playSceneVoice() {
  const sc = scene();
  if (!sc.voiceAssetId) return;
  idbGet("assets", sc.voiceAssetId).then(rec => {
    if (!rec || !rec.blob || !playing) return;
    voiceAudio = new Audio(URL.createObjectURL(rec.blob));
    voiceAudio.play().catch(() => {});
  }).catch(() => {});
}
function stepPlayback(ts) {
  if (!playing) return;
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  playT += dt;
  if (playT >= scene().duration) {
    if (curScene < project.scenes.length - 1) {
      curScene++; playT = 0; selId = null;
      renderScenes(); renderTracks(); playSceneVoice();
    } else { playT = scene().duration; drawStage(); drawPlayhead(); stopPlayback(); return; }
  }
  drawStage(); drawPlayhead();
  rafId = requestAnimationFrame(stepPlayback);
}
$("#playBtn").addEventListener("click", () => {
  if (playing) { stopPlayback(); return; }
  if (playT >= scene().duration) playT = 0;
  playing = true; lastTs = performance.now();
  $("#playBtn").textContent = "⏸";
  playSceneVoice();
  rafId = requestAnimationFrame(stepPlayback);
});
$("#jumpStartBtn").addEventListener("click", () => { stopPlayback(); playT = 0; drawStage(); drawPlayhead(); });
$("#back5Btn").addEventListener("click", () => { playT = clamp(playT - 5, 0, scene().duration); drawStage(); drawPlayhead(); });
$("#fwd5Btn").addEventListener("click", () => { playT = clamp(playT + 5, 0, scene().duration); drawStage(); drawPlayhead(); });
/* scenes */
$("#addSceneBtn").addEventListener("click", () => {
  project.scenes.push(freshScene(`Scene ${project.scenes.length + 1}`));
  curScene = project.scenes.length - 1; playT = 0; selId = null;
  pushHistory(); renderScenes(); renderTracks(); drawStage();
  setNote(`${scene().name} added.`);
});
$("#dupSceneBtn").addEventListener("click", () => {
  const c = JSON.parse(JSON.stringify(scene()));
  c.id = nid("sc"); c.name = scene().name + " copy";
  c.objects.forEach(o => o.id = nid("ob"));
  project.scenes.splice(curScene + 1, 0, c);
  curScene++; playT = 0; selId = null;
  pushHistory(); renderScenes(); renderTracks(); drawStage();
  setNote("Scene duplicated.");
});
$("#splitSceneBtn").addEventListener("click", () => {
  const sc = scene();
  if (playT < 0.25 || playT > sc.duration - 0.25) { setNote("Move the playhead inside the scene to split there."); return; }
  const second = freshScene(sc.name + " (2)");
  second.bg = sc.bg; second.duration = +(sc.duration - playT).toFixed(2);
  second.objects = sc.objects.map(o => {
    const atSplit = evalAt(o, playT);
    const c = JSON.parse(JSON.stringify(o));
    Object.assign(c, atSplit);
    c.keys = (o.keys || []).filter(k => k.t > playT).map(k => ({ ...k, t: +(k.t - playT).toFixed(2) }));
    return c;
  });
  sc.objects.forEach(o => { o.keys = (o.keys || []).filter(k => k.t <= playT); });
  sc.duration = +playT.toFixed(2);
  project.scenes.splice(curScene + 1, 0, second);
  pushHistory(); renderScenes(); renderTracks(); drawStage();
  setNote(`Scene split at ${playT.toFixed(1)}s.`);
});
/* keyframes */
$("#keyBtn").addEventListener("click", () => {
  const o = selObj();
  if (!o) { setNote("Select an object on the canvas first, then add a keyframe."); return; }
  const cur = { t: +playT.toFixed(2), x: o.x, y: o.y, scale: o.scale, rot: o.rot, op: o.op };
  // bake current visual state if keys already exist and playhead sits between them
  const ev = evalAt(o, playT);
  Object.assign(cur, { x: ev.x, y: ev.y, scale: ev.scale, rot: ev.rot, op: ev.op });
  o.keys = (o.keys || []).filter(k => Math.abs(k.t - playT) > 0.02);
  o.keys.push(cur); o.keys.sort((a, b) => a.t - b.t);
  pushHistory(); renderTracks();
  setNote(`Keyframe added for ${o.name} at ${playT.toFixed(1)}s. Move the playhead, move the object, add another — it will glide between them.`);
});
$("#keyDelBtn").addEventListener("click", () => {
  const o = selObj(); if (!o) return;
  const before = (o.keys || []).length;
  o.keys = o.keys.filter(k => Math.abs(k.t - playT) > 0.02);
  if (o.keys.length !== before) { pushHistory(); renderTracks(); setNote("Keyframe deleted."); }
  else setNote("No keyframe at the playhead for the selected object.");
});
/* camera framing + zooms */
let camZoom = 1;
$("#cameraBtn").addEventListener("click", () => {
  camZoom = camZoom >= 1.5 ? 1 : camZoom + 0.25;
  applyStageZoom();
  setNote(`Camera framing ${Math.round(camZoom * 100)}% — a closer shot for this scene.`);
});
let sliderZoom = 1;
function applyStageZoom() { $("#stageCanvas").style.transform = `scale(${camZoom * sliderZoom})`; }
$("#canvasZoom").addEventListener("input", (e) => { sliderZoom = e.target.value / 100; applyStageZoom(); });
$("#timelineZoom").addEventListener("input", (e) => {
  const z = 0.4 + e.target.value / 100;
  $$(".track-lane").forEach(l => { l.style.transform = `scaleX(${z})`; l.style.transformOrigin = "left center"; });
});
$("#layersBtn").addEventListener("click", () => {
  const rows = $$("#trackRows .track-row");
  const hidden = rows.length && rows[0].style.display === "none";
  rows.forEach(r => r.style.display = hidden ? "" : "none");
  $("#layersBtn").textContent = hidden ? "Layers ▾" : "Layers ▸";
});
$("#voiceBtn").addEventListener("click", () => selectTool("sounds"));
window.addEventListener("resize", drawPlayhead);

/* ---------------- Save / load (IndexedDB) ---------------- */
function setNote(t) { $("#saveNote").textContent = t; }
async function saveProject() {
  project.name = $("#projectName").value.trim() || "Untitled Project";
  const all = await idbAll("projects");
  const exists = all.some(p => p.name === project.name);
  if (!exists && all.length >= 2) {
    setNote("Free plan holds 2 projects — delete one from Projects, or save over an existing name.");
    return;
  }
  await idbPut("projects", { ...JSON.parse(JSON.stringify(project)), savedAt: Date.now() });
  localStorage.setItem("ssanim_last", project.name);
  setNote(`Project “${project.name}” saved in this browser.`);
  renderDashboard("");
}
$("#saveProjectBtn").addEventListener("click", () => saveProject().catch(() => setNote("Save failed — browser storage is unavailable.")));
async function loadProject(name) {
  const rec = await idbGet("projects", name);
  if (!rec) return false;
  project = rec; delete project.savedAt;
  curScene = 0; selId = null; playT = 0;
  Object.keys(imgCache).forEach(k => delete imgCache[k]);
  $("#projectName").value = project.name;
  history = []; hIdx = -1; pushHistory();
  renderScenes(); renderTracks(); drawStage(); drawPlayhead();
  return true;
}
$("#projectsBtn").addEventListener("click", async () => {
  const all = (await idbAll("projects")).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  const ul = $("#projectList");
  ul.innerHTML = all.length
    ? all.map(p => `<li><strong>${p.name}</strong> · ${p.scenes.length} scene(s) · saved ${new Date(p.savedAt || Date.now()).toLocaleString()}<br><button class="btn btn-panel" data-load="${p.name}" type="button" style="margin-top:6px;padding:6px 12px;font-size:13px">Open</button></li>`).join("")
    : `<li class="project-empty">No saved projects yet. Press “Save Project” and your work will appear here.</li>`;
  $$("[data-load]", ul).forEach(b => b.addEventListener("click", async () => {
    await loadProject(b.dataset.load);
    closeModal($("#projectsModal"));
    setNote(`Project “${b.dataset.load}” opened.`);
  }));
  openModal("#projectsModal");
});

/* ---------------- Tool rail + panels ---------------- */
const SPRITES = ["Bird Fly", "Boy and Girl Walking", "Boy Walking", "Dog Walk", "Girl Walk", "Cat Walk"];
const TUTORIALS = [
  ["How to Create a Character", "7:19"], ["How to Make a Cartoon Video", "6:16"],
  ["Full Studio Tutorial", "12:46"], ["Bangla Tutorial", "10:21"]];
const TOOLS = [
  { id: "character", icon: "🧑", name: "Character" },
  { id: "media", icon: "🖼️", name: "Media" },
  { id: "effect", icon: "🌧️", name: "Effect" },
  { id: "studio", icon: "🎬", name: "Studio" },
  { id: "assets", icon: "📦", name: "Asset Library" },
  { id: "sprite", icon: "🐦", name: "Sprite Sheet" },
  { id: "sounds", icon: "🔊", name: "Sounds" },
  { id: "ik", icon: "🦴", name: "Anim IK" },
  { id: "eraser", icon: "🧽", name: "Eraser" },
  { id: "tutorial", icon: "▶️", name: "Tutorial" },
  { id: "cinema", icon: "🎥", name: "Cinema" }
];
const rail = $("#toolRail"), panel = $("#toolPanel");
TOOLS.forEach((t, i) => {
  const b = document.createElement("button");
  b.className = "rail-btn" + (i === 0 ? " active" : "");
  b.type = "button"; b.dataset.tool = t.id;
  b.innerHTML = `<span class="rail-ico">${t.icon}</span>${t.name}`;
  b.addEventListener("click", () => selectTool(t.id));
  rail.appendChild(b);
});
function chips(items, active) {
  return `<div class="chip-row">${items.map((c, i) =>
    `<button class="chip${i === active ? " active" : ""}" type="button" data-chip="${i}">${c}</button>`).join("")}</div>`;
}
function note(t) { return `<p class="panel-note">${t}</p>`; }
let mediaTab = 0;
const MEDIA_TABS = ["Backgrounds", "People", "Vehicles", "Animals", "Objects", "Sounds", "Upload"];
function mediaGrid() {
  if (mediaTab === 0) return `<div class="card-grid">${BG_LIST.map(b =>
    `<div class="mini-card clickable" data-bg="${b[0]}"><span class="mc-ico">🏞️</span><span class="mc-name">${b[1]}</span><span class="mc-add">Set as scene background</span></div>`).join("")}</div>`;
  if (mediaTab === 1) return `<div class="card-grid">${Object.keys(CHAR_PRESETS).map(c =>
    `<div class="mini-card clickable" data-char="${c}"><span class="mc-ico">🧑</span><span class="mc-name">${c}</span><span class="mc-add">+ Add to canvas</span></div>`).join("")}</div>`;
  if (mediaTab === 2) return `<div class="card-grid">${VEHICLE_LIST.map(v =>
    `<div class="mini-card clickable" data-prop="${v[0]}|${v[1]}"><span class="mc-ico">${v[0]}</span><span class="mc-name">${v[1]}</span><span class="mc-add">+ Add to canvas</span></div>`).join("")}</div>`;
  if (mediaTab === 3) return `<div class="card-grid">${ANIMAL_LIST.map(v =>
    `<div class="mini-card clickable" data-prop="${v[0]}|${v[1]}"><span class="mc-ico">${v[0]}</span><span class="mc-name">${v[1]}</span><span class="mc-add">+ Add to canvas</span></div>`).join("")}</div>`;
  if (mediaTab === 4) return `<div class="card-grid">${PROP_LIST.map(v =>
    `<div class="mini-card clickable" data-prop="${v[0]}|${v[1]}"><span class="mc-ico">${v[0]}</span><span class="mc-name">${v[1]}</span><span class="mc-add">+ Add to canvas</span></div>`).join("")}</div>`;
  if (mediaTab === 5) return `<button class="btn btn-accent panel-btn" id="mediaSoundsBtn" type="button">Open Sounds — BGM, SFX &amp; Voice</button>`;
  return `<label class="btn btn-accent panel-btn" style="display:block;text-align:center;cursor:pointer">Upload Your Image
    <input type="file" accept="image/*" data-upload hidden></label>
    ${note("Your image is placed on the canvas and stored with the project in this browser.")}`;
}
const PANELS = {
  character: () => `<h4>Character</h4>
    <p class="panel-sub">Tap a character to add it to your scene. Drag it on the canvas; animate it with ◆ Keyframe.</p>
    <div class="card-grid">${Object.keys(CHAR_PRESETS).map(c =>
      `<div class="mini-card clickable" data-char="${c}"><span class="mc-ico">🧑</span><span class="mc-name">${c}</span><span class="pro-tag">MULTI PRO</span><span class="mc-add">+ Add to canvas</span></div>`).join("")}</div>
    <button class="btn btn-accent panel-btn" data-pro type="button">Add New Character</button>
    <button class="btn btn-panel panel-btn" data-pro type="button">New from Character Studio</button>
    ${note("The full library holds 45 characters — the owner adds more over time. Creating and editing characters is a Pro feature.")}`,
  media: () => `<h4>Media</h4>${chips(MEDIA_TABS, mediaTab)}${mediaGrid()}`,
  effect: () => `<h4>Effect</h4>
    <p class="panel-sub"><strong>Natural River &amp; Rain Studio</strong></p>
    <button class="btn btn-accent panel-btn" data-soon="River generator" type="button">Generate River</button>
    <label class="slider-row">River type <input type="range" min="0" max="100" value="40"></label>
    <label class="slider-row">Flow speed <input type="range" min="0" max="100" value="50"></label>
    <label class="slider-row">Width <input type="range" min="0" max="100" value="60"></label>
    <label class="slider-row">Angle <input type="range" min="0" max="100" value="30"></label>
    <label class="slider-row">Rain intensity <input type="range" min="0" max="100" value="55"></label>
    <label class="slider-row">Rain speed <input type="range" min="0" max="100" value="50"></label>
    <label class="slider-row">Wind <input type="range" min="0" max="100" value="20"></label>
    <label class="slider-row">Opacity <input type="range" min="0" max="100" value="80"></label>
    <button class="btn btn-panel panel-btn" data-soon="Thunder" type="button">Thunder</button>
    <button class="btn btn-panel panel-btn" data-soon="Camera shake" type="button">Camera Shake</button>
    <button class="btn btn-panel panel-btn" data-soon="Rain sound test" type="button">Test Rain Sound</button>
    ${note("The live effects engine switches on in the tools update — the full control set is already here.")}`,
  studio: () => `<h4>Studio</h4>
    <p class="panel-sub">The main Studio is where characters are built and rigged in Easy Mode and Advanced Mode.</p>
    <div class="mini-card"><span class="mc-ico">🎬</span><span class="mc-name">Upgrade your plan to access the Studio</span></div>
    <button class="btn btn-accent panel-btn" data-pro type="button">Get Pro</button>
    ${note("Pro members open the full Studio: character creation, editing and rigging.")}`,
  assets: () => `<h4>Asset Library</h4>
    <p class="panel-sub">Props for your scenes — tap to add. The owner adds new assets over time.</p>
    <div class="card-grid">${PROP_LIST.map(v =>
      `<div class="mini-card clickable" data-prop="${v[0]}|${v[1]}"><span class="mc-ico">${v[0]}</span><span class="mc-name">${v[1]}</span><span class="mc-add">+ Add to canvas</span></div>`).join("")}</div>
    <label class="btn btn-panel panel-btn" style="display:block;text-align:center;cursor:pointer">Upload
      <input type="file" accept="image/*" data-upload hidden></label>
    <button class="btn btn-accent panel-btn" id="sendEraserBtn" type="button">Send Image to Eraser</button>`,
  sprite: () => `<h4>Sprite Sheet</h4>
    <p class="panel-sub">Ready animation packs — 6 images each.</p>
    ${SPRITES.map(s => `<div class="mini-card" style="margin-bottom:9px"><span class="mc-ico">🐾</span><span class="mc-name">${s}</span>
      <button class="btn btn-panel panel-btn" data-soon="Sprite pack" type="button">Add to Timeline</button></div>`).join("")}
    ${note("Sprite packs arrive with the asset library update.")}`,
  sounds: () => `<h4>Sounds</h4>
    ${chips(["All", "BGM", "SFX", "Voice"], 3)}
    <div class="mini-card" style="margin-bottom:9px"><span class="mc-ico">🎵</span><span class="mc-name">Background Music &amp; Effects</span>
      <span class="panel-sub" style="display:block;margin:4px 0 0">A starter library is included; more tracks are being added.</span></div>
    <h4 style="margin-top:14px">Voice</h4>
    <p class="panel-sub">Record your voice or upload audio — it becomes this scene's voice track and plays during playback.</p>
    <button class="btn btn-accent panel-btn" id="recordBtn" type="button">● Record Voice</button>
    <div id="recordOut"></div>
    <label class="btn btn-panel panel-btn" style="display:block;text-align:center;cursor:pointer">Upload Audio
      <input type="file" accept="audio/*" id="audioUpload" hidden></label>
    <div id="audioOut"></div>`,
  ik: () => `<h4>Anim IK</h4>
    <p class="panel-sub">Turn any 2D character image into an animated puppet with IK joints.</p>
    <label class="btn btn-accent panel-btn" style="display:block;text-align:center;cursor:pointer">Add 2D Character Image
      <input type="file" accept="image/*" data-upload hidden></label>
    <label class="btn btn-panel panel-btn" style="display:block;text-align:center;cursor:pointer">Add Full Body Image
      <input type="file" accept="image/*" data-upload hidden></label>
    <p class="panel-sub" style="margin-top:12px"><strong>IK joints</strong> — Head · Neck · Shoulder L/R · Elbow L/R · Hand L/R · Hip L/R · Knee L/R · Foot L/R. Draw the body outline to finish the rig.</p>
    ${note("Anim IK is a Pro feature in Advanced Mode.")}`,
  eraser: () => `<h4>Eraser</h4>
    <p class="panel-sub">Remove backgrounds and clean up images in the Photo Editor.</p>
    <button class="btn btn-accent panel-btn" id="openEraserBtn" type="button">Open Photo Editor</button>`,
  tutorial: () => `<h4>Tutorial</h4>
    <p class="panel-sub">Learn the studio step by step.</p>
    ${TUTORIALS.map(t => `<div class="mini-card" style="margin-bottom:9px"><span class="mc-ico">▶️</span>
      <span class="mc-name">${t[0]}</span><span class="panel-sub" style="display:block;margin:2px 0 0">${t[1]}</span></div>`).join("")}
    ${note("Tutorial videos are being recorded and will play right here.")}`,
  cinema: () => `<h4>Cinema</h4>
    <p class="panel-sub">Watch Ss Animation cartoons on YouTube.</p>
    <button class="btn btn-accent panel-btn" id="openCinemaBtn" type="button">Open Cinema</button>`
};
async function attachVoice(blob, label) {
  const assetId = nid("vo");
  await idbPut("assets", { id: assetId, blob, name: label, at: Date.now() });
  scene().voiceAssetId = assetId;
  pushHistory(); renderTracks();
  setNote(`Voice set for ${scene().name} — press Play and it speaks with the scene.`);
}
let mediaRec = null, recChunks = [];
function wirePanel() {
  $$("[data-pro]", panel).forEach(b => b.addEventListener("click", () => openPro()));
  $$("[data-soon]", panel).forEach(b => b.addEventListener("click", () =>
    setNote(`${b.dataset.soon} switches on in the next studio update.`)));
  $$("[data-char]", panel).forEach(c => c.addEventListener("click", () => addCharacter(c.dataset.char)));
  $$("[data-bg]", panel).forEach(c => c.addEventListener("click", () => {
    scene().bg = c.dataset.bg; pushHistory(); drawStage();
    setNote("Background set for this scene.");
  }));
  $$("[data-prop]", panel).forEach(c => c.addEventListener("click", () => {
    const [emoji, name] = c.dataset.prop.split("|"); addProp(emoji, name);
  }));
  $$("[data-upload]", panel).forEach(inp => inp.addEventListener("change", () => {
    const f = inp.files && inp.files[0]; if (f) addImageFile(f).catch(() => setNote("That image could not be added."));
  }));
  $$(".chip", panel).forEach(c => c.addEventListener("click", () => {
    if ($("#toolPanel").dataset.tool === "media") { mediaTab = +c.dataset.chip; selectTool("media"); }
    else { $$(".chip", panel).forEach(x => x.classList.remove("active")); c.classList.add("active"); }
  }));
  const ms = $("#mediaSoundsBtn"); if (ms) ms.addEventListener("click", () => selectTool("sounds"));
  const se = $("#sendEraserBtn"); if (se) se.addEventListener("click", openEraser);
  const oe = $("#openEraserBtn"); if (oe) oe.addEventListener("click", openEraser);
  const oc = $("#openCinemaBtn"); if (oc) oc.addEventListener("click", () => openModal("#cinemaModal"));
  const rb = $("#recordBtn");
  if (rb) rb.addEventListener("click", async () => {
    if (mediaRec && mediaRec.state === "recording") { mediaRec.stop(); rb.textContent = "● Record Voice"; return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recChunks = [];
      mediaRec = new MediaRecorder(stream);
      mediaRec.ondataavailable = e => recChunks.push(e.data);
      mediaRec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recChunks, { type: mediaRec.mimeType || "audio/webm" });
        $("#recordOut").innerHTML = `<audio controls src="${URL.createObjectURL(blob)}" style="width:100%;margin-top:10px"></audio>`;
        await attachVoice(blob, "Voice recording");
      };
      mediaRec.start(); rb.textContent = "■ Stop Recording";
      setNote("Recording… press Stop when you finish the line.");
    } catch { setNote("Microphone is not available in this browser."); }
  });
  const au = $("#audioUpload");
  if (au) au.addEventListener("change", async () => {
    const f = au.files && au.files[0]; if (!f) return;
    $("#audioOut").innerHTML = `<audio controls src="${URL.createObjectURL(f)}" style="width:100%;margin-top:10px"></audio>`;
    await attachVoice(f, f.name);
  });
}
function selectTool(id) {
  if (id === "eraser") { openEraser(); return; }
  if (id === "cinema") { openModal("#cinemaModal"); return; }
  $$(".rail-btn").forEach(b => b.classList.toggle("active", b.dataset.tool === id));
  panel.dataset.tool = id;
  panel.innerHTML = PANELS[id]();
  wirePanel();
}

/* ---------------- Mode switch ---------------- */
const modeEasy = $("#modeEasy"), modeAdvanced = $("#modeAdvanced");
function setMode(adv) {
  modeEasy.classList.toggle("active", !adv);
  modeAdvanced.classList.toggle("active", adv);
  document.body.classList.toggle("advanced", adv);
  setNote(adv ? "Advanced Mode — full tool set and rigging controls." : "Easy Mode — the simple way to make a cartoon.");
}
modeEasy.addEventListener("click", () => setMode(false));
modeAdvanced.addEventListener("click", () => setMode(true));

/* ---------------- Modals ---------------- */
function openModal(sel) { $(sel).hidden = false; }
function closeModal(el) { el.hidden = true; }
$$(".modal-backdrop").forEach(m => {
  m.addEventListener("click", (e) => { if (e.target === m) closeModal(m); });
  $$("[data-close]", m).forEach(b => b.addEventListener("click", () => closeModal(m)));
});
$("#exportBtn").addEventListener("click", () => openModal("#exportModal"));
$("#renderBtn").addEventListener("click", () => {
  $("#exportNote").textContent = "Your project is saved and ready — the video rendering engine switches on in the export update.";
});
$("#profileBtn").addEventListener("click", () => {
  renderDashboard("");
  $("#dashboard").scrollIntoView({ behavior: "smooth" });
});
$("#googleSignInBtn").addEventListener("click", () => {
  setNote("Google sign-in switches on with cloud accounts (Pro update). Your projects are safe in this browser until then.");
  closeModal($("#profileModal"));
});

/* ---------------- Pro / manual payment ---------------- */
let payPlan = "Pro — 30 Days · ৳200", payMethod = "bKash";
function openPro(plan) {
  if (plan) payPlan = plan;
  $("#proPlanLine").firstChild.textContent = `Plan: ${payPlan}. Choose how you pay, send money, and send us the details — Pro is activated after verification, usually within a few minutes to 24 hours.`;
  $$("#payPlans .pay-plan").forEach(b => b.classList.toggle("active", b.dataset.plan === payPlan));
  openModal("#proModal");
}
$("#getProBtn").addEventListener("click", () => openPro());
$$(".plan-btn[data-plan^='Pro']").forEach(b => b.addEventListener("click", () => openPro(b.dataset.plan)));
$$("#payPlans .pay-plan").forEach(b => b.addEventListener("click", () => {
  payPlan = b.dataset.plan;
  $$("#payPlans .pay-plan").forEach(x => x.classList.toggle("active", x === b));
}));
$$(".pay-method").forEach(b => b.addEventListener("click", () => {
  payMethod = b.dataset.method;
  $$(".pay-method").forEach(x => x.classList.toggle("active", x === b));
  $("#payMethodName").textContent = payMethod;
}));
$("#paySubmitBtn").addEventListener("click", () => {
  const sender = $("#paySender").value.trim(), trx = $("#payTrx").value.trim();
  if (sender.length < 6 || trx.length < 4) {
    $("#payNote").textContent = "Please add your sender number and the Transaction ID so we can verify your payment.";
    return;
  }
  const subs = JSON.parse(localStorage.getItem("ssanim_pay_subs") || "[]");
  subs.push({ plan: payPlan, method: payMethod, sender, trx, at: new Date().toISOString() });
  localStorage.setItem("ssanim_pay_subs", JSON.stringify(subs));
  $("#payNote").textContent = "Received — thank you! We verify payments by hand and activate Pro within a few minutes to 24 hours.";
});

/* ---------------- Eraser overlay ---------------- */
function openEraser() { $("#eraserOverlay").hidden = false; }
$("#eraserCloseBtn").addEventListener("click", () => { $("#eraserOverlay").hidden = true; });
$("#sendToStudioBtn").addEventListener("click", () => {
  $("#eraserOverlay").hidden = true;
  setNote("Image sent to the Studio canvas.");
  selectTool("media");
});

/* ---------------- Dashboard (first interface) ---------------- */
async function renderDashboard(filter) {
  const listEl = $("#projList"), emptyEl = $("#projEmpty");
  if (!listEl) return;
  let all = [];
  try { all = (await idbAll("projects")).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); } catch { all = []; }
  $("#projCount").textContent = `(${all.length})`;
  const f = (filter || "").trim().toLowerCase();
  const shown = f ? all.filter(p => p.name.toLowerCase().includes(f)) : all;
  emptyEl.style.display = all.length ? "none" : "";
  listEl.innerHTML = shown.map(p =>
    `<div class="dash-proj-item"><span class="pi-ico">🎞</span>
       <span class="pi-meta"><span class="pi-name">${p.name}</span>
       <span class="pi-sub">${(p.scenes || []).length} scene(s) · saved ${new Date(p.savedAt || Date.now()).toLocaleString()}</span></span>
       <button class="btn btn-panel" data-dash-open="${p.name}" type="button" style="padding:7px 14px;font-size:13px">Open</button>
     </div>`).join("")
    + (f && !shown.length && all.length ? `<p class="panel-note">No projects match “${filter}”.</p>` : "");
  $$("[data-dash-open]", listEl).forEach(b => b.addEventListener("click", async () => {
    if (await loadProject(b.dataset.dashOpen)) {
      $("#studioApp").scrollIntoView({ behavior: "smooth" });
      setNote(`Project “${b.dataset.dashOpen}” opened in the studio.`);
    }
  }));
}
function newProject() {
  stopPlayback();
  project = freshProject();
  curScene = 0; selId = null; playT = 0;
  $("#projectName").value = project.name;
  history = []; hIdx = -1; pushHistory();
  renderScenes(); renderTracks(); drawStage(); drawPlayhead();
  $("#studioApp").scrollIntoView({ behavior: "smooth" });
  setNote("New project started — it auto-saves here as you work.");
}
$("#payNowBtn").addEventListener("click", () => openPro());
$("#powerBtn").addEventListener("click", () =>
  setNote("You are using Ss Animation in this browser — accounts and sign-out arrive with the cloud update."));
$("#newProjBtn").addEventListener("click", newProject);
$("#createProjBtn").addEventListener("click", newProject);
$("#projSearch").addEventListener("input", (e) => renderDashboard(e.target.value));

/* ---------------- Init + PWA ---------------- */
selectTool("character");
renderDashboard("");
renderScenes(); renderTracks(); drawStage(); pushHistory();
(async () => {
  try {
    const last = localStorage.getItem("ssanim_last");
    if (last) await loadProject(last);
  } catch { /* fresh project stays */ }
})();
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferredPrompt = e; $("#installBtn").hidden = false;
});
$("#installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null; $("#installBtn").hidden = true;
});

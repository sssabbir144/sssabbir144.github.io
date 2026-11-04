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
    const r = indexedDB.open("ssanim", 3);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", { keyPath: "name" });
      if (!d.objectStoreNames.contains("assets")) d.createObjectStore("assets", { keyPath: "id" });
      if (!d.objectStoreNames.contains("library")) d.createObjectStore("library", { keyPath: "id" });
      if (!d.objectStoreNames.contains("customChars")) d.createObjectStore("customChars", { keyPath: "name" });
    };
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { try { d.close(); } catch { } if (_db === d) _db = null; }; res(d); };
    r.onerror = () => rej(r.error);
  });
}
async function db() { if (!_db) _db = await idbOpen(); return _db; }
async function idbTx(store, mode, run) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const d = await db();
    try {
      return await new Promise((res, rej) => {
        const t = d.transaction(store, mode);
        const rq = run(t.objectStore(store));
        if (rq) { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }
        t.oncomplete = () => res(true);
        t.onerror = () => rej(t.error);
      });
    } catch (e) {
      if (attempt === 0 && e && e.name === "InvalidStateError") { _db = null; continue; }
      throw e;
    }
  }
}
async function idbPut(store, val) { return idbTx(store, "readwrite", os => { os.put(val); }); }
async function idbGet(store, key) { const v = await idbTx(store, "readonly", os => os.get(key)); return v === true ? null : (v || null); }
async function idbDel(store, key) { return idbTx(store, "readwrite", os => { os.delete(key); }); }
async function idbAll(store) { const v = await idbTx(store, "readonly", os => os.getAll()); return Array.isArray(v) ? v : []; }

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
/* 49 library props: [emoji, name, isPro] */
const PROP_LIST = [
  ["📺", "TV", 0], ["🌀", "Fan", 0], ["🪑", "Chair", 0], ["🪟", "Window", 0], ["🛋️", "Sofa", 0],
  ["🌳", "Tree", 0], ["🏠", "House", 0], ["🚗", "Car", 0], ["🚲", "Bike", 0], ["📱", "Mobile", 0],
  ["💡", "Lamp", 0], ["📚", "Books", 0], ["🪴", "Plant", 0], ["🛏️", "Bed", 0], ["🚪", "Door", 0],
  ["⏰", "Clock", 0], ["📻", "Radio", 0], ["🍎", "Apple", 0], ["🚦", "Traffic Light", 0], ["🏫", "School", 0],
  ["☂️", "Umbrella", 0], ["🔦", "Torch", 0], ["🗑️", "Dustbin", 0], ["📫", "Postbox", 0], ["🚧", "Barrier", 0],
  ["☁️", "Cloud", 0], ["🌻", "Sunflower", 0], ["🎈", "Balloon", 0], ["🛒", "Cart", 0], ["⚽", "Ball", 0],
  ["💻", "Laptop", 1], ["🖥️", "Computer", 1], ["📷", "Camera", 1], ["🎸", "Guitar", 1], ["🚀", "Rocket", 1],
  ["⛵", "Boat", 1], ["🚂", "Train", 1], ["✈️", "Plane", 1], ["🏰", "Castle", 1], ["🌴", "Palm Tree", 1],
  ["⛲", "Fountain", 1], ["🌉", "Bridge", 1], ["🏥", "Hospital", 1], ["🎡", "Ferris Wheel", 1], ["🚁", "Helicopter", 1],
  ["🧸", "Teddy Bear", 1], ["🌈", "Rainbow", 1], ["⭐", "Star", 1], ["🎁", "Gift Box", 1]];
const VEHICLE_LIST = [["🚗", "Car", 0], ["🚲", "Bike", 0], ["🚌", "Bus", 0], ["🚑", "Ambulance", 0], ["🚓", "Police Car", 1], ["🛵", "Scooter", 0]];
const ANIMAL_LIST = [["🐶", "Dog", 0], ["🐱", "Cat", 0], ["🐦", "Bird", 0], ["🐴", "Horse", 1], ["🐰", "Bunny", 0], ["🐸", "Frog", 0]];

/* ---------------- Project state ---------------- */
function freshScene(name) { return { id: nid("sc"), name, duration: 5, bg: null, objects: [], voiceAssetId: null, audio: [] }; }
function freshProject() { return { name: "Untitled Project", scenes: [freshScene("Scene 1")] }; }
let project = freshProject();
let savedName = null; // name the current project was last saved under (rename migration)
let curScene = 0, selId = null, playT = 0;
const scene = () => project.scenes[curScene];
const selObj = () => scene().objects.find(o => o.id === selId) || null;

/* ---------------- Keyframe easing + motion path (P3) ---------------- */
function easeApply(name, k) {
  if (name === "in") return k * k;
  if (name === "out") return 1 - (1 - k) * (1 - k);
  if (name === "inout") return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  return k;
}
function catmullRom(p0, p1, p2, p3, k) {
  const k2 = k * k, k3 = k2 * k;
  return 0.5 * ((2 * p1) + (-p0 + p2) * k + (2 * p0 - 5 * p1 + 4 * p2 - p3) * k2 + (-p0 + 3 * p1 - 3 * p2 + p3) * k3);
}
function evalAt(o, t) {
  const base = { x: o.x, y: o.y, scale: o.scale, rot: o.rot, op: o.op };
  if (o.pose) base.pose = { arm: o.pose.arm || 0, leg: o.pose.leg || 0, head: o.pose.head || 0, lean: o.pose.lean || 0 };
  if (!o.keys || !o.keys.length) return base;
  const ks = o.keys;
  const poseOf = (k) => k.pose ? { arm: k.pose.arm || 0, leg: k.pose.leg || 0, head: k.pose.head || 0, lean: k.pose.lean || 0 } : (base.pose ? { ...base.pose } : { arm: 0, leg: 0, head: 0, lean: 0 });
  if (t <= ks[0].t) return { x: ks[0].x, y: ks[0].y, scale: ks[0].scale, rot: ks[0].rot, op: ks[0].op, pose: poseOf(ks[0]) };
  if (t >= ks[ks.length - 1].t) { const L = ks[ks.length - 1]; return { x: L.x, y: L.y, scale: L.scale, rot: L.rot, op: L.op, pose: poseOf(L) }; }
  for (let i = 0; i < ks.length - 1; i++) {
    if (t >= ks[i].t && t <= ks[i + 1].t) {
      const raw = (t - ks[i].t) / Math.max(0.0001, ks[i + 1].t - ks[i].t);
      const k = easeApply(ks[i].ease, raw);
      const out = {};
      for (const f of ["scale", "rot", "op"]) out[f] = lerp(ks[i][f], ks[i + 1][f], k);
      if (ks.length >= 3) {
        const p0 = ks[Math.max(0, i - 1)], p1 = ks[i], p2 = ks[i + 1], p3 = ks[Math.min(ks.length - 1, i + 2)];
        out.x = catmullRom(p0.x, p1.x, p2.x, p3.x, k);
        out.y = catmullRom(p0.y, p1.y, p2.y, p3.y, k);
      } else {
        out.x = lerp(ks[i].x, ks[i + 1].x, k);
        out.y = lerp(ks[i].y, ks[i + 1].y, k);
      }
      const pa = poseOf(ks[i]), pb = poseOf(ks[i + 1]);
      out.pose = { arm: lerp(pa.arm, pb.arm, k), leg: lerp(pa.leg, pb.leg, k), head: lerp(pa.head, pb.head, k), lean: lerp(pa.lean, pb.lean, k) };
      return out;
    }
  }
  return base;
}
/* ---------------- Camera track (P3) ---------------- */
let camRowSel = false, selKey = null;
function evalCam(t) {
  const sc = scene();
  const ks = (sc && sc.camKeys) || [];
  if (!ks.length) return { zoom: 1, x: 0, y: 0 };
  if (t <= ks[0].t) return { zoom: ks[0].zoom, x: ks[0].x || 0, y: ks[0].y || 0 };
  const L = ks[ks.length - 1];
  if (t >= L.t) return { zoom: L.zoom, x: L.x || 0, y: L.y || 0 };
  for (let i = 0; i < ks.length - 1; i++) {
    if (t >= ks[i].t && t <= ks[i + 1].t) {
      const raw = (t - ks[i].t) / Math.max(0.0001, ks[i + 1].t - ks[i].t);
      const k = easeApply(ks[i].ease, raw);
      return { zoom: lerp(ks[i].zoom, ks[i + 1].zoom, k), x: lerp(ks[i].x || 0, ks[i + 1].x || 0, k), y: lerp(ks[i].y || 0, ks[i + 1].y || 0, k) };
    }
  }
  return { zoom: 1, x: 0, y: 0 };
}
function ensureCamKey(t) {
  const sc = scene();
  sc.camKeys = sc.camKeys || [];
  const found = sc.camKeys.find(k => Math.abs(k.t - t) < 0.02);
  if (found) return found;
  const cur = evalCam(t);
  const ck = { t: +t.toFixed(2), zoom: cur.zoom, x: Math.round(cur.x), y: Math.round(cur.y), ease: "inout" };
  sc.camKeys.push(ck); sc.camKeys.sort((a, b) => a.t - b.t);
  return ck;
}
function objSize(o) {
  if (o.type === "char") return { w: 200, h: 350 };
  if (o.type === "sprite") return { w: 220, h: 220 };
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
  if (ev.lean) ctx.rotate(ev.lean);
  // legs + shoes (hip-pivot swing — walk cycles for sprite packs)
  const sw = ev.swing || 0;
  const swL = ev.swingLeg !== undefined ? ev.swingLeg : sw;
  const swA = ev.swingArm !== undefined ? ev.swingArm : sw * 0.8;
  const leg = (hx, a) => {
    ctx.save(); ctx.translate(hx, 42); ctx.rotate(a);
    ctx.fillStyle = p.pants; ctx.fillRect(-19, 0, 38, 103);
    ctx.fillStyle = "#26221f"; ctx.fillRect(-24, 100, 48, 16);
    ctx.restore();
  };
  leg(-33, swL); leg(33, -swL);
  // skirt
  if (p.skirt) { ctx.fillStyle = p.shirt; ctx.beginPath(); ctx.moveTo(-58, 30); ctx.lineTo(58, 30); ctx.lineTo(76, 95); ctx.lineTo(-76, 95); ctx.fill(); }
  // arms (shoulder-pivot swing, opposite to the legs)
  const arm = (sx, a) => {
    ctx.save(); ctx.translate(sx, -58); ctx.rotate(a);
    ctx.fillStyle = p.shirt; ctx.fillRect(-13, 0, 26, 92);
    ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 2; ctx.strokeRect(-13, 0, 26, 92);
    ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(0, 100, 13, 0, 7); ctx.fill();
    ctx.restore();
  };
  arm(-71, -swA); arm(71, swA);
  // torso
  ctx.fillStyle = p.shirt;
  ctx.beginPath(); ctx.roundRect(-60, -70, 120, 122, 18); ctx.fill();
  // head group (IK head tilt pivots at the neck)
  ctx.save();
  ctx.translate(0, -70); ctx.rotate(ev.headTilt || 0); ctx.translate(0, 70);
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
  // face (eyes + mouth variants; defaults keep the classic look)
  ctx.fillStyle = "#26221f"; ctx.strokeStyle = "#26221f";
  const eyeStyle = p.eyes || "round";
  if (eyeStyle === "happy") {
    ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(-18, -114, 7, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(18, -114, 7, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
  } else if (eyeStyle === "sleepy") {
    ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-25, -118); ctx.lineTo(-11, -118); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, -118); ctx.lineTo(25, -118); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(-18, -118, 5.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(18, -118, 5.5, 0, 7); ctx.fill();
  }
  const mouthStyle = p.mouth || "smile";
  if (mouthStyle === "open") {
    ctx.beginPath(); ctx.ellipse(0, -100, 8, 10, 0, 0, 7); ctx.fill();
  } else if (mouthStyle === "flat") {
    ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-10, -100); ctx.lineTo(10, -100); ctx.stroke();
  } else {
    ctx.lineWidth = 4; ctx.beginPath();
    ctx.arc(0, -102, 15, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  if ((p.extra || "none") === "glasses") {
    ctx.lineWidth = 3.5; ctx.strokeStyle = "#26221f";
    ctx.beginPath(); ctx.arc(-18, -118, 12, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(18, -118, 12, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -118); ctx.lineTo(6, -118); ctx.stroke();
  }
  if ((p.extra || "none") === "cap") {
    ctx.fillStyle = p.cap || "#24457a";
    ctx.beginPath(); ctx.arc(0, -140, 54, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -138, 62, 10, 0, 0, Math.PI); ctx.fill();
  }
  ctx.fillStyle = "rgba(240,120,110,.45)";
  ctx.beginPath(); ctx.arc(-34, -104, 8, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(34, -104, 8, 0, 7); ctx.fill();
  ctx.restore(); // head group
  ctx.restore();
}

/* ---------------- Stage engine ---------------- */
const stageEl = $("#stageEl"), sctx = stageEl.getContext("2d");
const imgCache = {}; // assetId -> HTMLImageElement
const memBlobs = {}; // session-only fallback when browser storage refuses a write
function ensureImage(assetId) {
  if (imgCache[assetId]) return imgCache[assetId];
  const img = new Image();
  imgCache[assetId] = img;
  if (memBlobs[assetId]) {
    img.src = URL.createObjectURL(memBlobs[assetId]);
    img.onload = () => drawStage();
    return img;
  }
  idbGet("assets", assetId).then(rec => {
    if (rec && rec.blob) { img.src = URL.createObjectURL(rec.blob); img.onload = () => drawStage(); }
  }).catch(() => {});
  return img;
}
const dataImgCache = {};
function ensureDataImage(url) {
  if (!dataImgCache[url]) {
    const i = new Image();
    i.src = url; i.onload = () => drawStage();
    dataImgCache[url] = i;
  }
  return dataImgCache[url];
}
function drawStage() {
  const sc = scene();
  sctx.clearRect(0, 0, 1280, 720);
  const _cam = evalCam(playT);
  sctx.fillStyle = "#000"; sctx.fillRect(0, 0, 1280, 720);
  sctx.save();
  if (_cam.zoom !== 1 || _cam.x || _cam.y) { sctx.translate(640, 360); sctx.scale(_cam.zoom, _cam.zoom); sctx.translate(-640 - _cam.x, -360 - _cam.y); }
  if (sc.bgAsset) {
    const bimg = ensureImage(sc.bgAsset);
    if (bimg && bimg.complete && bimg.naturalWidth) {
      const s = Math.max(1280 / bimg.naturalWidth, 720 / bimg.naturalHeight);
      sctx.drawImage(bimg, (1280 - bimg.naturalWidth * s) / 2, (720 - bimg.naturalHeight * s) / 2, bimg.naturalWidth * s, bimg.naturalHeight * s);
    } else if (sc.bg) paintBG(sctx, sc.bg);
    else { sctx.fillStyle = "#000"; sctx.fillRect(0, 0, 1280, 720); }
  } else if (sc.bg) paintBG(sctx, sc.bg);
  else { sctx.fillStyle = "#000"; sctx.fillRect(0, 0, 1280, 720); }
  if (sc.bgColor) {
    sctx.save(); sctx.globalAlpha = 0.35; sctx.fillStyle = sc.bgColor;
    sctx.fillRect(0, 0, 1280, 720); sctx.restore();
  }
  for (const o of sc.objects) {
    if (o.hidden) continue;
    { const _c = clipOf(o, sc); if (playT < _c.start - 0.001 || playT > _c.start + _c.dur + 0.001) continue; }
    const ev = evalAt(o, playT);
    const _pose = ev.pose || o.pose;
    if (_pose) {
      ev.swingLeg = (_pose.leg || 0) * Math.PI / 180;
      ev.swingArm = (_pose.arm || 0) * Math.PI / 180;
      ev.headTilt = (_pose.head || 0) * Math.PI / 180;
      ev.lean = (_pose.lean || 0) * Math.PI / 180;
    }
    if (o.type === "char") drawChar(sctx, o, ev);
    else if (o.type === "prop") {
      sctx.save();
      sctx.translate(ev.x, ev.y); sctx.rotate(ev.rot * Math.PI / 180);
      sctx.scale(ev.scale * (o.flip ? -1 : 1), ev.scale);
      sctx.globalAlpha = ev.op;
      sctx.font = "100px serif"; sctx.textAlign = "center"; sctx.textBaseline = "middle";
      sctx.fillText(o.emoji, 0, 0);
      sctx.restore();
    } else if (o.type === "sprite") {
      const fi = Math.floor(playT / (o.frameDur || 0.12)) % o.frames.length;
      const img = ensureDataImage(o.frames[fi]);
      if (img && img.complete && img.naturalWidth) {
        sctx.save();
        sctx.translate(ev.x, ev.y); sctx.rotate(ev.rot * Math.PI / 180);
        sctx.scale(ev.scale * (o.flip ? -1 : 1), ev.scale);
        sctx.globalAlpha = ev.op;
        sctx.drawImage(img, -110, -110, 220, 220);
        sctx.restore();
      }
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
    if (o.outline) {
      const { w, h } = objSize(o);
      sctx.save();
      sctx.translate(ev.x, ev.y); sctx.rotate(ev.rot * Math.PI / 180);
      sctx.scale(ev.scale, ev.scale);
      sctx.strokeStyle = "#57b7d9"; sctx.lineWidth = 2.5 / ev.scale; sctx.setLineDash([8, 6]);
      sctx.strokeRect(-w / 2, -h / 2, w, h);
      sctx.setLineDash([]);
      sctx.fillStyle = "#F5C518";
      const joints = [[0, -h * 0.42], [-w * 0.3, -h * 0.2], [w * 0.3, -h * 0.2], [-w * 0.3, h * 0.22], [w * 0.3, h * 0.22], [-w * 0.14, h * 0.08], [w * 0.14, h * 0.08], [-w * 0.14, h * 0.46], [w * 0.14, h * 0.46]];
      for (const [jx, jy] of joints) { sctx.beginPath(); sctx.arc(jx, jy, 7 / ev.scale, 0, 7); sctx.fill(); }
      sctx.restore();
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
  drawFX(sctx, sc);
  if (!exporting) drawMotionPath(sctx, sc);
  sctx.restore();
  $("#stageEmpty").style.display = sc.objects.length ? "none" : "";
  syncObjTools();
}
function drawMotionPath(ctx, sc) {
  if (!selId) return;
  const o = sc.objects.find(x => x.id === selId);
  if (!o || !o.keys || o.keys.length < 2) return;
  const ks = o.keys;
  ctx.save();
  ctx.strokeStyle = "rgba(245,197,24,.85)"; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
  ctx.beginPath();
  if (ks.length === 2) { ctx.moveTo(ks[0].x, ks[0].y); ctx.lineTo(ks[1].x, ks[1].y); }
  else {
    ctx.moveTo(ks[0].x, ks[0].y);
    for (let i = 0; i < ks.length - 1; i++) {
      const p0 = ks[Math.max(0, i - 1)], p1 = ks[i], p2 = ks[i + 1], p3 = ks[Math.min(ks.length - 1, i + 2)];
      for (let s = 1; s <= 14; s++) { const k = s / 14; ctx.lineTo(catmullRom(p0.x, p1.x, p2.x, p3.x, k), catmullRom(p0.y, p1.y, p2.y, p3.y, k)); }
    }
  }
  ctx.stroke(); ctx.setLineDash([]);
  for (const k of ks) { ctx.beginPath(); ctx.arc(k.x, k.y, 5, 0, 7); ctx.fillStyle = "#F5C518"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "#000"; ctx.stroke(); }
  ctx.restore();
}
/* ---------------- Effects rendering (rain / river / thunder) ---------------- */
const frand = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function drawFX(ctx, sc) {
  const fx = sc.fx || {};
  const now = performance.now() / 1000;
  if (fx.river) {
    const rv = fx.river, wpx = 60 + rv.width * 2.2;
    ctx.save();
    ctx.translate(640, 720 - wpx / 2 - 6);
    ctx.rotate((rv.angle - 50) * 0.0035);
    const g = ctx.createLinearGradient(0, -wpx / 2, 0, wpx / 2);
    g.addColorStop(0, rv.color2); g.addColorStop(0.5, rv.color1); g.addColorStop(1, rv.color2);
    ctx.fillStyle = g; ctx.fillRect(-760, -wpx / 2, 1520, wpx);
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 4;
    const off = (now * rv.flow * 2.4) % 130;
    for (let x = -760 - 130 + off; x < 760; x += 130) {
      ctx.beginPath(); ctx.moveTo(x, -wpx * 0.22); ctx.quadraticCurveTo(x + 26, -wpx * 0.34, x + 52, -wpx * 0.22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 40, wpx * 0.24); ctx.quadraticCurveTo(x + 66, wpx * 0.12, x + 92, wpx * 0.24); ctx.stroke();
    }
    ctx.restore();
  }
  if (fx.rain) {
    const rn = fx.rain, count = Math.round(rn.intensity * 3.6);
    ctx.save();
    ctx.strokeStyle = `rgba(200,225,245,${0.25 + rn.opacity / 100 * 0.65})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const sx = frand(i) * 1320 - 20;
      const sy = (frand(i + 500) * 720 + now * (240 + rn.speed * 7)) % 760 - 20;
      const wx = rn.wind * 0.35 * (sy / 720 + 0.4);
      ctx.moveTo(sx + wx, sy);
      ctx.lineTo(sx + wx - rn.wind * 0.14, sy + 17);
    }
    ctx.stroke();
    if (rn.splash) {
      ctx.strokeStyle = `rgba(210,235,250,${0.35 + rn.opacity / 200})`;
      for (let i = 0; i < count / 6; i++) {
        const sx = frand(i + 900) * 1280, ph = (now * 3 + frand(i) * 6) % 1;
        ctx.beginPath(); ctx.ellipse(sx, 706, 4 + ph * 8, 1.6 + ph * 2.6, 0, 0, 7); ctx.stroke();
      }
    }
    ctx.restore();
  }
  if (fx.thunder) {
    const cyc = (performance.now() % 5600);
    const a = cyc < 110 ? 0.5 : (cyc > 320 && cyc < 410 ? 0.32 : 0);
    if (a > 0) { ctx.fillStyle = `rgba(240,246,255,${a})`; ctx.fillRect(0, 0, 1280, 720); }
  }
}
/* FX animation loop — runs while rain/river/thunder/shake is live */
let fxRaf = null;
function fxActive() {
  const fx = scene().fx || {};
  return !!(fx.rain || fx.river || fx.thunder || (fx.shake || 0) > 0);
}
function ensureFxLoop() {
  if (fxRaf) return;
  const step = () => {
    if (!fxActive() && !playing) { fxRaf = null; applyStageZoom(); drawStage(); return; }
    if (((scene().fx || {}).shake || 0) > 0) applyStageZoom();
    if (!playing) drawStage();
    fxRaf = requestAnimationFrame(step);
  };
  fxRaf = requestAnimationFrame(step);
}
/* Rain sound — synthesized white noise (Web Audio), no audio file needed */
let rainAudio = null;
function setRainSound(on, intensity) {
  try {
    if (!rainAudio) {
      const AC = new (window.AudioContext || window.webkitAudioContext)();
      const len = AC.sampleRate * 2, buf = AC.createBuffer(1, len, AC.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
      const filt = AC.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 900;
      const gain = AC.createGain(); gain.gain.value = 0;
      src.connect(filt); filt.connect(gain); gain.connect(AC.destination);
      src.start();
      rainAudio = { AC, gain };
    }
    rainAudio.AC.resume();
    rainAudio.gain.gain.setTargetAtTime(on ? 0.04 + (intensity || 50) / 100 * 0.09 : 0, rainAudio.AC.currentTime, 0.2);
  } catch { /* audio unavailable — visuals still work */ }
}
/* ---------------- Sprite pack painters (6 frames each) ---------------- */
function drawBird(x, ph) {
  const bob = Math.sin(ph) * 8;
  x.save(); x.translate(110, 104 + bob);
  x.fillStyle = "#f2a541";
  x.beginPath(); x.ellipse(0, 6, 46, 26, 0, 0, 7); x.fill();
  x.fillStyle = "#f7c873"; x.beginPath(); x.arc(34, -8, 17, 0, 7); x.fill();
  x.fillStyle = "#e2703a"; x.beginPath(); x.moveTo(48, -10); x.lineTo(66, -4); x.lineTo(48, 2); x.fill();
  x.fillStyle = "#26221f"; x.beginPath(); x.arc(38, -12, 3.4, 0, 7); x.fill();
  x.save(); x.translate(-6, -4); x.rotate(Math.sin(ph) * 0.9 - 0.25);
  x.fillStyle = "#d9832e"; x.beginPath(); x.ellipse(-16, -16, 34, 13, -0.5, 0, 7); x.fill(); x.restore();
  x.fillStyle = "#d9832e"; x.beginPath(); x.moveTo(-42, 0); x.lineTo(-66, -12); x.lineTo(-62, 14); x.fill();
  x.restore();
}
function drawQuad(x, ph, kind) {
  const dog = kind === "dog";
  x.save(); x.translate(110, 118);
  const lp = Math.sin(ph) * 0.55;
  x.strokeStyle = dog ? "#8a6844" : "#565b66"; x.lineWidth = 9; x.lineCap = "round";
  const legL = (lx, a) => { x.save(); x.translate(lx, 18); x.rotate(a); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 34); x.stroke(); x.restore(); };
  legL(-30, lp); legL(30, lp); legL(-16, -lp); legL(42, -lp);
  x.fillStyle = dog ? "#a97c50" : "#788089";
  x.beginPath(); x.roundRect(-52, -16, 104, 40, 16); x.fill();
  x.save(); x.translate(-52, -8); x.rotate(Math.sin(ph * 2) * 0.4 - 0.5); x.fillRect(-26, -5, 28, 9); x.restore();
  x.beginPath(); x.arc(64, -18, 21, 0, 7); x.fill();
  if (dog) { x.fillStyle = "#8a6844"; x.beginPath(); x.ellipse(56, -26, 8, 15, 0.4, 0, 7); x.fill(); }
  else {
    x.fillStyle = "#788089";
    x.beginPath(); x.moveTo(50, -34); x.lineTo(56, -50); x.lineTo(64, -36); x.fill();
    x.beginPath(); x.moveTo(66, -36); x.lineTo(76, -48); x.lineTo(80, -32); x.fill();
  }
  x.fillStyle = "#26221f"; x.beginPath(); x.arc(70, -20, 3.2, 0, 7); x.fill();
  x.beginPath(); x.arc(85, -14, 4.5, 0, 7); x.fill();
  x.restore();
}
function spriteFrames(kind) {
  const frames = [];
  for (let i = 0; i < 6; i++) {
    const c = document.createElement("canvas"); c.width = c.height = 220;
    const x = c.getContext("2d"), ph = i / 6 * Math.PI * 2;
    if (kind === "bird") drawBird(x, ph);
    else if (kind === "dog" || kind === "cat") drawQuad(x, ph, kind);
    else if (kind === "walkers") {
      drawChar(x, { params: CHAR_PRESETS["Hero Boy"], flip: false }, { x: 64, y: 118, scale: 0.5, rot: 0, op: 1, swing: Math.sin(ph) * 0.5 });
      drawChar(x, { params: CHAR_PRESETS["Hero Girl"], flip: false }, { x: 154, y: 118, scale: 0.5, rot: 0, op: 1, swing: Math.sin(ph + Math.PI) * 0.5 });
    } else {
      const preset = kind === "girl" ? CHAR_PRESETS["Hero Girl"] : CHAR_PRESETS["Hero Boy"];
      drawChar(x, { params: preset, flip: false }, { x: 110, y: 118, scale: 0.52, rot: 0, op: 1, swing: Math.sin(ph) * 0.5 });
    }
    frames.push(c.toDataURL("image/png"));
  }
  return frames;
}
function addSpritePack(kind, name) {
  addObject({ type: "sprite", name, frames: spriteFrames(kind), frameDur: 0.12, x: 640, y: 430, scale: 1, rot: 0, flip: false, op: 1 });
  setNote(`${name} added — press Play and it moves. Scrub the playhead to step through the cycle.`);
}
function stagePos(evt) {
  const r = stageEl.getBoundingClientRect();
  const vx = (evt.clientX - r.left) / r.width * 1280, vy = (evt.clientY - r.top) / r.height * 720;
  const cam = evalCam(playT);
  if (cam.zoom === 1 && !cam.x && !cam.y) return { x: vx, y: vy };
  return { x: (vx - 640) / cam.zoom + 640 + cam.x, y: (vy - 360) / cam.zoom + 360 + cam.y };
}
function hitTest(pt) {
  const objs = scene().objects;
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (o.hidden || o.locked) continue;
    { const _c = clipOf(o); if (playT < _c.start - 0.001 || playT > _c.start + _c.dur + 0.001) continue; }
    const ev = evalAt(o, playT), { w, h } = objSize(o);
    if (Math.abs(pt.x - ev.x) <= w * ev.scale / 2 + 6 && Math.abs(pt.y - ev.y) <= h * ev.scale / 2 + 6) return o;
  }
  return null;
}
let drag = null;
stageEl.addEventListener("pointerdown", (e) => {
  if (handMode) {
    const sx = e.clientX, sy = e.clientY, px = panX, py = panY;
    stageEl.setPointerCapture(e.pointerId);
    const mv = (ev) => { panX = px + (ev.clientX - sx); panY = py + (ev.clientY - sy); applyStageZoom(); };
    const up = () => { stageEl.removeEventListener("pointermove", mv); stageEl.removeEventListener("pointerup", up); };
    stageEl.addEventListener("pointermove", mv); stageEl.addEventListener("pointerup", up);
    return;
  }
  if (camRowSel) {
    if (scene().camLocked) { setNote("The camera track is locked — unlock it in the Camera row to frame shots."); return; }
    const cam0 = evalCam(playT), sx = e.clientX, sy = e.clientY, r0 = stageEl.getBoundingClientRect();
    stageEl.setPointerCapture(e.pointerId);
    let camMoved = false;
    const cmv = (ev) => {
      const dxv = (ev.clientX - sx) / r0.width * 1280 / cam0.zoom;
      const dyv = (ev.clientY - sy) / r0.height * 720 / cam0.zoom;
      const ck = ensureCamKey(playT);
      ck.x = Math.round(clamp(cam0.x - dxv, -420, 420));
      ck.y = Math.round(clamp(cam0.y - dyv, -280, 280));
      camMoved = true; drawStage();
    };
    const cup = () => { stageEl.removeEventListener("pointermove", cmv); stageEl.removeEventListener("pointerup", cup); if (camMoved) { pushHistory(); renderTracks(); setNote(`Camera framed at ${playT.toFixed(1)}s — the pan is saved in the camera key here.`); } };
    stageEl.addEventListener("pointermove", cmv); stageEl.addEventListener("pointerup", cup);
    return;
  }
  const pt = stagePos(e), o = hitTest(pt);
  selId = o ? o.id : null;
  if (o) camRowSel = false;
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
  if (o.start == null) o.start = 0;
  if (o.dur == null) o.dur = scene().duration;
  scene().objects.push(o); selId = o.id;
  pushHistory(); drawStage(); renderTracks();
  return o;
}
let CUSTOM_CHARS = {};
function allPresets() { return { ...CHAR_PRESETS, ...CUSTOM_CHARS }; }
async function loadCustomChars() {
  try {
    const rows = await idbAll("customChars");
    CUSTOM_CHARS = {};
    for (const r of rows) CUSTOM_CHARS[r.name] = r.params;
  } catch { CUSTOM_CHARS = {}; }
}
function addCharacter(name) {
  const p = allPresets()[name];
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
  if (!file.name) { try { file = new File([file], "image.png", { type: file.type || "image/png" }); } catch { /* fname below still covers the note */ } }
  const fname = file.name || "Image";
  const assetId = nid("as");
  let stored = true;
  try { await idbPut("assets", { id: assetId, blob: file, name: fname, at: Date.now() }); }
  catch { stored = false; memBlobs[assetId] = file; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const w = 430, h = Math.round(430 * img.naturalHeight / img.naturalWidth);
    addObject({ type: "image", name: fname, assetId, w, h, x: 640, y: 380, scale: 1, rot: 0, flip: false, op: 1 });
    setNote(stored ? `“${fname}” is on your canvas.` : `“${fname}” is on your canvas — kept for this session only, browser storage was unavailable.`);
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
  const ab = $("#autosaveBadge"); if (ab) ab.textContent = "● Saving…";
  try {
    project.name = $("#projectName").value.trim() || "Untitled Project";
    const all = await idbAll("projects");
    if (!all.some(p => p.name === project.name) && !isPro() && all.length >= 2) return; // Free limit: no silent 3rd project
    const prevRec = all.find(p => p.name === project.name);
    await idbPut("projects", { ...JSON.parse(JSON.stringify(project)), savedAt: Date.now(), thumb: captureThumb() || (prevRec && prevRec.thumb) || null });
    if (savedName && savedName !== project.name) { try { await idbDel("projects", savedName); } catch { /* old copy lingers */ } cloudDeleteProject(savedName); }
    savedName = project.name;
    localStorage.setItem("ssanim_last", project.name);
    cloudBackupProject(false);
    renderDashboard($("#projSearch") ? $("#projSearch").value : "");
    if (ab) ab.textContent = "● Auto-saved";
  } catch { if (ab) ab.textContent = "● Auto-saved"; /* storage unavailable — manual save still offered */ }
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

const undoB = $("#undoBtn"); if (undoB) undoB.addEventListener("click", () => {
  if (hIdx <= 0) { setNote("Nothing to undo yet."); return; }
  hIdx--; restoreHistory(history[hIdx]);
});
const redoB = $("#redoBtn"); if (redoB) redoB.addEventListener("click", () => {
  if (hIdx >= history.length - 1) { setNote("Nothing to redo yet."); return; }
  hIdx++; restoreHistory(history[hIdx]);
});
function undoStep() { if (hIdx <= 0) { setNote("Nothing to undo yet."); return; } hIdx--; restoreHistory(history[hIdx]); }
function redoStep() { if (hIdx >= history.length - 1) { setNote("Nothing to redo yet."); return; } hIdx++; restoreHistory(history[hIdx]); }
document.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = (e.key || "").toLowerCase();
  if (k === "z" && !e.shiftKey) { e.preventDefault(); undoStep(); }
  else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redoStep(); }
});

/* ---------------- Timeline ---------------- */
const fmt = s => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const totalDur = () => project.scenes.reduce((a, s) => a + s.duration, 0);
function globalT() {
  let g = playT;
  for (let i = 0; i < curScene; i++) g += project.scenes[i].duration;
  return g;
}
/* ---------------- Layers / clips (P3) ---------------- */
const TL_PAD = 12, LABEL_W = 148;
let tlZoomPct = 40, handMode = false, panX = 0, panY = 0;
function pxPerSec() { return tlZoomPct * 2.4; }
function clipOf(o, sc) {
  sc = sc || scene();
  const st = Math.max(0, o.start || 0);
  const d = (o.dur == null ? sc.duration : o.dur);
  return { start: st, dur: Math.max(0.2, Math.min(d, Math.max(0.2, sc.duration - st))) };
}
function positionClip(el, st, d) { el.style.left = (st * pxPerSec()) + "px"; el.style.width = Math.max(16, d * pxPerSec()) + "px"; }
function seekFromClientX(clientX) {
  const sc = scene(); const rect = $("#tlInner").getBoundingClientRect();
  playT = clamp((clientX - rect.left - TL_PAD - LABEL_W) / pxPerSec(), 0, sc.duration);
  drawStage(); drawPlayhead();
}
function renderRuler() {
  const sc = scene(), r = $("#tlRuler"); if (!r) return;
  const pps = pxPerSec();
  const steps = [1, 2, 5, 10, 15, 30, 60];
  const step = steps.find(x => x * pps >= 70) || 60;
  let html = "";
  for (let t = 0; t <= sc.duration + 0.001; t += step) html += `<span class="tl-tick" style="left:${TL_PAD + LABEL_W + t * pps}px">${fmt(t)}</span>`;
  r.innerHTML = html;
  const w = TL_PAD + LABEL_W + sc.duration * pps + 30;
  const sw = ($("#tlScroll") || {}).clientWidth || 0;
  $("#tlInner").style.width = Math.max(sw, w) + "px";
}
function clipDrag(el, opts) {
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".kf") || e.target.closest(".tctl")) return;
    e.preventDefault(); e.stopPropagation();
    if (opts.onSelect) opts.onSelect();
    const rect = el.getBoundingClientRect();
    let mode = "move";
    if (e.clientX - rect.left < 9) mode = "l";
    else if (rect.right - e.clientX < 9) mode = "r";
    const sc = scene(); const pps = pxPerSec();
    const c0 = opts.get(); const start0 = c0.start, dur0 = c0.dur;
    const x0 = e.clientX; let changed = false;
    el.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const dt = (ev.clientX - x0) / pps;
      let st = start0, d = dur0;
      if (mode === "move") st = clamp(start0 + dt, 0, Math.max(0, sc.duration - dur0));
      else if (mode === "l") { st = clamp(start0 + dt, 0, start0 + dur0 - 0.2); d = dur0 + (start0 - st); }
      else d = clamp(dur0 + dt, 0.2, sc.duration - start0);
      st = Math.round(st * 10) / 10; d = Math.round(d * 10) / 10;
      const cur = opts.get();
      if (st !== cur.start || d !== cur.dur) { opts.set(st, d); changed = true; positionClip(el, st, d); if (opts.onDrag) opts.onDrag(); drawStage(); }
    };
    const up = () => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up);
      if (changed) { pushHistory(); renderTracks(); }
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
  });
}
function renderClipKeys(clip, o, sc) {
  clip.querySelectorAll(".kf").forEach(k => k.remove());
  const cl = clipOf(o, sc); const pps = pxPerSec();
  for (const k of o.keys || []) {
    if (k.t < cl.start - 0.001 || k.t > cl.start + cl.dur + 0.001) continue;
    const d = document.createElement("button");
    d.className = "kf"; d.type = "button"; d.title = `Keyframe at ${k.t.toFixed(1)}s`;
    d.style.left = ((k.t - cl.start) * pps) + "px";
    d.addEventListener("click", (ev) => { ev.stopPropagation(); selId = o.id; camRowSel = false; selKey = { kind: "obj", id: o.id, t: k.t }; playT = k.t; drawStage(); drawPlayhead(); renderTracks(); });
    clip.appendChild(d);
  }
}
let layerMenuEl = null;
function closeLayerMenu() { if (layerMenuEl) { layerMenuEl.remove(); layerMenuEl = null; } }
function openLayerMenu(o, anchor) {
  closeLayerMenu();
  const m = document.createElement("div");
  m.className = "layer-menu";
  m.innerHTML = `<button type="button" data-a="dup">⎘ Duplicate Layer</button><button type="button" data-a="split">✂ Split at Playhead</button><button type="button" data-a="del">🗑 Delete Layer</button>`;
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - 200)) + "px";
  m.style.top = (r.bottom + 4) + "px";
  layerMenuEl = m;
  m.addEventListener("click", (e) => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    closeLayerMenu();
    if (a === "dup") duplicateLayer(o);
    else if (a === "split") splitLayer(o);
    else if (a === "del") deleteLayer(o);
  });
  setTimeout(() => {
    document.addEventListener("pointerdown", function h(ev) {
      if (!layerMenuEl) { document.removeEventListener("pointerdown", h); return; }
      if (!layerMenuEl.contains(ev.target)) { closeLayerMenu(); document.removeEventListener("pointerdown", h); }
    });
  }, 0);
}
function duplicateLayer(o) {
  const sc = scene();
  const b = JSON.parse(JSON.stringify(o));
  b.id = nid("ob"); b.name = o.name + " copy";
  sc.objects.splice(sc.objects.indexOf(o) + 1, 0, b);
  selId = b.id;
  pushHistory(); renderTracks(); drawStage();
  setNote(`Layer "${b.name}" added.`);
}
function splitLayer(o) {
  const sc = scene(); const cl = clipOf(o, sc);
  if (playT <= cl.start + 0.05 || playT >= cl.start + cl.dur - 0.05) { setNote("Move the playhead inside the clip to split it."); return; }
  const b = JSON.parse(JSON.stringify(o));
  b.id = nid("ob");
  o.start = cl.start; o.dur = Math.round((playT - cl.start) * 10) / 10;
  b.start = Math.round(playT * 10) / 10; b.dur = Math.round((cl.start + cl.dur - playT) * 10) / 10;
  sc.objects.splice(sc.objects.indexOf(o) + 1, 0, b);
  pushHistory(); renderTracks(); drawStage();
  setNote(`"${o.name}" split at ${playT.toFixed(1)}s.`);
}
function deleteLayer(o) {
  const sc = scene();
  sc.objects = sc.objects.filter(x => x.id !== o.id);
  if (selId === o.id) selId = null;
  pushHistory(); renderTracks(); drawStage();
  setNote(`Layer "${o.name}" deleted.`);
}
function drawPlayhead() {
  const x = TL_PAD + LABEL_W + playT * pxPerSec();
  const ph = $("#playhead"); if (ph) ph.style.left = x + "px";
  $("#timeDisplay").textContent = `${fmt(globalT())} / ${fmt(totalDur())}`;
  syncIkUI(); if (!playing) renderKeyBar();
}
function renderScenes() {
  const strip = $("#sceneStrip");
  $$(".scene-cell", strip).forEach(c => c.remove());
  project.scenes.forEach((s, i) => {
    const cell = document.createElement("span");
    cell.className = "scene-cell";
    const b = document.createElement("button");
    b.className = "scene-chip" + (i === curScene ? " active" : "");
    b.type = "button";
    b.innerHTML = `${s.name} <span class="sc-dur">${s.duration}s</span>`;
    b.addEventListener("click", () => { curScene = i; playT = 0; selId = null; renderScenes(); renderTracks(); drawStage(); drawPlayhead(); });
    cell.appendChild(b);
    if (project.scenes.length > 1) {
      const del = document.createElement("button");
      del.className = "scene-del"; del.type = "button"; del.textContent = "🗑"; del.title = `Delete ${s.name}`; del.setAttribute("aria-label", `Delete ${s.name}`);
      del.addEventListener("click", () => {
        const nm = project.scenes[i].name;
        project.scenes.splice(i, 1);
        if (curScene >= project.scenes.length) curScene = project.scenes.length - 1;
        playT = 0; selId = null;
        pushHistory(); renderScenes(); renderTracks(); drawStage(); drawPlayhead();
        setNote(`Scene “${nm}” deleted.`);
      });
      cell.appendChild(del);
    }
    strip.insertBefore(cell, $("#addSceneBtn"));
  });
}
function renderCamRow(wrap, sc) {
  const row = document.createElement("div");
  row.className = "track-row cam-row" + (camRowSel ? " sel" : "");
  const cluster = document.createElement("div");
  cluster.className = "tcluster";
  const nm = document.createElement("span");
  nm.className = "track-name"; nm.title = "Camera track"; nm.textContent = "📷 Camera";
  nm.addEventListener("click", () => { camRowSel = true; selId = null; renderTracks(); drawStage(); setNote("Camera track selected — drag on the stage to pan, press Camera for a zoom key, ◆ Keyframe adds a camera key at the playhead."); });
  cluster.appendChild(nm);
  const lockB = document.createElement("button");
  lockB.className = "tctl"; lockB.type = "button";
  lockB.textContent = sc.camLocked ? "🔒" : "🔓";
  lockB.title = sc.camLocked ? "Unlock camera track" : "Lock camera track";
  lockB.addEventListener("click", () => { sc.camLocked = !sc.camLocked; pushHistory(); renderTracks(); setNote(sc.camLocked ? "Camera track locked." : "Camera track unlocked."); });
  cluster.appendChild(lockB);
  row.appendChild(cluster);
  const lane = document.createElement("div");
  lane.className = "track-lane";
  lane.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".kf")) return;
    const r = lane.getBoundingClientRect();
    playT = clamp((e.clientX - r.left) / pxPerSec(), 0, scene().duration);
    camRowSel = true; selId = null;
    drawStage(); drawPlayhead(); renderTracks();
  });
  const bar = document.createElement("div");
  bar.className = "clip clip-cam";
  positionClip(bar, 0, sc.duration);
  bar.innerHTML = `<span class="clip-name">Camera — zoom &amp; pan over time</span>`;
  for (const ck of sc.camKeys || []) {
    const d = document.createElement("button");
    d.className = "kf cam"; d.type = "button";
    d.title = `Camera key at ${ck.t.toFixed(1)}s — ${Math.round(ck.zoom * 100)}%`;
    d.style.left = (ck.t * pxPerSec()) + "px";
    d.addEventListener("click", (ev) => { ev.stopPropagation(); camRowSel = true; selId = null; selKey = { kind: "cam", t: ck.t }; playT = ck.t; drawStage(); drawPlayhead(); renderTracks(); });
    bar.appendChild(d);
  }
  lane.appendChild(bar);
  row.appendChild(lane);
  wrap.appendChild(row);
}
function easeChips(cur) {
  return [["linear", "Linear"], ["in", "Ease In"], ["out", "Ease Out"], ["inout", "In-Out"]].map(([v, l]) => `<button class="chip${(cur || "linear") === v ? " active" : ""}" type="button" data-ease="${v}">${l}</button>`).join("");
}
function selKeyTarget() {
  const sc = scene();
  if (!selKey) return null;
  if (selKey.kind === "cam") { const ck = (sc.camKeys || []).find(k => Math.abs(k.t - selKey.t) < 0.02); return ck ? { rec: ck, label: `📷 Camera key @ ${ck.t.toFixed(1)}s` } : null; }
  const o = sc.objects.find(x => x.id === selKey.id);
  const k = o && (o.keys || []).find(k => Math.abs(k.t - selKey.t) < 0.02);
  return k ? { rec: k, label: `◆ Key @ ${k.t.toFixed(1)}s · ${o.name}` } : null;
}
function renderKeyBar() {
  const bar = $("#keyBar"); if (!bar) return;
  const tgt = selKeyTarget();
  if (!tgt) { if (selKey) selKey = null; bar.hidden = true; bar.innerHTML = ""; return; }
  let html = `<span class="kb-label">${tgt.label} · Ease after this key</span>${easeChips(tgt.rec.ease)}`;
  if (selKey.kind === "cam") html += `<span class="kb-label">Zoom</span><input type="range" id="kbZoom" min="50" max="250" value="${Math.round(tgt.rec.zoom * 100)}"><span class="kb-val" id="kbZoomVal">${Math.round(tgt.rec.zoom * 100)}%</span>`;
  html += `<button class="tl-btn" id="kbDel" type="button">Delete Key</button>`;
  bar.hidden = false; bar.innerHTML = html;
  bar.querySelectorAll("[data-ease]").forEach(b => b.addEventListener("click", () => {
    tgt.rec.ease = b.dataset.ease; pushHistory(); renderKeyBar(); drawStage();
    setNote(`Easing set to ${b.textContent} — it shapes the movement after this key.`);
  }));
  const del = $("#kbDel");
  if (del) del.addEventListener("click", () => {
    const sc = scene();
    if (selKey.kind === "cam") sc.camKeys = (sc.camKeys || []).filter(k => Math.abs(k.t - selKey.t) >= 0.02);
    else { const o = sc.objects.find(x => x.id === selKey.id); if (o) o.keys = (o.keys || []).filter(k => Math.abs(k.t - selKey.t) >= 0.02); }
    selKey = null; pushHistory(); renderTracks(); drawStage(); setNote("Keyframe deleted.");
  });
  const z = $("#kbZoom");
  if (z) {
    z.addEventListener("input", () => { tgt.rec.zoom = +z.value / 100; const v = $("#kbZoomVal"); if (v) v.textContent = z.value + "%"; drawStage(); });
    z.addEventListener("change", () => { pushHistory(); renderTracks(); });
  }
}
function syncIkUI() {
  const a = $("#ikArm"); if (!a) return;
  const o = selObj(); if (!o || o.type !== "char") return;
  const ev = evalAt(o, playT);
  const P = ev.pose || o.pose; if (!P) return;
  a.value = Math.round(P.arm || 0);
  const l = $("#ikLeg"); if (l) l.value = Math.round(P.leg || 0);
  const h = $("#ikHead"); if (h) h.value = Math.round(P.head || 0);
  const ln = $("#ikLean"); if (ln) ln.value = Math.round(P.lean || 0);
}
/* ---------------- Audio waveforms (real peaks from the clip's own audio) ---------------- */
const peaksCache = {};
let waveCtx = null;
async function computePeaks(blob, n) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC || !blob) return null;
    waveCtx = waveCtx || new AC();
    const buf = await waveCtx.decodeAudioData(await blob.arrayBuffer());
    const ch = buf.getChannelData(0), out = [], step = Math.max(1, Math.floor(ch.length / n)), sub = Math.max(1, Math.floor(step / 24));
    for (let i = 0; i < n; i++) { let m = 0; for (let j = 0; j < step; j += sub) { const v = Math.abs(ch[i * step + j] || 0); if (v > m) m = v; } out.push(+m.toFixed(3)); }
    return out;
  } catch { return null; }
}
function drawWave(cv, peaks) {
  const g = cv.getContext("2d"); if (!g) return;
  const W = cv.width, H = cv.height, n = peaks.length;
  g.clearRect(0, 0, W, H); g.fillStyle = "rgba(255,255,255,.85)";
  for (let i = 0; i < n; i++) { const h = Math.max(1, peaks[i] * (H - 3)); g.fillRect((i * W) / n, (H - h) / 2, Math.max(1, W / n - 0.6), h); }
}
async function attachWave(el, cacheKey, getBlob) {
  try {
    let peaks = peaksCache[cacheKey];
    if (!peaks) { const blob = await getBlob(); if (!blob) return; peaks = await computePeaks(blob, 72); if (!peaks) return; peaksCache[cacheKey] = peaks; }
    if (!el.isConnected) return;
    const cv = document.createElement("canvas");
    cv.className = "wave";
    cv.width = Math.max(24, el.clientWidth || 120); cv.height = 24;
    el.insertBefore(cv, el.firstChild);
    drawWave(cv, peaks);
  } catch { /* the waveform is a visual aid; the clip itself still works */ }
}
function renderTracks() {
  const wrap = $("#trackRows"); if (!wrap) return;
  wrap.innerHTML = "";
  const sc = scene();
  renderRuler();
  const pps = pxPerSec();
  renderCamRow(wrap, sc);
  if (!sc.objects.length && !(sc.audio || []).length && !sc.voiceAssetId) {
    const e = document.createElement("div");
    e.className = "tl-empty";
    e.innerHTML = `<div class="tl-empty-ic">▦</div><div class="tl-empty-title">No layers</div><div class="tl-empty-sub">No layers in timeline. Select characters or media to add layers.</div>`;
    wrap.appendChild(e);
  }
  for (const o of sc.objects) {
    const cl = clipOf(o, sc);
    const row = document.createElement("div");
    row.className = "track-row" + (o.id === selId ? " sel" : "");
    const cluster = document.createElement("div");
    cluster.className = "tcluster";
    const nm = document.createElement("span");
    nm.className = "track-name"; nm.title = o.name; nm.textContent = o.name;
    nm.addEventListener("click", () => { selId = o.id; camRowSel = false; selKey = null; renderTracks(); drawStage(); });
    cluster.appendChild(nm);
    const lockB = document.createElement("button");
    lockB.className = "tctl"; lockB.type = "button";
    lockB.textContent = o.locked ? "🔒" : "🔓";
    lockB.title = o.locked ? "Unlock layer" : "Lock layer";
    lockB.addEventListener("click", () => { o.locked = !o.locked; pushHistory(); renderTracks(); drawStage(); setNote(`"${o.name}" ${o.locked ? "locked" : "unlocked"}.`); });
    cluster.appendChild(lockB);
    const eyeB = document.createElement("button");
    eyeB.className = "tctl"; eyeB.type = "button";
    eyeB.textContent = o.hidden ? "🚫" : "👁";
    eyeB.title = o.hidden ? "Show layer" : "Hide layer";
    eyeB.addEventListener("click", () => { o.hidden = !o.hidden; pushHistory(); renderTracks(); drawStage(); setNote(`"${o.name}" ${o.hidden ? "hidden" : "shown"}.`); });
    cluster.appendChild(eyeB);
    const moreB = document.createElement("button");
    moreB.className = "tctl"; moreB.type = "button"; moreB.textContent = "⋯";
    moreB.title = "Layer options";
    moreB.addEventListener("click", (ev) => { ev.stopPropagation(); selId = o.id; openLayerMenu(o, moreB); });
    cluster.appendChild(moreB);
    row.appendChild(cluster);
    const lane = document.createElement("div");
    lane.className = "track-lane";
    lane.addEventListener("pointerdown", (e) => {
      if (e.target !== lane) return;
      const r = lane.getBoundingClientRect();
      playT = clamp((e.clientX - r.left) / pps, 0, sc.duration);
      drawStage(); drawPlayhead();
    });
    const clip = document.createElement("div");
    clip.className = "clip clip-" + o.type + (o.locked ? " locked" : "");
    positionClip(clip, cl.start, cl.dur);
    clip.innerHTML = `<span class="clip-name">${o.name}</span><i class="trim trim-l"></i><i class="trim trim-r"></i>`;
    renderClipKeys(clip, o, sc);
    if (!o.locked) clipDrag(clip, {
      get: () => clipOf(o, sc),
      set: (st, d) => { o.start = st; o.dur = d; },
      onDrag: () => renderClipKeys(clip, o, sc),
      onSelect: () => { if (selId !== o.id) { selId = o.id; } }
    });
    lane.appendChild(clip);
    row.appendChild(lane);
    wrap.appendChild(row);
  }
  const vrow = document.createElement("div");
  vrow.className = "track-row";
  const vcluster = document.createElement("div");
  vcluster.className = "tcluster";
  vcluster.innerHTML = `<span class="track-name">Voice</span>`;
  if (sc.voiceAssetId) {
    const dv = document.createElement("button");
    dv.className = "tctl"; dv.type = "button"; dv.textContent = "✕"; dv.title = "Remove voice clip";
    dv.addEventListener("click", () => { scene().voiceAssetId = null; pushHistory(); renderTracks(); setNote("Voice clip removed from this scene."); });
    vcluster.appendChild(dv);
  }
  vrow.appendChild(vcluster);
  const vlane = document.createElement("div");
  vlane.className = "track-lane";
  vlane.addEventListener("pointerdown", (e) => {
    if (e.target !== vlane) return;
    const r = vlane.getBoundingClientRect();
    playT = clamp((e.clientX - r.left) / pps, 0, sc.duration);
    drawStage(); drawPlayhead();
  });
  if (sc.voiceAssetId) {
    const vc = document.createElement("div");
    vc.className = "clip clip-voice";
    positionClip(vc, 0, sc.duration);
    vc.innerHTML = `<span class="clip-name">🔊 Voice clip — plays with this scene</span>`;
    vlane.appendChild(vc);
    attachWave(vc, "voice-" + sc.voiceAssetId, async () => { if (memBlobs[sc.voiceAssetId]) return memBlobs[sc.voiceAssetId]; try { const rec = await idbGet("assets", sc.voiceAssetId); return rec && rec.blob ? rec.blob : null; } catch { return null; } });
  }
  vrow.appendChild(vlane);
  wrap.appendChild(vrow);
  for (const clip of sc.audio || []) {
    const row = document.createElement("div");
    row.className = "track-row";
    const cluster = document.createElement("div");
    cluster.className = "tcluster";
    const nm = document.createElement("span");
    nm.className = "track-name"; nm.title = clip.name; nm.textContent = "🔊 " + clip.name;
    cluster.appendChild(nm);
    const x = document.createElement("button");
    x.className = "tctl"; x.type = "button"; x.textContent = "✕"; x.title = "Remove audio clip";
    x.addEventListener("click", () => { const s2 = scene(); s2.audio = (s2.audio || []).filter(c => c.id !== clip.id); stopClipAudio(clip.id); pushHistory(); renderTracks(); setNote(`"${clip.name}" removed from the timeline.`); });
    cluster.appendChild(x);
    row.appendChild(cluster);
    const lane = document.createElement("div");
    lane.className = "track-lane";
    lane.addEventListener("pointerdown", (e) => {
      if (e.target !== lane) return;
      const r = lane.getBoundingClientRect();
      playT = clamp((e.clientX - r.left) / pps, 0, sc.duration);
      drawStage(); drawPlayhead();
    });
    const blk = document.createElement("div");
    blk.className = "audio-clip";
    positionClip(blk, clip.start || 0, clip.dur || 1);
    blk.textContent = clip.name;
    clipDrag(blk, {
      get: () => ({ start: clip.start || 0, dur: clip.dur || 1 }),
      set: (st, d) => { clip.start = st; clip.dur = d; }
    });
    attachWave(blk, clip.assetId, async () => { const tid = (clip.assetId || "").replace(/^trk-/, ""); return tid ? await trackBlob(tid) : null; });
    lane.appendChild(blk);
    row.appendChild(lane);
    wrap.appendChild(row);
  }
  drawPlayhead();
}
/* transport + playback */
let playing = false, rafId = null, lastTs = 0, voiceAudio = null;
function stopPlayback() {
  playing = false; cancelAnimationFrame(rafId);
  $("#playBtn").textContent = "▶";
  if (voiceAudio) { voiceAudio.pause(); voiceAudio = null; }
  stopAllClipAudio();
}
function playSceneVoice() {
  const sc = scene();
  if (!sc.voiceAssetId) return;
  if (memBlobs[sc.voiceAssetId]) {
    if (!playing) return;
    voiceAudio = new Audio(URL.createObjectURL(memBlobs[sc.voiceAssetId]));
    voiceAudio.play().catch(() => {});
    return;
  }
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
  drawStage(); drawPlayhead(); syncClipAudio();
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
  if ((sc.camKeys || []).length) {
    const atSplit = evalCam(playT);
    second.camKeys = [{ t: 0, zoom: atSplit.zoom, x: Math.round(atSplit.x), y: Math.round(atSplit.y), ease: "inout" }].concat(sc.camKeys.filter(k => k.t > playT).map(k => ({ ...k, t: +(k.t - playT).toFixed(2) })));
    sc.camKeys = sc.camKeys.filter(k => k.t <= playT);
    if (!sc.camKeys.some(k => Math.abs(k.t - playT) < 0.02)) sc.camKeys.push({ t: +playT.toFixed(2), zoom: atSplit.zoom, x: Math.round(atSplit.x), y: Math.round(atSplit.y), ease: "inout" });
    sc.camKeys.sort((a, b) => a.t - b.t);
  }
  sc.duration = +playT.toFixed(2);
  project.scenes.splice(curScene + 1, 0, second);
  pushHistory(); renderScenes(); renderTracks(); drawStage();
  setNote(`Scene split at ${playT.toFixed(1)}s.`);
});
/* keyframes */
$("#keyBtn").addEventListener("click", () => {
  if (camRowSel) {
    if (scene().camLocked) { setNote("The camera track is locked — unlock it in the Camera row first."); return; }
    const ck = ensureCamKey(playT);
    selKey = { kind: "cam", t: ck.t };
    pushHistory(); renderTracks(); drawStage();
    setNote(`Camera key at ${playT.toFixed(1)}s — zoom ${Math.round(ck.zoom * 100)}%. Drag the stage to pan, press Camera to change the zoom, add keys at other times to glide between framings.`);
    return;
  }
  const o = selObj();
  if (!o) { setNote("Select an object on the canvas first, then add a keyframe."); return; }
  const cur = { t: +playT.toFixed(2), x: o.x, y: o.y, scale: o.scale, rot: o.rot, op: o.op };
  // bake current visual state if keys already exist and playhead sits between them
  const ev = evalAt(o, playT);
  Object.assign(cur, { x: ev.x, y: ev.y, scale: ev.scale, rot: ev.rot, op: ev.op });
  const _p = ev.pose || (o.pose ? { ...o.pose } : { arm: 0, leg: 0, head: 0, lean: 0 });
  cur.pose = { arm: _p.arm || 0, leg: _p.leg || 0, head: _p.head || 0, lean: _p.lean || 0 };
  cur.ease = "inout";
  o.keys = (o.keys || []).filter(k => Math.abs(k.t - playT) > 0.02);
  o.keys.push(cur); o.keys.sort((a, b) => a.t - b.t);
  selKey = { kind: "obj", id: o.id, t: cur.t };
  pushHistory(); renderTracks();
  setNote(`Keyframe added for ${o.name} at ${playT.toFixed(1)}s — position, size and pose are saved in the key. Move the playhead, move or pose it, add another — it will glide between them.`);
});
$("#keyDelBtn").addEventListener("click", () => {
  if (camRowSel) {
    const sc = scene(); const before = (sc.camKeys || []).length;
    sc.camKeys = (sc.camKeys || []).filter(k => Math.abs(k.t - playT) > 0.02);
    if (sc.camKeys.length !== before) { selKey = null; pushHistory(); renderTracks(); drawStage(); setNote("Camera key deleted."); }
    else setNote("No camera key at the playhead.");
    return;
  }
  const o = selObj(); if (!o) return;
  const before = (o.keys || []).length;
  o.keys = o.keys.filter(k => Math.abs(k.t - playT) > 0.02);
  if (o.keys.length !== before) { pushHistory(); renderTracks(); setNote("Keyframe deleted."); }
  else setNote("No keyframe at the playhead for the selected object.");
});
/* camera track keys (P3) — the Camera button sets a zoom key at the playhead */
$("#cameraBtn").addEventListener("click", () => {
  if (scene().camLocked) { setNote("The camera track is locked — unlock it in the Camera row first."); return; }
  camRowSel = true; selId = null;
  const ck = ensureCamKey(playT);
  ck.zoom = ck.zoom >= 1.49 ? 1 : +(ck.zoom + 0.25).toFixed(2);
  selKey = { kind: "cam", t: ck.t };
  pushHistory(); renderTracks(); drawStage();
  setNote(`Camera key at ${playT.toFixed(1)}s — framing ${Math.round(ck.zoom * 100)}%. Drag the stage to pan; add keys at other times and the camera glides between them — in playback and in the export.`);
});
let sliderZoom = 1;
function applyStageZoom() {
  let tx = 0, ty = 0;
  const sh = (scene().fx || {}).shake || 0;
  if (sh > 0) {
    const t = performance.now();
    tx = Math.sin(t * 0.11) * sh * 0.35;
    ty = Math.cos(t * 0.13) * sh * 0.28;
  }
  $("#stageCanvas").style.transform = `translate(${tx + panX}px, ${ty + panY}px) scale(${sliderZoom})`;
}
$("#stageZoomOut").addEventListener("click", () => { sliderZoom = clamp(Math.round((sliderZoom - 0.1) * 10) / 10, 0.5, 1.5); applyStageZoom(); setNote(`Stage zoom ${Math.round(sliderZoom * 100)}%.`); });
$("#stageZoomIn").addEventListener("click", () => { sliderZoom = clamp(Math.round((sliderZoom + 0.1) * 10) / 10, 0.5, 1.5); applyStageZoom(); setNote(`Stage zoom ${Math.round(sliderZoom * 100)}%.`); });
$("#tlZoomOut").addEventListener("click", () => { tlZoomPct = clamp(tlZoomPct - 10, 10, 100); $("#tlZoomVal").textContent = tlZoomPct + "%"; renderTracks(); });
$("#tlZoomIn").addEventListener("click", () => { tlZoomPct = clamp(tlZoomPct + 10, 10, 100); $("#tlZoomVal").textContent = tlZoomPct + "%"; renderTracks(); });
$("#handBtn").addEventListener("click", () => { handMode = !handMode; if (!handMode) { panX = 0; panY = 0; applyStageZoom(); } $("#handBtn").classList.toggle("active", handMode); setNote(handMode ? "Hand tool on — drag the stage to pan the view." : "Hand tool off — view centred again."); });
$("#tlCollapseBtn").addEventListener("click", () => { const c = $("#timelineRoot").classList.toggle("tl-collapsed"); $("#tlCollapseBtn").textContent = c ? "⌄" : "⌃"; });
$("#dockBtn").addEventListener("click", () => { const t = $("#timelineTracks"); const hid = t.style.display === "none"; t.style.display = hid ? "" : "none"; setNote(hid ? "Layers shown." : "Layers hidden."); });
$("#lockAllBtn").addEventListener("click", () => { const sc = scene(); const any = sc.objects.some(o => o.locked); sc.objects.forEach(o => { o.locked = !any; }); $("#lockAllBtn").textContent = !any ? "🔒" : "🔓"; pushHistory(); renderTracks(); drawStage(); setNote(!any ? "All layers locked." : "All layers unlocked."); });
$("#delLayerBtn").addEventListener("click", () => { const o = scene().objects.find(x => x.id === selId); if (o) deleteLayer(o); else setNote("Select a layer first, then delete it."); });
(function wireSeek() {
  const wire = (el) => {
    if (!el) return;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      seekFromClientX(e.clientX);
      el.setPointerCapture(e.pointerId);
      const mv = (ev) => seekFromClientX(ev.clientX);
      const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); };
      el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
    });
  };
  wire($("#tlRuler"));
  wire(document.querySelector("#playhead .ph-handle"));
})();
window.addEventListener("resize", drawPlayhead);

/* ---------------- Save / load (IndexedDB) ---------------- */
function setNote(t) { $("#saveNote").textContent = t; }
async function saveProject() {
  project.name = $("#projectName").value.trim() || "Untitled Project";
  const all = await idbAll("projects");
  const exists = all.some(p => p.name === project.name);
  if (!exists && !isPro() && all.length >= 2) {
    setNote("Free plan holds 2 projects — upgrade to Pro for unlimited projects, or save over an existing name.");
    return;
  }
  const prevRec2 = all.find(p => p.name === project.name);
  await idbPut("projects", { ...JSON.parse(JSON.stringify(project)), savedAt: Date.now(), thumb: captureThumb() || (prevRec2 && prevRec2.thumb) || null });
  if (savedName && savedName !== project.name) { try { await idbDel("projects", savedName); } catch { /* old copy lingers */ } cloudDeleteProject(savedName); }
  savedName = project.name;
  localStorage.setItem("ssanim_last", project.name);
  const cloud = await cloudBackupProject(true);
  setNote(`Project “${project.name}” saved in this browser.${cloud ? " Cloud backup updated." : ""}`);
  renderDashboard("");
}
$("#projectName").addEventListener("change", () => {
  const v = $("#projectName").value.trim();
  if (!v) { $("#projectName").value = project.name; return; }
  if (v === project.name) return;
  project.name = v;
  saveProject().catch(() => setNote("Rename could not be saved — storage unavailable."));
});
$("#saveProjectBtn").addEventListener("click", () => saveProject().catch(e => setNote(`Save failed — ${(e && e.name) || "storage unavailable"}. Your work is still open in this tab; try saving again.`)));
async function loadProject(name) {
  const rec = await idbGet("projects", name);
  if (!rec) return false;
  project = rec; delete project.savedAt; delete project.thumb;
  savedName = name;
  curScene = 0; selId = null; playT = 0;
  Object.keys(imgCache).forEach(k => delete imgCache[k]);
  $("#projectName").value = project.name;
  history = []; hIdx = -1; pushHistory();
  renderScenes(); renderTracks(); drawStage(); drawPlayhead();
  return true;
}
/* ---------------- Tool rail + panels ---------------- */
const SPRITES = ["Bird Fly", "Boy and Girl Walking", "Boy Walking", "Dog Walk", "Girl Walk", "Cat Walk"];
const TUTORIALS = [
  ["How to Create a Character", "7:19"], ["How to Make a Cartoon Video", "6:16"],
  ["Full Studio Tutorial", "12:46"], ["Bangla Tutorial", "10:21"]];
const TOOLS = [
  { id: "character", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="4.8" r="2.2"/><path d="M14.8 7.2 11.8 12.5"/><path d="M13.9 9.2 17 11l-1.6 2.6"/><path d="M13.9 9.2 10.4 10.8l1.4 2.6"/><path d="M11.8 12.5 16.2 14.8l2 4"/><path d="M11.8 12.5 8.6 15.8 5.2 14.6"/></svg>', name: "Character" },
  { id: "media", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6.8a2 2 0 0 1 2-2h3.4l2.1 2.4h7.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>', name: "Media" },
  { id: "effect", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16"/><path d="M12 4v16"/><path d="M18 4v16"/><path d="M3.5 15h5"/><path d="M9.5 8h5"/><path d="M15.5 15h5"/></svg>', name: "Effect" },
  { id: "studio", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.4" r="2.5"/><path d="M9.2 8.6h5.6l.9 6h-7.4z"/><path d="M9.3 9.4 6.2 13"/><path d="M14.7 9.4 17.8 13"/><path d="M9.9 14.6 8.9 20.4"/><path d="M14.1 14.6l1 5.8"/></svg>', name: "Studio" },
  { id: "assets", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5h9.8a4.3 4.3 0 0 0 .9-8.5 5.8 5.8 0 0 0-11.2-1.2A4.9 4.9 0 0 0 7 18.5z"/><path d="M12.3 12.4 10.2 15.2h1.8l-1 3.2 3.1-3.9h-1.9l1.1-2.1z" fill="currentColor" stroke="none"/></svg>', name: "Asset Library" },
  { id: "sprite", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/></svg>', name: "Sprite Sheet" },
  { id: "sounds", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M5 10v4"/><path d="M9.5 7v10"/><path d="M14 4.5v15"/><path d="M18.5 8v8"/></svg>', name: "Sounds" },
  { id: "ik", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="17.5" cy="4.6" r="2.1"/><path d="M15.8 6.8 12.5 12.8"/><path d="M14.8 8.6l2.4 2.8-1.6 2.4"/><path d="M14.8 8.6 11.4 10.8l1.2 2.8"/><path d="M12.5 12.8l4.3 2.8-0.6 4.4"/><path d="M12.5 12.8 9.4 16.4 6.4 14.6"/><path d="M2.2 9.5h3.2"/><path d="M1.4 12.6h3.2"/><path d="M2.2 15.7h2.8"/></svg>', name: "Anim IK" },
  { id: "eraser", icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.9 15.9 15.8 7a1.8 1.8 0 0 1 2.5 0l1.6 1.6a1.8 1.8 0 0 1 0 2.5l-7.5 7.5a1.8 1.8 0 0 1-1.3.5H7.9a1.8 1.8 0 0 1-1.8-1.8v-.1a1.8 1.8 0 0 1 .8-1.3z"/><path d="M9.7 13.1l3.6 3.6" stroke="#141414" stroke-width="1.7" fill="none"/></svg>', name: "Eraser" },
  { id: "tutorial", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 6.8 10.7 4.4h2.6l1.1 2.4"/><rect x="3.6" y="6.8" width="16.8" height="11.6" rx="2.4"/><path d="M10.4 9.9 15.4 12.6l-5 2.7z"/></svg>', name: "Tutorial" },
  { id: "cinema", icon: '<svg viewBox="0 0 24 24" fill="#a259e6"><path d="M8.8 5.9c0-.9 1-1.5 1.8-1L19 11a1.15 1.15 0 0 1 0 2l-8.4 6.1c-.8.5-1.8-.1-1.8-1z"/></svg>', name: "Cinema" }
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
let mediaTab = 0, mediaSeg = "single", mediaPackId = null;
function comboPacks() { return libraryItems.filter(i => i.kind === "combo"); }
function packViews(pid) { return libraryItems.filter(i => i.kind === "background" && i.packId === pid); }
function singleLibs() { return libraryItems.filter(i => i.kind === "background" && !i.packId); }
async function addLibraryImage(f, kind, packId) {
  const assetId = nid("as"), libId = nid("lib");
  await idbPut("assets", { id: assetId, blob: f, name: f.name, at: Date.now() });
  const meta = { id: libId, kind, name: (f.name || "Image").replace(/\.[^.]+$/, ""), pro: false, assetId, blob: f, at: Date.now() };
  if (packId) meta.packId = packId;
  await idbPut("library", meta);
  await loadLibrary();
  return meta;
}
async function createComboPack(files) {
  const pid = nid("pk");
  await idbPut("library", { id: pid, kind: "combo", name: `Combo Pack ${comboPacks().length + 1}`, at: Date.now() });
  for (const f of files) await addLibraryImage(f, "background", pid);
  await loadLibrary();
}
function packCard(p) {
  const views = packViews(p.id);
  const first = views[0];
  const url = first && first.blob ? URL.createObjectURL(first.blob) : "";
  return `<div class="mini-card clickable" data-pack="${p.id}">${url ? `<img class="lib-thumb" src="${url}" alt="">` : `<span class="mc-ico">▦</span>`}<span class="mc-name">${p.name}</span><span class="mc-add">${views.length} Views — tap to open</span></div>`;
}
function propCard(v) {
  const [emoji, name, pro] = v;
  return `<div class="mini-card clickable" data-prop="${emoji}|${name}|${pro ? 1 : 0}">
    <span class="mc-ico">${emoji}</span><span class="mc-name">${name}</span>
    ${pro ? `<span class="lock-tag">🔒 PRO</span>` : `<span class="mc-add">+ Add to canvas</span>`}</div>`;
}
function libCard(it, action, label) {
  const url = it.blob ? URL.createObjectURL(it.blob) : "";
  return `<div class="mini-card clickable" data-lib="${action}|${it.id}">
    ${url ? `<img class="lib-thumb" src="${url}" alt="">` : `<span class="mc-ico">🖼️</span>`}
    <span class="mc-name">${it.name}</span>
    ${it.pro ? `<span class="lock-tag">🔒 PRO</span>` : `<span class="mc-add">${label}</span>`}</div>`;
}
function mediaPanel() {
  const singles = BG_LIST.length + singleLibs().length;
  const packs = comboPacks();
  const head = `<div class="panel-head"><h4>Media Library</h4><button class="panel-x" id="mediaClose" type="button" aria-label="Close panel">✕</button></div>
  <div class="ml-tabs">
    <button class="ml-tab${mediaTab === 0 ? " active" : ""}" data-mtab="0" type="button">🖼 Backgrounds (${singles + packs.length})</button>
    <button class="ml-tab${mediaTab === 1 ? " active" : ""}" data-mtab="1" type="button">🎵 Audio (${allTracks().length})</button>
  </div>`;
  if (mediaTab === 1) return head + `<label class="btn btn-accent panel-btn" style="display:block;text-align:center;cursor:pointer">＋ Upload Audio
      <input type="file" accept="audio/*" id="mediaAudioUpload" hidden></label>` + allTracks().map(t => `
    <div class="mini-card" style="margin-bottom:9px"><span class="mc-ico">${t.kind === "BGM" ? "🎵" : "🔊"}</span><span class="mc-name">${t.name}</span><span class="pro-tag">${t.kind}</span>
      <button class="btn btn-panel panel-btn" data-tpreview="${t.id}" type="button">▶ Preview</button>
      <button class="btn btn-accent panel-btn" data-tadd="${t.id}" type="button">+ Add to Timeline</button></div>`).join("");
  const seg = `<div class="ml-seg">
    <button class="ml-seg-btn${mediaSeg === "single" ? " active" : ""}" data-mseg="single" type="button">📁 Single Backgrounds<span>${singles} items</span></button>
    <button class="ml-seg-btn${mediaSeg === "combo" ? " active" : ""}" data-mseg="combo" type="button">▦ Combo Backgrounds<span>${packs.length} packs</span></button>
  </div>`;
  if (mediaSeg === "single") return head + seg + `
    <label class="btn btn-accent panel-btn" style="display:block;text-align:center;cursor:pointer">＋ Upload Single Background
      <input type="file" accept="image/*" id="mediaBgUpload" hidden></label>
    <div class="ml-row"><span>Single Scenes (${singles})</span><button class="btn btn-panel ml-reload" id="mediaReload" type="button">⟳ Reload</button></div>
    <div class="card-grid">${BG_LIST.map(b =>
      `<div class="mini-card clickable" data-bg="${b[0]}"><span class="mc-ico">🏞️</span><span class="mc-name">${b[1]}</span><span class="mc-add">Set as scene background</span></div>`).join("")}
      ${singleLibs().map(i => libCard(i, "bg", "Set as background")).join("")}</div>`;
  if (mediaPackId) {
    const p = packs.find(x => x.id === mediaPackId);
    if (p) { const views = packViews(p.id); return head + seg + `
    <button class="btn btn-panel panel-btn" id="mediaPackBack" type="button">← All Packs</button>
    <div class="ml-row"><span>${p.name} (${views.length} Views)</span></div>
    <label class="btn btn-accent panel-btn" style="display:block;text-align:center;cursor:pointer">+ Add View to Folder
      <input type="file" accept="image/*" id="mediaAddView" hidden></label>
    <div class="card-grid">${views.map(i => libCard(i, "bg", "Set as background")).join("") || `<p class="panel-sub">No views in this pack yet.</p>`}</div>`; }
    mediaPackId = null;
  }
  return head + seg + `
    <label class="btn btn-accent panel-btn" style="display:block;text-align:center;cursor:pointer">＋ Upload Combo Pack
      <input type="file" accept="image/*" id="mediaComboUpload" hidden multiple></label>
    <div class="ml-row"><span>Combo Packs (${packs.length})</span><button class="btn btn-panel ml-reload" id="mediaReload" type="button">⟳ Reload</button></div>
    ${packs.length ? `<div class="card-grid">${packs.map(packCard).join("")}</div>` : `<p class="panel-sub">No combo packs yet — upload a set of views of one place to make a pack.</p>`}`;
}
function audioDuration(blob) {
  return new Promise(res => {
    const a = new Audio(); const url = URL.createObjectURL(blob);
    a.preload = "metadata";
    a.onloadedmetadata = () => { const d = a.duration; URL.revokeObjectURL(url); res(isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : 5); };
    a.onerror = () => { URL.revokeObjectURL(url); res(5); };
    a.src = url;
  });
}
function wireMedia() {
  if (!$("#mediaClose")) return;
  const au = $("#mediaAudioUpload"); if (au) au.addEventListener("change", async () => { const f = au.files && au.files[0]; if (!f) return; const assetId = nid("as"); await idbPut("assets", { id: assetId, blob: f, name: f.name, at: Date.now() }); const dur = await audioDuration(f); await idbPut("library", { id: nid("trk"), kind: "audiotrack", name: (f.name || "Audio").replace(/\.[^.]+$/, ""), akind: "BGM", assetId, dur, at: Date.now() }); await loadLibrary(); selectTool("media"); setNote(`Audio "${(f.name || "Audio").replace(/\.[^.]+$/, "")}" added — Preview it or add it to the timeline.`); });
  $("#mediaClose").addEventListener("click", () => { panel.hidden = true; $$(".rail-btn").forEach(b => b.classList.remove("active")); });
  $$("[data-mtab]", panel).forEach(b => b.addEventListener("click", () => { mediaTab = +b.dataset.mtab; selectTool("media"); }));
  $$("[data-mseg]", panel).forEach(b => b.addEventListener("click", () => { mediaSeg = b.dataset.mseg; mediaPackId = null; selectTool("media"); }));
  const rl = $("#mediaReload"); if (rl) rl.addEventListener("click", () => { selectTool("media"); setNote(mediaTab === 1 ? "Audio list reloaded." : "Backgrounds reloaded."); });
  const up = $("#mediaBgUpload"); if (up) up.addEventListener("change", async () => { const f = up.files && up.files[0]; if (!f) return; await addLibraryImage(f, "background"); selectTool("media"); setNote(`"${(f.name || "Image").replace(/\.[^.]+$/, "")}" added to Single Scenes.`); });
  const cp = $("#mediaComboUpload"); if (cp) cp.addEventListener("change", async () => { const files = Array.from(cp.files || []); if (!files.length) return; await createComboPack(files); selectTool("media"); setNote(`Combo pack added with ${files.length} view(s).`); });
  $$("[data-pack]", panel).forEach(c => c.addEventListener("click", () => { mediaPackId = c.dataset.pack; selectTool("media"); }));
  const bk = $("#mediaPackBack"); if (bk) bk.addEventListener("click", () => { mediaPackId = null; selectTool("media"); });
  const av = $("#mediaAddView"); if (av) av.addEventListener("change", async () => { const f = av.files && av.files[0]; if (!f || !mediaPackId) return; await addLibraryImage(f, "background", mediaPackId); selectTool("media"); setNote("View added to this pack."); });
}
const PANELS = {
  character: () => `<h4>Characters (${Object.keys(CHAR_PRESETS).length + Object.keys(CUSTOM_CHARS).length})</h4>
    <p class="panel-sub">Tap a character to add it to your scene. Drag it on the canvas; animate it with ◆ Keyframe.</p>
    <div class="field-row" style="margin-bottom:10px"><input type="search" id="charSearch" placeholder="Search characters…" style="flex:1"><button class="btn btn-panel" id="charReloadBtn" type="button">⟳ Reload</button></div>
    <div class="card-grid">${Object.keys(CHAR_PRESETS).map(c =>
      `<div class="mini-card clickable" data-char="${c}"><span class="mc-ico">🧑</span><span class="mc-name">${c}</span><span class="pro-tag">MULTI PRO</span><span class="mc-add">+ Add to canvas</span></div>`).join("")}</div>
    ${Object.keys(CUSTOM_CHARS).length ? `<p class="panel-sub" style="margin-top:12px"><strong>Your characters</strong> — made in the Character Studio.</p>
    <div class="card-grid">${Object.keys(CUSTOM_CHARS).map(c =>
      `<div class="mini-card clickable" data-char="${c}"><span class="mc-ico">⭐</span><span class="mc-name">${c}</span><span class="mc-add">+ Add to canvas</span></div>`).join("")}</div>` : ""}
    <button class="btn btn-accent panel-btn" id="charStudioNewBtn" type="button">Add New Character</button>
    <button class="btn btn-panel panel-btn" id="charStudioBtn" type="button">New from Character Studio</button>
    <button class="btn btn-panel panel-btn" id="charEditBtn" type="button">Edit Character</button>
    ${note("The full library holds 45 characters — the owner adds more over time. On the original, creating and editing characters is a Pro feature; here the Character Studio is open until plans activate (Phase F).")}`,
  media: () => mediaPanel(),
  effect: () => {
    const fx = scene().fx || {};
    const rv = fx.river || { flow: 50, width: 60, angle: 50, color1: "#57b7d9", color2: "#2e6da0" };
    const rn = fx.rain || { intensity: 55, speed: 50, wind: 20, opacity: 80, splash: true };
    const rvt = (fx.river && fx.river.type) || fx.riverType || "river";
    return `<h4>Effect</h4>
    <p class="panel-sub"><strong>Natural River &amp; Rain Studio</strong> — effects play live on your canvas, in this scene.</p>
    <button class="btn ${fx.river ? "btn-panel" : "btn-accent"} panel-btn" id="fxRiverBtn" type="button">${fx.river ? "Remove River" : "Generate River"}</button>
    <label class="slider-row">River type
      <select id="rvType" class="fx-select">
        <option value="stream"${rvt === "stream" ? " selected" : ""}>Stream</option><option value="river"${rvt === "river" ? " selected" : ""}>River</option><option value="rapids"${rvt === "rapids" ? " selected" : ""}>Rapids</option>
      </select></label>
    <label class="slider-row">Flow speed <input type="range" id="rvFlow" min="0" max="100" value="${rv.flow}"></label>
    <label class="slider-row">Width <input type="range" id="rvWidth" min="0" max="100" value="${rv.width}"></label>
    <label class="slider-row">Angle <input type="range" id="rvAngle" min="0" max="100" value="${rv.angle}"></label>
    <div class="field-row">
      <label class="slider-row">Water colour <input type="color" id="rvColor1" value="${rv.color1}"></label>
      <label class="slider-row">Deep colour <input type="color" id="rvColor2" value="${rv.color2}"></label>
    </div>
    <button class="btn ${fx.rain ? "btn-panel" : "btn-accent"} panel-btn" id="fxRainBtn" type="button" style="margin-top:14px">${fx.rain ? "Stop Rain" : "Start Rain"}</button>
    <label class="slider-row">Rain intensity (drop count) <input type="range" id="rnIntensity" min="0" max="100" value="${rn.intensity}"></label>
    <label class="slider-row">Rain speed <input type="range" id="rnSpeed" min="0" max="100" value="${rn.speed}"></label>
    <label class="slider-row">Wind <input type="range" id="rnWind" min="0" max="100" value="${rn.wind}"></label>
    <label class="slider-row">Opacity <input type="range" id="rnOpacity" min="0" max="100" value="${rn.opacity}"></label>
    <label class="slider-row" style="display:flex;align-items:center;gap:8px">Splashes <input type="checkbox" id="rnSplash" ${rn.splash ? "checked" : ""} style="width:auto"></label>
    <button class="btn btn-panel panel-btn" id="fxThunderBtn" type="button">${fx.thunder ? "Thunder: On" : "Thunder"}</button>
    <label class="slider-row">Camera shake <input type="range" id="fxShake" min="0" max="100" value="${fx.shake || 0}"></label>
    <button class="btn btn-panel panel-btn" id="fxSoundBtn" type="button">Test Rain Sound</button>
    ${note("Effects belong to this scene — switch scenes to give each one its own weather.")}`;
  },
  assets: () => `<h4>Asset Library</h4>
    <p class="panel-sub">49 props for your scenes — tap to add. 🔒 Pro assets unlock with a plan.</p>
    ${libraryItems.filter(i => i.kind !== "combo" && !i.packId).length ? `<p class="panel-sub"><strong>Owner's library</strong> — backgrounds also appear in the Media Library.</p>
    <div class="card-grid">${libraryItems.filter(i => i.kind !== "combo" && !i.packId).map(i => libCard(i, i.kind === "background" ? "bg" : i.kind, i.kind === "background" ? "Set as background" : "+ Add to canvas")).join("")}</div>` : ""}
    <div class="card-grid">${PROP_LIST.map(propCard).join("")}</div>
    <p class="panel-sub" style="margin-top:12px"><strong>Vehicles</strong></p>
    <div class="card-grid">${VEHICLE_LIST.map(propCard).join("")}</div>
    <p class="panel-sub" style="margin-top:12px"><strong>Animals</strong></p>
    <div class="card-grid">${ANIMAL_LIST.map(propCard).join("")}</div>
    <details class="lib-manager">
      <summary>Owner Library — add your own assets</summary>
      <label class="field">Asset image <input type="file" id="libFile" accept="image/*"></label>
      <label class="field">Name <input type="text" id="libName" placeholder="e.g. Red Bicycle"></label>
      <div class="field-row">
        <label class="field">Kind
          <select id="libKind"><option value="prop">Prop</option><option value="background">Background</option><option value="character">Character</option></select></label>
        <label class="field">Access
          <select id="libPlan"><option value="free">Free</option><option value="pro">Pro (locked)</option></select></label>
      </div>
      <button class="btn btn-accent panel-btn" id="libAddBtn" type="button">Add to Library</button>
      <button class="btn btn-panel panel-btn" id="libBackupBtn" type="button">Download Library Backup</button>
      <label class="btn btn-panel panel-btn" style="display:block;text-align:center;cursor:pointer">Import Library Backup
        <input type="file" id="libImport" accept="application/json" hidden></label>
      ${note("Owner uploads are stored in this browser for now; cloud storage (Phase F) will carry them to every visitor. Use the backup file to keep them safe and move them later.")}
    </details>`,
  sprite: () => `<h4>Sprite Sheet</h4>
    <p class="panel-sub">Ready animation packs — 6 frames each. Add one, press Play, and it moves; keyframes can carry it across the scene.</p>
    ${[["bird", "Bird Fly"], ["walkers", "Boy and Girl Walking"], ["boy", "Boy Walking"], ["dog", "Dog Walk"], ["girl", "Girl Walk"], ["cat", "Cat Walk"]].map(s =>
      `<div class="mini-card" style="margin-bottom:9px"><span class="mc-ico">🐾</span><span class="mc-name">${s[1]}</span>
      <button class="btn btn-panel panel-btn" data-sprite="${s[0]}|${s[1]}" type="button">Add to Timeline</button></div>`).join("")}`,
  sounds: () => `<h4>Sounds</h4>
    <div class="chip-row">${["All", "BGM", "SFX", "Voice"].map(f => `<button class="chip${soundFilter === f ? " active" : ""}" type="button" data-sfilter="${f}">${f}</button>`).join("")}</div>
    ${soundFilter !== "Voice" ? AUDIO_TRACKS.filter(t => soundFilter === "All" || t.kind === soundFilter).map(t => `
    <div class="mini-card" style="margin-bottom:9px"><span class="mc-ico">${t.kind === "BGM" ? "🎵" : "🔊"}</span><span class="mc-name">${t.name}</span><span class="pro-tag">${t.kind}</span>
      <button class="btn btn-panel panel-btn" data-tpreview="${t.id}" type="button">▶ Preview</button>
      <button class="btn btn-accent panel-btn" data-tadd="${t.id}" type="button">+ Add to Timeline</button></div>`).join("") : ""}
    ${soundFilter === "All" || soundFilter === "Voice" ? `<h4 style="margin-top:14px">Voice</h4>
    <p class="panel-sub">Record your voice or upload audio — it becomes this scene's voice track and plays during playback.</p>
    <button class="btn btn-accent panel-btn" id="recordBtn" type="button">● Record Voice</button>
    <div id="recordOut"></div>
    <label class="btn btn-panel panel-btn" style="display:block;text-align:center;cursor:pointer">Upload Audio
      <input type="file" accept="audio/*" id="audioUpload" hidden></label>
    <div id="audioOut"></div>` : ""}`,
  ik: () => {
    const o = selObj();
    const pose = (o && o.pose) || { arm: 0, leg: 0, head: 0, lean: 0 };
    return `<h4>Anim IK</h4>
    <p class="panel-sub">Turn any 2D character image into an animated puppet with IK joints, and pose built-in characters joint by joint.</p>
    <label class="btn btn-accent panel-btn" style="display:block;text-align:center;cursor:pointer">Add 2D Character Image
      <input type="file" accept="image/*" data-upload hidden></label>
    <label class="btn btn-panel panel-btn" style="display:block;text-align:center;cursor:pointer">Add Full Body Image
      <input type="file" accept="image/*" data-upload hidden></label>
    <p class="panel-sub" style="margin-top:12px"><strong>IK joints</strong> — Head · Neck · Shoulder L/R · Elbow L/R · Hand L/R · Hip L/R · Knee L/R · Foot L/R.</p>
    <p class="panel-sub">${o && o.type === "char" ? `Posing: <strong>${o.name}</strong>` : "Select a character on the canvas to pose it."}</p>
    <label class="slider-row">Arm swing <input type="range" id="ikArm" min="-70" max="70" value="${pose.arm || 0}"></label>
    <label class="slider-row">Leg swing <input type="range" id="ikLeg" min="-70" max="70" value="${pose.leg || 0}"></label>
    <label class="slider-row">Head tilt <input type="range" id="ikHead" min="-40" max="40" value="${pose.head || 0}"></label>
    <label class="slider-row">Body lean <input type="range" id="ikLean" min="-30" max="30" value="${pose.lean || 0}"></label>
    <button class="btn btn-panel panel-btn" id="ikOutlineBtn" type="button">${o && o.outline ? "Hide Body Outline" : "Draw Body Outline"}</button>
    <button class="btn btn-panel panel-btn" id="ikResetBtn" type="button">Reset Pose</button>
    ${note("On the original, Anim IK is a Pro feature in Advanced Mode; here it is open until plans activate (Phase F).")}`;
  },
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
/* ---------------- Starter audio library (synthesised, stored as assets) ---------------- */
const AUDIO_TRACKS = [
  { id: "bgm-happy", name: "Happy Morning", kind: "BGM", dur: 8 },
  { id: "bgm-calm", name: "Calm Evening", kind: "BGM", dur: 8 },
  { id: "bgm-adventure", name: "Adventure Day", kind: "BGM", dur: 8 },
  { id: "sfx-rain", name: "Rain", kind: "SFX", dur: 5 },
  { id: "sfx-birds", name: "Morning Birds", kind: "SFX", dur: 5 },
  { id: "sfx-thunder", name: "Thunder", kind: "SFX", dur: 4 }
];
let soundFilter = "All";
let userTracks = [];
function allTracks() { return AUDIO_TRACKS.concat(userTracks); }
function wavBlob(buffer) {
  const nCh = Math.min(2, buffer.numberOfChannels), sr = buffer.sampleRate, len = buffer.length;
  const bytes = 44 + len * nCh * 2, ab = new ArrayBuffer(bytes), v = new DataView(ab);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); v.setUint32(4, bytes - 8, true); wstr(8, "WAVEfmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, nCh, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * nCh * 2, true); v.setUint16(32, nCh * 2, true); v.setUint16(34, 16, true);
  wstr(36, "data"); v.setUint32(40, len * nCh * 2, true);
  const chans = []; for (let c = 0; c < nCh; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < nCh; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); v.setInt16(o, s * 0x7fff, true); o += 2; }
  return new Blob([ab], { type: "audio/wav" });
}
async function synthTrack(tr) {
  const sr = 22050, ctx = new OfflineAudioContext(1, Math.ceil(sr * tr.dur), sr);
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  const tone = (m, t, d, type, g, slideTo) => { const o = ctx.createOscillator(), gn = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(mf(m), t); if (slideTo) o.frequency.exponentialRampToValueAtTime(mf(slideTo), t + d); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(gn); gn.connect(ctx.destination); o.start(t); o.stop(t + d + 0.05); };
  const noise = (t, d, freq, g, brown) => { const len = Math.ceil(sr * d), buf = ctx.createBuffer(1, len, sr), ch = buf.getChannelData(0); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = brown ? last * 3.5 : w; } const s2 = ctx.createBufferSource(); s2.buffer = buf; const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq; const gn = ctx.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + d); s2.connect(f); f.connect(gn); gn.connect(ctx.destination); s2.start(t); };
  if (tr.id === "bgm-happy") { [72, 76, 79, 76, 81, 79, 76, 72, 74, 76, 79, 84, 79, 76, 74, 71].forEach((m, i) => tone(m, i * 0.5, 0.45, "triangle", 0.16)); [48, 55, 52, 53].forEach((m, i) => { tone(m, i * 2, 1.9, "sine", 0.12); tone(m + 7, i * 2, 1.9, "sine", 0.06); }); }
  else if (tr.id === "bgm-calm") { [60, 64, 67, 71, 69, 67, 64, 62, 60, 64, 67, 71, 74, 71, 67, 64].forEach((m, i) => tone(m, i * 0.5, 0.9, "sine", 0.12)); [36, 41, 43, 48].forEach((m, i) => tone(m, i * 2, 2.2, "sine", 0.08)); }
  else if (tr.id === "bgm-adventure") { [67, 67, 71, 74, 79, 74, 71, 67, 69, 71, 74, 71, 67, 64, 62, 64].forEach((m, i) => tone(m, i * 0.5, 0.4, "square", 0.05)); [43, 43, 48, 50].forEach((m, i) => { tone(m, i * 2, 0.5, "triangle", 0.14); tone(m, i * 2 + 1, 0.5, "triangle", 0.14); }); }
  else if (tr.id === "sfx-rain") { noise(0, tr.dur, 1400, 0.20, false); noise(0, tr.dur, 500, 0.10, false); }
  else if (tr.id === "sfx-birds") { [0.3, 0.9, 1.7, 2.6, 3.4, 4.2].forEach((t, i) => tone(96 + (i % 3) * 2, t, 0.28, "sine", 0.10, 103 + (i % 3) * 2)); }
  else if (tr.id === "sfx-thunder") { noise(0.1, 1.2, 220, 0.5, true); noise(1.6, 2.2, 140, 0.34, true); }
  return wavBlob(await ctx.startRendering());
}
const trackBlobs = {};
async function trackBlob(id) {
  if (trackBlobs[id]) return trackBlobs[id];
  const ut = userTracks.find(t => t.id === id);
  if (ut) {
    if (memBlobs[ut.assetId]) { trackBlobs[id] = memBlobs[ut.assetId]; return trackBlobs[id]; }
    try { const rec = await idbGet("assets", ut.assetId); if (rec && rec.blob) { trackBlobs[id] = rec.blob; memBlobs[ut.assetId] = rec.blob; return rec.blob; } } catch { }
    return null;
  }
  const key = "trk-" + id;
  if (memBlobs[key]) { trackBlobs[id] = memBlobs[key]; return trackBlobs[id]; }
  try { const rec = await idbGet("assets", key); if (rec && rec.blob) { trackBlobs[id] = rec.blob; memBlobs[key] = rec.blob; return rec.blob; } } catch { }
  const tr = AUDIO_TRACKS.find(t => t.id === id);
  const blob = await synthTrack(tr);
  trackBlobs[id] = blob; memBlobs[key] = blob;
  try { await idbPut("assets", { id: key, blob, name: tr.name, at: Date.now() }); } catch { }
  return blob;
}
let previewAudio = null, previewId = null;
async function previewTrack(id) {
  const tr = allTracks().find(t => t.id === id);
  if (!tr) return;
  if (previewAudio && previewId === id) { previewAudio.pause(); previewAudio = null; previewId = null; setNote("Preview stopped."); return; }
  if (previewAudio) { previewAudio.pause(); previewAudio = null; }
  previewId = id;
  setNote(`Preparing "${tr.name}"…`);
  const blob = await trackBlob(id);
  if (previewId !== id) return;
  previewAudio = new Audio(URL.createObjectURL(blob));
  previewAudio.play().catch(() => setNote("Preview could not play in this browser."));
  setNote(`Playing "${tr.name}" — click Preview again to stop.`);
}
async function addSceneAudio(id) {
  const tr = allTracks().find(t => t.id === id);
  if (!tr) return;
  setNote(`Preparing "${tr.name}"…`);
  await trackBlob(id);
  const sc = scene(); sc.audio = sc.audio || [];
  sc.audio.push({ id: nid("au"), assetId: tr.user ? tr.id : "trk-" + id, name: tr.name, kind: tr.kind, start: 0, dur: tr.dur || 5 });
  pushHistory(); renderTracks();
  setNote(`"${tr.name}" is on the timeline — press Play and it plays with the scene.`);
}
const clipAudios = new Map();
function stopClipAudio(cid) { const a = clipAudios.get(cid); if (a) { try { a.pause(); } catch { } clipAudios.delete(cid); } }
function stopAllClipAudio() { for (const cid of Array.from(clipAudios.keys())) stopClipAudio(cid); }
function syncClipAudio() {
  const sc = scene();
  for (const clip of sc.audio || []) {
    const inWin = playT >= clip.start && playT < clip.start + clip.dur;
    if (inWin && !clipAudios.has(clip.id)) {
      const blob = memBlobs[clip.assetId] || trackBlobs[clip.assetId.replace("trk-", "")] || trackBlobs[clip.assetId];
      if (blob) { const a = new Audio(URL.createObjectURL(blob)); try { a.currentTime = Math.max(0, playT - clip.start); } catch { } a.play().catch(() => { }); clipAudios.set(clip.id, a); }
      else trackBlob(clip.assetId.replace("trk-", "")).catch(() => { });
    } else if (!inWin) stopClipAudio(clip.id);
  }
}
async function attachVoice(blob, label) {
  const assetId = nid("vo");
  let stored = true;
  try { await idbPut("assets", { id: assetId, blob, name: label, at: Date.now() }); }
  catch { stored = false; memBlobs[assetId] = blob; }
  scene().voiceAssetId = assetId;
  pushHistory(); renderTracks();
  setNote(stored
    ? `Voice set for ${scene().name} — press Play and it speaks with the scene.`
    : `Voice set for ${scene().name} — kept for this session only, browser storage was unavailable.`);
}
let mediaRec = null, recChunks = [];
function wirePanel() {
  $$("[data-pro]", panel).forEach(b => b.addEventListener("click", () => openPro()));
  $$("[data-soon]", panel).forEach(b => b.addEventListener("click", () =>
    setNote(`${b.dataset.soon} switches on in the next studio update.`)));
  $$("[data-char]", panel).forEach(c => c.addEventListener("click", () => addCharacter(c.dataset.char)));
  const charSearchEl = $("#charSearch", panel);
  if (charSearchEl) charSearchEl.addEventListener("input", () => { const q = charSearchEl.value.trim().toLowerCase(); $$("[data-char]", panel).forEach(c => { c.style.display = !q || c.textContent.toLowerCase().includes(q) ? "" : "none"; }); });
  const charReloadEl = $("#charReloadBtn", panel);
  if (charReloadEl) charReloadEl.addEventListener("click", () => { selectTool("character"); setNote("Character list reloaded."); });
  $$("[data-sfilter]", panel).forEach(b => b.addEventListener("click", () => { soundFilter = b.dataset.sfilter; selectTool("sounds"); }));
  $$("[data-tpreview]", panel).forEach(b => b.addEventListener("click", () => previewTrack(b.dataset.tpreview)));
  $$("[data-tadd]", panel).forEach(b => b.addEventListener("click", () => addSceneAudio(b.dataset.tadd)));
  $$("[data-bg]", panel).forEach(c => c.addEventListener("click", () => {
    scene().bg = c.dataset.bg; pushHistory(); drawStage();
    setNote("Background set for this scene.");
  }));
  $$("[data-prop]", panel).forEach(c => c.addEventListener("click", () => {
    const [emoji, name, pro] = c.dataset.prop.split("|");
    if (pro === "1" && !isPro()) { setNote(`“${name}” is a Pro asset — members unlock the full library.`); openPro(); return; }
    addProp(emoji, name);
  }));
  $$("[data-lib]", panel).forEach(c => c.addEventListener("click", async () => {
    const [action, id] = c.dataset.lib.split("|");
    const it = libraryItems.find(x => x.id === id);
    if (!it) return;
    if (it.pro && !isPro()) { setNote(`“${it.name}” is a Pro asset — members unlock the full library.`); openPro(); return; }
    if (action === "bg") {
      scene().bgAsset = it.assetId; pushHistory(); drawStage();
      setNote(`“${it.name}” is now this scene's background.`);
    } else {
      const rec = await idbGet("assets", it.assetId);
      if (rec && rec.blob) addImageFile(rec.blob).catch(() => {});
      else setNote("That asset could not be loaded.");
    }
  }));
  $$("[data-sprite]", panel).forEach(c => c.addEventListener("click", () => {
    const [kind, name] = c.dataset.sprite.split("|"); addSpritePack(kind, name);
  }));
  wireLibrary();
  wireFx();
  wireCharStudio();
  wireIk();
  wireMedia();
  wireStudioTool();
  $$("[data-upload]", panel).forEach(inp => inp.addEventListener("change", () => {
    const f = inp.files && inp.files[0]; if (f) addImageFile(f).catch(() => setNote("That image could not be added."));
  }));
  $$(".chip", panel).forEach(c => c.addEventListener("click", () => {
    if ($("#toolPanel").dataset.tool === "media") { mediaTab = +c.dataset.chip; selectTool("media"); }
    else { $$(".chip", panel).forEach(x => x.classList.remove("active")); c.classList.add("active"); }
  }));
  const ms = $("#mediaSoundsBtn"); if (ms) ms.addEventListener("click", () => selectTool("sounds"));
  const se = $("#sendEraserBtn"); if (se) se.addEventListener("click", async () => {
    const o = selObj();
    if (o && o.type === "image") {
      const rec = await idbGet("assets", o.assetId);
      if (rec && rec.blob) { openEraser(rec.blob); return; }
    }
    openEraser();
    setNote("Photo Editor open — use Open to load an image, or select an image on the canvas first and use Send Image to Eraser.");
  });
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
/* ---------------- Owner library ---------------- */
let libraryItems = [];
async function loadLibrary() {
  try { libraryItems = await idbAll("library"); } catch { libraryItems = []; }
  userTracks = libraryItems.filter(i => i.kind === "audiotrack").map(i => ({ id: i.id, name: i.name, kind: i.akind || "BGM", dur: i.dur || 5, assetId: i.assetId, user: true }));
}
function blobToDataURL(blob) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => res(null);
    r.readAsDataURL(blob);
  });
}
function wireLibrary() {
  const addBtn = $("#libAddBtn");
  if (!addBtn) return;
  addBtn.addEventListener("click", async () => {
    const f = $("#libFile").files && $("#libFile").files[0];
    if (!f) { setNote("Choose an image first, then add it to the library."); return; }
    const assetId = nid("as");
    const libId = nid("lib");
    const meta = {
      id: libId, kind: $("#libKind").value,
      name: $("#libName").value.trim() || f.name,
      pro: $("#libPlan").value === "pro", assetId, blob: f, at: Date.now()
    };
    await idbPut("assets", { id: assetId, blob: f, name: f.name, at: Date.now() });
    await idbPut("library", meta);
    await loadLibrary();
    selectTool("assets");
    setNote("Added to the owner's library — find it in the Asset Library and under Media.");
    if (fb && fb.user && cloudOk) {
      try {
        const { ref, uploadBytes, getDownloadURL } = fb.stM;
        const r = ref(fb.storage, `library/${fb.user.uid}/${assetId}`);
        await uploadBytes(r, f);
        const url = await getDownloadURL(r);
        const { doc, setDoc } = fb.fsM;
        await setDoc(doc(fb.db, "users", fb.user.uid, "library", libId), {
          kind: meta.kind, name: meta.name, pro: meta.pro, url, at: meta.at
        });
        setNote("Added to the owner's library — and backed up to the cloud.");
      } catch { /* local copy stands; cloud copy is a bonus */ }
    }
  });
  $("#libBackupBtn").addEventListener("click", async () => {
    const items = [];
    for (const it of libraryItems) {
      const rec = await idbGet("assets", it.assetId);
      const blob = (rec && rec.blob) || it.blob;
      if (blob) items.push({ kind: it.kind, name: it.name, pro: !!it.pro, dataUrl: await blobToDataURL(blob) });
    }
    const out = new Blob([JSON.stringify({ app: "Ss Animation", v: 1, items }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(out);
    a.download = "ss-animation-library-backup.json";
    a.click();
    setNote(`Library backup downloaded (${items.length} asset(s)).`);
  });
  $("#libImport").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      let n = 0;
      for (const it of data.items || []) {
        if (!it.dataUrl) continue;
        const blob = await (await fetch(it.dataUrl)).blob();
        const assetId = nid("as");
        await idbPut("assets", { id: assetId, blob, name: it.name, at: Date.now() });
        await idbPut("library", { id: nid("lib"), kind: it.kind || "prop", name: it.name || "Asset", pro: !!it.pro, assetId, blob, at: Date.now() });
        n++;
      }
      await loadLibrary();
      selectTool("assets");
      setNote(`Imported ${n} asset(s) into the owner's library.`);
    } catch { setNote("That backup file could not be read."); }
  });
}
/* ---------------- Anim IK wiring ---------------- */
function wireIk() {
  if (!$("#ikArm")) return;
  const bind = (id, key) => {
    const el = $("#" + id);
    const apply = () => {
      const o = selObj();
      if (!o || o.type !== "char") { setNote("Select a character on the canvas first — IK poses characters."); return; }
      o.pose = o.pose || { arm: 0, leg: 0, head: 0, lean: 0 };
      o.pose[key] = +el.value;
      const _kk = (o.keys || []).find(k => Math.abs(k.t - playT) < 0.02);
      if (_kk) { _kk.pose = _kk.pose || { arm: o.pose.arm || 0, leg: o.pose.leg || 0, head: o.pose.head || 0, lean: o.pose.lean || 0 }; _kk.pose[key] = +el.value; }
      drawStage();
    };
    el.addEventListener("input", apply);
    el.addEventListener("change", () => { apply(); pushHistory(); });
  };
  bind("ikArm", "arm"); bind("ikLeg", "leg"); bind("ikHead", "head"); bind("ikLean", "lean");
  $("#ikOutlineBtn").addEventListener("click", () => {
    const o = selObj();
    if (!o) { setNote("Select an object on the canvas first."); return; }
    o.outline = !o.outline;
    pushHistory(); drawStage(); selectTool("ik");
    setNote(o.outline ? "Body outline and joint points are drawn on the canvas." : "Body outline hidden.");
  });
  $("#ikResetBtn").addEventListener("click", () => {
    const o = selObj();
    if (!o || o.type !== "char") { setNote("Select a character on the canvas first."); return; }
    o.pose = { arm: 0, leg: 0, head: 0, lean: 0 };
    const _rk = (o.keys || []).find(k => Math.abs(k.t - playT) < 0.02);
    if (_rk) _rk.pose = { arm: 0, leg: 0, head: 0, lean: 0 };
    pushHistory(); drawStage(); selectTool("ik");
    setNote(`${o.name} is standing straight again.`);
  });
}
/* ---------------- Main Studio tool wiring ---------------- */
let studioMode = 0;
function placeChar(name, x, y, s) {
  addCharacter(name);
  const o = selObj();
  if (o) { o.x = x; o.y = y; if (s) o.scale = s; }
  return o;
}
function applyTemplate(kind) {
  const sc = scene();
  if (kind === "village") {
    sc.bg = "village"; sc.bgAsset = null;
    placeChar("Hero Boy", 430, 440); placeChar("Hero Girl", 850, 440);
    setNote("Village Morning built — a boy and a girl in the village. Press Play or add keyframes.");
  } else if (kind === "rain") {
    sc.bg = "village"; sc.bgAsset = null;
    sc.fx = sc.fx || {};
    sc.fx.rain = { intensity: 65, speed: 55, wind: 25, opacity: 85, splash: true };
    placeChar("Hero Boy", 640, 440);
    setNote("Rainy Day built — rain is falling on this scene (Effect panel fine-tunes it).");
  } else if (kind === "class") {
    sc.bg = "school"; sc.bgAsset = null;
    placeChar("Teacher", 470, 440); placeChar("Hero Boy", 880, 450, 0.9);
    setNote("Classroom Talk built — teacher and student ready.");
  } else if (kind === "river") {
    sc.bg = "river"; sc.bgAsset = null;
    sc.fx = sc.fx || {};
    sc.fx.river = { flow: 50, width: 60, angle: 50, color1: "#57b7d9", color2: "#2e6da0" };
    placeChar("Mother", 470, 420); placeChar("Hero Boy", 830, 430, 0.9);
    setNote("River Picnic built — the river is flowing (Effect panel fine-tunes it).");
  } else if (kind === "walkin") {
    const o = placeChar("Hero Boy", 150, 440);
    if (o) {
      const d = Math.max(2, sc.duration * 0.6);
      o.keys = [
        { t: 0, x: 150, y: 440, scale: o.scale, rot: 0, op: 1 },
        { t: +d.toFixed(2), x: 640, y: 440, scale: o.scale, rot: 0, op: 1 }
      ];
      playT = 0;
      setNote("Walk-In Entrance built — press Play and he walks to the centre.");
    }
  }
  pushHistory(); drawStage(); renderTracks(); ensureFxLoop();
}
function wireStudioTool() {
  $$("[data-studiomode]").forEach(b => b.addEventListener("click", () => {
    studioMode = +b.dataset.studiomode;
    selectTool("studio");
  }));
  $$("[data-template]").forEach(b => b.addEventListener("click", () => applyTemplate(b.dataset.template)));
  const adv = (id, fn) => {
    const el = $("#" + id);
    if (!el) return;
    el.addEventListener("input", () => { fn(el); drawStage(); });
    el.addEventListener("change", () => { pushHistory(); renderTracks(); });
  };
  adv("advX", el => { const o = selObj(); if (o) o.x = +el.value || 0; });
  adv("advY", el => { const o = selObj(); if (o) o.y = +el.value || 0; });
  adv("advScale", el => { const o = selObj(); if (o) o.scale = clamp((+el.value || 100) / 100, 0.1, 4); });
  adv("advRot", el => { const o = selObj(); if (o) o.rot = +el.value || 0; });
  adv("advOp", el => { const o = selObj(); if (o) o.op = clamp((+el.value || 100) / 100, 0.05, 1); });
  adv("advDur", el => { scene().duration = clamp(+el.value || 5, 1, 120); });
  adv("advWash", el => { scene().bgColor = el.value; });
  const wc = $("#advWashClear");
  if (wc) wc.addEventListener("click", () => {
    scene().bgColor = null;
    pushHistory(); drawStage(); selectTool("studio");
    setNote("Colour wash cleared.");
  });
}
/* ---------------- Effects wiring ---------------- */
function wireFx() {
  if (!$("#fxRiverBtn")) return;
  const fxGet = () => { scene().fx = scene().fx || {}; return scene().fx; };
  const upd = (hist) => { drawStage(); ensureFxLoop(); if (hist) pushHistory(); };
  $("#fxRiverBtn").addEventListener("click", () => {
    const fx = fxGet();
    if (fx.river) { fx.river = null; fx.shake = 0; }
    else fx.river = { type: $("#rvType").value, flow: +$("#rvFlow").value, width: +$("#rvWidth").value, angle: +$("#rvAngle").value, color1: $("#rvColor1").value, color2: $("#rvColor2").value };
    pushHistory(); selectTool("effect"); upd(false);
    setNote(fx.river ? "River is flowing in this scene." : "River removed.");
  });
  const rvUpd = () => {
    const fx = fxGet();
    fx.riverType = $("#rvType").value;
    if (!fx.river) return;
    fx.river = { type: fx.riverType, flow: +$("#rvFlow").value, width: +$("#rvWidth").value, angle: +$("#rvAngle").value, color1: $("#rvColor1").value, color2: $("#rvColor2").value };
    upd(false);
  };
  ["rvFlow", "rvWidth", "rvAngle", "rvColor1", "rvColor2", "rvType"].forEach(id => {
    const el = $("#" + id);
    el.addEventListener("input", rvUpd);
    el.addEventListener("change", () => pushHistory());
  });
  $("#fxRainBtn").addEventListener("click", () => {
    const fx = fxGet();
    fx.rain = fx.rain ? null : { intensity: +$("#rnIntensity").value, speed: +$("#rnSpeed").value, wind: +$("#rnWind").value, opacity: +$("#rnOpacity").value, splash: $("#rnSplash").checked };
    if (!fx.rain) setRainSound(false, 0);
    pushHistory(); selectTool("effect"); upd(false);
    setNote(fx.rain ? "Rain is falling in this scene." : "Rain stopped.");
  });
  const rnUpd = () => {
    const fx = fxGet(); if (!fx.rain) return;
    fx.rain = { intensity: +$("#rnIntensity").value, speed: +$("#rnSpeed").value, wind: +$("#rnWind").value, opacity: +$("#rnOpacity").value, splash: $("#rnSplash").checked };
    upd(false);
  };
  ["rnIntensity", "rnSpeed", "rnWind", "rnOpacity", "rnSplash"].forEach(id => {
    const el = $("#" + id);
    el.addEventListener("input", rnUpd);
    el.addEventListener("change", () => pushHistory());
  });
  $("#fxThunderBtn").addEventListener("click", () => {
    const fx = fxGet();
    fx.thunder = !fx.thunder;
    pushHistory(); selectTool("effect"); upd(false);
    setNote(fx.thunder ? "Thunder is on — watch for lightning." : "Thunder off.");
  });
  const shakeEl = $("#fxShake");
  shakeEl.addEventListener("input", () => { fxGet().shake = +shakeEl.value; upd(false); setNote(+shakeEl.value > 0 ? `Camera shake on — intensity ${shakeEl.value}.` : "Camera shake off."); });
  shakeEl.addEventListener("change", () => { pushHistory(); });
  let soundOn = false;
  $("#fxSoundBtn").addEventListener("click", (e) => {
    soundOn = !soundOn;
    setRainSound(soundOn, fxGet().rain ? fxGet().rain.intensity : 55);
    e.currentTarget.textContent = soundOn ? "Stop Rain Sound" : "Test Rain Sound";
  });
}
function selectTool(id) {
  if (id === "eraser") { openEraser(); return; }
  if (id === "cinema") { openModal("#cinemaModal"); return; }
  if (id === "studio") {
    const o = selObj();
    if (o && o.type === "char") openCharStudio(o.params, o.name, o.id);
    else openCharStudio(null, "", null);
    return;
  }
  panel.hidden = false;
  $$(".rail-btn").forEach(b => b.classList.toggle("active", b.dataset.tool === id));
  panel.dataset.tool = id;
  panel.innerHTML = PANELS[id]();
  wirePanel();
}

/* ---------------- Modals ---------------- */
function openModal(sel) { $(sel).hidden = false; }
function closeModal(el) { el.hidden = true; }
$$(".modal-backdrop").forEach(m => {
  m.addEventListener("click", (e) => { if (e.target === m) closeModal(m); });
  $$("[data-close]", m).forEach(b => b.addEventListener("click", () => closeModal(m)));
});
/* ---------------- Export engine (Phase E) ----------------
   Frames are drawn by the real stage renderer at export resolution.
   MP4: ffmpeg.wasm, loaded on demand and cached for offline reuse.
   Fallback: MediaRecorder WebM in real time — always labelled honestly. */
let exporting = false, exportCancel = false, ffInstance = null, ffBusy = false;
const sleepE = (ms) => new Promise(r => setTimeout(r, ms));
function totalDuration() { return project.scenes.reduce((a, s) => a + (s.duration || 0), 0); }
function setExpStatus(t) { $("#expStatus").textContent = t; }
function setExpProgress(p, t) {
  $("#expFill").style.width = Math.round(clamp(p, 0, 1) * 100) + "%";
  if (t) setExpStatus(t);
}
function drawWatermark() {
  sctx.save();
  sctx.font = "700 30px Archivo, sans-serif";
  sctx.textAlign = "right";
  sctx.shadowColor = "rgba(0,0,0,.55)"; sctx.shadowBlur = 6;
  sctx.fillStyle = "rgba(255,255,255,.78)";
  sctx.fillText("Ss Animation", 1242, 690);
  sctx.restore();
}
async function runFrames({ fps, k, wm, onStart, onScene, onFrame, onFinish }) {
  const prev = { scene: curScene, t: playT, sel: selId };
  stopPlayback();
  selId = null;
  stageEl.width = Math.round(1280 * k);
  stageEl.height = Math.round(720 * k);
  const total = Math.max(1, Math.round(totalDuration() * fps));
  let idx = 0, ok = true;
  try {
    if (onStart) await onStart();
    for (let i = 0; i < project.scenes.length && ok; i++) {
      curScene = i;
      if (onScene) onScene(i);
      const frames = Math.max(1, Math.round((project.scenes[i].duration || 0) * fps));
      for (let f = 0; f < frames; f++) {
        if (exportCancel) { ok = false; break; }
        playT = f / fps;
        sctx.setTransform(k, 0, 0, k, 0, 0);
        drawStage();
        if (wm) drawWatermark();
        idx++;
        setExpProgress(idx / total * 0.9, `Rendering frame ${idx} of ${total}…`);
        const cont = await onFrame(idx, total);
        if (cont === false) { ok = false; break; }
      }
    }
  } finally {
    if (onFinish) { try { await onFinish(); } catch { /* ignore */ } }
    stageEl.width = 1280; stageEl.height = 720;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    curScene = prev.scene; playT = prev.t; selId = prev.sel;
    renderScenes(); renderTracks(); drawStage();
  }
  return ok;
}
async function collectVoices() {
  const out = [];
  let start = 0;
  for (let i = 0; i < project.scenes.length; i++) {
    const sc = project.scenes[i];
    if (sc.voiceAssetId) {
      if (memBlobs[sc.voiceAssetId]) { out.push({ index: i, start, blob: memBlobs[sc.voiceAssetId] }); start += sc.duration || 0; continue; }
      const rec = await idbGet("assets", sc.voiceAssetId).catch(() => null);
      if (rec && rec.blob) out.push({ index: i, start, blob: rec.blob });
    }
    start += sc.duration || 0;
  }
  return out;
}
function voiceExt(blob) {
  const t = blob.type || "";
  if (t.includes("mp4")) return "m4a";
  if (t.includes("mpeg")) return "mp3";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("wav")) return "wav";
  return "webm";
}
async function validCore(blob, kind) {
  if (!blob) return false;
  if (kind === "wasm") {
    if (blob.size < 1000000) return false;
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return head[0] === 0 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d;
  }
  return blob.size > 50000;
}
async function fetchCore(url, kind) {
  let cache = null;
  try { cache = await caches.open("ssanim-ffmpeg-v1"); } catch { cache = null; }
  if (cache) {
    const hit = await cache.match(url);
    if (hit && await validCore(await hit.clone().blob(), kind)) return hit.blob();
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("engine download failed");
  const blob = await res.blob();
  if (!(await validCore(blob, kind))) throw new Error("engine file invalid");
  if (cache) { try { await cache.put(url, new Response(blob.slice(0))); } catch { /* ignore */ } }
  return blob;
}
async function loadFFmpeg() {
  if (ffInstance) return ffInstance;
  if (!window.FFmpegWASM) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js";
      s.onload = res; s.onerror = () => rej(new Error("engine script failed"));
      document.head.appendChild(s);
    });
  }
  const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/";
  const [coreJS, coreWasm] = await Promise.all([
    fetchCore(base + "ffmpeg-core.js", "js"),
    fetchCore(base + "ffmpeg-core.wasm", "wasm")
  ]);
  const ff = new FFmpegWASM.FFmpeg();
  ff.on("progress", ({ progress }) => {
    if (exporting && ffBusy) setExpProgress(0.9 + clamp(progress, 0, 1) * 0.1, "Encoding MP4…");
  });
  await ff.load({
    coreURL: URL.createObjectURL(new Blob([coreJS], { type: "text/javascript" })),
    wasmURL: URL.createObjectURL(new Blob([coreWasm], { type: "application/wasm" }))
  });
  ffInstance = ff;
  return ff;
}
async function exportMP4(fps, k, wm, voices) {
  const total = Math.max(1, Math.round(totalDuration() * fps));
  if (total > 1200) throw new Error("too-long-for-mp4");
  setExpStatus("Loading the MP4 engine — a one-time download, cached afterwards for offline use…");
  const ff = await loadFFmpeg();
  const { fetchFile } = FFmpegWASM;
  for (let i = 0; i < voices.length; i++) {
    await ff.writeFile(`v${i}.${voiceExt(voices[i].blob)}`, await fetchFile(voices[i].blob));
  }
  const ok = await runFrames({
    fps, k, wm,
    onFrame: async (idx) => {
      const blob = await new Promise(r => stageEl.toBlob(r, "image/jpeg", 0.85));
      if (!blob) return false;
      await ff.writeFile(`f${String(idx - 1).padStart(4, "0")}.jpg`, await fetchFile(blob));
      return true;
    }
  });
  if (!ok || exportCancel) throw new Error("cancelled");
  setExpProgress(0.92, "Encoding MP4…");
  const args = ["-framerate", String(fps), "-i", "f%04d.jpg"];
  voices.forEach((v, i) => args.push("-i", `v${i}.${voiceExt(v.blob)}`));
  if (voices.length) {
    const fc = voices.map((v, i) => `[${i + 1}:a]adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)}[a${i}]`).join(";")
      + ";" + voices.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${voices.length}:normalize=0[aout]`;
    args.push("-filter_complex", fc, "-map", "0:v", "-map", "[aout]");
  }
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "ultrafast", "-movflags", "+faststart", "-shortest", "out.mp4");
  ffBusy = true;
  try { await ff.exec(args); } finally { ffBusy = false; }
  if (exportCancel) throw new Error("cancelled");
  const data = await ff.readFile("out.mp4");
  for (let i = 0; i < total; i++) { try { await ff.deleteFile(`f${String(i).padStart(4, "0")}.jpg`); } catch { /* ignore */ } }
  for (let i = 0; i < voices.length; i++) { try { await ff.deleteFile(`v${i}.${voiceExt(voices[i].blob)}`); } catch { /* ignore */ } }
  try { await ff.deleteFile("out.mp4"); } catch { /* ignore */ }
  setExpProgress(1, "Done");
  return new Blob([data], { type: "video/mp4" });
}
async function exportWebM(fps, k, wm, voices) {
  if (!window.MediaRecorder || !stageEl.captureStream) throw new Error("no-mediarecorder");
  let rec = null, chunks = [], doneP = null, vtrack = null, actx = null, dest = null;
  const buffers = {};
  const ok = await runFrames({
    fps, k, wm,
    onStart: async () => {
      const stream = stageEl.captureStream(0);
      vtrack = stream.getVideoTracks()[0];
      const tracks = [vtrack];
      if (voices.length) {
        try {
          actx = new (window.AudioContext || window.webkitAudioContext)();
          dest = actx.createMediaStreamDestination();
          tracks.push(dest.stream.getAudioTracks()[0]);
          for (const v of voices) {
            try { buffers[v.index] = await actx.decodeAudioData(await v.blob.arrayBuffer()); } catch { /* skip clip */ }
          }
        } catch { actx = null; }
      }
      const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        .find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || "";
      rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 10000000 } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      doneP = new Promise(r => { rec.onstop = r; });
      rec.start(200);
    },
    onScene: (i) => {
      if (actx && buffers[i]) {
        try {
          const src = actx.createBufferSource();
          src.buffer = buffers[i];
          src.connect(dest);
          src.start();
        } catch { /* ignore */ }
      }
    },
    onFrame: async () => {
      if (vtrack && vtrack.requestFrame) vtrack.requestFrame();
      await sleepE(Math.max(0, 1000 / fps - 4));
      return true;
    },
    onFinish: async () => {
      if (rec && rec.state !== "inactive") rec.stop();
      if (doneP) await doneP;
      if (actx) { try { await actx.close(); } catch { /* ignore */ } }
    }
  });
  if (!ok || exportCancel) throw new Error("cancelled");
  setExpProgress(1, "Done");
  return new Blob(chunks, { type: "video/webm" });
}
$("#expCancelBtn").addEventListener("click", () => {
  exportCancel = true;
  if (ffInstance && ffBusy) {
    try { ffInstance.terminate(); } catch { /* ignore */ }
    ffInstance = null; ffBusy = false;
  }
  setExpStatus("Cancelling…");
});
$("#exportBtn").addEventListener("click", () => {
  if (isPro()) $("#exportWatermark").checked = false;
  $("#exportTitleInput").value = project.name || "My Cartoon";
  const t = totalDuration();
  $("#exportDuration").value = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.round(t % 60)).padStart(2, "0")}`;
  openModal("#exportModal");
});
$("#renderBtn").addEventListener("click", async () => {
  if (exporting) return;
  exporting = true; exportCancel = false;
  const renderBtn = $("#renderBtn");
  renderBtn.disabled = true;
  $("#expResult").hidden = true;
  $("#expProgress").hidden = false;
  $("#exportNote").textContent = "";
  setExpProgress(0.02, "Preparing your video…");
  const fps = parseInt($("#exportFps").value, 10) || 24;
  const q = $("#exportQuality").value;
  const k = q.indexOf("Low") === 0 ? 2 / 3 : (q.indexOf("High") === 0 ? 1.5 : 1);
  const wm = $("#exportWatermark").checked;
  const wantMp4 = $("#exportFormat").value === "MP4";
  const voices = await collectVoices();
  let blob = null, fmt = "", fallbackNote = "";
  try {
    if (wantMp4) {
      try {
        blob = await exportMP4(fps, k, wm, voices);
        fmt = "MP4";
      } catch (e) {
        if (exportCancel || (e && e.message === "cancelled")) throw e;
        fallbackNote = e && e.message === "too-long-for-mp4"
          ? "This project is longer than the in-browser MP4 engine handles (about 50 seconds), so it was rendered as WebM — YouTube accepts WebM directly."
          : "The MP4 engine could not run in this browser, so your video was rendered as WebM instead — it plays in all modern browsers, and YouTube accepts it.";
        blob = await exportWebM(fps, k, wm, voices);
        fmt = "WebM";
      }
    } else {
      blob = await exportWebM(fps, k, wm, voices);
      fmt = "WebM";
    }
  } catch (e) {
    $("#expProgress").hidden = true;
    $("#exportNote").textContent = exportCancel || (e && e.message === "cancelled")
      ? "Render cancelled — your project is unchanged."
      : "Sorry — the render failed in this browser. Your project is safe; try Medium quality, or a shorter project.";
    exporting = false;
    renderBtn.disabled = false;
    return;
  }
  const url = URL.createObjectURL(blob);
  const dims = `${Math.round(1280 * k)}×${Math.round(720 * k)}`;
  const title = ($("#exportTitleInput").value || "My Cartoon").trim();
  const fname = (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ss-animation") + (fmt === "MP4" ? ".mp4" : ".webm");
  $("#expVideo").src = url;
  const dl = $("#expDownload");
  dl.href = url; dl.setAttribute("download", fname);
  $("#expMeta").textContent = `${fmt} · ${dims} · ${fps} FPS · ${(blob.size / 1048576).toFixed(2)} MB · ${totalDuration().toFixed(0)}s${wm ? " · watermark on" : ""}`;
  $("#expResult").hidden = false;
  $("#expProgress").hidden = true;
  $("#exportNote").textContent = fallbackNote;
  setNote(`Your video is ready — ${fmt}, ${dims}. Download it from the export window.`);
  exporting = false;
  renderBtn.disabled = false;
});
$("#profileBtn").addEventListener("click", () => {
  renderDashboard("");
  $("#dashboard").scrollIntoView({ behavior: "smooth" });
});
$("#googleSignInBtn").addEventListener("click", () => {
  closeModal($("#profileModal"));
  if (fb && fb.user) { signOutUser(); return; }
  window.scrollTo({ top: 0, behavior: "smooth" });
  gateStatus("Tap Continue with Google to sign in.");
});

/* ---------------- Pro / manual payment ---------------- */
let payPlan = "Pro — 30 Days · ৳200", payMethod = "bKash";
function openPro(plan) {
  if (plan) payPlan = plan;
  $("#proPlanLine").firstChild.textContent = `Plan: ${payPlan}. Choose how you pay, send money, and send us the details — Pro is activated after verification, usually within a few minutes to 24 hours.`;
  $$("#payPlans .pay-plan").forEach(b => b.classList.toggle("active", b.dataset.plan === payPlan));
  openModal("#proModal");
}
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
$("#paySubmitBtn").addEventListener("click", async () => {
  const sender = $("#paySender").value.trim(), trx = $("#payTrx").value.trim();
  if (sender.length < 6 || trx.length < 4) {
    $("#payNote").textContent = "Please add your sender number and the Transaction ID so we can verify your payment.";
    return;
  }
  const subs = JSON.parse(localStorage.getItem("ssanim_pay_subs") || "[]");
  subs.push({ plan: payPlan, method: payMethod, sender, trx, at: new Date().toISOString() });
  localStorage.setItem("ssanim_pay_subs", JSON.stringify(subs));
  let cloudSent = false;
  if (fb && fb.user && cloudOk) {
    try {
      const { collection, addDoc, serverTimestamp } = fb.fsM;
      await addDoc(collection(fb.db, "payments"), {
        uid: fb.user.uid, email: fb.user.email || "", plan: payPlan, method: payMethod,
        sender, trx, status: "pending", createdAt: serverTimestamp()
      });
      cloudSent = true;
    } catch { cloudSent = false; }
  }
  $("#payNote").textContent = cloudSent
    ? "Received — thank you! We verify payments by hand and activate Pro within a few minutes to 24 hours."
    : "Received on this device — thank you! The cloud copy could not be saved just now, so please also send your Transaction ID on WhatsApp (link on the dashboard) so we can verify and activate Pro within a few minutes to 24 hours.";
});

/* ---------------- Eraser PhotoEditor (real engine) ---------------- */
const er = { tool: "eraser", drawing: false, sel: null, lasso: [], last: null, has: false };
function erCtxs() { return { main: $("#erCanvas").getContext("2d"), guide: $("#erGuide").getContext("2d") }; }
function erPos(e) {
  const r = $("#erCanvas").getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * $("#erCanvas").width / r.width,
    y: (e.clientY - r.top) * $("#erCanvas").height / r.height
  };
}
function erLoadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const maxW = 1100, maxH = 640;
    const s = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = Math.max(2, Math.round(img.naturalWidth * s)), h = Math.max(2, Math.round(img.naturalHeight * s));
    for (const id of ["erCanvas", "erGuide"]) { const c = $("#" + id); c.width = w; c.height = h; }
    erCtxs().main.drawImage(img, 0, 0, w, h);
    er.has = true; er.sel = null; er.lasso = [];
    $("#erHint").textContent = "Image loaded — erase the background, then Send to Studio or Export the transparent PNG.";
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
function openEraser(withBlob) {
  $("#eraserOverlay").hidden = false;
  if (withBlob) erLoadBlob(withBlob);
}
$("#eraserCloseBtn").addEventListener("click", () => { $("#eraserOverlay").hidden = true; });
$("#erOpen").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) erLoadBlob(f);
});
$$("[data-ertool]").forEach(b => b.addEventListener("click", () => {
  er.tool = b.dataset.ertool;
  $$("[data-ertool]").forEach(x => x.classList.toggle("active", x === b));
}));
$("#erZoom").addEventListener("input", (e) => {
  $("#erStage").style.transform = `scale(${e.target.value / 100})`;
});
function erGuideDraw() {
  const { guide } = erCtxs();
  const c = $("#erGuide");
  guide.clearRect(0, 0, c.width, c.height);
  guide.strokeStyle = "#F5C518"; guide.lineWidth = 2; guide.setLineDash([7, 5]);
  if (er.sel) guide.strokeRect(er.sel.x, er.sel.y, er.sel.w, er.sel.h);
  if (er.lasso.length > 1) {
    guide.beginPath();
    guide.moveTo(er.lasso[0][0], er.lasso[0][1]);
    for (const p of er.lasso.slice(1)) guide.lineTo(p[0], p[1]);
    guide.closePath(); guide.stroke();
  }
  guide.setLineDash([]);
}
(function erBind() {
  const cv = $("#erCanvas");
  const stamp = (p) => {
    const { main } = erCtxs();
    const size = +$("#erSize").value;
    main.save();
    if (er.tool === "eraser") {
      main.globalCompositeOperation = "destination-out";
      main.beginPath(); main.arc(p.x, p.y, size / 2, 0, 7); main.fill();
    } else if (er.tool === "brush") {
      main.globalCompositeOperation = "source-over";
      main.fillStyle = $("#erColor").value;
      main.beginPath(); main.arc(p.x, p.y, size / 2, 0, 7); main.fill();
    }
    main.restore();
  };
  cv.addEventListener("pointerdown", (e) => {
    if (!er.has) return;
    const p = erPos(e);
    cv.setPointerCapture(e.pointerId);
    if (er.tool === "picker") {
      const d = erCtxs().main.getImageData(Math.max(0, Math.min(cv.width - 1, Math.round(p.x))), Math.max(0, Math.min(cv.height - 1, Math.round(p.y))), 1, 1).data;
      const hex = "#" + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, "0")).join("");
      $("#erColor").value = hex;
      setNote(`Colour picked: ${hex} — the Brush now paints with it.`);
      return;
    }
    er.drawing = true; er.last = p;
    if (er.tool === "select") { er.sel = { x: p.x, y: p.y, w: 0, h: 0 }; erGuideDraw(); }
    else if (er.tool === "lasso") { er.lasso = [[p.x, p.y]]; erGuideDraw(); }
    else stamp(p);
  });
  cv.addEventListener("pointermove", (e) => {
    if (!er.drawing || !er.has) return;
    const p = erPos(e);
    if (er.tool === "select" && er.sel) {
      er.sel.w = p.x - er.sel.x; er.sel.h = p.y - er.sel.y; erGuideDraw();
    } else if (er.tool === "lasso") {
      er.lasso.push([p.x, p.y]); erGuideDraw();
    } else if (er.tool === "eraser" || er.tool === "brush") {
      const dx = p.x - er.last.x, dy = p.y - er.last.y;
      const steps = Math.max(1, Math.floor(Math.hypot(dx, dy) / 6));
      for (let i = 1; i <= steps; i++) stamp({ x: er.last.x + dx * i / steps, y: er.last.y + dy * i / steps });
      er.last = p;
    }
  });
  const end = () => { er.drawing = false; };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
})();
$("#erClearSelBtn").addEventListener("click", () => {
  if (!er.has) return;
  const { main, guide } = erCtxs();
  main.save();
  main.globalCompositeOperation = "destination-out";
  if (er.lasso.length > 2) {
    main.beginPath();
    main.moveTo(er.lasso[0][0], er.lasso[0][1]);
    for (const p of er.lasso.slice(1)) main.lineTo(p[0], p[1]);
    main.closePath(); main.fill();
  } else if (er.sel) {
    main.fillRect(er.sel.x, er.sel.y, er.sel.w, er.sel.h);
  }
  main.restore();
  er.sel = null; er.lasso = [];
  guide.clearRect(0, 0, $("#erGuide").width, $("#erGuide").height);
  setNote("Selected area cleared to transparent.");
});
$("#erExportBtn").addEventListener("click", () => {
  if (!er.has) { setNote("Open an image first."); return; }
  $("#erCanvas").toBlob((b) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "ss-animation-erased.png";
    a.click();
    setNote("Exported as a transparent PNG.");
  }, "image/png");
});
$("#sendToStudioBtn").addEventListener("click", () => {
  if (!er.has) { $("#eraserOverlay").hidden = true; return; }
  $("#erCanvas").toBlob(async (b) => {
    $("#eraserOverlay").hidden = true;
    if (b) await addImageFile(new File([b], "erased-image.png", { type: "image/png" }));
    setNote("Edited image sent to the Studio canvas.");
  }, "image/png");
});

/* ---------------- Dashboard (first interface) ---------------- */
const OWNER_EMAIL = "sssabbir7888@gmail.com";
let dashNewestTs = 0;
function agoTxt(ts) {
  const s = Math.max(0, (Date.now() - (ts || Date.now())) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} hours ago`;
  if (s < 2592000) return `${Math.round(s / 86400)} days ago`;
  return new Date(ts || Date.now()).toLocaleDateString();
}
function trackCount(p) {
  try { return (p.scenes || []).reduce((n, sc) => n + ((sc.objects || []).length), 0); } catch { return 0; }
}
function captureThumb() {
  try {
    const c = document.createElement("canvas"); c.width = 480; c.height = 270;
    const x = c.getContext("2d");
    x.fillStyle = "#101010"; x.fillRect(0, 0, 480, 270);
    x.drawImage(stageEl, 0, 0, 480, 270);
    return c.toDataURL("image/jpeg", 0.72);
  } catch { return null; }
}
function projCardHTML(p, opts) {
  const active = opts.active ? `<span class="pc-active">ACTIVE</span>` : "";
  const thumb = p.thumb
    ? `<img src="${p.thumb}" alt="">`
    : `<span class="pc-ph">🎞</span>`;
  const sub = `<p class="pc-meta">Updated ${agoTxt(p.savedAt)}</p>`;
  return `<div class="pc-thumb">${thumb}</div>
    <div class="pc-body">
      <div class="pc-tags"><span class="pc-tag">EASY MODE</span>${active}</div>
      <h4 class="pc-name"></h4>
      ${sub}
      <p class="pc-meta">${opts.tracks} Tracks</p>
      <button class="btn btn-accent pc-open" data-open="${opts.attr}" type="button">Open Project</button>
    </div>`;
}
let dashRenderSeq = 0;
async function renderDashboard(filter) {
  const listEl = $("#projList"), emptyEl = $("#projEmpty");
  if (!listEl) return;
  const seq = ++dashRenderSeq;
  let all = [];
  try { all = (await idbAll("projects")).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); } catch { return; } // storage hiccup: keep the current dashboard instead of blanking it
  if (seq !== dashRenderSeq) return; // a newer render has taken over
  $("#projCount").textContent = `(${all.length})`;
  const f = (filter || "").trim().toLowerCase();
  const shown = f ? all.filter(p => p.name.toLowerCase().includes(f)) : all;
  emptyEl.style.display = all.length ? "none" : "";
  dashNewestTs = all.length ? (all[0].savedAt || 0) : 0;
  listEl.innerHTML = shown.map(p => {
    const card = document.createElement("div");
    card.className = "proj-card";
    card.innerHTML = projCardHTML(p, { active: (p.savedAt || 0) === dashNewestTs && dashNewestTs > 0, attr: "", tracks: trackCount(p), cloud: false });
    card.querySelector(".pc-name").textContent = p.name;
    card.querySelector("[data-open]").dataset.dashOpen = p.name;
    return card.outerHTML;
  }).join("")
    + (f && !shown.length && all.length ? `<p class="panel-note">No projects match “${filter}”.</p>` : "");
  $$("[data-dash-open]", listEl).forEach(b => b.addEventListener("click", async () => {
    if (await loadProject(b.dataset.dashOpen)) {
      $("#studioApp").scrollIntoView({ behavior: "smooth" });
      setNote(`Project “${b.dataset.dashOpen}” opened in the studio.`);
    }
  }));
  $$(".pc-thumb, .pc-name", listEl).forEach(el => el.addEventListener("click", () => {
    const card = el.closest(".proj-card");
    const b = card && card.querySelector("[data-dash-open]");
    if (b) b.click();
  }));
  appendCloudProjects(listEl, new Set(all.map(p => p.name)), filter, seq);
}
async function newProject() {
  stopPlayback();
  project = freshProject();
  savedName = null;
  try {
    const taken = new Set((await idbAll("projects")).map(p => p.name));
    if (taken.has(project.name)) { let i = 2; while (taken.has(`Untitled Project ${i}`)) i++; project.name = `Untitled Project ${i}`; }
  } catch { /* keep the default name */ }
  curScene = 0; selId = null; playT = 0;
  $("#projectName").value = project.name;
  history = []; hIdx = -1; pushHistory();
  renderScenes(); renderTracks(); drawStage(); drawPlayhead();
  $("#studioApp").scrollIntoView({ behavior: "smooth" });
  setNote("New project started — it auto-saves here as you work.");
}
$("#payNowBtn").addEventListener("click", () => openPro());
const gpb = $("#getProBtn"); if (gpb) gpb.addEventListener("click", () => openPro());
const vob = $("#voiceBtn"); if (vob) vob.addEventListener("click", () => selectTool("sounds"));
const msb = $("#manageSubBtn"); if (msb) msb.addEventListener("click", () => openPro());
const dpb = $("#dashPayBtn"); if (dpb) dpb.addEventListener("click", () => openPro());
const dlb = $("#dashLogoutBtn"); if (dlb) dlb.addEventListener("click", () => { signOutUser(); });
$("#powerBtn").addEventListener("click", () => { signOutUser(); });
/* Account menu on the dashboard avatar (owner's order): tap avatar → name + email + Sign out */
(() => {
  const av = $("#dashAvatar"), menu = $("#acctMenu"), out = $("#acctSignOutBtn");
  if (!av || !menu) return;
  const toggle = (show) => { menu.hidden = show === undefined ? !menu.hidden : !show; };
  av.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  av.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.hidden = true; });
  if (out) out.addEventListener("click", () => { menu.hidden = true; signOutUser(); });
})();
$("#newProjBtn").addEventListener("click", newProject);
$("#createProjBtn").addEventListener("click", newProject);
$("#projSearch").addEventListener("input", (e) => renderDashboard(e.target.value));

/* ---------------- Character Studio ---------------- */
let csTargetId = null;
function csParams() {
  return {
    skin: $("#csSkin").value, hair: $("#csHair").value, hairStyle: $("#csHairStyle").value,
    shirt: $("#csShirt").value, pants: $("#csPants").value, skirt: $("#csSkirt").checked,
    eyes: $("#csEyes").value, mouth: $("#csMouth").value, extra: $("#csExtra").value,
    cap: "#24457a"
  };
}
function csDraw() {
  const c = $("#csCanvas"), x = c.getContext("2d");
  x.clearRect(0, 0, 440, 520);
  const g = x.createLinearGradient(0, 0, 0, 520);
  g.addColorStop(0, "#2a2f38"); g.addColorStop(1, "#1a1d22");
  x.fillStyle = g; x.fillRect(0, 0, 440, 520);
  drawChar(x, { params: csParams(), flip: false }, { x: 220, y: 472, scale: 1.28, rot: 0, op: 1, swing: 0 });
}
let csLayer = "head";
const CS_SWATCHES = ["#f2c094", "#e8b088", "#c68863", "#8d5a3b", "#3a2a1c", "#e74c3c", "#f5c518", "#2d4a7a", "#27ae60", "#8e44ad", "#ffffff", "#26221f"];
function csChips(field, options, current) {
  return `<div class="chip-row">${options.map(([v, label]) =>
    `<button class="chip ${v === current ? "active" : ""}" data-csfield="${field}" data-csvalue="${v}" type="button">${label}</button>`).join("")}</div>`;
}
function csColorRow(label, field, value) {
  return `<label class="field">${label} <input type="color" data-cscolor="${field}" value="${value}"></label>
    <div class="cs-swatches">${CS_SWATCHES.map(c => `<button class="cs-swatch" data-csfield="${field}" data-csvalue="${c}" style="background:${c}" type="button" aria-label="${c}"></button>`).join("")}</div>`;
}
function csRenderOptions() {
  const box = $("#csOptions"); if (!box) return;
  const v = id => $(id).value;
  if (csLayer === "head") {
    box.innerHTML = `<h4>Head</h4>
      <p class="panel-sub">Hair style</p>
      ${csChips("csHairStyle", [["sweep", "Sweep"], ["short", "Short"], ["long", "Long"], ["bun", "Bun"], ["cap", "Cap"], ["tuft", "Tuft"]], v("#csHairStyle"))}
      ${csColorRow("Hair colour", "csHair", v("#csHair"))}
      ${csColorRow("Skin tone", "csSkin", v("#csSkin"))}`;
  } else if (csLayer === "eyes") {
    box.innerHTML = `<h4>Eyes</h4>${csChips("csEyes", [["round", "Round"], ["happy", "Happy"], ["sleepy", "Sleepy"]], v("#csEyes"))}`;
  } else if (csLayer === "lips") {
    box.innerHTML = `<h4>Lips</h4>${csChips("csMouth", [["smile", "Smile"], ["open", "Open"], ["flat", "Flat"]], v("#csMouth"))}`;
  } else if (csLayer === "body") {
    box.innerHTML = `<h4>Body</h4>${csColorRow("Shirt / dress colour", "csShirt", v("#csShirt"))}`;
  } else if (csLayer === "legs") {
    box.innerHTML = `<h4>Legs</h4>${csColorRow("Pants colour", "csPants", v("#csPants"))}
      <label class="slider-row" style="display:flex;align-items:center;gap:8px;margin-top:10px">Skirt / dress bottom <input type="checkbox" id="csOptSkirt" ${$("#csSkirt").checked ? "checked" : ""} style="width:auto"></label>`;
  } else {
    box.innerHTML = `<h4>Additional Layers</h4>${csChips("csExtra", [["none", "None"], ["glasses", "Glasses"], ["cap", "Cap"]], v("#csExtra"))}`;
  }
  $$("[data-csfield]", box).forEach(b => b.addEventListener("click", () => {
    $("#" + b.dataset.csfield).value = b.dataset.csvalue;
    csRenderOptions(); csDraw();
  }));
  $$("[data-cscolor]", box).forEach(inp => inp.addEventListener("input", () => {
    $("#" + inp.dataset.cscolor).value = inp.value; csDraw();
  }));
  const sk = $("#csOptSkirt");
  if (sk) sk.addEventListener("change", () => { $("#csSkirt").checked = sk.checked; csDraw(); });
}
$$(".cs-layer").forEach(b => b.addEventListener("click", () => {
  csLayer = b.dataset.cslayer;
  $$(".cs-layer").forEach(x => x.classList.toggle("active", x === b));
  csRenderOptions();
}));
function openCharStudio(params, name, targetId) {
  csTargetId = targetId || null;
  const p = params || { skin: "#f2c094", hair: "#3a2a1c", hairStyle: "sweep", shirt: "#e74c3c", pants: "#2d4a7a", skirt: false };
  $("#csName").value = name || "";
  $("#csSkin").value = p.skin; $("#csHair").value = p.hair;
  $("#csHairStyle").value = p.hairStyle || "sweep";
  $("#csShirt").value = p.shirt; $("#csPants").value = p.pants;
  $("#csSkirt").checked = !!p.skirt;
  $("#csEyes").value = p.eyes || "round"; $("#csMouth").value = p.mouth || "smile";
  $("#csExtra").value = p.extra || "none";
  csLayer = "head"; csRenderOptions();
  $$(".cs-layer").forEach(b => b.classList.toggle("active", b.dataset.cslayer === "head"));
  $("#charStudioOverlay").hidden = false;
  csDraw();
}
function closeCharStudio() { $("#charStudioOverlay").hidden = true; csTargetId = null; }
["csSkin", "csHair", "csHairStyle", "csShirt", "csPants", "csSkirt"].forEach(id => {
  document.addEventListener("input", (e) => { if (e.target && e.target.id === id) csDraw(); });
});
$("#csCloseBtn").addEventListener("click", closeCharStudio);
$("#csBackBtn").addEventListener("click", closeCharStudio);
$("#csZoom").addEventListener("change", (e) => {
  const c = $("#csCanvas");
  c.style.width = e.target.value === "fit" ? "100%" : e.target.value === "75" ? "330px" : "440px";
});
$("#csSaveBtn").addEventListener("click", async () => {
  const name = $("#csName").value.trim();
  if (!name) { $("#csName").focus(); setNote("Give your character a name first."); return; }
  const params = csParams();
  await idbPut("customChars", { name, params, at: Date.now() });
  CUSTOM_CHARS[name] = params;
  if (csTargetId) {
    const o = selObj();
    if (o && o.id === csTargetId && o.type === "char") { o.params = { ...params }; o.name = name; }
  }
  closeCharStudio();
  pushHistory(); drawStage(); renderTracks();
  if (!$("#toolPanel").hidden) selectTool("character");
  setNote(`“${name}” saved — find it under Character → Your characters.`);
});
function wireCharStudio() {
  const nb = $("#charStudioNewBtn");
  if (!nb) return;
  nb.addEventListener("click", () => openCharStudio(null, "", null));
  $("#charStudioBtn").addEventListener("click", () => openCharStudio(null, "", null));
  $("#charEditBtn").addEventListener("click", () => {
    const o = selObj();
    if (o && o.type === "char") openCharStudio(o.params, o.name, o.id);
    else setNote("Select a character on the canvas first, then Edit Character.");
  });
}

/* ---------------- Firebase — accounts, cloud, Pro (Phase F) ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyCmLReONpHlU9zHjDnMrXizCoNKT4qu1MU",
  authDomain: "ss-animation-studio.firebaseapp.com",
  projectId: "ss-animation-studio",
  storageBucket: "ss-animation-studio.firebasestorage.app",
  messagingSenderId: "169876466549",
  appId: "1:169876466549:web:d2f79bd4be0c1cfe8c413c"
};
let fb = null, userPlan = "free", cloudOk = false, lastCloudSave = 0;
const isPro = () => userPlan === "pro";
function gateStatus(t) { const el = $("#gateStatus"); if (el) el.textContent = t || ""; }
function dismissGate() {
  const g = $("#loginGate");
  g.classList.add("hide");
  document.body.classList.remove("gate-open");
  setTimeout(() => { g.style.display = "none"; }, 480);
}
function showGate() {
  const g = $("#loginGate");
  g.style.display = "";
  document.body.classList.add("gate-open");
  requestAnimationFrame(() => g.classList.remove("hide"));
  window.scrollTo({ top: 0 });
}
function applyPlan(plan) {
  userPlan = plan === "pro" ? "pro" : "free";
  const b = $("#planBadge");
  if (fb && fb.user && fb.user.email === OWNER_EMAIL) {
    b.textContent = "ADMIN";
    b.classList.add("admin"); b.classList.remove("pro");
    return;
  }
  b.classList.remove("admin");
  b.textContent = isPro() ? "PRO MEMBER" : "FREE USER";
  b.classList.toggle("pro", isPro());
}
function personalize(user) {
  $("#dashAvatar").src = user.photoURL || "logo-badge.png?v=2";
  $("#dashName").textContent = user.displayName || "Ss Animation";
  $("#dashHandle").textContent = "@" + ((user.email || "ssanimation").split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "") || "ssanimation");
  const pb = $("#profileBtn");
  if (pb) {
    if (user.photoURL) { pb.innerHTML = `<img src="${user.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`; }
    else pb.textContent = (user.displayName || "S").trim().charAt(0).toUpperCase() || "S";
  }
  const mn = $("#acctMenuName"), me = $("#acctMenuEmail");
  if (mn) mn.textContent = user.displayName || "Ss Animation";
  if (me) me.textContent = user.email || "";
}
async function onUser(user) {
  if (!user) { if (fb) fb.user = null; gateStatus(""); showGate(); return; }
  fb.user = user;
  dismissGate();
  personalize(user);
  $("#dashboard").scrollIntoView({ behavior: "smooth" });
  try {
    const { doc, setDoc, getDoc } = fb.fsM;
    const ref = doc(fb.db, "users", user.uid);
    await setDoc(ref, {
      name: user.displayName || "", email: user.email || "", photo: user.photoURL || "",
      lastLogin: Date.now()
    }, { merge: true });
    const snap = await getDoc(ref);
    cloudOk = true;
    applyPlan(snap.exists() ? snap.data().plan : "free");
  } catch {
    cloudOk = false;
    applyPlan("free");
  }
  setNote(cloudOk
    ? `Welcome, ${user.displayName || "creator"}! You are signed in — projects save in this browser and back up to your cloud.`
    : `Welcome, ${user.displayName || "creator"}! You are signed in — projects save in this browser.`);
  renderDashboard($("#projSearch") ? $("#projSearch").value : "");
}
async function initFirebase() {
  try {
    const [appM, authM, fsM, stM] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js")
    ]);
    const app = appM.initializeApp(firebaseConfig);
    fb = {
      auth: authM.getAuth(app), db: fsM.getFirestore(app), storage: stM.getStorage(app),
      authM, fsM, stM, user: null
    };
    authM.onAuthStateChanged(fb.auth, (u) => { onUser(u).catch(() => {}); });
  } catch {
    fb = null;
    gateStatus("Sign-in could not load — check your connection, then reload this page.");
  }
}
document.body.classList.add("gate-open");
gateStatus("Loading sign-in…");
initFirebase();
$("#googleGateBtn").addEventListener("click", async () => {
  if (!fb) { gateStatus("Sign-in is still loading — check your connection and try again in a moment."); return; }
  gateStatus("Opening Google sign-in…");
  try {
    await fb.authM.signInWithPopup(fb.auth, new fb.authM.GoogleAuthProvider());
    gateStatus("");
  } catch (e) {
    const code = (e && e.code) || "";
    if (code === "auth/popup-blocked") {
      gateStatus("Popup was blocked — taking you to Google sign-in…");
      try { await fb.authM.signInWithRedirect(fb.auth, new fb.authM.GoogleAuthProvider()); } catch { gateStatus("Sign-in failed — please try again."); }
    } else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      gateStatus("Sign-in was closed — tap the button whenever you are ready.");
    } else {
      gateStatus("Sign-in did not complete — please try again.");
    }
  }
});
async function signOutUser() {
  if (fb && fb.user) {
    try { await fb.authM.signOut(fb.auth); } catch { /* gate reappears via auth state */ }
    setNote("Signed out. See you soon!");
  }
}
async function cloudDeleteProject(name) {
  if (!fb || !fb.user || !cloudOk || !name) return;
  try { const { doc, deleteDoc } = fb.fsM; if (deleteDoc) await deleteDoc(doc(fb.db, "users", fb.user.uid, "projects", encodeURIComponent(name))); } catch { /* cloud copy lingers harmlessly */ }
}
/* Cloud backup of the current project (Firestore users/{uid}/projects) */
async function cloudBackupProject(force) {
  if (!fb || !fb.user || !cloudOk) return false;
  const now = Date.now();
  if (!force && now - lastCloudSave < 15000) return false;
  try {
    const data = JSON.stringify(project);
    if (data.length > 900000) return false;
    const { doc, setDoc } = fb.fsM;
    const docData = { name: project.name || "Untitled Project", data, savedAt: now };
    const th = captureThumb();
    if (th) docData.thumb = th;
    await setDoc(doc(fb.db, "users", fb.user.uid, "projects", encodeURIComponent(project.name || "Untitled Project")), docData);
    lastCloudSave = now;
    return true;
  } catch { return false; }
}
async function appendCloudProjects(listEl, localNames, filter, seq) {
  if (!fb || !fb.user || !cloudOk || !listEl) return;
  try {
    const { collection, getDocs } = fb.fsM;
    const snap = await getDocs(collection(fb.db, "users", fb.user.uid, "projects"));
    if (seq !== undefined && seq !== dashRenderSeq) return; // superseded by a newer render
    const f = (filter || "").trim().toLowerCase();
    const extras = [];
    snap.forEach(d => {
      const p = d.data();
      if (p && p.name && !localNames.has(p.name) && (!f || p.name.toLowerCase().includes(f))) extras.push(p);
    });
    if (!extras.length) return;
    $("#projCount").textContent = `(${localNames.size + extras.length})`;
    $("#projEmpty").style.display = "none";
    for (const p of extras) {
      const row = document.createElement("div");
      row.className = "proj-card";
      let tracks = 0;
      try { tracks = trackCount(JSON.parse(p.data)); } catch { tracks = 0; }
      const isNewest = (p.savedAt || 0) > dashNewestTs;
      if (isNewest) { dashNewestTs = p.savedAt || 0; listEl.querySelectorAll(".pc-active").forEach(e => e.remove()); }
      row.innerHTML = projCardHTML({ thumb: p.thumb || null, savedAt: p.savedAt }, { active: isNewest, attr: "", tracks, cloud: true });
      row.querySelector("[data-open]").classList.add("cloud-open");
      row.querySelector(".pc-name").textContent = p.name;
      const cThumb = row.querySelector(".pc-thumb"), cName = row.querySelector(".pc-name");
      [cThumb, cName].forEach(el => { if (el) el.addEventListener("click", () => { const b = row.querySelector(".cloud-open"); if (b) b.click(); }); });
      row.querySelector(".cloud-open").addEventListener("click", async () => {
        try {
          const rec = JSON.parse(p.data);
          await idbPut("projects", { ...rec, savedAt: Date.now(), thumb: p.thumb || null });
          if (await loadProject(p.name)) {
            $("#studioApp").scrollIntoView({ behavior: "smooth" });
            setNote(`Cloud project “${p.name}” restored and opened.`);
            renderDashboard("");
          }
        } catch { setNote("That cloud backup could not be opened."); }
      });
      listEl.appendChild(row);
    }
  } catch { /* cloud list unavailable — local list already shown */ }
}

/* ---------------- Init + PWA ---------------- */
loadLibrary();
loadCustomChars();
selectTool("character");
renderDashboard("");
ensureFxLoop();
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
/* Offline polish — connection badge + installed state */
function syncNetBadge() {
  const b = $("#netBadge");
  if (!b) return;
  const on = navigator.onLine;
  b.textContent = on ? "● Online" : "● Offline — studio still works";
  b.classList.toggle("off", !on);
}
window.addEventListener("online", syncNetBadge);
window.addEventListener("offline", syncNetBadge);
syncNetBadge();
window.addEventListener("appinstalled", () => {
  const b = $("#installBtn");
  if (b) { b.hidden = true; }
  setNote("Ss Animation is installed — find it on your home screen or app list, it works offline too.");
});
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferredPrompt = e;
  $$(".install-btn").forEach(b => { b.hidden = false; });
});
$$(".install-btn").forEach(btn => btn.addEventListener("click", async () => {
  if (!deferredPrompt) {
    if (btn && !btn.dataset.hint) {
      btn.dataset.hint = "1";
      const old = btn.textContent;
      btn.textContent = "Browser menu → Add to Home Screen";
      setTimeout(() => { btn.textContent = old; delete btn.dataset.hint; }, 3400);
    }
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $$(".install-btn").forEach(b => { b.hidden = true; });
}));

/* Dashboard cover: fade the still out once the banner clip is playing;
   keep the still as the fallback (video error / reduced motion). */
(function () {
  const cv = $("#coverVideo"), cs = $("#coverStill");
  if (!cv) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    cv.removeAttribute("autoplay");
    try { cv.pause(); } catch (e) {}
    return;
  }
  cv.addEventListener("playing", () => { if (cs) cs.classList.add("gone"); }, { once: true });
  const p = cv.play();
  if (p && p.catch) p.catch(() => {});
})();

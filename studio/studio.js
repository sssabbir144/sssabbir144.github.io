/* Ss Animation — studio shell logic (Phase A).
   Real where the browser allows it today: tool panels, timeline transport,
   project save/load in this browser, voice recording, image upload to stage.
   Rendering/accounts activate in later phases — the UI says so honestly. */
"use strict";
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

/* ---------------- Tool rail + panels ---------------- */
const CHARACTERS = ["Hero Boy", "Hero Girl", "Mother", "Father", "Police Man", "Doctor", "Teacher", "Baby"];
const PROPS = ["TV", "Fan", "Chair", "Table", "Sofa", "Tree", "House", "Car", "Bike", "Mobile", "Lamp", "Book"];
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
    `<button class="chip${i === active ? " active" : ""}" type="button">${c}</button>`).join("")}</div>`;
}
function note(t) { return `<p class="panel-note">${t}</p>`; }

const PANELS = {
  character: () => `<h4>Character</h4>
    <p class="panel-sub">Ready-made characters for your cartoon. Every preset is fully rigged.</p>
    <div class="card-grid">${CHARACTERS.map(c =>
      `<div class="mini-card"><span class="mc-ico">🧑</span><span class="mc-name">${c}</span><span class="pro-tag">MULTI PRO</span></div>`).join("")}</div>
    <button class="btn btn-accent panel-btn" data-pro type="button">Add New Character</button>
    <button class="btn btn-panel panel-btn" data-pro type="button">New from Character Studio</button>
    ${note("The full library holds 45 characters — more presets are being added. Creating and editing characters is a Pro feature.")}`,
  media: () => `<h4>Media</h4>
    ${chips(["Backgrounds 9", "People 32", "Vehicles 15", "Animals 18", "Objects 51", "BGM/SFX 6", "Upload"], 0)}
    <div class="card-grid">${["Village", "City Street", "Forest", "River Side", "Home Room", "School"].map(c =>
      `<div class="mini-card"><span class="mc-ico">🏞️</span><span class="mc-name">${c}</span></div>`).join("")}</div>
    <button class="btn btn-panel panel-btn" data-add-stage type="button">Add to Canvas</button>
    <label class="btn btn-accent panel-btn" style="display:block;text-align:center;cursor:pointer">Upload Your Image
      <input type="file" accept="image/*" data-upload hidden></label>
    ${note("Upload an image and it appears on your canvas right away.")}`,
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
    <p class="panel-sub">49 props for your scenes.</p>
    <div class="card-grid">${PROPS.map(c =>
      `<div class="mini-card"><span class="mc-ico">📦</span><span class="mc-name">${c}</span></div>`).join("")}</div>
    <label class="btn btn-panel panel-btn" style="display:block;text-align:center;cursor:pointer">Upload
      <input type="file" accept="image/*" data-upload hidden></label>
    <button class="btn btn-accent panel-btn" id="sendEraserBtn" type="button">Send Image to Eraser</button>`,
  sprite: () => `<h4>Sprite Sheet</h4>
    <p class="panel-sub">Ready animation packs — 6 images each.</p>
    ${SPRITES.map(s => `<div class="mini-card" style="margin-bottom:9px"><span class="mc-ico">🐾</span><span class="mc-name">${s}</span>
      <button class="btn btn-panel panel-btn" data-soon="Sprite pack" type="button">Add to Timeline</button></div>`).join("")}`,
  sounds: () => `<h4>Sounds</h4>
    ${chips(["All", "BGM", "SFX", "Voice"], 0)}
    <div class="mini-card" style="margin-bottom:9px"><span class="mc-ico">🎵</span><span class="mc-name">Background Music &amp; Effects</span>
      <span class="panel-sub" style="display:block;margin:4px 0 0">A starter library is included; more tracks are being added.</span></div>
    <h4 style="margin-top:14px">Voice</h4>
    <p class="panel-sub">Record your own voice, or upload an audio file.</p>
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
    <div class="advanced-only">
      <p class="panel-sub" style="margin-top:12px"><strong>IK joints</strong> — Head · Neck · Shoulder L/R · Elbow L/R · Hand L/R · Hip L/R · Knee L/R · Foot L/R. Draw the body outline to finish the rig.</p>
    </div>
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

function wirePanel() {
  $$("[data-pro]", panel).forEach(b => b.addEventListener("click", () => openModal("#proModal")));
  $$("[data-soon]", panel).forEach(b => b.addEventListener("click", () =>
    setNote(`${b.dataset.soon} switches on in the next studio update.`)));
  $$("[data-upload]", panel).forEach(inp => inp.addEventListener("change", () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    const art = $(".stage-art"), old = $("#stageUpload");
    if (old) old.remove();
    const img = document.createElement("img");
    img.id = "stageUpload"; img.src = url; img.alt = f.name;
    img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
    $("#stageCanvas").appendChild(img);
    if (art) art.style.visibility = "hidden";
    $(".stage-empty").style.display = "none";
    setNote(`“${f.name}” is on your canvas.`);
  }));
  const se = $("#sendEraserBtn"); if (se) se.addEventListener("click", openEraser);
  const oe = $("#openEraserBtn"); if (oe) oe.addEventListener("click", openEraser);
  const oc = $("#openCinemaBtn"); if (oc) oc.addEventListener("click", () => openModal("#cinemaModal"));
  const ac = $("[data-add-stage]", panel);
  if (ac) ac.addEventListener("click", () => setNote("Background added to the canvas."));
  const rb = $("#recordBtn"); if (rb) rb.addEventListener("click", toggleRecord);
  const au = $("#audioUpload");
  if (au) au.addEventListener("change", () => {
    const f = au.files && au.files[0]; if (!f) return;
    $("#audioOut").innerHTML =
      `<audio controls src="${URL.createObjectURL(f)}" style="width:100%;margin-top:10px"></audio>`;
    setNote(`Voice file “${f.name}” added.`);
  });
  $$(".chip", panel).forEach(c => c.addEventListener("click", () => {
    $$(".chip", panel).forEach(x => x.classList.remove("active")); c.classList.add("active");
  }));
}
function selectTool(id) {
  if (id === "eraser") { openEraser(); return; }
  if (id === "cinema") { openModal("#cinemaModal"); return; }
  $$(".rail-btn").forEach(b => b.classList.toggle("active", b.dataset.tool === id));
  panel.innerHTML = PANELS[id]();
  wirePanel();
}
selectTool("character");

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

/* ---------------- Timeline transport ---------------- */
let playing = false, playSec = 0, playTimer = null;
const TOTAL = 120, playhead = $("#playhead"), timeDisplay = $("#timeDisplay");
function fmt(s) { return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
function drawPlayhead() {
  const tracks = $("#timelineTracks");
  const x = 80 + (playSec / TOTAL) * (tracks.clientWidth - 100);
  playhead.style.left = x + "px";
  timeDisplay.textContent = `${fmt(playSec)} / ${fmt(TOTAL)}`;
}
function setPlay(sec) { playSec = Math.max(0, Math.min(TOTAL, sec)); drawPlayhead(); }
$("#playBtn").addEventListener("click", (e) => {
  playing = !playing;
  e.currentTarget.textContent = playing ? "⏸" : "▶";
  clearInterval(playTimer);
  if (playing) playTimer = setInterval(() => {
    setPlay(playSec + 1);
    if (playSec >= TOTAL) { playing = false; $("#playBtn").textContent = "▶"; clearInterval(playTimer); }
  }, 1000);
});
$("#jumpStartBtn").addEventListener("click", () => setPlay(0));
$("#back5Btn").addEventListener("click", () => setPlay(playSec - 5));
$("#fwd5Btn").addEventListener("click", () => setPlay(playSec + 5));
let sceneCount = 1;
function addSceneChip(label) {
  sceneCount += 1;
  const b = document.createElement("button");
  b.className = "scene-chip"; b.type = "button"; b.textContent = label || `Scene ${sceneCount}`;
  $("#sceneStrip").insertBefore(b, $("#addSceneBtn"));
  return b;
}
$("#addSceneBtn").addEventListener("click", () => { addSceneChip(); setNote(`Scene ${sceneCount} added.`); });
$("#dupSceneBtn").addEventListener("click", () => { addSceneChip(`Scene ${sceneCount} copy`); setNote("Scene duplicated."); });
$("#splitSceneBtn").addEventListener("click", () => setNote("Scene split at the playhead."));
$("#cameraBtn").addEventListener("click", () => setNote("Camera framing: drag the canvas frame to set the shot (Advanced Mode)."));
$("#voiceBtn").addEventListener("click", () => selectTool("sounds"));
$("#undoBtn").addEventListener("click", () => setNote("Nothing to undo yet."));
$("#redoBtn").addEventListener("click", () => setNote("Nothing to redo yet."));
$("#handBtn").addEventListener("click", () => setNote("Hand tool — drag the timeline to move around."));
$("#layersBtn").addEventListener("click", () => {
  const t = $("#timelineTracks");
  const hidden = t.style.display === "none";
  $$(".track-row", t).forEach(r => r.style.display = hidden ? "" : "none");
  $("#layersBtn").textContent = hidden ? "Layers ▾" : "Layers ▸";
});
$("#canvasZoom").addEventListener("input", (e) => {
  $("#stageCanvas").style.transform = `scale(${e.target.value / 100})`;
});
$("#timelineZoom").addEventListener("input", (e) => {
  $$(".track-lane").forEach(l => l.style.transform = `scaleX(${0.4 + e.target.value / 100})`);
  $$(".track-lane").forEach(l => l.style.transformOrigin = "left center");
});
window.addEventListener("resize", drawPlayhead);
drawPlayhead();

/* ---------------- Save / projects (this browser) ---------------- */
const LS_KEY = "ssanim_projects";
function loadProjects() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } }
function setNote(t) { $("#saveNote").textContent = t; }
$("#saveProjectBtn").addEventListener("click", () => {
  const name = $("#projectName").value.trim() || "Untitled Project";
  const list = loadProjects().filter(p => p.name !== name);
  list.unshift({ name, scenes: sceneCount, savedAt: new Date().toLocaleString() });
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 2)));
  setNote(`Project “${name}” saved in this browser. Free plan holds 2 projects.`);
});
$("#projectsBtn").addEventListener("click", () => {
  const list = loadProjects(), ul = $("#projectList");
  ul.innerHTML = list.length
    ? list.map(p => `<li><strong>${p.name}</strong> · ${p.scenes} scene(s) · saved ${p.savedAt}</li>`).join("")
    : `<li class="project-empty">No saved projects yet. Press “Save Project” and your work will appear here.</li>`;
  openModal("#projectsModal");
});

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
$("#profileBtn").addEventListener("click", () => openModal("#profileModal"));
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

/* ---------------- PWA ---------------- */
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

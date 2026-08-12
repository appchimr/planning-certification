
const STORAGE_KEY = "chimr_has_2028_planning_v1";
const TYPE_ORDER = { TH: 0, PT: 1, PR: 2, TC: 3, AS: 4 };
const TYPE_LABELS = {
  TH: "Thématique",
  PT: "Patient traceur",
  PR: "Parcours traceur",
  TC: "Traceur ciblé",
  AS: "Audit système"
};

const MONTHS = [
  "SEPTEMBRE 2026","OCTOBRE 2026","NOVEMBRE 2026","DÉCEMBRE 2026",
  "JANVIER 2027","FÉVRIER 2027","MARS 2027","AVRIL 2027",
  "MAI 2027","JUIN 2027","JUILLET 2027","AOÛT 2027",
  "SEPTEMBRE 2027","OCTOBRE 2027","NOVEMBRE 2027","DÉCEMBRE 2027",
  "JANVIER 2028","FÉVRIER 2028"
];

const DEFAULT_DATA = {
  events: [
    ["SEPTEMBRE 2026","TH","Douleur"],["SEPTEMBRE 2026","PT","Médecine - HC"],["SEPTEMBRE 2026","PT","USLD"],
    ["OCTOBRE 2026","TH","Urgences vitales"],["OCTOBRE 2026","PT","HAD - Enfant"],["OCTOBRE 2026","TC","Urgences - accueil non programmé"],
    ["NOVEMBRE 2026","TH","Expérience patient"],["NOVEMBRE 2026","PT","Psychiatrie - HDJ adulte"],["NOVEMBRE 2026","PT","SMR - HC"],["NOVEMBRE 2026","TC","Produits sanguins labiles / Médecine"],
    ["DÉCEMBRE 2026","TH","Identitovigilance"],["DÉCEMBRE 2026","PT","Médecine - HDJ"],["DÉCEMBRE 2026","TC","Produits sanguins labiles / Urgences"],
    ["JANVIER 2027","TH","Droits des patients"],["JANVIER 2027","PT","SMR - Addictologie"],["JANVIER 2027","PT","HAD - Adulte"],
    ["FÉVRIER 2027","TH","Système d'information"],["FÉVRIER 2027","PT","Médecine - Addictologie"],["FÉVRIER 2027","PR","Psychiatrie"],
    ["MARS 2027","TH","Circuit du médicament"],["MARS 2027","PT","Médecine - HC"],["MARS 2027","PT","USLD"],["MARS 2027","TC","Médicament - HAD"],["MARS 2027","TC","Médicament - SMR"],["MARS 2027","TC","Médicament - SMR addictologie"],
    ["AVRIL 2027","TH","Risque infectieux"],["AVRIL 2027","PT","HAD - Enfant"],["AVRIL 2027","TC","Infections associées aux soins - Roye"],["AVRIL 2027","TC","Infections associées aux soins - Montdidier"],
    ["MAI 2027","TH","Démarche qualité"],["MAI 2027","PT","Médecine - HDJ"],["MAI 2027","PR","Addictologie"],
    ["JUIN 2027","TH","Bientraitance"],["JUIN 2027","PT","HAD - Adulte"],["JUIN 2027","PT","SMR - HC"],
    ["JUILLET 2027","TH","Plans sanitaires"],["JUILLET 2027","PR","HAD"],
    ["AOÛT 2027","TH","Plans sanitaires"],
    ["SEPTEMBRE 2027","TH","Fin de vie"],["SEPTEMBRE 2027","PT","Médecine - Addictologie"],["SEPTEMBRE 2027","PT","Psychiatrie - HDJ"],["SEPTEMBRE 2027","PR","Urgences / SMUR"],["SEPTEMBRE 2027","PR","Médecine"],["SEPTEMBRE 2027","PR","SMR"],["SEPTEMBRE 2027","PR","USLD"],
    ["OCTOBRE 2027","TH","Dépendances iatrogènes"],
    ["NOVEMBRE 2027","TH","Dossier patient"],
    ["DÉCEMBRE 2027","TH","Parcours intrahospitalier"],
    ["JANVIER 2028","TH","Audit système"],["JANVIER 2028","AS","Professionnels Montdidier"],["JANVIER 2028","AS","Professionnels Roye"],["JANVIER 2028","AS","Encadrement"],["JANVIER 2028","AS","Représentants des usagers"]
  ].map((e, i) => ({ id: `ev-${i+1}`, month:e[0], type:e[1], label:e[2], done:false }))
};

let state = loadState();

const planningEl = document.getElementById("planning");
const dialog = document.getElementById("eventDialog");
const form = document.getElementById("eventForm");
const eventId = document.getElementById("eventId");
const eventType = document.getElementById("eventType");
const eventLabel = document.getElementById("eventLabel");
const eventMonthSelect = document.getElementById("eventMonthSelect");
const eventDone = document.getElementById("eventDone");
const doneLabel = document.getElementById("doneLabel");
const dialogTitle = document.getElementById("dialogTitle");

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_DATA);
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.events)) throw new Error("format");
    return parsed;
  } catch(e){
    return clone(DEFAULT_DATA);
  }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  document.getElementById("saveState").textContent = "Enregistré";
  renderStats();
}
function idNow(){ return "ev-" + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 1800);
}

function renderLegend(){
  const el = document.getElementById("legend");
  el.innerHTML = "";
  ["TH","PT","PR","TC","AS"].forEach(t=>{
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="badge ${t}">${t}</span><span>${TYPE_LABELS[t]}</span>`;
    el.appendChild(item);
  });
}

function monthEvents(month){
  return state.events
    .filter(e=>e.month===month)
    .sort((a,b)=> TYPE_ORDER[a.type]-TYPE_ORDER[b.type] || a.label.localeCompare(b.label,"fr"));
}

function renderEvent(e){
  const row = document.createElement("div");
  row.className = `event-row ${e.type}${e.done ? " done":""}`;
  row.dataset.id = e.id;

  const code = document.createElement("span");
  code.className = `event-code ${e.type}`;
  code.textContent = e.type;

  const label = document.createElement("span");
  label.className = "event-label";
  label.textContent = e.label;

  const actions = document.createElement("div");
  actions.className = "event-actions no-export";

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "done-check";
  check.checked = !!e.done;
  check.title = e.type==="TH" ? "Thématique traitée" : "Méthode réalisée";
  check.addEventListener("change", ()=>{
    e.done = check.checked;
    saveState();
    render();
  });

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "mini-btn";
  edit.textContent = "Modifier";
  edit.addEventListener("click", ()=>openEdit(e.id));

  const del = document.createElement("button");
  del.type = "button";
  del.className = "mini-btn delete";
  del.textContent = "Suppr.";
  del.addEventListener("click", ()=>{
    if(confirm(`Supprimer « ${e.label} » ?`)){
      state.events = state.events.filter(x=>x.id!==e.id);
      saveState(); render(); toast("Événement supprimé");
    }
  });

  actions.append(check,edit,del);
  row.append(code,label,actions);
  return row;
}

function createMonthCard(month){
  const card = document.createElement("div");
  card.className = "month-card";
  const title = document.createElement("div");
  title.className = "month-title";
  title.textContent = month;

  const list = document.createElement("div");
  list.className = "event-list";
  monthEvents(month).forEach(e=>list.appendChild(renderEvent(e)));

  if(month==="AOÛT 2027"){
    const note = document.createElement("div");
    note.className = "month-note";
    note.innerHTML = "📅 <strong>Veille / publication attendue du référentiel HAS 2028</strong>";
    list.appendChild(note);
  }
  if(["OCTOBRE 2027","NOVEMBRE 2027","DÉCEMBRE 2027"].includes(month)){
    const up = document.createElement("div");
    up.className = "upgrade";
    up.innerHTML = `<div class="icon">⟳</div><div><b>MISE À NIVEAU</b><span>Référentiel HAS 2028</span></div>`;
    list.appendChild(up);
  }

  const add = document.createElement("button");
  add.type = "button";
  add.className = "add-event no-export";
  add.textContent = "+ Ajouter un événement";
  add.addEventListener("click", ()=>openNew(month));

  card.append(title,list,add);
  return card;
}

function createSection(title, months){
  const section = document.createElement("section");
  section.className = "section";
  const h = document.createElement("div");
  h.className = "section-title";
  h.textContent = title;
  const grid = document.createElement("div");
  grid.className = "month-grid";
  months.forEach(m=>grid.appendChild(createMonthCard(m)));
  section.append(h,grid);
  return section;
}

function createFinalSection(){
  const section = document.createElement("section");
  section.className = "section";
  const h = document.createElement("div");
  h.className = "section-title";
  h.textContent = "2028 · VÉRIFICATION FINALE ET CERTIFICATION";

  const grid = document.createElement("div");
  grid.className = "final-grid";

  const jan = document.createElement("div");
  jan.className = "final-col";
  jan.innerHTML = `<div class="final-title">JANVIER 2028 · AUDITS SYSTÈME</div>`;
  const list = document.createElement("div");
  list.className = "event-list";
  monthEvents("JANVIER 2028").forEach(e=>list.appendChild(renderEvent(e)));
  const add = document.createElement("button");
  add.type = "button";
  add.className = "add-event no-export";
  add.textContent = "+ Ajouter un événement";
  add.addEventListener("click", ()=>openNew("JANVIER 2028"));
  const note = document.createElement("div");
  note.className = "final-note";
  note.textContent = "Vérification finale avant la visite";
  jan.append(list,add,note);

  const feb = document.createElement("div");
  feb.className = "final-col";
  feb.innerHTML = `
    <div class="visit-card">
      <div class="visit-head">FÉVRIER 2028 · VISITE DE CERTIFICATION HAS</div>
      <div class="visit-body">
        <div class="visit-icon">🏅</div>
        <div><h3>VISITE DE CERTIFICATION HAS</h3>
        <p>Aucune méthode interne programmée :<br>mois entièrement réservé à la visite.</p></div>
      </div>
    </div>`;

  grid.append(jan,feb);
  section.append(h,grid);
  return section;
}

function render(){
  planningEl.innerHTML = "";
  planningEl.appendChild(createSection(
    "2026-2027 · DÉPLOIEMENT ET ENTRAÎNEMENT",
    ["SEPTEMBRE 2026","OCTOBRE 2026","NOVEMBRE 2026","DÉCEMBRE 2026",
     "JANVIER 2027","FÉVRIER 2027","MARS 2027","AVRIL 2027",
     "MAI 2027","JUIN 2027","JUILLET 2027","AOÛT 2027"]
  ));
  planningEl.appendChild(createSection(
    "2027 · BASCULE VERS LE RÉFÉRENTIEL 2028",
    ["SEPTEMBRE 2027","OCTOBRE 2027","NOVEMBRE 2027","DÉCEMBRE 2027"]
  ));
  planningEl.appendChild(createFinalSection());
  renderStats();
}

function renderStats(){
  const methods = state.events.filter(e=>e.type!=="TH");
  const doneMethods = methods.filter(e=>e.done);
  const themes = state.events.filter(e=>e.type==="TH");
  const doneThemes = themes.filter(e=>e.done);

  document.getElementById("methodProgress").textContent = `${doneMethods.length} / ${methods.length}`;
  document.getElementById("methodProgressBar").style.width = methods.length ? `${doneMethods.length/methods.length*100}%` : "0%";
  document.getElementById("themeProgress").textContent = `${doneThemes.length} / ${themes.length}`;
  document.getElementById("themeProgressBar").style.width = themes.length ? `${doneThemes.length/themes.length*100}%` : "0%";
}

function fillMonthOptions(){
  eventMonthSelect.innerHTML = "";
  MONTHS.filter(m=>m!=="FÉVRIER 2028").forEach(m=>{
    const o = document.createElement("option");
    o.value = m; o.textContent = m;
    eventMonthSelect.appendChild(o);
  });
}

function updateDoneLabel(){
  doneLabel.textContent = eventType.value==="TH" ? "Traité" : "Réalisé";
}
eventType.addEventListener("change", updateDoneLabel);

function openNew(month){
  dialogTitle.textContent = "Ajouter un événement";
  eventId.value = "";
  eventType.value = "TH";
  eventLabel.value = "";
  eventMonthSelect.value = month;
  eventDone.checked = false;
  updateDoneLabel();
  dialog.showModal();
  setTimeout(()=>eventLabel.focus(),50);
}
function openEdit(id){
  const e = state.events.find(x=>x.id===id);
  if(!e) return;
  dialogTitle.textContent = "Modifier un événement";
  eventId.value = e.id;
  eventType.value = e.type;
  eventLabel.value = e.label;
  eventMonthSelect.value = e.month;
  eventDone.checked = !!e.done;
  updateDoneLabel();
  dialog.showModal();
  setTimeout(()=>eventLabel.select(),50);
}

document.getElementById("closeDialog").addEventListener("click", ()=>dialog.close());
document.getElementById("cancelDialog").addEventListener("click", ()=>dialog.close());

form.addEventListener("submit", ev=>{
  ev.preventDefault();
  const id = eventId.value;
  const payload = {
    month: eventMonthSelect.value,
    type: eventType.value,
    label: eventLabel.value.trim(),
    done: eventDone.checked
  };
  if(!payload.label) return;
  if(id){
    const e = state.events.find(x=>x.id===id);
    if(e) Object.assign(e,payload);
  } else {
    state.events.push({id:idNow(),...payload});
  }
  saveState(); render(); dialog.close(); toast("Planning mis à jour");
});

document.getElementById("btnReset").addEventListener("click", ()=>{
  if(confirm("Réinitialiser le planning avec les données de départ ?")){
    state = clone(DEFAULT_DATA);
    saveState(); render(); toast("Planning réinitialisé");
  }
});

document.getElementById("btnExportData").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "planning-certification-HAS-2028-sauvegarde.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("fileImport").addEventListener("change", async e=>{
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    const parsed = JSON.parse(await file.text());
    if(!parsed || !Array.isArray(parsed.events)) throw new Error("Format invalide");
    state = parsed; saveState(); render(); toast("Sauvegarde importée");
  }catch(err){
    alert("Impossible d'importer cette sauvegarde.");
  }finally{
    e.target.value = "";
  }
});

async function exportCanvas(){
  const area = document.getElementById("exportArea");
  document.body.classList.add("exporting");
  await new Promise(r=>setTimeout(r,80));
  const canvas = await html2canvas(area,{
    scale: 2,
    backgroundColor:"#ffffff",
    useCORS:true,
    logging:false
  });
  document.body.classList.remove("exporting");
  return canvas;
}

document.getElementById("btnExportPng").addEventListener("click", async ()=>{
  try{
    const canvas = await exportCanvas();
    const a = document.createElement("a");
    a.download = "programme-certification-HAS-2028-CHIMR.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  }catch(e){
    alert("L'export PNG a échoué. Vérifiez que vous êtes connecté à Internet afin de charger les bibliothèques d'export.");
  }
});

document.getElementById("btnExportPdf").addEventListener("click", async ()=>{
  try{
    const canvas = await exportCanvas();
    const img = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
    const pdf = new jsPDF({orientation, unit:"mm", format:"a3"});
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW/canvas.width,pageH/canvas.height);
    const w = canvas.width*ratio, h = canvas.height*ratio;
    pdf.addImage(img,"PNG",(pageW-w)/2,(pageH-h)/2,w,h,"FAST");
    pdf.save("programme-certification-HAS-2028-CHIMR.pdf");
  }catch(e){
    alert("L'export PDF a échoué. Vérifiez que vous êtes connecté à Internet afin de charger les bibliothèques d'export.");
  }
});

fillMonthOptions();
renderLegend();
render();
saveState();

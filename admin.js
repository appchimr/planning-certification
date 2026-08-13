
const LOCAL_BACKUP_KEY = "chimr_has_2028_admin_backup_d1_v1";

let state = {events:[]};
let unlocked = false;

const dialog = document.getElementById("eventDialog");
const form = document.getElementById("eventForm");

const eventId = document.getElementById("eventId");
const eventType = document.getElementById("eventType");
const eventLabel = document.getElementById("eventLabel");
const eventMonthSelect = document.getElementById("eventMonthSelect");
const eventDone = document.getElementById("eventDone");
const doneLabel = document.getElementById("doneLabel");
const eventPlannedDate = document.getElementById("eventPlannedDate");
const eventCompletedDate = document.getElementById("eventCompletedDate");
const dateFields = document.getElementById("dateFields");

const adminKeyInput = document.getElementById("adminKey");

function fillMonths(){
  eventMonthSelect.innerHTML = "";

  MONTHS
    .filter(m => m !== "FÉVRIER 2028")
    .forEach(m => {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      eventMonthSelect.appendChild(o);
    });
}

function updateFormForType(){
  doneLabel.textContent =
    eventType.value === "TH" ? "Traité" : "Réalisé";

  const hasDates = DATED_TYPES.has(eventType.value);
  dateFields.hidden = !hasDates;

  if(!hasDates){
    eventPlannedDate.value = "";
    eventCompletedDate.value = "";
  }
}

eventType.addEventListener("change",updateFormForType);

eventDone.addEventListener("change",() => {
  if(
    eventDone.checked &&
    DATED_TYPES.has(eventType.value) &&
    !eventCompletedDate.value
  ){
    eventCompletedDate.value = todayIso();
  }
});

function handlers(){
  return {
    add: month => {
      if(!ensureUnlocked()) return;
      openNew(month);
    },

    edit: id => {
      if(!ensureUnlocked()) return;
      openEdit(id);
    },

    delete: id => {
      if(!ensureUnlocked()) return;
      deleteEvent(id);
    },

    toggle: async (id,done) => {
      if(!ensureUnlocked()){
        render();
        return;
      }

      const e = state.events.find(x => x.id === id);

      if(e){
        e.done = done;

        if(done && DATED_TYPES.has(e.type) && !e.completedDate){
          e.completedDate = todayIso();
        }

        if(!done){
          e.completedDate = "";
        }

        render();

        try{
          await saveCentral();
        }catch(_){}
      }
    }
  };
}

function render(){
  renderPlanning("planning",state.events,true,handlers());
}

function idNow(){
  return "ev-" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2,6);
}

function todayIso(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function localBackup(){
  localStorage.setItem(
    LOCAL_BACKUP_KEY,
    JSON.stringify(state)
  );
}

function ensureUnlocked(){
  if(unlocked) return true;

  toast("Déverrouillez d’abord l’administration.");
  adminKeyInput.focus();
  return false;
}

function setUnlocked(value){
  unlocked = value;

  document.getElementById("lockText").textContent =
    value
      ? "Administration déverrouillée pour cette session"
      : "Administration verrouillée";

  document.getElementById("btnUnlock").textContent =
    value ? "Verrouiller" : "Déverrouiller";

  adminKeyInput.disabled = value;
  adminKeyInput.value = value ? "••••••••" : "";
}

async function unlock(){
  if(unlocked){
    sessionStorage.removeItem("HAS_ADMIN_KEY");
    setUnlocked(false);
    return;
  }

  const key = adminKeyInput.value.trim();

  if(!key){
    toast("Saisissez la clé d’administration.");
    return;
  }

  try{
    await postApi({
      action:"auth",
      adminKey:key
    });

    sessionStorage.setItem("HAS_ADMIN_KEY",key);
    setUnlocked(true);
    toast("Administration déverrouillée");

  }catch(err){
    toast("Clé incorrecte");
  }
}

document.getElementById("btnUnlock")
  .addEventListener("click",unlock);

adminKeyInput.addEventListener("keydown",e => {
  if(e.key === "Enter") unlock();
});

async function loadAdmin(){
  try{
    setConnectionStatus(
      "Chargement de Cloudflare D1…",
      "warn"
    );

    const data = await loadRemoteEvents();

    state = {events:data.events};
    localBackup();
    render();

    setConnectionStatus(
      "Synchronisé avec Cloudflare D1",
      "ok"
    );

  }catch(err){
    console.error(err);

    const raw = localStorage.getItem(LOCAL_BACKUP_KEY);

    if(raw){
      try{
        state = JSON.parse(raw);
        render();

        setConnectionStatus(
          "Mode secours local — serveur indisponible",
          "warn"
        );

      }catch(_){
        setConnectionStatus(
          "Aucune donnée disponible",
          "bad"
        );
      }

    }else{
      setConnectionStatus(
        "Aucune donnée disponible",
        "bad"
      );
    }
  }
}

async function saveCentral(){
  localBackup();

  const key = sessionStorage.getItem("HAS_ADMIN_KEY");

  if(!key){
    setUnlocked(false);
    throw new Error("Administration verrouillée");
  }

  try{
    setConnectionStatus(
      "Synchronisation en cours…",
      "warn"
    );

    const data = await postApi({
      action:"saveAll",
      adminKey:key,
      events:state.events
    });

    setConnectionStatus(
      "Synchronisé avec Cloudflare D1",
      "ok"
    );

    document.getElementById("saveState").textContent =
      `Synchronisé à ${
        new Date(data.serverTime)
          .toLocaleTimeString(
            "fr-FR",
            {hour:"2-digit",minute:"2-digit"}
          )
      }`;

  }catch(err){
    console.error(err);

    setConnectionStatus(
      "Sauvegarde D1 impossible — copie locale conservée",
      "bad"
    );

    document.getElementById("saveState").textContent =
      "Copie locale uniquement";

    toast(err.message || "Erreur de sauvegarde");
    throw err;
  }
}

function openNew(month){
  document.getElementById("dialogTitle").textContent =
    "Ajouter un événement";

  eventId.value = "";
  eventType.value = "TH";
  eventLabel.value = "";
  eventMonthSelect.value = month;
  eventDone.checked = false;
  eventPlannedDate.value = "";
  eventCompletedDate.value = "";

  updateFormForType();

  dialog.showModal();

  setTimeout(() => eventLabel.focus(),40);
}

function openEdit(id){
  const e = state.events.find(x => x.id === id);
  if(!e) return;

  document.getElementById("dialogTitle").textContent =
    "Modifier un événement";

  eventId.value = e.id;
  eventType.value = e.type;
  eventLabel.value = e.label;
  eventMonthSelect.value = e.month;
  eventDone.checked = !!e.done;
  eventPlannedDate.value = e.plannedDate || "";
  eventCompletedDate.value = e.completedDate || "";

  updateFormForType();

  dialog.showModal();

  setTimeout(() => eventLabel.select(),40);
}

async function deleteEvent(id){
  const e = state.events.find(x => x.id === id);
  if(!e) return;

  if(!confirm(`Supprimer « ${e.label} » ?`)){
    return;
  }

  state.events = state.events.filter(x => x.id !== id);
  render();

  try{
    await saveCentral();
    toast("Événement supprimé");
  }catch(_){}
}

form.addEventListener("submit",async ev => {
  ev.preventDefault();

  const hasDates = DATED_TYPES.has(eventType.value);

  const payload = {
    month:eventMonthSelect.value,
    type:eventType.value,
    label:eventLabel.value.trim(),
    done:eventDone.checked,
    plannedDate:hasDates ? eventPlannedDate.value : "",
    completedDate:hasDates ? eventCompletedDate.value : ""
  };

  if(!payload.label) return;

  if(payload.completedDate && !payload.done){
    payload.done = true;
  }

  const id = eventId.value;

  if(id){
    const e = state.events.find(x => x.id === id);
    if(e) Object.assign(e,payload);

  }else{
    state.events.push({
      id:idNow(),
      ...payload
    });
  }

  dialog.close();
  render();

  try{
    await saveCentral();
    toast("Planning mis à jour");
  }catch(_){}
});

document.getElementById("closeDialog")
  .addEventListener("click",() => dialog.close());

document.getElementById("cancelDialog")
  .addEventListener("click",() => dialog.close());

document.getElementById("btnReload")
  .addEventListener("click",loadAdmin);

document.getElementById("btnExportPng")
  .addEventListener("click",() =>
    exportPng().catch(() => alert("Export PNG impossible."))
  );

document.getElementById("btnExportPdf")
  .addEventListener("click",() =>
    exportPdf().catch(() => alert("Export PDF impossible."))
  );

document.getElementById("btnExportData")
  .addEventListener("click",() => {
    const blob = new Blob(
      [JSON.stringify(state,null,2)],
      {type:"application/json"}
    );

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      "planning-certification-HAS-2028-sauvegarde.json";

    a.click();
    URL.revokeObjectURL(a.href);
  });

document.getElementById("fileImport")
  .addEventListener("change",async e => {
    if(!ensureUnlocked()){
      e.target.value = "";
      return;
    }

    const file = e.target.files?.[0];
    if(!file) return;

    try{
      const parsed = JSON.parse(await file.text());

      if(!parsed || !Array.isArray(parsed.events)){
        throw new Error("Format invalide");
      }

      state = parsed;
      render();

      await saveCentral();

      toast(
        "Sauvegarde importée et enregistrée dans Cloudflare D1"
      );

    }catch(err){
      alert(
        "Impossible d’importer cette sauvegarde."
      );
    }

    e.target.value = "";
  });

fillMonths();
renderLegend("legend");

const savedKey =
  sessionStorage.getItem("HAS_ADMIN_KEY");

if(savedKey){
  adminKeyInput.value = savedKey;

  postApi({
    action:"auth",
    adminKey:savedKey
  })
    .then(() => setUnlocked(true))
    .catch(() => setUnlocked(false));
}

loadAdmin();


const LOCAL_BACKUP_KEY = "chimr_has_2028_admin_backup_d1_v4";

let state = {events:[],services:[]};
let unlocked = false;
let currentMonthlyMonth = "";

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

const monthlyDialog = document.getElementById("monthlyDialog");
const monthlyTitle = document.getElementById("monthlyTitle");
const monthlyBody = document.getElementById("monthlyPlanBody");
const btnSaveMonthly = document.getElementById("btnSaveMonthly");

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

    month: month => {
      openMonthlyAdmin(month);
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

  if(monthlyDialog.open && currentMonthlyMonth){
    renderMonthlyPlanBody(
      "monthlyPlanBody",
      currentMonthlyMonth,
      state.events,
      value,
      state.services
    );
    btnSaveMonthly.hidden = !value;
  }
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

    state = {
      events:data.events,
      services:Array.isArray(data.services) ? data.services : []
    };
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

function openMonthlyAdmin(month){
  currentMonthlyMonth = month;
  monthlyTitle.textContent = `Planification mensuelle — ${month}`;

  renderMonthlyPlanBody(
    "monthlyPlanBody",
    month,
    state.events,
    unlocked,
    state.services
  );

  btnSaveMonthly.hidden = !unlocked;
  monthlyDialog.showModal();
}

function collectMonthlyPlans(){
  return [...monthlyBody.querySelectorAll("tbody tr[data-event-id]")]
    .map(tr => {
      const service =
        String(tr.dataset.service || "").trim();

      const plannedDate =
        tr.querySelector(".monthly-planned")?.value || "";

      const completedDate =
        tr.querySelector(".monthly-completed")?.value || "";

      let done =
        !!tr.querySelector(".monthly-done")?.checked;

      if(completedDate){
        done = true;
      }

      return {
        eventId:tr.dataset.eventId,
        service,
        plannedDate,
        completedDate,
        done
      };
    })
    .filter(row => row.service);
}

function applyPlansToState(month, plans){
  const byEvent = new Map();

  plans.forEach(row => {
    if(!byEvent.has(row.eventId)){
      byEvent.set(row.eventId, []);
    }

    if(row.service){
      byEvent.get(row.eventId).push({
        service:row.service,
        plannedDate:row.plannedDate,
        completedDate:row.completedDate,
        done:row.done
      });
    }
  });

  state.events
    .filter(e => e.month === month)
    .forEach(e => {
      e.servicePlan = byEvent.get(e.id) || [];
    });
}

async function saveMonthlyPlan(){
  if(!ensureUnlocked()) return;

  const key = sessionStorage.getItem("HAS_ADMIN_KEY");
  const plans = collectMonthlyPlans();

  const seen = new Set();
  for(const row of plans){
    const duplicateKey =
      `${row.eventId}::${row.service.trim().toLocaleLowerCase("fr")}`;

    if(seen.has(duplicateKey)){
      toast(`Le service « ${row.service} » est présent deux fois pour le même événement.`);
      return;
    }

    seen.add(duplicateKey);
  }

  try{
    setConnectionStatus(
      "Enregistrement de la planification mensuelle…",
      "warn"
    );

    const data = await postApi({
      action:"saveMonthPlan",
      adminKey:key,
      month:currentMonthlyMonth,
      plans,
      services:state.services
    });

    applyPlansToState(currentMonthlyMonth, plans);
    localBackup();
    render();

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

    monthlyDialog.close();
    toast("Planification mensuelle enregistrée");

  }catch(err){
    console.error(err);
    setConnectionStatus(
      "Enregistrement mensuel impossible",
      "bad"
    );
    toast(err.message || "Erreur de sauvegarde");
  }
}

monthlyBody.addEventListener("click",e => {
  const decline = e.target.closest(".monthly-decline-services");

  if(decline){
    if(!ensureUnlocked()) return;

    const block = decline.closest(".monthly-event");
    const panel = block?.querySelector(".service-selector");

    if(panel){
      panel.hidden = !panel.hidden;
    }
    return;
  }

  const cancel = e.target.closest(".service-selector-cancel");

  if(cancel){
    const panel = cancel.closest(".service-selector");
    if(panel) panel.hidden = true;
    return;
  }

  const add = e.target.closest(".service-catalog-add");

  if(add){
    if(!ensureUnlocked()) return;

    const panel = add.closest(".service-selector");
    const input = panel?.querySelector(".service-catalog-new");
    const name = String(input?.value || "").trim();

    if(!name){
      toast("Saisissez le nom du service.");
      input?.focus();
      return;
    }

    const exists = state.services.some(
      s => s.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")
    );

    if(exists){
      toast("Ce service existe déjà dans la liste.");
      input?.select();
      return;
    }

    // Preserve dates currently typed before re-render
    applyPlansToState(
      currentMonthlyMonth,
      collectMonthlyPlans()
    );

    state.services.push(name);

    const event = state.events.find(
      ev => ev.id === add.dataset.eventId
    );

    if(event){
      const current = servicePlanForEvent(event);

      current.push({
        service:name,
        plannedDate:"",
        completedDate:"",
        done:false
      });

      event.servicePlan = current;
    }

    renderMonthlyPlanBody(
      "monthlyPlanBody",
      currentMonthlyMonth,
      state.events,
      true,
      state.services
    );

    const newPanel = monthlyBody.querySelector(
      `.service-selector[data-event-id="${CSS.escape(add.dataset.eventId)}"]`
    );

    if(newPanel){
      newPanel.hidden = false;
    }

    toast(`Service « ${name} » ajouté à la liste.`);
    return;
  }

  const apply = e.target.closest(".service-selector-apply");

  if(apply){
    if(!ensureUnlocked()) return;

    // Preserve all dates typed before applying new service selection
    applyPlansToState(
      currentMonthlyMonth,
      collectMonthlyPlans()
    );

    const event = state.events.find(
      ev => ev.id === apply.dataset.eventId
    );

    const panel = apply.closest(".service-selector");

    if(!event || !panel) return;

    const selected = [
      ...panel.querySelectorAll(".service-choice-check:checked")
    ].map(input => input.value);

    const previous = servicePlanForEvent(event);
    const previousMap = new Map(
      previous.map(row => [row.service,row])
    );

    const removedWithData = previous.filter(row =>
      !selected.includes(row.service) &&
      (row.plannedDate || row.completedDate || row.done)
    );

    if(
      removedWithData.length &&
      !confirm(
        "Certains services décochés contiennent déjà des dates ou un statut réalisé. Leur planification sera supprimée. Continuer ?"
      )
    ){
      return;
    }

    event.servicePlan = selected.map(service => {
      const old = previousMap.get(service);

      return old || {
        service,
        plannedDate:"",
        completedDate:"",
        done:false
      };
    });

    renderMonthlyPlanBody(
      "monthlyPlanBody",
      currentMonthlyMonth,
      state.events,
      true,
      state.services
    );

    toast("Sélection des services appliquée.");
    return;
  }
});

monthlyBody.addEventListener("change",e => {
  const tr = e.target.closest("tr[data-event-id]");
  if(!tr) return;

  const done = tr.querySelector(".monthly-done");
  const completed = tr.querySelector(".monthly-completed");

  if(e.target.classList.contains("monthly-done")){
    if(done.checked && !completed.value){
      completed.value = todayIso();
    }

    if(!done.checked){
      completed.value = "";
    }
  }

  if(e.target.classList.contains("monthly-completed")){
    if(completed.value){
      done.checked = true;
    }
  }

  tr.classList.toggle(
    "monthly-row-done",
    !!done?.checked
  );
});

btnSaveMonthly.addEventListener("click",saveMonthlyPlan);

document.getElementById("closeMonthlyTop")
  .addEventListener("click",() => monthlyDialog.close());

document.getElementById("cancelMonthly")
  .addEventListener("click",() => monthlyDialog.close());

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
      ...payload,
      servicePlan:[]
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

      const key = sessionStorage.getItem("HAS_ADMIN_KEY");

      const data = await postApi({
        action:"restoreAll",
        adminKey:key,
        events:parsed.events,
        services:Array.isArray(parsed.services) ? parsed.services : state.services
      });

      state = {
        events:parsed.events,
        services:Array.isArray(parsed.services)
          ? parsed.services
          : state.services
      };
      localBackup();
      render();

      document.getElementById("saveState").textContent =
        `Restauré à ${
          new Date(data.serverTime)
            .toLocaleTimeString(
              "fr-FR",
              {hour:"2-digit",minute:"2-digit"}
            )
        }`;

      toast(
        "Sauvegarde restaurée dans Cloudflare D1"
      );

    }catch(err){
      console.error(err);
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

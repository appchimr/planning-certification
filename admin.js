
const LOCAL_BACKUP_KEY = "chimr_has_2028_admin_backup_d1_v4";

let state = {events:[],services:[],monthSettings:[],evaluators:[]};
let unlocked = false;
let currentMonthlyMonth = "";
let monthlyDraft = null;

function applyRemoteState(data){
  state = {
    events:data.events,
    services:Array.isArray(data.services) ? data.services : [],
    monthSettings:Array.isArray(data.monthSettings) ? data.monthSettings : [],
    evaluators:Array.isArray(data.evaluators) ? data.evaluators : [],
    revision:data.revision
  };
}

function renderMonthlyAdmin(){
  renderMonthlyPlanBody(
    "monthlyPlanBody",
    currentMonthlyMonth,
    monthlyDraft?.events || state.events,
    unlocked,
    monthlyDraft?.services || state.services,
    state.evaluators,
    openMonthlyAdmin
  );
}

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

function fillMonths(currentMonth){
  eventMonthSelect.innerHTML = "";

  [...new Set([...MONTHS.slice(0,-1),currentMonth].filter(Boolean))]
    .sort((a,b) => monthKey(a).localeCompare(monthKey(b)))
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

function moveMonthSelect(select,month){
  if(!month) return;
  if(![...select.options].some(option => option.value === month)){
    select.add(new Option(month,month));
  }
  select.value = month;
}

eventPlannedDate.addEventListener("change",() => {
  moveMonthSelect(eventMonthSelect,dateMonth(eventPlannedDate.value));
});

eventMonthSelect.addEventListener("change",() => {
  if(dateMonth(eventPlannedDate.value) !== eventMonthSelect.value){
    eventPlannedDate.value = "";
  }
});

eventDone.addEventListener("change",() => {
  if(!eventDone.checked) eventCompletedDate.value = "";
  if(
    eventDone.checked &&
    DATED_TYPES.has(eventType.value) &&
    !eventCompletedDate.value
  ){
    eventCompletedDate.value = planningToday();
  }
});

function getMonthSetting(month){
  return state.monthSettings.find(setting => setting.month === month) || null;
}

function upsertMonthSetting(setting){
  const index =
    state.monthSettings.findIndex(item => item.month === setting.month);

  if(index >= 0){
    state.monthSettings[index] = {
      ...state.monthSettings[index],
      ...setting
    };
  }else{
    state.monthSettings.push(setting);
  }
}

function renderMonthUpgradeAdmin(month){
  const panel = document.getElementById("monthUpgradeAdmin");
  if(!panel) return;

  const setting = getMonthSetting(month);

  if(!setting || !unlocked){
    panel.hidden = true;
    return;
  }

  panel.hidden = false;

  document.getElementById("monthUpgradeVisible").checked =
    !!setting.upgradeVisible;

  document.getElementById("monthUpgradeTitle").value =
    setting.upgradeTitle || "MISE À NIVEAU";

  document.getElementById("monthUpgradeSubtitle").value =
    setting.upgradeSubtitle || "Référentiel HAS 2028";

  panel.classList.toggle(
    "month-upgrade-admin-hidden-state",
    !setting.upgradeVisible
  );
}

async function saveUpgradeSetting(forceVisible=null){
  if(!ensureUnlocked()) return;

  const setting = getMonthSetting(currentMonthlyMonth);

  if(!setting){
    toast("Aucun bandeau configurable pour ce mois.");
    return;
  }

  const adminKey = sessionStorage.getItem("HAS_ADMIN_KEY");

  const upgradeVisible =
    forceVisible === null
      ? document.getElementById("monthUpgradeVisible").checked
      : Boolean(forceVisible);

  const upgradeTitle =
    document.getElementById("monthUpgradeTitle").value.trim() ||
    "MISE À NIVEAU";

  const upgradeSubtitle =
    document.getElementById("monthUpgradeSubtitle").value.trim() ||
    "Référentiel HAS 2028";

  try{
    const data = await postApi({
      action:"saveMonthSetting",
      adminKey,
      month:currentMonthlyMonth,
      upgradeVisible,
      upgradeTitle,
      upgradeSubtitle
    });

    upsertMonthSetting(data.monthSetting);
    localBackup();
    render();
    renderMonthUpgradeAdmin(currentMonthlyMonth);

    toast(
      upgradeVisible
        ? "Bandeau de mise à niveau enregistré."
        : "Bandeau de mise à niveau masqué."
    );
  }catch(err){
    console.error(err);
    toast(err?.message || "Impossible d'enregistrer le bandeau.");
  }
}

function renderEvaluatorCatalogAdmin(){
  const panel = document.getElementById("evaluatorCatalogAdmin");
  const list = document.getElementById("evaluatorCatalogList");

  if(!panel || !list){
    return;
  }

  panel.hidden = !unlocked;

  if(!unlocked){
    return;
  }

  list.innerHTML = "";

  state.evaluators.forEach(name => {
    const chip = document.createElement("span");
    chip.className = "evaluator-chip";
    chip.textContent = name;
    list.appendChild(chip);
  });
}

function collectMonthlyEvaluatorAssignments(){
  return [...monthlyBody.querySelectorAll(".evaluator-selector")]
    .map(panel => ({
      eventId:panel.dataset.eventId,
      evaluators:[
        ...panel.querySelectorAll(".evaluator-choice-check:checked")
      ].map(input => input.value)
    }));
}

function applyEvaluatorAssignmentsToDraft(month,assignments){
  const map = new Map(
    assignments.map(item => [
      item.eventId,
      Array.isArray(item.evaluators)
        ? item.evaluators
        : []
    ])
  );

  monthlyDraft.events
    .filter(event => event.month === month && event.type !== "TH")
    .forEach(event => {
      event.evaluators = map.get(event.id) || [];
      delete event.evaluator;
    });
}

async function addEvaluatorToCatalog(){
  if(!ensureUnlocked()) return;

  const input = document.getElementById("newEvaluatorName");
  const name = String(input?.value || "").trim();

  if(!name){
    toast("Saisissez le nom de l’évaluateur.");
    input?.focus();
    return;
  }

  const exists = state.evaluators.some(
    item => item.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")
  );

  if(exists){
    toast("Cet évaluateur existe déjà dans la liste.");
    input?.select();
    return;
  }

  // Conserver les saisies en cours avant de reconstruire la fenêtre.
  applyPlansToDraft(
    currentMonthlyMonth,
    collectMonthlyPlans()
  );
  applyEvaluatorAssignmentsToDraft(
    currentMonthlyMonth,
    collectMonthlyEvaluatorAssignments()
  );

  try{
    const key = sessionStorage.getItem("HAS_ADMIN_KEY");

    const data = await postApi({
      action:"addEvaluator",
      adminKey:key,
      name
    });

    state.evaluators = Array.isArray(data.evaluators)
      ? data.evaluators
      : [...state.evaluators,name];

    if(input){
      input.value = "";
    }

    renderEvaluatorCatalogAdmin();

    renderMonthlyAdmin();

    toast(`Évaluateur « ${name} » ajouté.`);
  }catch(err){
    console.error(err);
    toast(err?.message || "Impossible d’ajouter l’évaluateur.");
  }
}

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
          e.completedDate = planningToday();
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
  renderPlanning("planning",state.events,true,handlers(),state.monthSettings);
}

function idNow(){
  return "ev-" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2,6);
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
    openMonthlyAdmin(currentMonthlyMonth);
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

    applyRemoteState(data);
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
      events:state.events,
      revision:state.revision
    });

    applyRemoteState(data.planning);
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
  fillMonths(month);
  eventMonthSelect.value = month;
  eventDone.checked = false;
  eventPlannedDate.value = "";
  eventCompletedDate.value = "";

  configureEventForm();

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
  fillMonths(e.month);
  eventMonthSelect.value = e.month;
  eventDone.checked = !!e.done;
  eventPlannedDate.value = e.plannedDate || "";
  eventCompletedDate.value = e.completedDate || "";

  configureEventForm(e);

  dialog.showModal();

  setTimeout(() => eventLabel.select(),40);
}

function configureEventForm(event){
  const byService = event && servicePlanForEvent(event).length > 0;
  eventMonthSelect.disabled = Boolean(byService);
  eventDone.disabled = Boolean(byService);
  eventPlannedDate.disabled = Boolean(byService);
  eventCompletedDate.disabled = Boolean(byService);
  eventType.querySelector('option[value="TH"]').disabled = Boolean(byService);

  const help = document.getElementById("eventScheduleHelp");
  help.textContent = byService
    ? "Pour modifier les échéances ou les réalisations, ouvrez le suivi par service."
    : "Pour reporter une évaluation, choisissez un autre mois et renseignez la nouvelle date si elle est connue.";
  updateFormForType();
  help.hidden = !DATED_TYPES.has(eventType.value);
}

eventType.addEventListener("change",() => {
  document.getElementById("eventScheduleHelp").hidden = !DATED_TYPES.has(eventType.value);
});

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
  if(monthlyDialog.open && monthlyDraft && month !== currentMonthlyMonth){
    const plansEdited = JSON.stringify(collectMonthlyPlans()) !== monthlyDraft.initialPlans;
    const assignmentsEdited = JSON.stringify(collectMonthlyEvaluatorAssignments()) !== monthlyDraft.initialAssignments;

    if((plansEdited || assignmentsEdited)
        && !confirm("Changer de mois sans enregistrer les modifications en cours ?")){
      return;
    }
  }

  currentMonthlyMonth = month;
  monthlyDraft = unlocked ? structuredClone(state) : null;
  monthlyTitle.textContent = `Planification mensuelle — ${month}`;
  renderMonthlyAdmin();

  if(monthlyDraft){
    monthlyDraft.initialPlans = JSON.stringify(collectMonthlyPlans());
    monthlyDraft.initialAssignments = JSON.stringify(collectMonthlyEvaluatorAssignments());
  }

  btnSaveMonthly.hidden = !unlocked;
  if(!monthlyDialog.open) monthlyDialog.showModal();
  renderMonthUpgradeAdmin(month);
  renderEvaluatorCatalogAdmin();
}

function collectMonthlyPlans(){
  return [...monthlyBody.querySelectorAll("tbody tr[data-editable=true]")]
    .map(tr => {
      const service =
        String(tr.dataset.service || "").trim();

      const plannedMonth = tr.querySelector(".monthly-planned-month").value;

      const plannedDate =
        tr.querySelector(".monthly-planned")?.value || "";

      const completedDate =
        tr.querySelector(".monthly-completed")?.value || "";

      let done =
        !!tr.querySelector(".monthly-done")?.checked;

      if(completedDate){
        done = true;
      }

      const evaluatorMode =
        tr.dataset.evaluatorMode === "custom"
          ? "custom"
          : "inherit";

      const evaluators =
        evaluatorMode === "custom"
          ? [
              ...tr.querySelectorAll(
                ".service-evaluator-choice-check:checked"
              )
            ].map(input => input.value)
          : [];

      return {
        eventId:tr.dataset.eventId,
        service,
        plannedMonth,
        plannedDate,
        completedDate,
        done,
        evaluatorMode,
        evaluators
      };
    })
    .filter(row => row.service);
}


function applyPlansToDraft(month,plans){
  const byEvent = new Map();

  plans.forEach(({eventId,...row}) => {
    if(!byEvent.has(eventId)) byEvent.set(eventId,[]);
    byEvent.get(eventId).push(row);
  });

  monthlyDraft.events
    .filter(event => event.month === month && event.type !== "TH")
    .forEach(event => {
      event.servicePlan = byEvent.get(event.id) || [];
    });
}

async function saveMonthlyPlan(){
  if(!ensureUnlocked() || btnSaveMonthly.disabled) return;

  const key = sessionStorage.getItem("HAS_ADMIN_KEY");
  const plans = collectMonthlyPlans();
  const evaluatorAssignments =
    collectMonthlyEvaluatorAssignments();

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

  btnSaveMonthly.disabled = true;
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
      services:monthlyDraft.services,
      revision:monthlyDraft.revision,
      evaluatorAssignments
    });

    applyRemoteState(data.planning);
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
  }finally{
    btnSaveMonthly.disabled = false;
  }
}

monthlyBody.addEventListener("click",e => {
  const serviceEvaluatorToggle =
    e.target.closest(".service-evaluator-toggle");

  if(serviceEvaluatorToggle){
    if(!ensureUnlocked()) return;

    const cell =
      serviceEvaluatorToggle.closest(".service-evaluator-cell");
    const panel =
      cell?.querySelector(".service-evaluator-selector");

    if(panel){
      panel.hidden = !panel.hidden;
    }
    return;
  }

  const serviceEvaluatorCancel =
    e.target.closest(".service-evaluator-cancel");

  if(serviceEvaluatorCancel){
    const panel =
      serviceEvaluatorCancel.closest(".service-evaluator-selector");

    if(panel){
      panel.hidden = true;
    }
    return;
  }

  const serviceEvaluatorApply =
    e.target.closest(".service-evaluator-apply");

  if(serviceEvaluatorApply){
    if(!ensureUnlocked()) return;

    const tr =
      serviceEvaluatorApply.closest("tr[data-event-id]");

    if(!tr) return;

    tr.dataset.evaluatorMode = "custom";

    const event = monthlyDraft.events.find(
      item => item.id === tr.dataset.eventId
    );

    const names = [
      ...tr.querySelectorAll(
        ".service-evaluator-choice-check:checked"
      )
    ].map(input => input.value);

    const display =
      tr.querySelector(".service-evaluator-display");

    if(display){
      display.innerHTML = "";

      const mode = document.createElement("span");
      mode.className = "service-evaluator-mode custom";
      mode.textContent = "Personnalisé";

      display.append(
        mode,
        buildEvaluatorChips(names)
      );
    }

    const button =
      tr.querySelector(".service-evaluator-toggle");

    if(button){
      button.textContent = "Modifier";
    }

    const inherit =
      tr.querySelector(".service-evaluator-inherit");

    if(inherit){
      inherit.hidden = false;
    }

    const panel =
      tr.querySelector(".service-evaluator-selector");

    if(panel){
      panel.hidden = true;
    }

    return;
  }

  const serviceEvaluatorInherit =
    e.target.closest(".service-evaluator-inherit");

  if(serviceEvaluatorInherit){
    if(!ensureUnlocked()) return;

    const tr =
      serviceEvaluatorInherit.closest("tr[data-event-id]");

    if(!tr) return;

    tr.dataset.evaluatorMode = "inherit";

    const event = monthlyDraft.events.find(
      item => item.id === tr.dataset.eventId
    );

    const names = assignedEvaluatorsForEvent(event || {});

    tr.querySelectorAll(
      ".service-evaluator-choice-check"
    ).forEach(input => {
      input.checked = names.includes(input.value);
    });

    const display =
      tr.querySelector(".service-evaluator-display");

    if(display){
      display.innerHTML = "";

      display.appendChild(
        buildEvaluatorChips(names)
      );
    }

    const button =
      tr.querySelector(".service-evaluator-toggle");

    if(button){
      button.textContent = "Personnaliser";
    }

    serviceEvaluatorInherit.hidden = true;

    const panel =
      tr.querySelector(".service-evaluator-selector");

    if(panel){
      panel.hidden = true;
    }

    return;
  }

  const evaluatorToggle =
    e.target.closest(".monthly-evaluator-toggle");

  if(evaluatorToggle){
    if(!ensureUnlocked()) return;

    const block = evaluatorToggle.closest(".monthly-event");
    const panel = block?.querySelector(".evaluator-selector");

    if(panel){
      panel.hidden = !panel.hidden;
    }
    return;
  }

  const evaluatorClose =
    e.target.closest(".evaluator-selector-close");

  if(evaluatorClose){
    const panel = evaluatorClose.closest(".evaluator-selector");
    if(panel) panel.hidden = true;
    return;
  }

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

    const exists = monthlyDraft.services.some(
      s => s.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")
    );

    if(exists){
      toast("Ce service existe déjà dans la liste.");
      input?.select();
      return;
    }

    // Preserve dates currently typed before re-render
    applyPlansToDraft(
      currentMonthlyMonth,
      collectMonthlyPlans()
    );
    applyEvaluatorAssignmentsToDraft(currentMonthlyMonth,collectMonthlyEvaluatorAssignments());

    monthlyDraft.services.push(name);

    const event = monthlyDraft.events.find(
      ev => ev.id === add.dataset.eventId
    );

    if(event){
      const current = servicePlanForEvent(event);

      current.push({
        service:name,
        plannedDate:"",
        completedDate:"",
        done:false,
        evaluatorMode:"inherit",
        evaluators:[]
      });

      event.servicePlan = current;
    }

    renderMonthlyAdmin();

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
    applyPlansToDraft(
      currentMonthlyMonth,
      collectMonthlyPlans()
    );
    applyEvaluatorAssignmentsToDraft(currentMonthlyMonth,collectMonthlyEvaluatorAssignments());

    const event = monthlyDraft.events.find(
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
      (row.plannedDate || row.completedDate || row.done || row.plannedMonth !== event.month)
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
        done:false,
        evaluatorMode:"inherit",
        evaluators:[]
      };
    });

    renderMonthlyAdmin();

    toast("Sélection des services appliquée.");
    return;
  }
});

monthlyBody.addEventListener("change",e => {
  const tr = e.target.closest("tr[data-event-id]");
  if(!tr || tr.dataset.editable !== "true") return;

  const month = tr.querySelector(".monthly-planned-month");
  const date = tr.querySelector(".monthly-planned");
  if(e.target === date) moveMonthSelect(month,dateMonth(date.value));
  if(e.target === month && dateMonth(date.value) !== month.value) date.value = "";

  const done = tr.querySelector(".monthly-done");
  const completed = tr.querySelector(".monthly-completed");

  if(e.target.classList.contains("monthly-done")){
    if(done.checked && !completed.value){
      completed.value = planningToday();
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


monthlyBody.addEventListener("change",async event => {
  const check = event.target.closest(".monthly-theme-done");

  if(!check){
    return;
  }

  if(!ensureUnlocked()){
    check.checked = !check.checked;
    return;
  }

  const item = state.events.find(
    row => row.id === check.dataset.eventId
  );

  if(!item){
    return;
  }

  const previous = !!item.done;
  item.done = !!check.checked;

  try{
    const key = sessionStorage.getItem("HAS_ADMIN_KEY");

    setConnectionStatus(
      "Enregistrement de la thématique…",
      "warn"
    );

    const data = await postApi({
      action:"saveAll",
      adminKey:key,
      events:state.events,
      revision:monthlyDraft.revision
    });

    applyRemoteState(data.planning);
    const draftItem = monthlyDraft?.events.find(row => row.id === item.id);
    if(draftItem){
      draftItem.done = item.done;
      monthlyDraft.revision = state.revision;
    }
    localBackup();
    render();

    setConnectionStatus(
      "Synchronisé avec Cloudflare D1",
      "ok"
    );

    toast(
      item.done
        ? "Thématique marquée comme traitée."
        : "Thématique repassée à traiter."
    );

  }catch(err){
    console.error(err);
    item.done = previous;
    check.checked = previous;

    setConnectionStatus(
      "Enregistrement de la thématique impossible",
      "bad"
    );

    toast(
      err?.message ||
      "Impossible d’enregistrer la thématique."
    );
  }
});

btnSaveMonthly.addEventListener("click",saveMonthlyPlan);
monthlyDialog.addEventListener("close",() => {
  if(!monthlyDialog.open) monthlyDraft = null;
});

document.getElementById("closeMonthlyTop")
  .addEventListener("click",() => monthlyDialog.close());

document.getElementById("cancelMonthly")
  .addEventListener("click",() => monthlyDialog.close());

form.addEventListener("submit",async ev => {
  ev.preventDefault();
  if(!ensureUnlocked()) return;

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


document.getElementById("btnMonthlyPdf")
  ?.addEventListener("click",async () => {
    try{
      if(monthlyDraft){
        applyPlansToDraft(currentMonthlyMonth,collectMonthlyPlans());
        applyEvaluatorAssignmentsToDraft(currentMonthlyMonth,collectMonthlyEvaluatorAssignments());
      }

      await exportMonthlyPdf(currentMonthlyMonth,monthlyDraft?.events || state.events);
    }catch(err){
      console.error(err);
      alert(
        err?.message ||
        "Impossible de générer la synthèse PDF."
      );
    }
  });

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
        revision:state.revision,
        services:Array.isArray(parsed.services) ? parsed.services : state.services,
        monthSettings:Array.isArray(parsed.monthSettings)
          ? parsed.monthSettings
          : state.monthSettings,
        evaluators:Array.isArray(parsed.evaluators)
          ? parsed.evaluators
          : state.evaluators
      });

      applyRemoteState(data.planning);
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

document.getElementById("btnSaveUpgrade")
  ?.addEventListener("click",() => saveUpgradeSetting(null));

document.getElementById("btnUpgradeDone")
  ?.addEventListener("click",async () => {
    if(!ensureUnlocked()) return;

    if(!confirm(
      "Masquer le bandeau « Mise à niveau » pour ce mois ? Vous pourrez le réafficher plus tard."
    )){
      return;
    }

    document.getElementById("monthUpgradeVisible").checked = false;
    await saveUpgradeSetting(false);
  });

document.getElementById("monthUpgradeVisible")
  ?.addEventListener("change",event => {
    document.getElementById("monthUpgradeAdmin")
      ?.classList.toggle(
        "month-upgrade-admin-hidden-state",
        !event.target.checked
      );
  });

document.getElementById("btnAddEvaluator")
  ?.addEventListener("click",addEvaluatorToCatalog);

document.getElementById("newEvaluatorName")
  ?.addEventListener("keydown",event => {
    if(event.key === "Enter"){
      event.preventDefault();
      addEvaluatorToCatalog();
    }
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

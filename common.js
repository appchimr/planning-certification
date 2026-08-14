
const TYPE_ORDER = { TH:0, PT:1, PR:2, TC:3, AS:4, EV:5, EP:6, CR:7, JT:8, FP:9 };

const TYPE_LABELS = {
  TH:"Thématique",
  PT:"Patient traceur",
  PR:"Parcours traceur",
  TC:"Traceur ciblé",
  AS:"Audit système",
  EV:"Évaluation",
  EP:"Expérience patient",
  CR:"Cartographie des risques",
  JT:"Journée thématique",
  FP:"Formation"
};

const DATED_TYPES = new Set(["PT","PR","TC","AS","EV","EP","CR","JT","FP"]);

const MONTHS = [
  "SEPTEMBRE 2026","OCTOBRE 2026","NOVEMBRE 2026","DÉCEMBRE 2026",
  "JANVIER 2027","FÉVRIER 2027","MARS 2027","AVRIL 2027",
  "MAI 2027","JUIN 2027","JUILLET 2027","AOÛT 2027",
  "SEPTEMBRE 2027","OCTOBRE 2027","NOVEMBRE 2027","DÉCEMBRE 2027",
  "JANVIER 2028","FÉVRIER 2028"
];

function apiConfigured(){
  return window.APP_CONFIG &&
    APP_CONFIG.API_URL &&
    !APP_CONFIG.API_URL.includes("COLLER_ICI");
}

function apiUrl(){
  return APP_CONFIG.API_URL;
}

function monthIndex(month){
  return MONTHS.indexOf(month);
}

function monthEvents(events, month){
  return events
    .filter(e => e.month === month)
    .sort((a,b) =>
      (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99) ||
      String(a.plannedDate || "").localeCompare(String(b.plannedDate || "")) ||
      a.label.localeCompare(b.label,"fr")
    );
}

function phaseForMonth(month){
  const i = monthIndex(month);
  if(i >= 0 && i <= 11) return "phase-training";
  if(i >= 12 && i <= 15) return "phase-transition";
  if(month === "JANVIER 2028") return "phase-final";
  return "";
}

function renderLegend(targetId){
  const el = document.getElementById(targetId);
  if(!el) return;

  el.innerHTML = "";

  ["TH","PT","PR","TC","AS","EV","EP","CR","JT","FP"].forEach(t => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML =
      `<span class="badge ${t}">${t}</span><span>${TYPE_LABELS[t]}</span>`;
    el.appendChild(item);
  });
}

function renderStats(events){
  const methods = events.filter(e => ["PT","PR","TC","AS"].includes(e.type));
  const doneMethods = methods.filter(e => e.done);
  const themes = events.filter(e => e.type === "TH");
  const doneThemes = themes.filter(e => e.done);

  const mp = document.getElementById("methodProgress");
  const mb = document.getElementById("methodProgressBar");
  const tp = document.getElementById("themeProgress");
  const tb = document.getElementById("themeProgressBar");

  if(mp) mp.textContent = `${doneMethods.length} / ${methods.length}`;
  if(mb) mb.style.width =
    methods.length ? `${doneMethods.length / methods.length * 100}%` : "0%";

  if(tp) tp.textContent = `${doneThemes.length} / ${themes.length}`;
  if(tb) tb.style.width =
    themes.length ? `${doneThemes.length / themes.length * 100}%` : "0%";
}

function renderNext(events){
  const el = document.getElementById("nextList");
  if(!el) return;

  const now = new Date();

  const upcoming = events
    .filter(e => !e.done && DATED_TYPES.has(e.type) && e.plannedDate)
    .filter(e => {
      const d = new Date(`${e.plannedDate}T12:00:00`);
      return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
    })
    .sort((a,b) =>
      String(a.plannedDate).localeCompare(String(b.plannedDate)) ||
      (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99)
    )
    .slice(0,5);

  el.innerHTML = "";

  if(!upcoming.length){
    el.innerHTML =
      '<span class="metric-sub">Aucune échéance datée à venir.</span>';
    return;
  }

  upcoming.forEach(e => {
    const row = document.createElement("div");
    row.className = "next-item";
    row.innerHTML =
      `<span class="next-date">${formatDateFr(e.plannedDate)}</span>` +
      `<span class="badge ${e.type} mini">${e.type}</span>` +
      `<span>${escapeHtml(e.label)}</span>`;
    el.appendChild(row);
  });
}

function escapeHtml(v){
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function formatDateFr(iso){
  if(!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if(!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function eventDateText(e){
  if(!DATED_TYPES.has(e.type)){
    return {text:"",status:""};
  }

  if(e.done && e.completedDate){
    return {
      text:`Réalisé le ${formatDateFr(e.completedDate)}`,
      status:"completed"
    };
  }

  if(e.plannedDate){
    return {
      text:`Prévu le ${formatDateFr(e.plannedDate)}`,
      status:"planned"
    };
  }

  if(e.done){
    return {
      text:"Réalisé",
      status:"completed"
    };
  }

  return {text:"",status:""};
}

function servicePlanForEvent(event){
  return Array.isArray(event.servicePlan)
    ? event.servicePlan
        .map(row => ({
          service:String(row.service || "").trim(),
          plannedDate:row.plannedDate || "",
          completedDate:row.completedDate || "",
          done:!!row.done,
          evaluatorMode:
            row.evaluatorMode === "custom"
              ? "custom"
              : "inherit",
          evaluators:Array.isArray(row.evaluators)
            ? row.evaluators
                .map(name => String(name || "").trim())
                .filter(Boolean)
            : []
        }))
        .filter(row => row.service)
    : [];
}

function eventServiceProgress(event){
  const rows = servicePlanForEvent(event);
  return {
    done:rows.filter(r => r.done).length,
    total:rows.length
  };
}

function monthlyTypeLabel(type){
  return type === "TH"
    ? "Thématique du mois"
    : (TYPE_LABELS[type] || type);
}

function effectiveServiceEvaluators(event,rowData){
  return rowData.evaluatorMode === "custom"
    ? (Array.isArray(rowData.evaluators) ? rowData.evaluators : [])
    : assignedEvaluatorsForEvent(event);
}

function buildEvaluatorChips(names){
  const wrap = document.createElement("div");
  wrap.className = "service-evaluator-chips";

  if(!names.length){
    const empty = document.createElement("span");
    empty.className = "service-evaluator-none";
    empty.textContent = "Non attribué";
    wrap.appendChild(empty);
    return wrap;
  }

  names.forEach(name => {
    const chip = document.createElement("span");
    chip.className = "service-evaluator-chip";
    chip.textContent = name;
    wrap.appendChild(chip);
  });

  return wrap;
}

function buildServiceEvaluatorCell(
  event,
  rowData,
  editable=false,
  evaluatorCatalog=[]
){
  const cell = document.createElement("td");
  cell.className = "service-evaluator-cell";

  const effective = effectiveServiceEvaluators(event,rowData);
  const isCustom = rowData.evaluatorMode === "custom";

  const display = document.createElement("div");
  display.className = "service-evaluator-display";

  if(isCustom){
    const mode = document.createElement("span");
    mode.className = "service-evaluator-mode custom";
    mode.textContent = "Personnalisé";
    display.appendChild(mode);
  }

  display.appendChild(
    buildEvaluatorChips(effective)
  );
  cell.appendChild(display);

  if(editable){
    const button = document.createElement("button");
    button.type = "button";
    button.className = "service-evaluator-toggle";
    button.textContent = isCustom ? "Modifier" : "Personnaliser";

    const panel = document.createElement("div");
    panel.className = "service-evaluator-selector";
    panel.hidden = true;

    const title = document.createElement("div");
    title.className = "service-evaluator-selector-title";
    title.innerHTML =
      `<strong>Évaluateurs pour ${escapeHtml(rowData.service)}</strong>` +
      `<span>Cette sélection remplacera les évaluateurs par défaut uniquement pour ce service.</span>`;

    const grid = document.createElement("div");
    grid.className = "service-evaluator-selector-grid";

    const initiallySelected = isCustom
      ? rowData.evaluators
      : assignedEvaluatorsForEvent(event);

    (evaluatorCatalog || []).forEach(name => {
      const label = document.createElement("label");
      label.className = "service-evaluator-choice";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "service-evaluator-choice-check";
      check.value = name;
      check.checked = initiallySelected.includes(name);

      const text = document.createElement("span");
      text.textContent = name;

      label.append(check,text);
      grid.appendChild(label);
    });

    const actions = document.createElement("div");
    actions.className = "service-evaluator-selector-actions";

    const inherit = document.createElement("button");
    inherit.type = "button";
    inherit.className = "btn ghost service-evaluator-inherit";
    inherit.textContent = "Revenir aux évaluateurs par défaut";
    inherit.hidden = !isCustom;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn ghost service-evaluator-cancel";
    cancel.textContent = "Annuler";

    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "btn primary service-evaluator-apply";
    apply.textContent = "Appliquer";

    actions.append(inherit,cancel,apply);
    panel.append(title,grid,actions);

    cell.append(button,panel);
  }

  return cell;
}

function buildMonthlyServiceRow(
  event,
  rowData,
  editable=false,
  evaluatorCatalog=[]
){
  const tr = document.createElement("tr");
  tr.dataset.eventId = event.id;
  tr.dataset.service = rowData.service;
  tr.dataset.evaluatorMode =
    rowData.evaluatorMode === "custom"
      ? "custom"
      : "inherit";

  if(rowData.done){
    tr.classList.add("monthly-row-done");
  }

  const service = document.createElement("td");
  service.className = "monthly-service";
  service.textContent = rowData.service;

  const evaluator = buildServiceEvaluatorCell(
    event,
    rowData,
    editable,
    evaluatorCatalog
  );

  const planned = document.createElement("td");
  const completed = document.createElement("td");
  const done = document.createElement("td");
  done.className = "monthly-done-cell";

  if(editable){
    const plannedInput = document.createElement("input");
    plannedInput.type = "date";
    plannedInput.className = "monthly-planned";
    plannedInput.value = rowData.plannedDate || "";

    const completedInput = document.createElement("input");
    completedInput.type = "date";
    completedInput.className = "monthly-completed";
    completedInput.value = rowData.completedDate || "";

    const doneInput = document.createElement("input");
    doneInput.type = "checkbox";
    doneInput.className = "monthly-done";
    doneInput.checked = !!rowData.done;
    doneInput.title = "Action réalisée";

    planned.appendChild(plannedInput);
    completed.appendChild(completedInput);
    done.appendChild(doneInput);
  }else{
    planned.textContent = rowData.plannedDate
      ? formatDateFr(rowData.plannedDate)
      : "—";

    completed.textContent = rowData.completedDate
      ? formatDateFr(rowData.completedDate)
      : "—";

    done.innerHTML = rowData.done
      ? '<span class="monthly-status done">✓ Réalisé</span>'
      : '<span class="monthly-status pending">À réaliser</span>';
  }

  tr.append(service,evaluator,planned,completed,done);
  return tr;
}

function buildServiceSelector(event,serviceCatalog){
  const selected = new Set(
    servicePlanForEvent(event).map(row => row.service)
  );

  const panel = document.createElement("div");
  panel.className = "service-selector no-export";
  panel.dataset.eventId = event.id;
  panel.hidden = true;

  const title = document.createElement("div");
  title.className = "service-selector-title";
  title.innerHTML =
    `<strong>Services concernés</strong>` +
    `<span>Cochez uniquement les services à décliner pour cette action.</span>`;

  const grid = document.createElement("div");
  grid.className = "service-selector-grid";

  (serviceCatalog || []).forEach(service => {
    const label = document.createElement("label");
    label.className = "service-choice";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "service-choice-check";
    check.value = service;
    check.checked = selected.has(service);

    const text = document.createElement("span");
    text.textContent = service;

    label.append(check,text);
    grid.appendChild(label);
  });

  const addRow = document.createElement("div");
  addRow.className = "service-selector-add";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "service-catalog-new";
  input.maxLength = 120;
  input.placeholder = "Nouveau service à ajouter à la liste";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn ghost service-catalog-add";
  addBtn.dataset.eventId = event.id;
  addBtn.textContent = "+ Ajouter un service";

  addRow.append(input,addBtn);

  const actions = document.createElement("div");
  actions.className = "service-selector-actions";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn ghost service-selector-cancel";
  cancel.textContent = "Annuler";

  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "btn primary service-selector-apply";
  apply.dataset.eventId = event.id;
  apply.textContent = "Appliquer la sélection";

  actions.append(cancel,apply);

  panel.append(title,grid,addRow,actions);
  return panel;
}

function assignedEvaluatorsForEvent(event){
  if(Array.isArray(event.evaluators)){
    return event.evaluators
      .map(name => String(name || "").trim())
      .filter(Boolean);
  }

  // Compatibilité avec une sauvegarde V4.7 à un seul évaluateur.
  if(event.evaluator){
    return [String(event.evaluator).trim()].filter(Boolean);
  }

  return [];
}

function buildMonthlyEvaluator(event,editable=false,evaluatorCatalog=[]){
  if(event.type === "TH"){
    return null;
  }

  const assigned = assignedEvaluatorsForEvent(event);
  const hasServiceBreakdown =
    servicePlanForEvent(event).length > 0;

  // En administration, l'affectation globale reste disponible :
  // elle sert de valeur par défaut pour les services.
  // En lecture seule / PDF, si l'action est déclinée par service,
  // on n'affiche pas les évaluateurs une seconde fois dans l'en-tête.
  if(!editable && hasServiceBreakdown){
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = editable
    ? "monthly-evaluator-control no-export"
    : "monthly-evaluator-readonly";

  if(editable){
    const button = document.createElement("button");
    button.type = "button";
    button.className = "monthly-evaluator-toggle";
    button.dataset.eventId = event.id;
    button.textContent = assigned.length
      ? `Évaluateurs (${assigned.length})`
      : "Affecter les évaluateurs";

    const panel = document.createElement("div");
    panel.className = "evaluator-selector";
    panel.dataset.eventId = event.id;
    panel.hidden = true;

    const title = document.createElement("div");
    title.className = "evaluator-selector-title";
    title.innerHTML =
      `<strong>Évaluateurs de cette action</strong>` +
      `<span>Vous pouvez sélectionner plusieurs personnes.</span>`;

    const grid = document.createElement("div");
    grid.className = "evaluator-selector-grid";

    (evaluatorCatalog || []).forEach(name => {
      const label = document.createElement("label");
      label.className = "evaluator-choice";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "evaluator-choice-check";
      check.value = name;
      check.checked = assigned.includes(name);

      const text = document.createElement("span");
      text.textContent = name;

      label.append(check,text);
      grid.appendChild(label);
    });

    if(!(evaluatorCatalog || []).length){
      const empty = document.createElement("div");
      empty.className = "evaluator-selector-empty";
      empty.textContent =
        "Ajoutez d’abord un évaluateur dans la liste générale.";
      grid.appendChild(empty);
    }

    const actions = document.createElement("div");
    actions.className = "evaluator-selector-actions";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn ghost evaluator-selector-close";
    close.textContent = "Fermer";

    actions.appendChild(close);
    panel.append(title,grid,actions);
    wrap.append(button,panel);

  }else if(assigned.length){
    const label = document.createElement("span");
    label.textContent =
      assigned.length > 1 ? "Évaluateurs" : "Évaluateur";

    const names = document.createElement("div");
    names.className = "monthly-evaluator-names";

    assigned.forEach(name => {
      const chip = document.createElement("strong");
      chip.textContent = name;
      names.appendChild(chip);
    });

    wrap.append(label,names);
  }else{
    wrap.hidden = true;
  }

  return wrap;
}

function renderMonthlyPlanBody(
  targetId,
  month,
  events,
  editable=false,
  serviceCatalog=[],
  evaluatorCatalog=[]
){
  const root = document.getElementById(targetId);
  if(!root) return;

  const items = monthEvents(events,month);
  root.innerHTML = "";

  if(!items.length){
    root.innerHTML =
      '<div class="monthly-empty">Aucun événement n’est programmé pour ce mois.</div>';
    return;
  }

  items.forEach(event => {
    const block = document.createElement("section");
    block.className =
      `monthly-event monthly-type-${event.type}`;
    block.dataset.eventId = event.id;

    const isTheme = event.type === "TH";
    const rows = isTheme ? [] : servicePlanForEvent(event);
    const progress = eventServiceProgress(event);

    const head = document.createElement("div");
    head.className = "monthly-event-head";

    const title = document.createElement("div");
    title.className = "monthly-event-title";
    title.innerHTML =
      `<span class="badge ${event.type}">${event.type}</span>` +
      `<div>` +
        `<strong>${escapeHtml(event.label)}</strong>` +
        `<span>${escapeHtml(monthlyTypeLabel(event.type))}</span>` +
      `</div>`;

    if(isTheme){
      head.append(title);
    }else{
      const side = document.createElement("div");
      side.className = "monthly-event-side";

      const evaluator = buildMonthlyEvaluator(
        event,
        editable,
        evaluatorCatalog
      );

      if(evaluator){
        side.appendChild(evaluator);
      }

      const summary = document.createElement("div");
      summary.className = "monthly-event-summary";

      if(rows.length){
        summary.innerHTML =
          `<strong>${progress.done} / ${progress.total}</strong>` +
          `<span>service${progress.total > 1 ? "s" : ""} réalisé${progress.total > 1 ? "s" : ""}</span>`;
      }else{
        summary.innerHTML =
          `<span>Non décliné par service</span>`;
      }

      side.appendChild(summary);
      head.append(title,side);
    }

    const content = document.createElement("div");
    content.className = "monthly-event-content";

    if(isTheme){
      content.classList.add("monthly-theme-content");
    }else if(rows.length){
      const tableWrap = document.createElement("div");
      tableWrap.className = "monthly-table-wrap";

      const table = document.createElement("table");
      table.className = "monthly-table";

      table.innerHTML =
        `<thead><tr>` +
          `<th>Service</th>` +
          `<th>Évaluateur(s)</th>` +
          `<th>Date prévisionnelle</th>` +
          `<th>Date de réalisation</th>` +
          `<th>Réalisé</th>` +
        `</tr></thead>`;

      const tbody = document.createElement("tbody");

      rows.forEach(rowData => {
        tbody.appendChild(
          buildMonthlyServiceRow(
            event,
            rowData,
            editable,
            evaluatorCatalog
          )
        );
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);
      content.appendChild(tableWrap);

    }else if(!isTheme){
      const empty = document.createElement("div");
      empty.className = "monthly-event-empty";
      empty.textContent = editable
        ? "Aucun service sélectionné pour cet événement."
        : "Aucune déclinaison par service n’est programmée pour cet événement.";

      content.appendChild(empty);
    }

    if(editable && !isTheme){
      const tools = document.createElement("div");
      tools.className = "monthly-event-tools no-export";

      const decline = document.createElement("button");
      decline.type = "button";
      decline.className = "monthly-decline-services";
      decline.dataset.eventId = event.id;
      decline.textContent = rows.length
        ? "Modifier les services"
        : "Décliner par service";

      tools.appendChild(decline);
      content.appendChild(tools);
      content.appendChild(
        buildServiceSelector(
          event,
          serviceCatalog
        )
      );
    }

    block.append(head,content);
    root.appendChild(block);
  });
}
function buildEventRow(e, editable=false, handlers={}){
  const row = document.createElement("div");
  row.className = `event-row ${e.type}${e.done ? " done" : ""}`;
  row.dataset.id = e.id;

  const code = document.createElement("span");
  code.className = `event-code ${e.type}`;
  code.textContent = e.type;

  const content = document.createElement("div");
  content.className = "event-content";

  const label = document.createElement("span");
  label.className = "event-label";
  label.textContent = e.label;
  content.appendChild(label);

  const dateInfo = eventDateText(e);
  if(dateInfo.text){
    const date = document.createElement("span");
    date.className =
      `event-date ${dateInfo.status === "completed" ? "event-date-completed" : "event-date-planned"}`;
    date.textContent = dateInfo.text;
    content.appendChild(date);
  }

  row.append(code, content);

  if(editable){
    const actions = document.createElement("div");
    actions.className = "event-actions no-export";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "done-check";
    check.checked = !!e.done;
    check.title = e.type === "TH" ? "Thématique traitée" : "Événement réalisé";
    check.addEventListener("change", () =>
      handlers.toggle?.(e.id, check.checked)
    );

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "mini-btn";
    edit.textContent = "Modifier";
    edit.addEventListener("click", () => handlers.edit?.(e.id));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "mini-btn delete";
    del.textContent = "Suppr.";
    del.addEventListener("click", () => handlers.delete?.(e.id));

    actions.append(check, edit, del);
    row.append(actions);
  }

  return row;
}

function makeMonthTitle(month, handlers={}){
  const title = document.createElement("button");
  title.type = "button";
  title.className = "month-title month-title-clickable";
  title.innerHTML =
    `<span class="month-title-label">${escapeHtml(month)}</span>` +
    `<span class="month-title-action">Suivi mensuel <b>›</b></span>`;
  title.title = "Ouvrir la planification mensuelle";
  title.addEventListener("click", () => handlers.month?.(month));
  return title;
}

function monthSettingFor(month,monthSettings){
  if(!monthSettings) return null;

  if(Array.isArray(monthSettings)){
    return monthSettings.find(setting => setting.month === month) || null;
  }

  return monthSettings[month] || null;
}

function upgradeSettingFor(month,monthSettings){
  const setting = monthSettingFor(month,monthSettings);

  if(!setting){
    return {
      visible:false,
      title:"MISE À NIVEAU",
      subtitle:"Référentiel HAS 2028"
    };
  }

  return {
    visible:!!setting.upgradeVisible,
    title:setting.upgradeTitle || "MISE À NIVEAU",
    subtitle:setting.upgradeSubtitle || "Référentiel HAS 2028"
  };
}

function buildMonthCard(month, events, editable=false, handlers={}, monthSettings=[]){
  const card = document.createElement("div");
  card.className = `month-card ${phaseForMonth(month)}`.trim();

  const title = makeMonthTitle(month, handlers);

  const list = document.createElement("div");
  list.className = "event-list";

  monthEvents(events,month)
    .forEach(e => list.appendChild(buildEventRow(e,editable,handlers)));

  if(month === "AOÛT 2027"){
    const note = document.createElement("div");
    note.className = "month-note";
    note.innerHTML =
      "📅 <strong>Veille / publication attendue du référentiel HAS 2028</strong>";
    list.appendChild(note);
  }

  const upgrade = upgradeSettingFor(month,monthSettings);

  if(upgrade.visible){
    const up = document.createElement("div");
    up.className = "upgrade";
    up.innerHTML =
      '<div class="icon">⟳</div>' +
      `<div><b>${escapeHtml(upgrade.title)}</b>` +
      `<span>${escapeHtml(upgrade.subtitle)}</span></div>`;
    list.appendChild(up);
  }

  card.append(title,list);

  if(editable && month !== "FÉVRIER 2028"){
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-event no-export";
    add.textContent = "+ Ajouter un événement";
    add.addEventListener("click", () => handlers.add?.(month));
    card.appendChild(add);
  }

  return card;
}

function buildSection(title, months, events, editable=false, handlers={}, monthSettings=[]){
  const section = document.createElement("section");
  section.className = "section";

  const h = document.createElement("div");
  h.className = "section-title";
  h.textContent = title;

  const grid = document.createElement("div");
  grid.className = "month-grid";

  months.forEach(m =>
    grid.appendChild(buildMonthCard(m,events,editable,handlers,monthSettings))
  );

  section.append(h,grid);
  return section;
}

function buildFinalSection(events, editable=false, handlers={}, monthSettings=[]){
  const section = document.createElement("section");
  section.className = "section";

  const h = document.createElement("div");
  h.className = "section-title";
  h.textContent = "2028 · VÉRIFICATION FINALE ET CERTIFICATION";

  const grid = document.createElement("div");
  grid.className = "final-grid";

  const jan = document.createElement("div");
  jan.className = "final-col phase-final";

  const janTitle = makeMonthTitle("JANVIER 2028", handlers);
  janTitle.classList.add("final-month-title");

  const list = document.createElement("div");
  list.className = "event-list";

  monthEvents(events,"JANVIER 2028")
    .forEach(e => list.appendChild(buildEventRow(e,editable,handlers)));

  jan.append(janTitle, list);

  if(editable){
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-event no-export";
    add.textContent = "+ Ajouter un événement";
    add.addEventListener("click", () => handlers.add?.("JANVIER 2028"));
    jan.appendChild(add);
  }

  const note = document.createElement("div");
  note.className = "final-note";
  note.textContent = "Vérification finale avant la visite";
  jan.appendChild(note);

  const feb = document.createElement("div");
  feb.className = "final-col phase-visit";
  feb.innerHTML =
    '<div class="visit-card">' +
      '<div class="visit-head">FÉVRIER 2028 · VISITE DE CERTIFICATION HAS</div>' +
      '<div class="visit-body">' +
        '<div class="visit-icon">⚑</div>' +
        '<div><h3>VISITE DE CERTIFICATION HAS</h3>' +
        '<p>Aucune méthode interne programmée :<br>' +
        'mois entièrement réservé à la visite.</p></div>' +
      '</div>' +
    '</div>';

  grid.append(jan,feb);
  section.append(h,grid);
  return section;
}

function renderPlanning(targetId, events, editable=false, handlers={}, monthSettings=[]){
  const el = document.getElementById(targetId);
  if(!el) return;

  el.innerHTML = "";

  el.appendChild(buildSection(
    "2026-2027 · DÉPLOIEMENT ET ENTRAÎNEMENT",
    MONTHS.slice(0,12),
    events,
    editable,
    handlers,
    monthSettings
  ));

  el.appendChild(buildSection(
    "2027 · BASCULE VERS LE RÉFÉRENTIEL 2028",
    MONTHS.slice(12,16),
    events,
    editable,
    handlers,
    monthSettings
  ));

  el.appendChild(buildFinalSection(events,editable,handlers,monthSettings));

  renderStats(events);
  renderNext(events);
}

async function loadRemoteEvents(){
  if(!apiConfigured()) throw new Error("API non configurée");

  const r = await fetch(
    `${apiUrl()}?action=load&t=${Date.now()}`,
    { cache:"no-store" }
  );

  const data = await r.json();

  if(!data.ok || !Array.isArray(data.events)){
    throw new Error(data.error || "Données invalides");
  }

  return data;
}

async function postApi(payload){
  if(!apiConfigured()) throw new Error("API non configurée");

  const r = await fetch(apiUrl(),{
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify(payload)
  });

  const data = await r.json();

  if(!data.ok){
    throw new Error(data.error || "Erreur serveur");
  }

  return data;
}

function setConnectionStatus(text,mode="ok"){
  const textEl = document.getElementById("connectionText");
  const dot = document.getElementById("connectionDot");

  if(textEl) textEl.textContent = text;
  if(dot) dot.className = `status-dot ${mode}`;
}

function toast(msg){
  const el = document.getElementById("toast");
  if(!el) return;

  el.textContent = msg;
  el.classList.add("show");

  setTimeout(() => el.classList.remove("show"),1800);
}



function monthlySummaryStats(month,events){
  const items = monthEvents(events,month);

  const completedEvents =
    items.filter(event => event.done).length;

  const serviceRows =
    items.flatMap(event => servicePlanForEvent(event));

  const completedServiceRows =
    serviceRows.filter(row =>
      row.done && row.completedDate
    ).length;

  return {
    totalEvents:items.length,
    completedEvents,
    totalServiceRows:serviceRows.length,
    completedServiceRows
  };
}

function safeFileNamePart(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .toLowerCase();
}

async function exportMonthlyPdf(month,events){
  if(!month){
    throw new Error("Aucun mois sélectionné.");
  }

  const items = monthEvents(events,month);
  if(!items.length){
    throw new Error("Aucune action à exporter pour ce mois.");
  }

  const stats = monthlySummaryStats(month,events);

  const wrapper = document.createElement("div");
  wrapper.className = "monthly-pdf-export";
  wrapper.setAttribute("aria-hidden","true");

  const header = document.createElement("div");
  header.className = "monthly-pdf-header";

  header.innerHTML =
    `<div class="monthly-pdf-brand">` +
      `<img src="logo-chimr.jpg" alt="CHIMR">` +
      `<div>` +
        `<div class="monthly-pdf-kicker">CERTIFICATION HAS 2028</div>` +
        `<h1>Synthèse mensuelle des actions</h1>` +
        `<h2>${escapeHtml(month)}</h2>` +
      `</div>` +
    `</div>` +
    `<div class="monthly-pdf-generated">` +
      `Édité le ${new Date().toLocaleDateString("fr-FR")}` +
    `</div>`;

  const summary = document.createElement("div");
  summary.className = "monthly-pdf-summary";
  summary.innerHTML =
    `<div class="monthly-pdf-stat">` +
      `<span>Actions réalisées</span>` +
      `<strong>${stats.completedEvents} / ${stats.totalEvents}</strong>` +
    `</div>` +
    `<div class="monthly-pdf-stat">` +
      `<span>Déclinaisons réalisées</span>` +
      `<strong>${stats.completedServiceRows} / ${stats.totalServiceRows}</strong>` +
    `</div>` +
    `<div class="monthly-pdf-stat monthly-pdf-stat-wide">` +
      `<span>Objet</span>` +
      `<strong>Suivi des actions programmées et réalisées</strong>` +
    `</div>`;

  const plan = document.createElement("div");
  plan.id = "monthlyPdfPlan";
  plan.className = "monthly-pdf-plan";

  wrapper.append(header,summary,plan);
  document.body.appendChild(wrapper);

  try{
    renderMonthlyPlanBody(
      "monthlyPdfPlan",
      month,
      events,
      false,
      []
    );

    await new Promise(resolve => setTimeout(resolve,120));

    const canvas = await html2canvas(wrapper,{
      scale:2,
      backgroundColor:"#ffffff",
      useCORS:true,
      logging:false,
      windowWidth:980
    });

    const {jsPDF} = window.jspdf;

    const pdf = new jsPDF({
      orientation:"portrait",
      unit:"mm",
      format:"a4",
      compress:true
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const marginX = 8;
    const marginY = 8;
    const usableWidth = pageWidth - (marginX * 2);
    const usableHeight = pageHeight - (marginY * 2);

    const pxPerMm = canvas.width / usableWidth;
    const pageSliceHeightPx =
      Math.floor(usableHeight * pxPerMm);

    let sourceY = 0;
    let page = 0;

    while(sourceY < canvas.height){
      const sliceHeight =
        Math.min(
          pageSliceHeightPx,
          canvas.height - sourceY
        );

      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;

      const ctx = slice.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0,0,slice.width,slice.height);

      ctx.drawImage(
        canvas,
        0,sourceY,
        canvas.width,sliceHeight,
        0,0,
        canvas.width,sliceHeight
      );

      const img = slice.toDataURL("image/jpeg",0.94);
      const renderedHeight = sliceHeight / pxPerMm;

      if(page > 0){
        pdf.addPage("a4","portrait");
      }

      pdf.addImage(
        img,
        "JPEG",
        marginX,
        marginY,
        usableWidth,
        renderedHeight,
        undefined,
        "FAST"
      );

      sourceY += sliceHeight;
      page += 1;
    }

    const filename =
      `synthese-actions-${safeFileNamePart(month)}-CHIMR.pdf`;

    pdf.save(filename);

  }finally{
    wrapper.remove();
  }
}

async function exportCanvas(){
  const area = document.getElementById("exportArea");

  document.body.classList.add("exporting");
  await new Promise(r => setTimeout(r,80));

  const canvas = await html2canvas(area,{
    scale:2,
    backgroundColor:"#ffffff",
    useCORS:true,
    logging:false
  });

  document.body.classList.remove("exporting");
  return canvas;
}

async function exportPng(){
  const canvas = await exportCanvas();
  const a = document.createElement("a");

  a.download = "programme-certification-HAS-2028-CHIMR.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}

async function exportPdf(){
  const canvas = await exportCanvas();
  const img = canvas.toDataURL("image/png");
  const {jsPDF} = window.jspdf;

  const orientation =
    canvas.width >= canvas.height ? "landscape" : "portrait";

  const pdf = new jsPDF({
    orientation,
    unit:"mm",
    format:"a3"
  });

  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pw/canvas.width,ph/canvas.height);

  const w = canvas.width * ratio;
  const h = canvas.height * ratio;

  pdf.addImage(
    img,
    "PNG",
    (pw-w)/2,
    (ph-h)/2,
    w,
    h,
    "FAST"
  );

  pdf.save("programme-certification-HAS-2028-CHIMR.pdf");
}

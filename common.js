
const TYPE_ORDER = { TH:0, JT:1, PT:2, PR:3, TC:4, AS:5, EV:6, EP:7 };

const TYPE_LABELS = {
  TH:"Thématique",
  JT:"Journée thématique",
  PT:"Patient traceur",
  PR:"Parcours traceur",
  TC:"Traceur ciblé",
  AS:"Audit système",
  EV:"Évaluation",
  EP:"Expérience patient"
};

const DATED_TYPES = new Set(["JT","PT","PR","TC","AS","EV","EP"]);

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

  ["TH","JT","PT","PR","TC","AS","EV","EP"].forEach(t => {
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
  if(!DATED_TYPES.has(e.type)) return "";

  if(e.done && e.completedDate){
    return `Réalisé le ${formatDateFr(e.completedDate)}`;
  }

  if(e.plannedDate){
    return `Prévu le ${formatDateFr(e.plannedDate)}`;
  }

  if(e.done){
    return "Réalisé";
  }

  return "";
}

function servicePlanForEvent(event){
  return Array.isArray(event.servicePlan)
    ? event.servicePlan
        .map(row => ({
          service:String(row.service || "").trim(),
          plannedDate:row.plannedDate || "",
          completedDate:row.completedDate || "",
          done:!!row.done
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

function buildMonthlyServiceRow(eventId,rowData,editable=false){
  const tr = document.createElement("tr");
  tr.dataset.eventId = eventId;
  tr.dataset.service = rowData.service;

  if(rowData.done){
    tr.classList.add("monthly-row-done");
  }

  const service = document.createElement("td");
  service.className = "monthly-service";
  service.textContent = rowData.service;

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

  tr.append(service,planned,completed,done);
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

function renderMonthlyPlanBody(
  targetId,
  month,
  events,
  editable=false,
  serviceCatalog=[]
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
    block.className = "monthly-event";
    block.dataset.eventId = event.id;

    const rows = servicePlanForEvent(event);
    const progress = eventServiceProgress(event);

    const head = document.createElement("div");
    head.className = "monthly-event-head";

    const title = document.createElement("div");
    title.className = "monthly-event-title";
    title.innerHTML =
      `<span class="badge ${event.type}">${event.type}</span>` +
      `<div>` +
        `<strong>${escapeHtml(event.label)}</strong>` +
        `<span>${escapeHtml(TYPE_LABELS[event.type] || event.type)}</span>` +
      `</div>`;

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

    head.append(title,summary);

    const content = document.createElement("div");
    content.className = "monthly-event-content";

    if(rows.length){
      const tableWrap = document.createElement("div");
      tableWrap.className = "monthly-table-wrap";

      const table = document.createElement("table");
      table.className = "monthly-table";

      table.innerHTML =
        `<thead><tr>` +
          `<th>Service</th>` +
          `<th>Date prévisionnelle</th>` +
          `<th>Date de réalisation</th>` +
          `<th>Réalisé</th>` +
        `</tr></thead>`;

      const tbody = document.createElement("tbody");

      rows.forEach(rowData => {
        tbody.appendChild(
          buildMonthlyServiceRow(
            event.id,
            rowData,
            editable
          )
        );
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);
      content.appendChild(tableWrap);

    }else{
      const empty = document.createElement("div");
      empty.className = "monthly-event-empty";
      empty.textContent = editable
        ? "Aucun service sélectionné pour cet événement."
        : "Aucune déclinaison par service n’est programmée pour cet événement.";

      content.appendChild(empty);
    }

    if(editable){
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

  const dateText = eventDateText(e);
  if(dateText){
    const date = document.createElement("span");
    date.className = "event-date";
    date.textContent = dateText;
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
  title.textContent = month;
  title.title = "Ouvrir la planification mensuelle";
  title.addEventListener("click", () => handlers.month?.(month));
  return title;
}

function buildMonthCard(month, events, editable=false, handlers={}){
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

  if(["OCTOBRE 2027","NOVEMBRE 2027","DÉCEMBRE 2027"].includes(month)){
    const up = document.createElement("div");
    up.className = "upgrade";
    up.innerHTML =
      '<div class="icon">⟳</div>' +
      '<div><b>MISE À NIVEAU</b><span>Référentiel HAS 2028</span></div>';
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

function buildSection(title, months, events, editable=false, handlers={}){
  const section = document.createElement("section");
  section.className = "section";

  const h = document.createElement("div");
  h.className = "section-title";
  h.textContent = title;

  const grid = document.createElement("div");
  grid.className = "month-grid";

  months.forEach(m =>
    grid.appendChild(buildMonthCard(m,events,editable,handlers))
  );

  section.append(h,grid);
  return section;
}

function buildFinalSection(events, editable=false, handlers={}){
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

function renderPlanning(targetId, events, editable=false, handlers={}){
  const el = document.getElementById(targetId);
  if(!el) return;

  el.innerHTML = "";

  el.appendChild(buildSection(
    "2026-2027 · DÉPLOIEMENT ET ENTRAÎNEMENT",
    MONTHS.slice(0,12),
    events,
    editable,
    handlers
  ));

  el.appendChild(buildSection(
    "2027 · BASCULE VERS LE RÉFÉRENTIEL 2028",
    MONTHS.slice(12,16),
    events,
    editable,
    handlers
  ));

  el.appendChild(buildFinalSection(events,editable,handlers));

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

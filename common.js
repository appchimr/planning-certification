
const TYPE_ORDER = { TH:0, PT:1, PR:2, TC:3, AS:4, EV:5, EP:6 };

const TYPE_LABELS = {
  TH:"Thématique",
  PT:"Patient traceur",
  PR:"Parcours traceur",
  TC:"Traceur ciblé",
  AS:"Audit système",
  EV:"Évaluation",
  EP:"Expérience patient"
};

const DATED_TYPES = new Set(["PT","PR","TC","AS","EV","EP"]);

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

  ["TH","PT","PR","TC","AS","EV","EP"].forEach(t => {
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

function buildMonthCard(month, events, editable=false, handlers={}){
  const card = document.createElement("div");
  card.className = `month-card ${phaseForMonth(month)}`.trim();

  const title = document.createElement("div");
  title.className = "month-title";
  title.textContent = month;

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
  jan.innerHTML =
    '<div class="final-title">JANVIER 2028 · AUDITS SYSTÈME</div>';

  const list = document.createElement("div");
  list.className = "event-list";

  monthEvents(events,"JANVIER 2028")
    .forEach(e => list.appendChild(buildEventRow(e,editable,handlers)));

  jan.appendChild(list);

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

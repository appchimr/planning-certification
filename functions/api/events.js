
const ALLOWED_TYPES = new Set(["TH","PT","PR","TC","AS","EV","EP","CR","JT","FP"]);

const TYPE_ORDER = {
  TH:0, PT:1, PR:2, TC:3, AS:4,
  EV:5, EP:6, CR:7, JT:8, FP:9
};

const DEFAULT_SERVICES = [
  "Urgences",
  "Médecine",
  "SMR",
  "HAD",
  "Médecine addictologie",
  "SMR addictologie",
  "HDJ CARP",
  "USLD",
  "Psychiatrie",
  "Laboratoire",
  "Imagerie médicale",
  "Pharmacie"
];

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function validIsoDate(value) {
  return value === "" || /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function normalizeEvent(ev) {
  if (!ev || typeof ev !== "object") {
    throw new Error("Événement invalide.");
  }

  const id = String(ev.id || "").trim();
  const month = String(ev.month || "").trim();
  const type = String(ev.type || "").trim();
  const label = String(ev.label || "").trim();
  const plannedDate = String(ev.plannedDate || "").trim();
  const completedDate = String(ev.completedDate || "").trim();

  if (!id || id.length > 100) throw new Error("ID invalide.");
  if (!month || month.length > 40) throw new Error("Mois invalide.");
  if (!ALLOWED_TYPES.has(type)) throw new Error("Type invalide.");
  if (!label || label.length > 200) throw new Error("Libellé invalide.");
  if (!validIsoDate(plannedDate)) throw new Error("Date programmée invalide.");
  if (!validIsoDate(completedDate)) throw new Error("Date réalisée invalide.");

  return {
    id,
    month,
    type,
    label,
    done: Boolean(ev.done || completedDate),
    plannedDate,
    completedDate,
    sortOrder: TYPE_ORDER[type] ?? 99
  };
}

function normalizePlanRow(row) {
  if (!row || typeof row !== "object") {
    throw new Error("Ligne de planification invalide.");
  }

  const eventId = String(row.eventId || "").trim();
  const service = String(row.service || "").trim();
  const plannedDate = String(row.plannedDate || "").trim();
  const completedDate = String(row.completedDate || "").trim();

  if (!eventId || eventId.length > 100) {
    throw new Error("Événement de planification invalide.");
  }

  if (!service || service.length > 120) {
    throw new Error("Nom de service invalide.");
  }

  if (!validIsoDate(plannedDate)) {
    throw new Error("Date prévisionnelle invalide.");
  }

  if (!validIsoDate(completedDate)) {
    throw new Error("Date de réalisation invalide.");
  }

  const evaluatorMode =
    row.evaluatorMode === "custom"
      ? "custom"
      : "inherit";

  const evaluators =
    evaluatorMode === "custom"
      ? normalizeEvaluatorCatalog(
          Array.isArray(row.evaluators)
            ? row.evaluators
            : []
        )
      : [];

  return {
    eventId,
    service,
    plannedDate,
    completedDate,
    done: Boolean(row.done || completedDate),
    evaluatorMode,
    evaluators
  };
}

function normalizeServiceName(value) {
  const name = String(value || "").trim();

  if (!name || name.length > 120) {
    throw new Error("Nom de service invalide.");
  }

  return name;
}

function normalizeServiceCatalog(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Map();

  values.forEach(value => {
    const name = normalizeServiceName(value);
    const key = name.toLocaleLowerCase("fr");

    if (!unique.has(key)) {
      unique.set(key, name);
    }
  });

  return [...unique.values()];
}

function secureEqual(a, b) {
  a = String(a || "");
  b = String(b || "");

  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

function checkAdmin(env, candidate) {
  if (!env.ADMIN_KEY) {
    throw new Error("Le secret ADMIN_KEY n’est pas configuré dans Cloudflare.");
  }

  return secureEqual(candidate, env.ADMIN_KEY);
}

function chunks(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

function makeEventUpserts(db, events) {
  const statements = [];

  for (const chunk of chunks(events, 12)) {
    const values = chunk
      .map(() => "(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
      .join(",");

    const sql = `
      INSERT INTO events (
        id, month, type, label, done,
        planned_date, completed_date, sort_order, updated_at
      )
      VALUES ${values}
      ON CONFLICT(id) DO UPDATE SET
        month = excluded.month,
        type = excluded.type,
        label = excluded.label,
        done = excluded.done,
        planned_date = excluded.planned_date,
        completed_date = excluded.completed_date,
        sort_order = excluded.sort_order,
        updated_at = CURRENT_TIMESTAMP
    `;

    const params = [];

    chunk.forEach(ev => {
      params.push(
        ev.id,
        ev.month,
        ev.type,
        ev.label,
        ev.done ? 1 : 0,
        ev.plannedDate || null,
        ev.completedDate || null,
        ev.sortOrder
      );
    });

    statements.push(db.prepare(sql).bind(...params));
  }

  return statements;
}

function makeServiceUpserts(db, services) {
  const statements = [];

  for (const chunk of chunks(services, 30)) {
    const values = chunk
      .map(() => "(?,?,1,CURRENT_TIMESTAMP)")
      .join(",");

    const sql = `
      INSERT INTO service_catalog (
        name, sort_order, active, updated_at
      )
      VALUES ${values}
      ON CONFLICT(name) DO UPDATE SET
        sort_order = excluded.sort_order,
        active = 1,
        updated_at = CURRENT_TIMESTAMP
    `;

    const params = [];

    chunk.forEach((name,index) => {
      params.push(
        name,
        services.indexOf(name) + 1
      );
    });

    statements.push(db.prepare(sql).bind(...params));
  }

  return statements;
}

function makePlanInserts(db, rows) {
  const statements = [];

  for (const chunk of chunks(rows, 20)) {
    const values = chunk
      .map(() => "(?,?,?,?,?,CURRENT_TIMESTAMP)")
      .join(",");

    const sql = `
      INSERT INTO monthly_actions (
        event_id, service, planned_date,
        completed_date, done, updated_at
      )
      VALUES ${values}
      ON CONFLICT(event_id, service) DO UPDATE SET
        planned_date = excluded.planned_date,
        completed_date = excluded.completed_date,
        done = excluded.done,
        updated_at = CURRENT_TIMESTAMP
    `;

    const params = [];

    chunk.forEach(row => {
      params.push(
        row.eventId,
        row.service,
        row.plannedDate || null,
        row.completedDate || null,
        row.done ? 1 : 0
      );
    });

    statements.push(db.prepare(sql).bind(...params));
  }

  return statements;
}

function makeDeleteByIds(db, table, column, ids) {
  const statements = [];

  for (const chunk of chunks(ids, 90)) {
    const marks = chunk.map(() => "?").join(",");
    statements.push(
      db.prepare(
        `DELETE FROM ${table} WHERE ${column} IN (${marks})`
      ).bind(...chunk)
    );
  }

  return statements;
}

function makeServiceEvaluatorOverrideInserts(db,rows) {
  return rows
    .filter(row => row.evaluatorMode === "custom")
    .map(row =>
      db.prepare(`
        INSERT INTO service_evaluator_overrides (
          event_id, service, updated_at
        )
        VALUES (?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(event_id,service) DO UPDATE SET
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        row.eventId,
        row.service
      )
    );
}

function makeServiceEvaluatorAssignmentInserts(db,rows) {
  const assignments = [];

  rows
    .filter(row => row.evaluatorMode === "custom")
    .forEach(row => {
      row.evaluators.forEach(evaluator => {
        assignments.push({
          eventId:row.eventId,
          service:row.service,
          evaluator
        });
      });
    });

  return assignments.map(item =>
    db.prepare(`
      INSERT INTO service_evaluator_assignments (
        event_id, service, evaluator, updated_at
      )
      VALUES (?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(event_id,service,evaluator) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      item.eventId,
      item.service,
      item.evaluator
    )
  );
}

async function readAll(db) {
  const [
    eventResult,
    planResult,
    serviceResult,
    monthSettingResult,
    evaluatorResult,
    assignmentResult,
    serviceOverrideResult,
    serviceEvaluatorResult
  ] = await db.batch([
    db.prepare(`
      SELECT
        id, month, type, label, done,
        planned_date AS plannedDate,
        completed_date AS completedDate,
        updated_at AS updatedAt
      FROM events
      ORDER BY sort_order ASC, label COLLATE NOCASE ASC
    `),
    db.prepare(`
      SELECT
        event_id AS eventId,
        service,
        planned_date AS plannedDate,
        completed_date AS completedDate,
        done
      FROM monthly_actions
      ORDER BY event_id ASC, service ASC
    `),
    db.prepare(`
      SELECT name
      FROM service_catalog
      WHERE active = 1
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC
    `),
    db.prepare(`
      SELECT
        month,
        upgrade_visible AS upgradeVisible,
        upgrade_title AS upgradeTitle,
        upgrade_subtitle AS upgradeSubtitle,
        updated_at AS updatedAt
      FROM month_settings
      ORDER BY month ASC
    `),
    db.prepare(`
      SELECT name
      FROM evaluator_catalog
      WHERE active = 1
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC
    `),
    db.prepare(`
      SELECT
        event_id AS eventId,
        evaluator
      FROM event_assignments
      ORDER BY event_id ASC, evaluator ASC
    `),
    db.prepare(`
      SELECT
        event_id AS eventId,
        service
      FROM service_evaluator_overrides
    `),
    db.prepare(`
      SELECT
        event_id AS eventId,
        service,
        evaluator
      FROM service_evaluator_assignments
      ORDER BY event_id ASC, service ASC, evaluator ASC
    `)
  ]);

  const overrideKeys = new Set(
    (serviceOverrideResult.results || []).map(row =>
      `${String(row.eventId)}::${String(row.service)}`
    )
  );

  const serviceEvaluatorMap = new Map();

  (serviceEvaluatorResult.results || []).forEach(row => {
    const key =
      `${String(row.eventId)}::${String(row.service)}`;

    if(!serviceEvaluatorMap.has(key)){
      serviceEvaluatorMap.set(key,[]);
    }

    serviceEvaluatorMap
      .get(key)
      .push(String(row.evaluator || ""));
  });

  const planMap = new Map();

  (planResult.results || []).forEach(row => {
    const eventId = String(row.eventId);
    const service = String(row.service);
    const key = `${eventId}::${service}`;

    if (!planMap.has(eventId)) {
      planMap.set(eventId, []);
    }

    planMap.get(eventId).push({
      service,
      plannedDate:row.plannedDate || "",
      completedDate:row.completedDate || "",
      done:Number(row.done) === 1,
      evaluatorMode:
        overrideKeys.has(key)
          ? "custom"
          : "inherit",
      evaluators:
        overrideKeys.has(key)
          ? (serviceEvaluatorMap.get(key) || [])
          : []
    });
  });

  const evaluatorMap = new Map();

  (assignmentResult.results || []).forEach(row => {
    const eventId = String(row.eventId);
    const evaluator = String(row.evaluator || "").trim();

    if(!evaluator){
      return;
    }

    if(!evaluatorMap.has(eventId)){
      evaluatorMap.set(eventId,[]);
    }

    evaluatorMap.get(eventId).push(evaluator);
  });

  const events = (eventResult.results || []).map(row => ({
    id:String(row.id),
    month:String(row.month),
    type:String(row.type),
    label:String(row.label),
    done:Number(row.done) === 1,
    plannedDate:row.plannedDate || "",
    completedDate:row.completedDate || "",
    updatedAt:row.updatedAt || "",
    evaluators:evaluatorMap.get(String(row.id)) || [],
    servicePlan:planMap.get(String(row.id)) || []
  }));

  const services = (serviceResult.results || [])
    .map(row => String(row.name))
    .filter(Boolean);

  const monthSettings = (monthSettingResult.results || [])
    .map(row => ({
      month:String(row.month),
      upgradeVisible:Number(row.upgradeVisible) === 1,
      upgradeTitle:row.upgradeTitle || "MISE À NIVEAU",
      upgradeSubtitle:row.upgradeSubtitle || "Référentiel HAS 2028",
      updatedAt:row.updatedAt || ""
    }));

  const evaluators = (evaluatorResult.results || [])
    .map(row => String(row.name))
    .filter(Boolean);

  return {
    events,
    services,
    monthSettings,
    evaluators
  };
}

export async function onRequestGet(context) {
  try {
    const data = await readAll(context.env.DB);

    return json({
      ok:true,
      events:data.events,
      services:data.services,
      monthSettings:data.monthSettings,
      evaluators:data.evaluators,
      serverTime: new Date().toISOString(),
      storage: "cloudflare-d1",
      schemaVersion: 2.8
    });

  } catch (err) {
    return json({
      ok: false,
      error: String(err?.message || err)
    }, 500);
  }
}

async function saveAllEvents(db, rawEvents) {
  if (!Array.isArray(rawEvents)) {
    throw new Error("Liste d’événements invalide.");
  }

  if (rawEvents.length > 1000) {
    throw new Error("Trop d’événements.");
  }

  const events = rawEvents.map(normalizeEvent);

  const existing = await db
    .prepare("SELECT id FROM events")
    .all();

  const incomingIds = new Set(events.map(e => e.id));
  const removedIds = (existing.results || [])
    .map(r => String(r.id))
    .filter(id => !incomingIds.has(id));

  const statements = [];

  statements.push(...makeEventUpserts(db, events));

  if (removedIds.length) {
    statements.push(
      ...makeDeleteByIds(
        db,
        "monthly_actions",
        "event_id",
        removedIds
      )
    );

    statements.push(
      ...makeDeleteByIds(
        db,
        "events",
        "id",
        removedIds
      )
    );
  }

  if (statements.length) {
    await db.batch(statements);
  }

  return events.length;
}

async function saveMonthPlan(
  db,
  month,
  rawPlans,
  rawServices,
  rawEvaluatorAssignments
) {
  month = String(month || "").trim();

  if (!month || month.length > 40) {
    throw new Error("Mois invalide.");
  }

  if (!Array.isArray(rawPlans)) {
    throw new Error("Planification mensuelle invalide.");
  }

  if (rawPlans.length > 500) {
    throw new Error("Trop de lignes de planification.");
  }

  const plans = rawPlans.map(normalizePlanRow);
  const services = normalizeServiceCatalog(rawServices);
  const evaluatorAssignments =
    normalizeEvaluatorAssignments(rawEvaluatorAssignments);

  const eventResult = await db
    .prepare("SELECT id FROM events WHERE month = ?")
    .bind(month)
    .all();

  const validIds = new Set(
    (eventResult.results || []).map(row => String(row.id))
  );

  const filteredPlans =
    plans.filter(plan => validIds.has(plan.eventId));

  const filteredAssignments =
    evaluatorAssignments.filter(item =>
      validIds.has(item.eventId)
    );

  const evaluatorNames = normalizeEvaluatorCatalog([
    ...filteredAssignments
      .map(item => item.evaluator)
      .filter(Boolean),
    ...filteredPlans.flatMap(row =>
      row.evaluatorMode === "custom"
        ? row.evaluators
        : []
    )
  ]);

  const statements = [
    ...makeServiceUpserts(db,services),
    ...makeEvaluatorCatalogUpserts(db,evaluatorNames),

    db.prepare(`
      DELETE FROM service_evaluator_assignments
      WHERE event_id IN (
        SELECT id FROM events WHERE month = ?
      )
    `).bind(month),

    db.prepare(`
      DELETE FROM service_evaluator_overrides
      WHERE event_id IN (
        SELECT id FROM events WHERE month = ?
      )
    `).bind(month),

    db.prepare(`
      DELETE FROM monthly_actions
      WHERE event_id IN (
        SELECT id FROM events WHERE month = ?
      )
    `).bind(month),

    ...makePlanInserts(db,filteredPlans),
    ...makeServiceEvaluatorOverrideInserts(
      db,
      filteredPlans
    ),
    ...makeServiceEvaluatorAssignmentInserts(
      db,
      filteredPlans
    ),

    db.prepare(`
      DELETE FROM event_assignments
      WHERE event_id IN (
        SELECT id FROM events WHERE month = ?
      )
    `).bind(month),

    ...makeEvaluatorAssignmentInserts(
      db,
      filteredAssignments
    )
  ];

  await db.batch(statements);

  return {
    plans:filteredPlans.length,
    evaluatorAssignments:filteredAssignments.length,
    serviceEvaluatorOverrides:
      filteredPlans.filter(
        row => row.evaluatorMode === "custom"
      ).length
  };
}

function normalizeEvaluatorName(value) {
  const name = String(value || "").trim();

  if (!name || name.length > 120) {
    throw new Error("Nom d’évaluateur invalide.");
  }

  return name;
}

function normalizeEvaluatorCatalog(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Map();

  values.forEach(value => {
    const name = normalizeEvaluatorName(value);
    const key = name.toLocaleLowerCase("fr");

    if (!unique.has(key)) {
      unique.set(key,name);
    }
  });

  return [...unique.values()];
}

function normalizeEvaluatorAssignments(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const rows = [];

  values.forEach(raw => {
    const eventId = String(raw?.eventId || "").trim();

    if(!eventId){
      return;
    }

    const names = Array.isArray(raw?.evaluators)
      ? raw.evaluators
      : (raw?.evaluator ? [raw.evaluator] : []);

    normalizeEvaluatorCatalog(names)
      .forEach(evaluator => {
        rows.push({
          eventId,
          evaluator
        });
      });
  });

  return rows;
}

function makeEvaluatorCatalogUpserts(db,evaluators) {
  const statements = [];

  for (const chunk of chunks(evaluators,30)) {
    const values = chunk
      .map(() => "(?,?,1,CURRENT_TIMESTAMP)")
      .join(",");

    const params = [];

    chunk.forEach(name => {
      params.push(
        name,
        evaluators.indexOf(name) + 1
      );
    });

    statements.push(
      db.prepare(`
        INSERT INTO evaluator_catalog (
          name, sort_order, active, updated_at
        )
        VALUES ${values}
        ON CONFLICT(name) DO UPDATE SET
          active = 1,
          updated_at = CURRENT_TIMESTAMP
      `).bind(...params)
    );
  }

  return statements;
}

function makeEvaluatorAssignmentInserts(db,assignments) {
  return assignments.map(item =>
    db.prepare(`
      INSERT INTO event_assignments (
        event_id, evaluator, updated_at
      )
      VALUES (?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(event_id,evaluator) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      item.eventId,
      item.evaluator
    )
  );
}

function normalizeMonthSettings(rawSettings) {
  if (!Array.isArray(rawSettings)) {
    return [];
  }

  return rawSettings.map(raw => {
    const month = String(raw?.month || "").trim();
    const upgradeTitle =
      String(raw?.upgradeTitle || "MISE À NIVEAU").trim();
    const upgradeSubtitle =
      String(raw?.upgradeSubtitle || "Référentiel HAS 2028").trim();

    if (!month || month.length > 40) {
      throw new Error("Mois de réglage invalide.");
    }

    if (!upgradeTitle || upgradeTitle.length > 120) {
      throw new Error("Titre du bandeau invalide.");
    }

    if (!upgradeSubtitle || upgradeSubtitle.length > 180) {
      throw new Error("Sous-titre du bandeau invalide.");
    }

    return {
      month,
      upgradeVisible:Boolean(raw.upgradeVisible),
      upgradeTitle,
      upgradeSubtitle
    };
  });
}

function makeMonthSettingUpserts(db,settings) {
  return settings.map(setting =>
    db.prepare(`
      INSERT INTO month_settings (
        month,
        upgrade_visible,
        upgrade_title,
        upgrade_subtitle,
        updated_at
      )
      VALUES (?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(month) DO UPDATE SET
        upgrade_visible = excluded.upgrade_visible,
        upgrade_title = excluded.upgrade_title,
        upgrade_subtitle = excluded.upgrade_subtitle,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      setting.month,
      setting.upgradeVisible ? 1 : 0,
      setting.upgradeTitle,
      setting.upgradeSubtitle
    )
  );
}

async function restoreAll(
  db,
  rawEvents,
  rawServices,
  rawMonthSettings,
  rawEvaluators
) {
  if (!Array.isArray(rawEvents)) {
    throw new Error("Sauvegarde invalide.");
  }

  if (rawEvents.length > 1000) {
    throw new Error("Sauvegarde trop volumineuse.");
  }

  const events = rawEvents.map(normalizeEvent);
  const plans = [];
  const assignments = [];
  const services = normalizeServiceCatalog(rawServices);
  const monthSettings = normalizeMonthSettings(rawMonthSettings);

  rawEvents.forEach(raw => {
    const id = String(raw.id || "").trim();

    if (Array.isArray(raw.servicePlan)) {
      raw.servicePlan.forEach(row => {
        plans.push(
          normalizePlanRow({
            ...row,
            eventId:id
          })
        );
      });
    }

    const eventEvaluators = Array.isArray(raw.evaluators)
      ? raw.evaluators
      : (raw.evaluator ? [raw.evaluator] : []);

    normalizeEvaluatorCatalog(eventEvaluators)
      .forEach(evaluator => {
        assignments.push({
          eventId:id,
          evaluator
        });
      });
  });

  const evaluatorCatalog = normalizeEvaluatorCatalog([
    ...(Array.isArray(rawEvaluators) ? rawEvaluators : []),
    ...assignments.map(item => item.evaluator),
    ...plans.flatMap(row =>
      row.evaluatorMode === "custom"
        ? row.evaluators
        : []
    )
  ]);

  const statements = [
    db.prepare("DELETE FROM service_evaluator_assignments"),
    db.prepare("DELETE FROM service_evaluator_overrides"),
    db.prepare("DELETE FROM monthly_actions"),
    db.prepare("DELETE FROM event_assignments"),
    db.prepare("DELETE FROM events"),

    ...makeEventUpserts(db,events),
    ...makePlanInserts(db,plans),
    ...makeServiceEvaluatorOverrideInserts(db,plans),
    ...makeServiceEvaluatorAssignmentInserts(db,plans),
    ...makeEvaluatorAssignmentInserts(db,assignments)
  ];

  if (services.length) {
    statements.push(
      db.prepare("DELETE FROM service_catalog"),
      ...makeServiceUpserts(db,services)
    );
  }

  if (monthSettings.length) {
    statements.push(
      db.prepare("DELETE FROM month_settings"),
      ...makeMonthSettingUpserts(db,monthSettings)
    );
  }

  if (evaluatorCatalog.length) {
    statements.push(
      db.prepare("DELETE FROM evaluator_catalog"),
      ...makeEvaluatorCatalogUpserts(
        db,
        evaluatorCatalog
      )
    );
  }

  await db.batch(statements);

  return {
    events:events.length,
    plans:plans.length,
    evaluatorAssignments:assignments.length,
    serviceEvaluatorOverrides:
      plans.filter(row =>
        row.evaluatorMode === "custom"
      ).length
  };
}

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    const action = String(payload?.action || "");

    if (action === "auth") {
      const ok = checkAdmin(context.env, payload.adminKey);

      return json({
        ok,
        error: ok ? undefined : "Clé d’administration invalide."
      }, ok ? 200 : 401);
    }

    if (!checkAdmin(context.env, payload.adminKey)) {
      return json({
        ok: false,
        error: "Clé d’administration invalide."
      }, 401);
    }

    const now = new Date().toISOString();

    if (action === "saveAll") {
      const saved = await saveAllEvents(
        context.env.DB,
        payload.events,
        payload.services,
        payload.monthSettings
      );

      return json({
        ok:true,
        saved,
        serverTime:now,
        storage:"cloudflare-d1"
      });
    }

    if (action === "saveMonthPlan") {
      const saved = await saveMonthPlan(
        context.env.DB,
        payload.month,
        payload.plans,
        payload.services,
        payload.evaluatorAssignments
      );

      return json({
        ok:true,
        saved,
        serverTime:now,
        storage:"cloudflare-d1"
      });
    }

    if (action === "addEvaluator") {
      const name = normalizeEvaluatorName(payload.name);

      const orderResult = await context.env.DB.prepare(`
        SELECT COALESCE(MAX(sort_order),0) + 1 AS nextOrder
        FROM evaluator_catalog
      `).first();

      await context.env.DB.prepare(`
        INSERT INTO evaluator_catalog (
          name, sort_order, active, updated_at
        )
        VALUES (?,?,1,CURRENT_TIMESTAMP)
        ON CONFLICT(name) DO UPDATE SET
          active = 1,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        name,
        Number(orderResult?.nextOrder || 1)
      ).run();

      const result = await context.env.DB.prepare(`
        SELECT name
        FROM evaluator_catalog
        WHERE active = 1
        ORDER BY sort_order ASC, name COLLATE NOCASE ASC
      `).all();

      return json({
        ok:true,
        evaluators:(result.results || [])
          .map(row => String(row.name))
          .filter(Boolean),
        serverTime:now,
        storage:"cloudflare-d1"
      });
    }

    if (action === "saveMonthSetting") {
      const settings = normalizeMonthSettings([{
        month:payload.month,
        upgradeVisible:payload.upgradeVisible,
        upgradeTitle:payload.upgradeTitle,
        upgradeSubtitle:payload.upgradeSubtitle
      }]);

      const setting = settings[0];

      await context.env.DB.batch(
        makeMonthSettingUpserts(context.env.DB,[setting])
      );

      return json({
        ok:true,
        monthSetting:setting,
        serverTime:now,
        storage:"cloudflare-d1"
      });
    }

    if (action === "restoreAll") {
      const restored = await restoreAll(
        context.env.DB,
        payload.events,
        payload.services,
        payload.monthSettings,
        payload.evaluators
      );

      return json({
        ok:true,
        restored,
        serverTime:now,
        storage:"cloudflare-d1"
      });
    }

    return json({
      ok:false,
      error:"Action inconnue."
    }, 400);

  } catch (err) {
    return json({
      ok:false,
      error:String(err?.message || err)
    }, 500);
  }
}

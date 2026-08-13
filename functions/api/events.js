
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

  return {
    eventId,
    service,
    plannedDate,
    completedDate,
    done: Boolean(row.done || completedDate)
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

async function readAll(db) {
  const [eventResult,planResult,serviceResult] = await db.batch([
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
    `)
  ]);

  const planMap = new Map();

  (planResult.results || []).forEach(row => {
    if (!planMap.has(row.eventId)) {
      planMap.set(row.eventId, []);
    }

    planMap.get(row.eventId).push({
      service:String(row.service),
      plannedDate:row.plannedDate || "",
      completedDate:row.completedDate || "",
      done:Number(row.done) === 1
    });
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
    servicePlan:planMap.get(String(row.id)) || []
  }));

  const services = (serviceResult.results || [])
    .map(row => String(row.name))
    .filter(Boolean);

  return {events,services};
}

export async function onRequestGet(context) {
  try {
    const data = await readAll(context.env.DB);

    return json({
      ok:true,
      events:data.events,
      services:data.services,
      serverTime: new Date().toISOString(),
      storage: "cloudflare-d1",
      schemaVersion: 2.4
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

async function saveMonthPlan(db, month, rawPlans, rawServices) {
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

  const eventResult = await db
    .prepare("SELECT id FROM events WHERE month = ?")
    .bind(month)
    .all();

  const validIds = new Set(
    (eventResult.results || []).map(r => String(r.id))
  );

  const filtered = plans.filter(p => validIds.has(p.eventId));

  const statements = [
    ...makeServiceUpserts(db, services),
    db.prepare(`
      DELETE FROM monthly_actions
      WHERE event_id IN (
        SELECT id FROM events WHERE month = ?
      )
    `).bind(month),
    ...makePlanInserts(db, filtered)
  ];

  await db.batch(statements);

  return filtered.length;
}

async function restoreAll(db, rawEvents, rawServices) {
  if (!Array.isArray(rawEvents)) {
    throw new Error("Sauvegarde invalide.");
  }

  if (rawEvents.length > 1000) {
    throw new Error("Sauvegarde trop volumineuse.");
  }

  const events = rawEvents.map(normalizeEvent);
  const plans = [];
  const services = normalizeServiceCatalog(rawServices);

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
  });

  const statements = [
    db.prepare("DELETE FROM monthly_actions"),
    db.prepare("DELETE FROM events"),
    ...makeEventUpserts(db, events),
    ...makePlanInserts(db, plans)
  ];

  if (services.length) {
    statements.push(
      db.prepare("DELETE FROM service_catalog"),
      ...makeServiceUpserts(db, services)
    );
  }

  await db.batch(statements);

  return {
    events:events.length,
    plans:plans.filter(r =>
      r.plannedDate || r.completedDate || r.done
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
        payload.services
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
        payload.services
      );

      return json({
        ok:true,
        saved,
        serverTime:now,
        storage:"cloudflare-d1"
      });
    }

    if (action === "restoreAll") {
      const restored = await restoreAll(
        context.env.DB,
        payload.events,
        payload.services
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

const ALLOWED_TYPES = new Set(["TH","PT","PR","TC","AS","EV","EP"]);

const TYPE_ORDER = {
  TH: 0, PT: 1, PR: 2, TC: 3, AS: 4, EV: 5, EP: 6
};

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
  if (!ev || typeof ev !== "object") throw new Error("Événement invalide.");

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
    id, month, type, label,
    done: Boolean(ev.done),
    plannedDate,
    completedDate,
    sortOrder: TYPE_ORDER[type] ?? 99
  };
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

export async function onRequestGet(context) {
  try {
    const result = await context.env.DB.prepare(`
      SELECT
        id, month, type, label, done,
        planned_date AS plannedDate,
        completed_date AS completedDate,
        updated_at AS updatedAt
      FROM events
      ORDER BY updated_at ASC, id ASC
    `).all();

    const events = (result.results || []).map(row => ({
      id: String(row.id),
      month: String(row.month),
      type: String(row.type),
      label: String(row.label),
      done: Number(row.done) === 1,
      plannedDate: row.plannedDate || "",
      completedDate: row.completedDate || "",
      updatedAt: row.updatedAt || ""
    }));

    return json({
      ok: true,
      events,
      serverTime: new Date().toISOString(),
      storage: "cloudflare-d1"
    });
  } catch (err) {
    return json({ ok:false, error:String(err?.message || err) }, 500);
  }
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
      return json({ ok:false, error:"Clé d’administration invalide." }, 401);
    }

    if (action !== "saveAll") {
      return json({ ok:false, error:"Action inconnue." }, 400);
    }

    if (!Array.isArray(payload.events)) {
      return json({ ok:false, error:"Liste d’événements invalide." }, 400);
    }

    if (payload.events.length > 1000) {
      return json({ ok:false, error:"Trop d’événements." }, 400);
    }

    const events = payload.events.map(normalizeEvent);
    const now = new Date().toISOString();

    const statements = [context.env.DB.prepare("DELETE FROM events")];

    const insert = context.env.DB.prepare(`
      INSERT INTO events (
        id, month, type, label, done,
        planned_date, completed_date, sort_order, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ev of events) {
      statements.push(insert.bind(
        ev.id,
        ev.month,
        ev.type,
        ev.label,
        ev.done ? 1 : 0,
        ev.plannedDate || null,
        ev.completedDate || null,
        ev.sortOrder,
        now
      ));
    }

    await context.env.DB.batch(statements);

    return json({
      ok:true,
      saved:events.length,
      serverTime:now,
      storage:"cloudflare-d1"
    });
  } catch (err) {
    return json({ ok:false, error:String(err?.message || err) }, 500);
  }
}

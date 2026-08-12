/**
 * Certification HAS 2028 - CHIMR
 * Backend Google Apps Script
 */

const SPREADSHEET_ID = "10nbKtQ2xISLU0riOfVgslWwBh10YTSZaWZhFWVw2NiA";
const SHEET_NAME = "Planning";
const HEADERS = [
  "ID",
  "Mois",
  "Type",
  "Libellé",
  "Réalisé",
  "Date programmée",
  "Date réalisée",
  "Ordre",
  "Modifié le"
];

const TYPE_ORDER = {
  TH: 0,
  PT: 1,
  PR: 2,
  TC: 3,
  AS: 4,
  EV: 5,
  EP: 6
};

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "load");

    if (action === "load") {
      return jsonResponse_({
        ok: true,
        events: readEvents_(),
        serverTime: new Date().toISOString()
      });
    }

    return jsonResponse_({ ok: false, error: "Action GET inconnue." });

  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    const payload = JSON.parse(
      (e && e.postData && e.postData.contents) || "{}"
    );

    const action = String(payload.action || "");

    if (action === "auth") {
      return jsonResponse_({
        ok: isAdminKeyValid_(payload.adminKey)
      });
    }

    if (!isAdminKeyValid_(payload.adminKey)) {
      return jsonResponse_({
        ok: false,
        error: "Clé d’administration invalide."
      });
    }

    if (action === "saveAll") {
      if (!Array.isArray(payload.events)) {
        return jsonResponse_({
          ok: false,
          error: "Liste d’événements invalide."
        });
      }

      const saved = writeEvents_(payload.events);

      return jsonResponse_({
        ok: true,
        saved: saved,
        serverTime: new Date().toISOString()
      });
    }

    return jsonResponse_({
      ok: false,
      error: "Action POST inconnue."
    });

  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });

  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

function getPlanningSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);

  return sheet;
}

function readEvents_() {
  const sheet = getPlanningSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  const values = sheet
    .getRange(2, 1, lastRow - 1, HEADERS.length)
    .getValues();

  return values
    .filter(row => row[0])
    .map(row => ({
      id: String(row[0]),
      month: String(row[1] || ""),
      type: String(row[2] || ""),
      label: String(row[3] || ""),
      done: row[4] === true || String(row[4]).toLowerCase() === "true",
      plannedDate: dateToIso_(row[5]),
      completedDate: dateToIso_(row[6]),
      updatedAt:
        row[8] instanceof Date
          ? row[8].toISOString()
          : String(row[8] || "")
    }));
}

function writeEvents_(events) {
  const sheet = getPlanningSheet_();
  const currentLastRow = sheet.getLastRow();

  if (currentLastRow > 1) {
    sheet
      .getRange(2, 1, currentLastRow - 1, HEADERS.length)
      .clearContent();
  }

  const now = new Date();

  const cleaned = events
    .filter(ev => ev && ev.id && ev.month && ev.type && ev.label)
    .map(ev => ({
      id: String(ev.id),
      month: String(ev.month),
      type: String(ev.type),
      label: String(ev.label),
      done: Boolean(ev.done),
      plannedDate: isoToDate_(ev.plannedDate),
      completedDate: isoToDate_(ev.completedDate)
    }));

  const rows = cleaned.map(ev => [
    ev.id,
    ev.month,
    ev.type,
    ev.label,
    ev.done,
    ev.plannedDate || "",
    ev.completedDate || "",
    Number(TYPE_ORDER[ev.type] ?? 99),
    now
  ]);

  if (rows.length) {
    sheet
      .getRange(2, 1, rows.length, HEADERS.length)
      .setValues(rows);

    sheet
      .getRange(2, 6, rows.length, 2)
      .setNumberFormat("dd/mm/yyyy");
  }

  sheet.autoResizeColumns(1, HEADERS.length);

  sheet
    .getRange(1, 1, 1, HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#0b2f6b")
    .setFontColor("#ffffff");

  SpreadsheetApp.flush();
  return rows.length;
}

function dateToIso_(value) {
  if (!value) return "";

  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
  }

  const s = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  return "";
}

function isoToDate_(value) {
  const s = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return null;
  }

  const parts = s.split("-");
  return new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );
}

function isAdminKeyValid_(candidate) {
  const expected = PropertiesService
    .getScriptProperties()
    .getProperty("ADMIN_KEY");

  if (!expected) {
    throw new Error(
      "La propriété de script ADMIN_KEY n’est pas configurée."
    );
  }

  return String(candidate || "") === String(expected);
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

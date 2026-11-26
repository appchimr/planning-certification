-- Migration unique de D1 depuis le schéma 2.8. Les données existantes restent en place.
ALTER TABLE monthly_actions ADD COLUMN planned_month TEXT;

-- Les dates déjà planifiées déterminent le mois des interventions existantes.
UPDATE monthly_actions
SET planned_month =
  json_extract(
    '["JANVIER","FÉVRIER","MARS","AVRIL","MAI","JUIN","JUILLET","AOÛT","SEPTEMBRE","OCTOBRE","NOVEMBRE","DÉCEMBRE"]',
    '$[' || (CAST(substr(planned_date, 6, 2) AS INTEGER) - 1) || ']'
  ) || ' ' || substr(planned_date, 1, 4)
WHERE CAST(substr(planned_date, 6, 2) AS INTEGER) BETWEEN 1 AND 12;

CREATE TABLE IF NOT EXISTS schedule_history (
  id INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  service TEXT NOT NULL DEFAULT '',
  from_month TEXT NOT NULL,
  from_date TEXT,
  to_month TEXT NOT NULL,
  to_date TEXT,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schedule_history_event ON schedule_history(event_id);

CREATE TRIGGER IF NOT EXISTS record_event_reschedule
AFTER UPDATE OF month, planned_date ON events
WHEN OLD.type <> 'TH'
  AND NEW.type <> 'TH'
  AND OLD.done = 0
  AND (OLD.month <> NEW.month
    OR (OLD.planned_date IS NOT NULL AND OLD.planned_date IS NOT NEW.planned_date))
BEGIN
  INSERT INTO schedule_history(event_id, from_month, from_date, to_month, to_date)
  VALUES (OLD.id, OLD.month, OLD.planned_date, NEW.month, NEW.planned_date);
END;

CREATE TRIGGER IF NOT EXISTS record_service_reschedule
AFTER UPDATE OF planned_month, planned_date ON monthly_actions
WHEN OLD.done = 0
  AND (
    COALESCE(OLD.planned_month, (SELECT month FROM events WHERE id = OLD.event_id))
      <> COALESCE(NEW.planned_month, (SELECT month FROM events WHERE id = NEW.event_id))
    OR (OLD.planned_date IS NOT NULL AND OLD.planned_date IS NOT NEW.planned_date)
  )
BEGIN
  INSERT INTO schedule_history(event_id, service, from_month, from_date, to_month, to_date)
  SELECT OLD.event_id, OLD.service,
    COALESCE(OLD.planned_month, events.month),
    COALESCE(OLD.planned_date, CASE
      WHEN COALESCE(OLD.planned_month, events.month) = events.month THEN events.planned_date
    END),
    COALESCE(NEW.planned_month, events.month), NEW.planned_date
  FROM events WHERE id = OLD.event_id;
END;

INSERT OR IGNORE INTO app_meta(key, value) VALUES ('planning_revision', '0');
INSERT OR REPLACE INTO app_meta(key, value) VALUES ('schema_version', '2.9');

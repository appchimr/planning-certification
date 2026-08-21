CREATE TABLE IF NOT EXISTS service_evaluator_overrides (
  event_id TEXT NOT NULL,
  service TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id,service),
  FOREIGN KEY (event_id,service)
    REFERENCES monthly_actions(event_id,service)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_evaluator_assignments (
  event_id TEXT NOT NULL,
  service TEXT NOT NULL,
  evaluator TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id,service,evaluator),
  FOREIGN KEY (event_id,service)
    REFERENCES monthly_actions(event_id,service)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_eval_override_event
ON service_evaluator_overrides(event_id);

CREATE INDEX IF NOT EXISTS idx_service_eval_assignment_event
ON service_evaluator_assignments(event_id);

CREATE INDEX IF NOT EXISTS idx_service_eval_assignment_evaluator
ON service_evaluator_assignments(evaluator);

INSERT OR REPLACE INTO app_meta(key,value)
VALUES ('schema_version','2.8');

SELECT
  (SELECT value FROM app_meta WHERE key='schema_version') AS schema_version,
  (SELECT COUNT(*) FROM events) AS nombre_evenements,
  (SELECT COUNT(*) FROM monthly_actions) AS lignes_planification,
  (SELECT COUNT(*) FROM service_catalog WHERE active=1) AS nombre_services,
  (SELECT COUNT(*) FROM month_settings) AS reglages_mensuels,
  (SELECT COUNT(*) FROM evaluator_catalog WHERE active=1) AS nombre_evaluateurs,
  (SELECT COUNT(*) FROM event_assignments) AS affectations_evaluateurs,
  (SELECT COUNT(*) FROM service_evaluator_overrides) AS personnalisations_services,
  (SELECT COUNT(*) FROM service_evaluator_assignments) AS affectations_services;

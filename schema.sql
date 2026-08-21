CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN ('TH','PT','PR','TC','AS','EV','EP','CR','JT','FP')
  ),
  label TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  planned_date TEXT,
  completed_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 99,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_month ON events(month);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_planned_date ON events(planned_date);

CREATE TABLE IF NOT EXISTS monthly_actions (
  event_id TEXT NOT NULL,
  service TEXT NOT NULL,
  planned_date TEXT,
  completed_date TEXT,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, service),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monthly_actions_event
ON monthly_actions(event_id);

CREATE INDEX IF NOT EXISTS idx_monthly_actions_planned
ON monthly_actions(planned_date);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO app_meta(key, value)
VALUES ('schema_version', '2.8');


CREATE TABLE IF NOT EXISTS service_catalog (
  name TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 999,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO service_catalog(name,sort_order,active)
VALUES
('Urgences',1,1),
('Médecine',2,1),
('SMR',3,1),
('HAD',4,1),
('Médecine addictologie',5,1),
('SMR addictologie',6,1),
('HDJ CARP',7,1),
('USLD',8,1),
('Psychiatrie',9,1),
('Laboratoire',10,1),
('Imagerie médicale',11,1),
('Pharmacie',12,1);


CREATE TABLE IF NOT EXISTS month_settings (
  month TEXT PRIMARY KEY,
  upgrade_visible INTEGER NOT NULL DEFAULT 0 CHECK (upgrade_visible IN (0,1)),
  upgrade_title TEXT NOT NULL DEFAULT 'MISE À NIVEAU',
  upgrade_subtitle TEXT NOT NULL DEFAULT 'Référentiel HAS 2028',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO month_settings (
  month,
  upgrade_visible,
  upgrade_title,
  upgrade_subtitle
)
VALUES
  ('OCTOBRE 2027',1,'MISE À NIVEAU','Référentiel HAS 2028'),
  ('NOVEMBRE 2027',1,'MISE À NIVEAU','Référentiel HAS 2028'),
  ('DÉCEMBRE 2027',1,'MISE À NIVEAU','Référentiel HAS 2028');


CREATE TABLE IF NOT EXISTS evaluator_catalog (
  name TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 999,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO evaluator_catalog (
  name,
  sort_order,
  active
)
VALUES
  ('M. David LABIAK',1,1),
  ('Mme Isabelle TARDIF',2,1),
  ('Dr Audrey REIX',3,1),
  ('Mme Isabelle PONCET',4,1);

CREATE TABLE IF NOT EXISTS event_assignments (
  event_id TEXT NOT NULL,
  evaluator TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id,evaluator),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_assignments_event
ON event_assignments(event_id);

CREATE INDEX IF NOT EXISTS idx_event_assignments_evaluator
ON event_assignments(evaluator);


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

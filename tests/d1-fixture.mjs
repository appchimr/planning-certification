import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const schema = readFileSync(new URL("../schema.sql",import.meta.url),"utf8");
const migration = readFileSync(new URL("../migration_reports.sql",import.meta.url),"utf8");

export function openTestDb({migrate = true} = {}){
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);

  // Reconstituer le schéma précédent et enregistrer les actions avant la migration.
  sqlite.exec(`
    DROP TRIGGER record_event_reschedule;
    DROP TRIGGER record_service_reschedule;
    DROP TABLE schedule_history;
    ALTER TABLE monthly_actions DROP COLUMN planned_month;
    DELETE FROM app_meta WHERE key = 'planning_revision';
    UPDATE app_meta SET value = '2.8' WHERE key = 'schema_version';

    INSERT INTO events(id, month, type, label, done, planned_date, completed_date) VALUES
      ('smr', 'NOVEMBRE 2026', 'PT', 'Patient traceur SMR', 0, '2026-11-20', NULL),
      ('urgent', 'NOVEMBRE 2026', 'EV', 'Urgences vitales', 1, NULL, '2026-11-23'),
      ('other', 'DÉCEMBRE 2026', 'AS', 'Audit système', 0, '2026-12-05', NULL),
      ('theme', 'NOVEMBRE 2026', 'TH', 'Thématique', 0, NULL, NULL);

    INSERT INTO monthly_actions(event_id, service, planned_date, completed_date, done) VALUES
      ('urgent', 'Urgences', '2026-11-20', '2026-11-20', 1),
      ('urgent', 'SMR', '2026-11-21', '2026-11-21', 1),
      ('urgent', 'HAD', '2026-11-23', '2026-11-23', 1),
      ('urgent', 'Médecine', '2026-11-30', NULL, 0),
      ('urgent', 'Psychiatrie', NULL, NULL, 0),
      ('urgent', 'Laboratoire', '2026-12-10', NULL, 0),
      ('urgent', 'USLD', NULL, NULL, 0);

    INSERT INTO event_assignments(event_id,evaluator) VALUES ('urgent','Mme Isabelle TARDIF');
    INSERT INTO service_evaluator_overrides(event_id,service) VALUES ('urgent','Urgences');
    INSERT INTO service_evaluator_assignments(event_id,service,evaluator)
      VALUES ('urgent','Urgences','Dr Audrey REIX');
  `);
  if(migrate) sqlite.exec(migration);

  // Rejouer les instructions de Pages Functions avec les transactions et paramètres de D1.
  const db = {
    prepare(sql){
      return {
        args:[],
        sql,
        bind(...args){
          this.args = args;
          return this;
        },
        async all(){
          return {results:sqlite.prepare(sql).all(...this.args)};
        }
      };
    },
    async batch(statements){
      sqlite.exec("BEGIN");
      try{
        const results = statements.map(({sql,args}) => {
          if(args.length > 100) throw new Error("Plus de 100 paramètres D1");
          return {results:sqlite.prepare(sql).all(...args)};
        });
        sqlite.exec("COMMIT");
        return results;
      }catch(error){
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };

  return {db,sqlite,migrate:() => sqlite.exec(migration)};
}

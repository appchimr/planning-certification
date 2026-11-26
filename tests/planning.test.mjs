import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { onRequestGet, onRequestPost } from "../functions/api/events.js";
import { openTestDb } from "./d1-fixture.mjs";

const common = readFileSync(new URL("../common.js",import.meta.url),"utf8");
const monthNames = ["NOVEMBRE 2026","DÉCEMBRE 2026","JANVIER 2027"];

function fixture(options){
  const setup = openTestDb(options);
  const env = {DB:setup.db,ADMIN_KEY:"cle-de-test"};
  return {
    ...setup,
    async read(){
      const response = await onRequestGet({env});
      assert.equal(response.status,200);
      return response.json();
    },
    async write(action,payload,{adminKey = env.ADMIN_KEY,expectedStatus = 200} = {}){
      const response = await onRequestPost({
        env,
        request:new Request("http://localhost/api/events",{
          method:"POST",
          body:JSON.stringify({action,adminKey,...payload})
        })
      });
      const result = await response.json();
      assert.equal(response.status,expectedStatus,result.error);
      return result;
    }
  };
}

function find(data,id){
  return data.events.find(event => event.id === id);
}

function model(events){
  return vm.runInNewContext(`${common}
    ;({months:monthNames.map(month => monthEvents(events,month).map(entry => ({
      id:entry.event.id,
      status:monthStatus(entry,"2026-11-26"),
      reports:entry.history.map(reportText),
      services:entry.rows.map(row => row.service).filter(Boolean),
      details:scheduleDetails(entry,"2026-11-26")
    }))), progress:events.filter(eventIsDone).map(event => event.id),
    decemberStats:monthlySummaryStats(monthNames[1],events)})
  `,{events,monthNames});
}

test("D1 migre le schéma 2.8 et conserve les actions, les dates et les évaluateurs",async () => {
  const f = fixture({migrate:false});
  const legacy = f.sqlite.prepare("SELECT * FROM events ORDER BY id").all();
  f.migrate();

  assert.deepEqual(f.sqlite.prepare("SELECT * FROM events ORDER BY id").all(),legacy);

  const data = await f.read();
  assert.equal(data.schemaVersion,2.9);
  const urgent = find(data,"urgent");
  assert.equal(urgent.done,false);
  assert.equal(urgent.completedDate,"");
  assert.equal(urgent.servicePlan.length,7);
  assert.equal(urgent.servicePlan.filter(row => row.done).length,3);
  assert.equal(urgent.servicePlan.find(row => row.service === "Laboratoire").plannedMonth,monthNames[1]);
  assert.deepEqual(urgent.evaluators,["Mme Isabelle TARDIF"]);
  assert.deepEqual(urgent.servicePlan.find(row => row.service === "Urgences").evaluators,["Dr Audrey REIX"]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM schedule_history").get().count,0);
});

test("un report reste visible au mois d’origine et seule la nouvelle date peut être en retard",async () => {
  const f = fixture();
  const initial = await f.read();
  const smr = find(initial,"smr");
  Object.assign(smr,{month:monthNames[1],plannedDate:"2026-12-09"});

  await f.write("saveAll",{events:initial.events,revision:initial.revision},{
    adminKey:"invalide",expectedStatus:401
  });
  const {planning} = await f.write("saveAll",{events:initial.events,revision:initial.revision});
  const current = find(planning,"smr");
  assert.equal(current.scheduleHistory[0].fromDate,"2026-11-20");

  const result = model(planning.events);
  const origin = result.months[0].find(entry => entry.id === "smr");
  const destination = result.months[1].find(entry => entry.id === "smr");
  assert.equal(origin.status,"reported");
  assert.match(origin.reports[0],/Reporté en décembre 2026 \(prévu le 20\/11\/2026\)/);
  assert.equal(destination.status,"planned");
  assert.equal(destination.details[0],"Le 09/12/2026");

  const movedAgain = await f.write("saveAll",{
    events:planning.events.map(event => event.id === "smr"
      ? {...event,month:monthNames[2],plannedDate:"2027-01-15"}
      : event),
    revision:planning.revision
  });
  const history = find(movedAgain.planning,"smr").scheduleHistory;
  assert.equal(history.length,2);
  assert.equal(history[0].fromMonth,monthNames[0]);
  assert.equal(history[1].fromMonth,monthNames[1]);

  const expired = vm.runInNewContext(`${common}
    scheduleStatus(scheduleForEvent(event),"2027-01-16")
  `,{event:find(movedAgain.planning,"smr")});
  assert.equal(expired,"late");
});

test("les services s’échelonnent sur trois mois, et la dernière réalisation termine l’évaluation",async () => {
  const f = fixture();
  const initial = await f.read();
  const urgent = find(initial,"urgent");
  const plans = urgent.servicePlan.map(row => ({
    ...row,eventId:urgent.id,
    ...(row.service === "Médecine" ? {plannedDate:"2026-12-04"} : {}),
    ...(["Psychiatrie","USLD"].includes(row.service) ? {plannedMonth:monthNames[2]} : {})
  }));
  const payload = {
    month:monthNames[0],plans,revision:initial.revision,
    evaluatorAssignments:[{eventId:urgent.id,evaluators:urgent.evaluators}]
  };
  const {planning} = await f.write("saveMonthPlan",payload);

  const months = model(planning.events).months.map(entries => entries.find(entry => entry.id === "urgent"));
  assert.equal(months[0].status,"inProgress");
  assert.equal(months[0].services.length,3);
  assert.equal(months[1].services.join(","),"Laboratoire,Médecine");
  assert.equal(months[2].services.join(","),"Psychiatrie,USLD");
  assert.match(months[0].details.join(" "),/3\/7 services réalisés.*04\/12\/2026/);
  assert.equal(model(planning.events).decemberStats.completedEvents,0);
  assert.equal(model(planning.events).progress.includes("urgent"),false);
  assert.equal(find(planning,"urgent").servicePlan.find(row => row.service === "SMR").completedDate,"2026-11-21");
  assert.equal(find(planning,"urgent").scheduleHistory.length,3);

  const stale = await f.write("saveMonthPlan",payload,{expectedStatus:409});
  assert.match(stale.error,/planning a changé/);
  assert.equal(find(await f.read(),"urgent").scheduleHistory.length,3);

  const {planning:finished} = await f.write("saveMonthPlan",{
    ...payload,revision:planning.revision,
    plans:plans.map(row => ({...row,done:true,completedDate:row.completedDate || "2027-01-18"}))
  });
  assert.equal(find(finished,"urgent").done,true);
  assert.equal(find(finished,"urgent").completedDate,"2027-01-18");
  assert.equal(model(finished.events).progress.includes("urgent"),true);
  assert.equal(find(finished,"urgent").scheduleHistory.length,3);
  assert.deepEqual(find(finished,"urgent").servicePlan.find(row => row.service === "Urgences").evaluators,["Dr Audrey REIX"]);

  const restored = await f.write("restoreAll",finished);
  assert.deepEqual(find(restored.planning,"urgent").scheduleHistory,find(finished,"urgent").scheduleHistory);
  assert.deepEqual(find(restored.planning,"urgent").servicePlan,find(finished,"urgent").servicePlan);

  const legacy = {...initial,events:initial.events.map(({scheduleHistory,...event}) => event)};
  await f.write("restoreAll",{...legacy,revision:restored.planning.revision});
  assert.equal(find(await f.read(),"urgent").servicePlan.length,7);
});

test("un service reporté conserve la date commune dont il avait hérité",async () => {
  const f = fixture();
  f.sqlite.prepare("UPDATE events SET planned_date = ? WHERE id = ?").run("2026-11-29","urgent");
  const initial = await f.read();
  const urgent = find(initial,"urgent");

  const {planning} = await f.write("saveMonthPlan",{
    month:monthNames[0],
    revision:initial.revision,
    plans:urgent.servicePlan.map(row => ({
      ...row,eventId:urgent.id,
      ...(row.service === "Psychiatrie" ? {plannedMonth:monthNames[1]} : {})
    }))
  });

  const [report] = find(planning,"urgent").scheduleHistory.filter(row => row.service === "Psychiatrie");
  assert.equal(report.fromDate,"2026-11-29");
  assert.equal(report.toMonth,monthNames[1]);
  assert.equal(report.toDate,null);
});

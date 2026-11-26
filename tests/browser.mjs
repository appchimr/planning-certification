import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";
import { onRequestGet, onRequestPost } from "../functions/api/events.js";
import { openTestDb } from "./d1-fixture.mjs";

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLANNING_PLAYWRIGHT || "playwright");
const env = {DB:openTestDb().db,ADMIN_KEY:"cle-de-test"};
const server = createServer(async (req,res) => {
  try{
    const path = new URL(req.url,"http://localhost").pathname;
    if(path === "/api/events"){
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = req.method === "POST"
        ? await onRequestPost({
            env,request:new Request("http://localhost/api/events",{
              method:"POST",body:Buffer.concat(chunks)
            })
          })
        : await onRequestGet({env});
      res.writeHead(response.status,{"Content-Type":"application/json"});
      res.end(await response.text());
      return;
    }

    if(!/^\/[\w.-]*$/.test(path)){
      res.writeHead(404).end();
      return;
    }

    const content = await readFile(new URL(".." + (path === "/" ? "/index.html" : path),import.meta.url));
    const extension = path.split(".").at(-1);
    const type = {js:"text/javascript",css:"text/css",jpg:"image/jpeg",png:"image/png"}[extension];
    res.writeHead(200,{"Content-Type":type || "text/html"});
    res.end(content);
  }catch(error){
    res.writeHead(500).end(error.message);
  }
});

server.listen(0,"127.0.0.1");
await once(server,"listening");
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

try{
  browser = await chromium.launch({executablePath:process.env.PLANNING_CHROMIUM || undefined});
  const context = await browser.newContext();
  await context.route("https://**/*",route => route.abort());
  const admin = await context.newPage();
  const publicPage = await context.newPage();

  for(const page of [admin,publicPage]){
    page.setDefaultTimeout(5000);
    await page.clock.setFixedTime(new Date("2026-11-26T10:00:00+01:00"));
    page.on("pageerror",error => { throw error; });
  }

  const card = (page,month) => page.locator(".month-card").filter({
    has:page.getByRole("button",{name:new RegExp("^" + month + " Suivi mensuel")})
  });
  const event = (scope,label) => scope.locator(".event-row").filter({hasText:label});
  const openMonth = (page,month) => card(page,month).getByRole("button",{name:/Suivi mensuel/}).click();
  const monthlyEvent = (page,label) => page.locator("#monthlyDialog .monthly-event").filter({hasText:label});
  const service = (page,name) => monthlyEvent(page,"Urgences vitales").locator(`tr[data-service="${name}"]`);

  await admin.goto(base + "/admin.html");
  const traceur = event(card(admin,"NOVEMBRE 2026"),"Patient traceur SMR");
  await traceur.waitFor();
  assert.match(await traceur.innerText(),/En retard/);

  await admin.locator("#adminKey").fill("cle-de-test");
  await admin.locator("#btnUnlock").click();
  await admin.getByRole("button",{name:"Verrouiller",exact:true}).waitFor();

  await traceur.getByRole("button",{name:"Modifier"}).click();
  await admin.locator("#eventMonthSelect").selectOption("DÉCEMBRE 2026");
  assert.equal(await admin.locator("#eventPlannedDate").inputValue(),"");
  await admin.locator("#eventPlannedDate").fill("2026-12-09");
  await admin.locator("#eventForm button[type=submit]").click();
  await traceur.getByText(/Reporté en décembre 2026/).waitFor();

  await openMonth(admin,"NOVEMBRE 2026");
  await service(admin,"Médecine").locator(".monthly-planned").fill("2026-12-04");
  assert.equal(await service(admin,"Médecine").locator(".monthly-planned-month").inputValue(),"DÉCEMBRE 2026");
  await service(admin,"Psychiatrie").locator(".monthly-planned-month").selectOption("JANVIER 2027");
  await service(admin,"USLD").locator(".monthly-planned-month").selectOption("JANVIER 2027");
  await admin.locator("#btnSaveMonthly").click();
  await admin.locator("#monthlyDialog").waitFor({state:"hidden"});

  await publicPage.goto(base);
  const december = card(publicPage,"DÉCEMBRE 2026");
  const january = card(publicPage,"JANVIER 2027");
  await event(december,"Patient traceur SMR").getByText("Prévu",{exact:true}).waitFor();
  assert.match(await event(december,"Urgences vitales").innerText(),/3\/7 services réalisés/);
  assert.match(await event(january,"Urgences vitales").innerText(),/Psychiatrie, USLD/);
  assert.equal(await publicPage.locator("#methodProgress").innerText(),"0 / 3");
  assert.match(await publicPage.locator("#nextList .next-item").first().innerText(),/04\/12\/2026[\s\S]+Médecine/);
  assert.match(await publicPage.locator("#scheduleIndicators").innerText(),/Avec report · 2/);

  await openMonth(publicPage,"NOVEMBRE 2026");
  await monthlyEvent(publicPage,"Patient traceur SMR").getByText(/Reporté en décembre 2026/).waitFor();
  assert.equal(await monthlyEvent(publicPage,"Urgences vitales").locator("tbody tr").count(),3);
  assert.match(await service(publicPage,"SMR").innerText(),/21\/11\/2026[\s\S]+Réalisé/);
  await publicPage.locator("#closeMonthlyTop").click();
  await openMonth(publicPage,"DÉCEMBRE 2026");
  assert.deepEqual(await monthlyEvent(publicPage,"Urgences vitales").locator("td.monthly-service").allTextContents(),
    ["Laboratoire","Médecine"]);

  await openMonth(admin,"JANVIER 2027");
  await monthlyEvent(admin,"Urgences vitales").getByRole("button",{name:/Modifier le suivi/}).click();
  assert.match(await admin.locator("#monthlyTitle").innerText(),/NOVEMBRE 2026/);

  for(const name of ["Laboratoire","Médecine","Psychiatrie","USLD"]){
    await service(admin,name).locator(".monthly-completed").fill("2027-01-18");
  }
  await admin.locator("#btnSaveMonthly").click();
  await admin.locator("#monthlyDialog").waitFor({state:"hidden"});
  await publicPage.reload();
  await publicPage.waitForFunction(() => document.querySelector("#methodProgress").textContent === "1 / 3");
  await openMonth(publicPage,"JANVIER 2027");
  assert.equal(await monthlyEvent(publicPage,"Urgences vitales").locator(".monthly-event-summary .completed").innerText(),"Réalisé");

  console.log("Parcours Chromium validés pour les reports, le suivi multi-services, les indicateurs et les deux vues.");
}finally{
  await browser?.close();
  server.close();
}

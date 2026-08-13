
let events = [];
let currentMonthlyMonth = "";

const monthlyDialog = document.getElementById("monthlyDialog");
const monthlyTitle = document.getElementById("monthlyTitle");

function openMonthlyPublic(month){
  currentMonthlyMonth = month;
  monthlyTitle.textContent = `Planification mensuelle — ${month}`;
  renderMonthlyPlanBody("monthlyPlanBody", month, events, false);
  monthlyDialog.showModal();
}

function publicHandlers(){
  return {
    month: openMonthlyPublic
  };
}

async function refreshPublic(){
  try{
    const data = await loadRemoteEvents();
    events = data.events;
    renderPlanning("planning",events,false,publicHandlers());

    const d = new Date(data.serverTime);
    const el = document.getElementById("lastUpdate");
    if(el){
      el.textContent = `Dernière actualisation : ${d.toLocaleString("fr-FR")}`;
    }

    if(monthlyDialog.open && currentMonthlyMonth){
      renderMonthlyPlanBody(
        "monthlyPlanBody",
        currentMonthlyMonth,
        events,
        false
      );
    }
  }catch(err){
    console.error(err);
    const p = document.getElementById("planning");
    if(p){
      p.innerHTML =
        '<div class="month-note">' +
        '<strong>Le planning ne peut pas être chargé pour le moment.</strong><br>' +
        'Réessayez dans quelques instants.</div>';
    }
  }
}

document.getElementById("closeMonthly")
  ?.addEventListener("click",() => monthlyDialog.close());

document.getElementById("closeMonthlyTop")
  ?.addEventListener("click",() => monthlyDialog.close());


document.getElementById("btnMonthlyPdf")
  ?.addEventListener("click",async () => {
    try{
      await exportMonthlyPdf(
        currentMonthlyMonth,
        events
      );
    }catch(err){
      console.error(err);
      alert(
        err?.message ||
        "Impossible de générer la synthèse PDF."
      );
    }
  });

document.getElementById("btnRefresh")?.addEventListener("click",refreshPublic);
document.getElementById("btnExportPng")?.addEventListener("click",()=>exportPng().catch(()=>alert("Export PNG impossible.")));
document.getElementById("btnExportPdf")?.addEventListener("click",()=>exportPdf().catch(()=>alert("Export PDF impossible.")));

renderLegend("legend");
refreshPublic();
setInterval(refreshPublic,60000);

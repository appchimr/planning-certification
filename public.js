let events = [];

async function refreshPublic(){
  try{
    const data = await loadRemoteEvents();
    events = data.events;
    renderPlanning("planning",events,false,{});

    const d = new Date(data.serverTime);
    const el = document.getElementById("lastUpdate");
    if(el){
      el.textContent = `Dernière actualisation : ${d.toLocaleString("fr-FR")}`;
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

document.getElementById("btnRefresh")?.addEventListener("click",refreshPublic);
document.getElementById("btnExportPng")?.addEventListener("click",()=>exportPng().catch(()=>alert("Export PNG impossible.")));
document.getElementById("btnExportPdf")?.addEventListener("click",()=>exportPdf().catch(()=>alert("Export PDF impossible.")));

renderLegend("legend");
refreshPublic();
setInterval(refreshPublic,60000);

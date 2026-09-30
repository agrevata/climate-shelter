import fs from "node:fs";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
// A second launcher must not create another tunnel or compete for Next's lock.
const portFree=await new Promise((resolve,reject)=>{
  const probe=net.createServer();
  probe.once("error",error=>error.code==="EADDRINUSE"?resolve(false):reject(error));
  probe.listen(3000,"127.0.0.1",()=>probe.close(()=>resolve(true)));
});
if(!portFree) {
  let sameApp=false;
  try {
    const response=await fetch("http://127.0.0.1:3000/api/wokwi/live",{signal:AbortSignal.timeout(2000)});
    const state=await response.json();
    sameApp=response.ok && state.location?.id==="shelter" && Array.isArray(state.history);
  } catch { /* Another application may own this port. */ }
  console.log(sameApp
    ? "Climate Shelter sudah berjalan di http://localhost:3000/monitoring. Gunakan server yang sudah aktif; tidak perlu menjalankan npm run dev dua kali. Untuk memulai ulang, hentikan terminal server sebelumnya dengan Ctrl+C."
    : "Port 3000 sedang digunakan. Hentikan aplikasi pemilik port terlebih dahulu, lalu jalankan npm run dev kembali.");
  process.exitCode=sameApp?0:1;
}
if(portFree) {
const children=[];
let stopping=false;
function start(args) {
  const child=spawn(process.execPath,args,{stdio:"inherit",env:process.env,windowsHide:true});
  children.push(child);
  child.on("error",e=>console.error(e.message));
  return child;
}
function stop(code=0) {
  if(stopping)return; stopping=true;
  for(const child of children) {
    if(process.platform==="win32" && child.pid) spawnSync("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});
    else child.kill();
  }
  process.exitCode=code;
}
const web=start(["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port","3000"]);
web.on("exit",code=>stop(code??1));
if(process.env.NEXT_PUBLIC_DEMO_MODE!=="false" && process.env.WOKWI_LOCAL_ENABLED==="true") {
  if(process.env.WOKWI_TUNNEL_AUTO_START==="true") {
    const link=start(["scripts/wokwi-start.mjs","--no-web"]);
    link.on("exit",code=>{if(!stopping)console.error(`Penghubung Wokwi berhenti (${code}). Web tetap tersedia di localhost.`);});
  } else {
    console.log("Monitoring Candigaron memakai data Wokwi. Penghubung eksternal belum diaktifkan; sensor menunggu ESP32.");
  }
}
process.on("SIGINT",()=>stop());
process.on("SIGTERM",()=>stop());
}

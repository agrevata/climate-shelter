// Run explicitly with `npm run wokwi:start` to open a temporary telemetry tunnel.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
process.loadEnvFile(".env.local");
if (process.env.WOKWI_LOCAL_ENABLED!=="true" || !process.env.WOKWI_INGEST_TOKEN)
  throw new Error("Konfigurasi Wokwi belum tersedia di .env.local.");
const children=[];
function start(file,args) {
  const child=spawn(file,args,{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  children.push(child); child.on("error",e=>console.error(e.message));return child;
}
async function reachable(url) {try{return (await fetch(url,{signal:AbortSignal.timeout(1500)})).status;}catch{return 0;}}
if(!process.argv.includes("--no-web") && !await reachable("http://127.0.0.1:3000/api/wokwi/live")) {
  const web=start(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1"]);
  web.stdout.pipe(process.stdout);web.stderr.pipe(process.stderr);
}
if(!await reachable("http://127.0.0.1:8787/")) {
  const proxy=start(process.execPath,["scripts/wokwi-proxy.mjs"]);proxy.stdout.pipe(process.stdout);proxy.stderr.pipe(process.stderr);
}
const tool=path.resolve("work/tools/cloudflared.exe");
if(!fs.existsSync(tool)) throw new Error("cloudflared resmi belum tersedia pada work/tools.");
fs.mkdirSync("work/wokwi",{recursive:true});
const tunnel=start(tool,["tunnel","--url","http://127.0.0.1:8787","--no-autoupdate","--protocol","http2"]);
let found=false;
function tunnelOutput(chunk) {
  const text=chunk.toString();process.stdout.write(text);
  const match=text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if(match&&!found) {
    found=true;
    fs.writeFileSync("work/wokwi/connect.txt",`CONNECT ${match[0]}/telemetry ${process.env.WOKWI_INGEST_TOKEN}\n`);
    fs.writeFileSync("work/wokwi/endpoint.json",JSON.stringify({url:match[0]+"/telemetry",created_at:new Date().toISOString()},null,2));
    console.log("\nBuka http://localhost:3000/monitoring — SD Negeri Candigaron 01. Run Wokwi Shelter dan Ruang Kelas. Salin isi work/wokwi/connect.txt ke Serial Monitor KEDUA project lalu Enter. Ulangi setelah Run ulang atau tunnel dimulai ulang. Jangan bagikan file token ini.\n");
  }
}
tunnel.stdout.on("data",tunnelOutput);tunnel.stderr.on("data",tunnelOutput);
const stop=()=>{
  for(const child of children) {
    if(process.platform==="win32" && child.pid) spawnSync("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});
    else child.kill();
  }
  process.exit();
};
process.on("SIGINT",stop);process.on("SIGTERM",stop);
tunnel.on("exit",code=>{if(code)console.error("Tunnel berhenti dengan kode",code);});

// Narrow tunnel target: forwards ONLY simulator telemetry, never the dashboard.
import http from "node:http";
const token = process.env.WOKWI_INGEST_TOKEN;
if (!token || token.length < 32) throw new Error("Missing simulator token");
const upstream = "http://127.0.0.1:3000/api/wokwi/telemetry";
http.createServer(async (req,res) => {
  res.setHeader("Cache-Control","no-store");
  if (req.method!=="POST" || req.url!=="/telemetry") { res.writeHead(404); res.end(); return; }
  if (req.headers.authorization!==`Bearer ${token}`) { res.writeHead(401); res.end(); return; }
  const chunks=[]; let size=0;
  try {
    for await (const chunk of req) { size+=chunk.length; if(size>8192) { res.writeHead(413);res.end();return; } chunks.push(chunk); }
    const r=await fetch(upstream,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:Buffer.concat(chunks),signal:AbortSignal.timeout(15000)});
    res.writeHead(r.status,{"Content-Type":"application/json"});res.end(await r.text());
  } catch { if(!res.headersSent) res.writeHead(502); res.end(); }
}).listen(8787,"127.0.0.1",()=>console.log("Wokwi telemetry proxy on 127.0.0.1:8787 (POST /telemetry only)"));

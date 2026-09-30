// Two reproducible Wokwi projects from one sensor/control implementation.
import fs from "node:fs";
const base = "firmware/wokwi";
let template = fs.readFileSync(`${base}/sketch.ino`, "utf8");
const roots=fs.readFileSync(`${base}/certs/roots.pem`,"utf8");
template=template.replace(/\/\/ BEGIN TRUSTED CA BUNDLE[\s\S]*?\/\/ END TRUSTED CA BUNDLE/,
  `// BEGIN TRUSTED CA BUNDLE (generated from certs/roots.pem; public certificates)\nstatic const char TRUSTED_CA[] PROGMEM=R"CLIMATE_CA(\n${roots})CLIMATE_CA";\n// END TRUSTED CA BUNDLE`);
fs.writeFileSync(`${base}/sketch.ino`,template);
const diagram = JSON.parse(fs.readFileSync(`${base}/diagram.json`, "utf8"));
for (const location of ["classroom", "shelter"]) {
  const room = location === "classroom";
  const dir = `${base}/${location}`;
  fs.mkdirSync(dir, { recursive: true });
  const sketch = room ? template : template
    .replace("ROOM_ACTUATORS=true", "ROOM_ACTUATORS=false")
    .replace('LOCATION_ID[]="classroom"', 'LOCATION_ID[]="shelter"')
    .replace('DEVICE_ID[]="climate-classroom-esp32"', 'DEVICE_ID[]="climate-shelter-esp32"');
  const circuit = structuredClone(diagram);
  circuit.parts.find(p => p.id === "title").attrs.text = room
    ? "CANDIGARON 01 | RUANG KELAS | KIPAS + POMPA + HVAC + VENTILASI"
    : "CANDIGARON 01 | SHELTER | KIPAS + POMPA AIR";
  circuit.parts.find(p => p.id === "dht1").attrs.temperature = room ? "30" : "24";
  if (!room) {
    const absent = new Set(["hvacLed", "hvacR", "servo1"]);
    circuit.parts = circuit.parts.filter(p => !absent.has(p.id));
    circuit.connections = circuit.connections.filter(c => !absent.has(c[0].split(":")[0]) && !absent.has(c[1].split(":")[0]));
  }
  fs.writeFileSync(`${dir}/sketch.ino`, sketch);
  fs.writeFileSync(`${dir}/diagram.json`, JSON.stringify(circuit, null, 2) + "\n");
  fs.copyFileSync(`${base}/libraries.txt`, `${dir}/libraries.txt`);
  console.log(`${location}: ${circuit.parts.length} parts, ${circuit.connections.length} wires`);
}

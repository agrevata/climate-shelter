// Optional fallback when Wokwi's cloud build queue is busy. No hardware flashing.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const cli=path.resolve("work/tools/arduino-cli/arduino-cli.exe");
const config=path.resolve("work/tools/arduino-cli.yaml");
if(!fs.existsSync(cli) || !fs.existsSync(config)) throw new Error("Compiler Arduino lokal belum disiapkan; gunakan Run di Wokwi.");
for(const location of ["classroom","shelter"]) {
  const source=path.resolve(`work/wokwi/build-sources/${location}`);
  fs.mkdirSync(source,{recursive:true});
  fs.copyFileSync(`firmware/wokwi/${location}/sketch.ino`,path.join(source,`${location}.ino`));
  const result=spawnSync(cli,["--config-file",config,"compile","--fqbn","esp32:esp32:esp32","--jobs","4",
    "--build-path",path.resolve(`work/wokwi/build-${location}`),
    "--output-dir",path.resolve(`work/wokwi/compiled-${location}`),source],
    {stdio:"inherit",windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0){process.exitCode=result.status??1;break;}
  console.log(`Firmware ${location}: work/wokwi/compiled-${location}/`);
}

import { spawn } from 'node:child_process';
import { loadCloudEnv,checkCloudEnv } from './cloud-env.mjs';

try {
  loadCloudEnv();
  checkCloudEnv();
  const action=process.argv[2];
  if(!['build','dev','start'].includes(action)) throw new Error('Gunakan npm run build:cloud atau dev:cloud.');
  if(action!=='build' && !process.env.APP_ORIGIN) process.env.APP_ORIGIN='http://localhost:3000';
  const args=action==='dev' ? ['scripts/dev.mjs'] : ['node_modules/next/dist/bin/next',action,...(action==='start'?['--hostname','127.0.0.1']:[])];
  const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env,windowsHide:true});
  child.on('error',error=>{console.error(error.message);process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code??1;});
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
} catch(error) { console.error(error.message); process.exitCode=1; }

// Isolated HTTP integration test: real Next routes + Supabase SDK + in-memory PostgreSQL.
// No request is sent to the user's Supabase; credentials and data below are test fixtures.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const sid='10000000-0000-4000-8000-000000000001';
const controllers=['30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004'];
const pub='sb_publishable_fixture_not_a_real_key_123456789';
const secret='sb_secret_fixture_not_a_real_key_123456789';
const users=[['60000000-0000-4000-8000-000000000001','operator@example.test','operator'],['60000000-0000-4000-8000-000000000002','admin@example.test','super_admin'],['60000000-0000-4000-8000-000000000003','outsider@example.test','operator']].map(([id,email,role])=>({id,email,role,aud:'authenticated',created_at:new Date().toISOString(),app_metadata:{},user_metadata:{}}));
const jwt=user=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})).toString('base64url'),'test-signature'].join('.');
const tokens=users.map(jwt);
const rpcArgs={authorize_device:['p_key','p_hash'],ingest_wokwi_telemetry:['p_device','p'],set_wokwi_setpoint:['p_controller','p_setpoint'],is_super_admin:[],has_school_role:['p_school','p_roles'],sensor_history:['p_school','p_hours'],dashboard_resource_history:['p_school','p_kind'],admin_members:['p_school'],system_statistics:[],issue_device_key:['p_device','p_hash']};
const tables=new Set(['schools','profiles','school_members','zones','devices','actuator_commands','actuator_logs','alerts','device_controls','activity_logs','school_settings','wokwi_controllers','wokwi_actuators','public_monitoring']);
let queue=Promise.resolve(),child;
const serialized=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
const response=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const mock=http.createServer(async(req,res)=>{
  try {
    const u=new URL(req.url,'http://localhost');
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
    const bearer=req.headers.authorization?.replace(/^Bearer /,'');
    const user=users[tokens.indexOf(bearer)];
    if(u.pathname==='/auth/v1/token') {
      const found=users.find(x=>x.email===body.email);
      return found && body.password==='fixture-password-123' ? response(res,200,{access_token:tokens[users.indexOf(found)],token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'fixture-refresh',user:found}) : response(res,400,{message:'Invalid test login'});
    }
    if(u.pathname==='/auth/v1/user') return user ? response(res,200,user) : response(res,401,{message:'Not signed in'});
    const result=await serialized(async()=>{
      await db.exec('reset role;');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user?.id??'']);
      await db.exec(`set role ${req.headers.apikey===secret?'service_role':user?'authenticated':'anon'};`);
      if(u.pathname.startsWith('/rest/v1/rpc/')) {
        const name=u.pathname.split('/').at(-1),args=rpcArgs[name];
        if(!args)throw new Error(`Unexpected RPC ${name}`);
        return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(k=>typeof body[k]==='object'&&!Array.isArray(body[k])?JSON.stringify(body[k]):body[k]))).rows[0].result;
      }
      const table=u.pathname.split('/').at(-1);if(!tables.has(table))throw new Error(`Unexpected table ${table}`);
      const values=[],conditions=[];
      for(const [key,value] of u.searchParams) {
        if(['select','order','limit'].includes(key))continue;
        if(!/^[a-z_]+$/.test(key)||!value.startsWith('eq.'))throw new Error('Unexpected filter');
        values.push(value.slice(3));conditions.push(`"${key}"=$${values.length}`);
      }
      const order=u.searchParams.get('order');
      if(order&&!/^[a-z_]+\.(asc|desc)$/.test(order))throw new Error('Unexpected order');
      const limit=Number(u.searchParams.get('limit')||1000);
      const rows=(await db.query(`select * from public.${table}${conditions.length?' where '+conditions.join(' and '):''}${order?' order by '+order.replace('.',' '):''} limit ${Math.min(limit,1000)}`,values)).rows;
      if(req.headers.accept?.includes('vnd.pgrst.object')) {
        if(rows.length!==1)throw Object.assign(new Error('JSON object requested, multiple (or no) rows returned'),{code:'PGRST116',details:`The result contains ${rows.length} rows`});
        return rows[0];
      }
      return rows;
    });
    response(res,200,result);
  }catch(e){response(res,400,{message:e.message,code:e.code??'P0001',details:e.details??''});}
});
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
let logs='';
try {
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create publication supabase_realtime;");
  await db.exec(fs.readFileSync('supabase/SETUP-SUPABASE.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  for(const user of users)await db.query('insert into auth.users(id,email) values($1,$2)',[user.id,user.email]);
  await db.exec(`insert into public.school_members(school_id,user_id,role) values('${sid}','${users[0].id}','operator');update public.profiles set role='super_admin' where id='${users[1].id}';`);
  const deviceKeys=[];
  for(const [index,id] of controllers.entries()) {
    const keyId=randomUUID(),key=String(index+1).repeat(64);
    await db.query('insert into public.device_credentials(id,device_id,key_hash) values($1,$2,$3)',[keyId,id,createHash('sha256').update(key).digest('hex')]);
    deviceKeys.push(`cs_${keyId}_${key}`);
  }
  const mockPort=await listen(mock),probe=net.createServer(),port=await listen(probe);
  await new Promise(resolve=>probe.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  const env={...process.env,NEXT_PUBLIC_DEMO_MODE:'false',VERCEL:'',NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${mockPort}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:pub,NEXT_PUBLIC_SUPABASE_ANON_KEY:'',SUPABASE_SECRET_KEY:secret,SUPABASE_SERVICE_ROLE_KEY:'',APP_ORIGIN:origin,WOKWI_LOCAL_ENABLED:'false',WOKWI_TUNNEL_AUTO_START:'false',CLIMATE_TEST_DIST_DIR:'.next-cloud-test'};
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',c=>{logs=(logs+c.toString()).slice(-10000);});child.stderr.on('data',c=>{logs=(logs+c.toString()).slice(-10000);});
  let ready=false;
  for(let i=0;i<90;i++) {
    if(child.exitCode!==null)throw new Error('Isolated Next server stopped');
    try { if((await fetch(origin+'/login',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;} }catch{/* waiting for compiler */}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready,'test server started');
  const post=(path,body,extra={})=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...extra},body:JSON.stringify(body)});
  const packet=(location)=>({device_id:`climate-${location}-esp32`,location_id:location,message_id:randomUUID(),temperature:30,humidity:65,co2:800,pm25:10,pcm_temperature:27,light_lux:350,occupancy:true,sensor_ok:true,tank_ok:true,fan_on:true,pump_on:true,hvac_on:false,ventilation_degrees:location==='classroom'?90:0,setpoint:26.7,firmware_version:'climate-wokwi-3.0'});
  const a=packet('shelter'),b=packet('classroom');
  assert.equal((await post('/api/wokwi/telemetry',a)).status,401);
  assert.equal((await post('/api/wokwi/telemetry',{...a,pump_on:true,tank_ok:false},{Authorization:'Bearer '+deviceKeys[0]})).status,400);
  assert.equal((await post('/api/wokwi/telemetry',b,{Authorization:'Bearer '+deviceKeys[0]})).status,403);
  for(const [i,p] of [a,b].entries()) {
    const r=await post('/api/wokwi/telemetry',p,{Authorization:'Bearer '+deviceKeys[i]});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).location_id,p.location_id);
  }
  console.log('PASS: HTTPS payload contract through real Next HTTP routes, two controller keys, invalid/cross-location requests rejected.');
  assert.equal((await fetch(origin+'/api/wokwi/live')).status,401);
  const login=async email=>{
    const r=await post('/api/auth/login',{email,password:'fixture-password-123',remember:true});assert.equal(r.status,200,await r.clone().text());
    return r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  };
  const cookie=await login(users[0].email);
  const dashboard=await fetch(origin+'/api/dashboard',{headers:{Cookie:cookie}});
  assert.equal(dashboard.status,200,await dashboard.clone().text());
  const view=await dashboard.json();
  assert.equal(view.source,'supabase');assert.equal(view.wokwiLocations.length,2);assert.equal(view.wokwiLocations[0].latest.temperature,30);
  assert.equal((await post('/api/wokwi/config',{location_id:'shelter',controller_id:controllers[0],setpoint:28},{Cookie:cookie,Origin:'https://untrusted.example'})).status,403);
  const config=await post('/api/wokwi/config',{location_id:'shelter',controller_id:controllers[0],setpoint:28},{Cookie:cookie});assert.equal(config.status,200,await config.clone().text());
  assert.equal((await (await post('/api/wokwi/telemetry',{...a,message_id:randomUUID()},{Authorization:'Bearer '+deviceKeys[0]})).json()).setpoint,28);
  const outsider=await login(users[2].email);
  assert.equal((await post('/api/wokwi/config',{location_id:'shelter',controller_id:controllers[0],setpoint:29},{Cookie:outsider})).status,403);
  console.log('PASS: cloud login, two-location dashboard, setpoint round-trip, origin check and cross-school HTTP authorization.');
  const adminCookie=await login(users[1].email);
  const rotate=await post('/api/manage/key',{deviceId:controllers[0]},{Cookie:adminCookie});
  assert.equal(rotate.status,200,await rotate.clone().text());
  const newKey=(await rotate.json()).token;
  assert.equal(newKey.length,104);
  assert.equal((await post('/api/wokwi/telemetry',packet('shelter'),{Authorization:'Bearer '+deviceKeys[0]})).status,401);
  assert.equal((await post('/api/wokwi/telemetry',packet('shelter'),{Authorization:'Bearer '+newKey})).status,200);
  console.log('PASS: device key rotation revokes the old key; 104-character key succeeds. No production data touched.');
} catch(error) {
  console.error(error.message);
  // Server logs contain test fixture data only, but omit them unless explicitly diagnosing locally.
  fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/cloud-http-test.log',logs);
  process.exitCode=1;
} finally {
  if(child?.pid) {
    if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    else child.kill();
  }
  mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));await db.close();
}

import fs from 'node:fs';

export function loadCloudEnv() {
  if(process.env.VERCEL!=='1' && fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
  process.env.NEXT_PUBLIC_DEMO_MODE='false';
  process.env.WOKWI_LOCAL_ENABLED='false';
  process.env.WOKWI_TUNNEL_AUTO_START='false';
}
export function checkCloudEnv(env=process.env) {
  const url=env.NEXT_PUBLIC_SUPABASE_URL;
  const pub=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret=env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const missing=[!url && 'NEXT_PUBLIC_SUPABASE_URL',!pub && 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',!secret && 'SUPABASE_SECRET_KEY'].filter(Boolean);
  if(missing.length) throw new Error(`Isi konfigurasi Supabase terlebih dahulu: ${missing.join(', ')}. Lihat docs/DEPLOY-VERCEL.md.`);
  let parsed;
  try { parsed=new URL(url); } catch { throw new Error('NEXT_PUBLIC_SUPABASE_URL bukan URL yang valid.'); }
  if(parsed.protocol!=='https:' || !parsed.hostname.endsWith('.supabase.co') || parsed.pathname!=='/' || parsed.search || parsed.hash || parsed.username || parsed.password)
    throw new Error('NEXT_PUBLIC_SUPABASE_URL harus URL HTTPS project Supabase (tanpa path).');
  function validKey(value,kind) {
    if(new RegExp(`^sb_${kind==='anon'?'publishable':'secret'}_[A-Za-z0-9_-]{16,}$`).test(value)) return true;
    try { const parts=value.split('.'); return parts.length===3 && JSON.parse(Buffer.from(parts[1],'base64url').toString()).role===kind; } catch { return false; }
  }
  if(!validKey(pub,'anon')) throw new Error('Key browser harus Publishable key (atau legacy anon), bukan Secret key.');
  if(!validKey(secret,'service_role')) throw new Error('Key server harus Secret key (atau legacy service_role).');
  if(pub===secret) throw new Error('Key browser dan key server harus berbeda.');
  if(env.VERCEL==='1' && env.APP_ORIGIN && !/^https:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])[^/]+\/?$/.test(env.APP_ORIGIN))
    throw new Error('APP_ORIGIN di Vercel harus alamat HTTPS website; hapus nilai localhost.');
  return {url:parsed.origin};
}

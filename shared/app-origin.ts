type OriginEnvironment = { [key:string]:string|undefined;APP_ORIGIN?:string;VERCEL?:string;VERCEL_ENV?:string;VERCEL_URL?:string;VERCEL_PROJECT_PRODUCTION_URL?:string};
// Only trusted deployment settings are used; never accept the request Host header.
export function resolveAppOrigin(env: OriginEnvironment): string {
  const domain=env.VERCEL_ENV==='preview' ? env.VERCEL_URL : env.VERCEL_PROJECT_PRODUCTION_URL;
  const input=env.APP_ORIGIN || (env.VERCEL==='1' && domain ? `https://${domain}` : '');
  if(!input) throw new Error('APP_ORIGIN atau domain Vercel belum tersedia.');
  const url=new URL(input);
  if(url.username || url.password || url.search || url.hash || (url.pathname!=='/' && url.pathname!==''))
    throw new Error('APP_ORIGIN harus berupa alamat utama website.');
  if(env.VERCEL==='1' ? url.protocol!=='https:' || ['localhost','127.0.0.1','[::1]'].includes(url.hostname)
    : !['http:','https:'].includes(url.protocol)) throw new Error('Alamat website tidak valid.');
  return url.origin;
}

type Env = { PLAY_CODE?: string; SESSION_SECRET?: string; NODE_ENV?: string };
const cookieName = 'emberhold_session';
const encoder = new TextEncoder();
const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' };
function gate(error = '') {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#18271f"><title>EMBERHOLD · 왕국 입장</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 0%,#39523a,transparent 65%),#14251f;color:#f4eedb;font-family:system-ui,sans-serif;padding:24px}.card{width:min(100%,420px);border:1px solid #9baf6f45;background:#20342b;padding:40px;border-radius:24px;box-shadow:0 30px 100px #0005}small{color:#d6b66c;letter-spacing:4px}h1{font-family:Georgia,serif;font-size:48px;letter-spacing:-2px;margin:20px 0 8px}p{color:#b7c3ad;font-size:14px;line-height:1.8}label{display:block;margin:32px 0 10px;font-size:13px}input,button{width:100%;font:inherit;border-radius:10px;padding:15px}input{background:#14251f;border:1px solid #819578;color:#fff;letter-spacing:3px}button{margin-top:14px;background:#e5c47b;color:#253326;border:0;font-weight:800;cursor:pointer}.error{color:#ffb4a1;min-height:24px}footer{font-size:11px;color:#8c9e89;margin-top:30px}</style><div class="card"><small>YOUR LITTLE KINGDOM</small><h1>Emberhold<span style="color:#e5c47b">.</span></h1><p>해가 저물면, 작은 왕국의 전투가 시작됩니다.<br>수호자님, 돌아오신 것을 환영합니다.</p><form method="POST" action="/unlock"><label for="code">왕국 입장 코드</label><input id="code" name="code" type="password" placeholder="입장 코드를 입력하세요" required maxlength="64" autocomplete="current-password"><button>왕국에 들어가기 →</button><p class="error" role="alert">${error}</p></form><footer>PRIVATE PLAYGROUND &nbsp; / &nbsp; SOLO DEFENSE</footer></div></html>`;
}
async function key(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign','verify']);
}
function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join(''); }
export async function authorize(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const secret = env.SESSION_SECRET || (env.NODE_ENV !== 'production' ? 'local-development-only-session-key-emberhold' : '');
  if (!secret || secret.length < 32) return new Response('Server configuration required: SESSION_SECRET', { status: 503, headers });
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  if (url.pathname === '/logout') return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`, 'Cache-Control': 'no-store' } });
  if (url.pathname === '/unlock') {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'POST' } });
    if (request.headers.get('origin') !== url.origin) return new Response('Forbidden', { status: 403, headers });
    if (Number(request.headers.get('content-length') || 0) > 1024) return new Response('Too large', { status: 413, headers });
    const body = await request.text();
    if (body.length > 1024) return new Response('Too large', { status: 413, headers });
    const code = new URLSearchParams(body).get('code');
    if (code !== (env.PLAY_CODE || 'PLAYGAME')) return new Response(gate('입장 코드가 올바르지 않습니다.'), { status: 401, headers });
    const expiry = String(Date.now() + 7 * 86400000);
    const signature = hex(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(expiry)));
    return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `${cookieName}=${expiry}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`, 'Cache-Control': 'no-store' } });
  }
  const cookie = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (cookie) {
    const [expiry, signature] = cookie.split('.');
    if (/^\d{13}$/.test(expiry) && /^[a-f0-9]{64}$/.test(signature || '') && Number(expiry) > Date.now() && Number(expiry) <= Date.now() + 7 * 86400000) {
      const bytes = Uint8Array.from(signature.match(/../g)!, x => parseInt(x,16));
      if (await crypto.subtle.verify('HMAC', await key(secret), bytes, encoder.encode(expiry))) return null;
    }
  }
  return new Response(gate(), { status: url.pathname === '/' ? 200 : 401, headers });
}

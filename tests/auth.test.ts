import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../server/auth';
const env={SESSION_SECRET:'test-secret-with-at-least-thirty-two-characters',PLAY_CODE:'PLAYGAME',NODE_ENV:'production'};
const origin='https://example.test';
function unlock(code:string,source=origin){return new Request(origin+'/unlock',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:source},body:new URLSearchParams({code})});}
test('game assets are blocked without a session; production fails closed without a secret',async()=>{
  assert.equal((await authorize(new Request(origin+'/'),env))?.status,200);
  assert.equal((await authorize(new Request(origin+'/assets/game.js'),env))?.status,401);
  assert.equal((await authorize(new Request(origin+'/'),{NODE_ENV:'production'}))?.status,503);
});
test('wrong codes, foreign origins and unsupported methods are rejected',async()=>{
  assert.equal((await authorize(unlock('WRONG'),env))?.status,401);
  assert.equal((await authorize(unlock('PLAYGAME','https://foreign.test'),env))?.status,403);
  assert.equal((await authorize(new Request(origin+'/unlock'),env))?.status,405);
});
test('correct code issues a signed HttpOnly Secure cookie; tampering fails and logout clears it',async()=>{
  const response=(await authorize(unlock('PLAYGAME'),env))!;assert.equal(response.status,303);
  const cookie=response.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
  assert.equal(await authorize(new Request(origin+'/assets/game.js',{headers:{cookie}}),env),null);
  assert.equal((await authorize(new Request(origin+'/',{headers:{cookie:cookie.replace(/\d/, '0')}}),env))?.status,200);
  const logout=(await authorize(new Request(origin+'/logout',{headers:{cookie}}),env))!;assert.match(logout.headers.get('set-cookie')!,/Max-Age=0/);
});

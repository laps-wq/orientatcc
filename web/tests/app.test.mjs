import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, generateKeyPairSync, sign } from 'node:crypto';
import { createApp, configuration } from '../server.mjs';
import { createStore } from '../lib/store.mjs';
import { previewRepository } from '../lib/preview.mjs';
import { validateDecision, decisionValues, approvals, revision } from '../lib/records.mjs';
import { googleRepository, verifyIdentity } from '../lib/google.mjs';
import http from 'node:http';

const temp=()=>mkdtempSync(join(tmpdir(),'orientatcc-test-'));
const key=()=>randomBytes(32).toString('hex');
test('valida decisões e detecta controles conflitantes',()=>{
  assert.throws(()=>validateDecision({status:'Revisar',version:'a'.repeat(64),note:''}));
  assert.throws(()=>validateDecision({status:'Enviar',version:'a'.repeat(64),note:'x'}));
  for(const status of ['Aprovado','Revisar','Descartado'])assert.equal(decisionValues(status).filter(Boolean).length,1);
  const row=['hoje','id','nome','','','','','Aprovado','','','',true,true,false];
  assert.equal(approvals([[],row])[0].status,'Conflito');
});
test('persistência de prévia, auditoria cifrada e conflito de versão',async()=>{
  const dir=temp(),secret=key();let store=createStore(dir,secret),repo=previewRepository(store);
  const a=(await repo.dashboard()).approvals[0];
  await repo.decide(a.row,{version:a.version,status:'Aprovado',note:'Exemplo'});
  await assert.rejects(repo.decide(a.row,{version:a.version,status:'Descartado',note:''}),{status:409});
  const sid=store.create({secret:'TOKEN-TESTE-NAO-DEVE-APARECER'});
  store.audit('teste','decisao','2',{note:'NOTA-CIFRADA-DE-TESTE'});
  store.close();store=createStore(dir,secret);repo=previewRepository(store);
  assert.equal((await repo.dashboard()).approvals[0].status,'Aprovado');
  assert.equal(store.get(sid).secret,'TOKEN-TESTE-NAO-DEVE-APARECER');
  assert.equal(store.history().length,1);store.remove(sid);assert.equal(store.get(sid),null);store.close();
  const bytes=readFileSync(join(dir,'orientatcc.sqlite')).toString();
  assert.ok(!bytes.includes('TOKEN-TESTE-NAO-DEVE-APARECER'));assert.ok(!bytes.includes('NOTA-CIFRADA-DE-TESTE'));
});
test('API bloqueia leitura sem sessão e exige CSRF para decisões',async()=>{
  const config={origin:'http://localhost:4180',preview:true,dir:temp(),key:key(),allowedEmail:'orientador@example.org'};
  const app=createApp(config);await new Promise(r=>app.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.address().port}`;
  config.origin=base;
  const request=(path,init={})=>fetch(base+path,init);
  try{
    assert.equal((await request('/api/dashboard')).status,401);
    const badHost=await new Promise(resolve=>http.get(base+'/api/session',{headers:{Host:'attacker.invalid'}},r=>{r.resume();resolve(r.statusCode);}));assert.equal(badHost,403);
    const login=await request('/api/session'),auth=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
    const d=await(await request('/api/dashboard',{headers:{cookie}})).json();assert.equal(d.mode,'preview');assert.equal(d.students.length,2);
    const item=d.approvals[0],body=JSON.stringify({version:item.version,status:'Aprovado',note:'Teste'}),headers={cookie,origin:config.origin,'content-type':'application/json'};
    assert.equal((await request('/api/approvals/2',{method:'POST',headers,body})).status,403);
    headers['x-csrf-token']=auth.csrf;
    assert.equal((await request('/api/transcripts')).status,401);
    const transcriptBody=JSON.stringify({studentId:d.students[0].id,date:'2026-09-30',source:'https://drive.google.com/file/d/demo/view',text:'Transcrição fictícia usada somente no teste da API.'});
    assert.equal((await request('/api/transcripts',{method:'POST',headers:{...headers,'x-csrf-token':'invalid'},body:transcriptBody})).status,403);
    const imported=await(await request('/api/transcripts',{method:'POST',headers,body:transcriptBody})).json();assert.equal(imported.duplicate,false);
    const repeated=await(await request('/api/transcripts',{method:'POST',headers,body:transcriptBody})).json();assert.equal(repeated.duplicate,true);
    const transcripts=await(await request('/api/transcripts',{headers:{cookie}})).json();assert.equal(transcripts.length,1);assert.equal(transcripts[0].status,'Aguardando revisão');
    assert.equal((await request('/api/approvals/2',{method:'POST',headers:{...headers,origin:'https://attacker.invalid'},body})).status,403);
    assert.equal((await request('/api/approvals/2',{method:'POST',headers,body})).status,200);
    assert.equal((await request('/api/approvals/2',{method:'POST',headers,body})).status,409);
    const meeting=d.meetings[0];assert.equal((await request('/api/meetings/2/no-show',{method:'POST',headers,body:JSON.stringify({version:meeting.version,noShow:true})})).status,200);
    const next=await(await request('/api/dashboard',{headers:{cookie}})).json();assert.equal(next.meetings[0].noShow,true);assert.equal(next.meetings[0].actions,meeting.actions);
    assert.equal((await request('/.env')).status,404);
    const html=await(await request('/')).text();assert.ok(!html.includes('lhbs@'));assert.ok(html.includes('OrientaTCC'));
    assert.equal((await request('/auth/logout',{method:'POST',headers,body:'{}'})).status,200);
    assert.equal((await request('/api/dashboard',{headers:{cookie}})).status,401);
  }finally{await new Promise(r=>app.close(r));}
});
test('modo real não oferece atalho de prévia',async()=>{
  const cfg={origin:'http://localhost:4180',preview:false,dir:temp(),key:key(),allowedEmail:'orientador@example.org'};const app=createApp(cfg);await new Promise(r=>app.listen(0,'127.0.0.1',r));
  try{const base=`http://127.0.0.1:${app.address().port}`;cfg.origin=base;const session=await(await fetch(base+'/api/session')).json();assert.equal(session.user,null);assert.equal(session.mode,'google');assert.equal((await fetch(base+'/auth/callback?state=x&code=y')).status,403);}finally{await new Promise(r=>app.close(r));}
  assert.throws(()=>configuration({NODE_ENV:'production',HOST:'0.0.0.0',APP_ORIGIN:'https://example.org'},true));
  assert.throws(()=>configuration({APP_ORIGIN:'http://example.org',TOKEN_ENCRYPTION_KEY:key()},false));
});
test('adaptador Google preserva fórmula e conteúdo, escreve somente I e L:N',async()=>{
  const original=globalThis.fetch;const before=['data','aluno','Nome','Tipo','Recomendação','Evidência','Alta','Pendente','','Origem','data','FALSE','FALSE','FALSE'];let current=[...before],written;
  const header=['Data','ID','Aluno','Tipo','Recomendação','Evidência','Impacto','Decisão','Observação da orientadora','Origem','Atualizado em','Aprovar','Revisar','Descartar'];
  globalThis.fetch=async(url,opts)=>{let result;if(String(url).includes('?fields='))result={sheets:[{properties:{title:'Para minha aprovação',sheetId:17}}]};else if(String(url).endsWith(':batchUpdate')){written=JSON.parse(opts.body);current[7]='Aprovado';current[11]='TRUE';result={};}else{const decoded=decodeURIComponent(url);result={values:[decoded.endsWith('A1:N1')?header:current]};}return new Response(JSON.stringify(result),{status:200});};
  try{const repo=googleRepository({spreadsheetId:'fixture'},{token:{access_token:'fake',expiresAt:Date.now()+100000}},()=>{});await repo.decide(2,{version:revision(before),status:'Aprovado',note:''});assert.deepEqual(written.requests.map(r=>[r.updateCells.range.startColumnIndex,r.updateCells.range.endColumnIndex]),[[8,9],[11,14]]);assert.ok(!JSON.stringify(written).includes('formulaValue'));}finally{globalThis.fetch=original;}
});
test('identidade exige assinatura, expiração, nonce e conta autorizada',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'test'};
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}));
  const claims={iss:'https://accounts.google.com',aud:'client',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,nonce:'nonce',email_verified:true,email:'orientador@example.org',sub:'subject'};
  const jwt=p=>{const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url'),b=Buffer.from(JSON.stringify(p)).toString('base64url');return `${h}.${b}.${sign('RSA-SHA256',Buffer.from(`${h}.${b}`),privateKey).toString('base64url')}`;};
  try{assert.equal((await verifyIdentity(jwt(claims),'client','nonce','orientador@example.org')).email,claims.email);await assert.rejects(verifyIdentity(jwt({...claims,email:'aluno@example.org'}),'client','nonce',claims.email));await assert.rejects(verifyIdentity(jwt({...claims,exp:undefined}),'client','nonce',claims.email));await assert.rejects(verifyIdentity(jwt(claims),'client','wrong',claims.email));}finally{globalThis.fetch=original;}
});

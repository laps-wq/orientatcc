import { createPublicKey, verify } from 'node:crypto';
import { approvals, students, meetings, revision, decisionValues } from './records.mjs';

export async function verifyIdentity(token, clientId, nonce, allowedEmail) {
  const parts=String(token).split('.');
  if(parts.length!==3||parts.some(p=>!p)||!nonce||!clientId||!allowedEmail) throw new Error('Identidade inválida.');
  const [head,body,sig]=parts;
  const header=JSON.parse(Buffer.from(head,'base64url'));
  if(header.alg!=='RS256'||!header.kid) throw new Error('Assinatura Google inválida.');
  const response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error('Não foi possível validar o login Google.');
  const {keys}=await response.json();
  const jwk=keys.find(k=>k.kid===header.kid);
  if(!jwk || !verify('RSA-SHA256',Buffer.from(`${head}.${body}`),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(sig,'base64url'))) throw new Error('Assinatura Google inválida.');
  const p=JSON.parse(Buffer.from(body,'base64url'));
  if(!['accounts.google.com','https://accounts.google.com'].includes(p.iss)||p.aud!==clientId||!Number.isFinite(p.exp)||p.exp<=Date.now()/1000||!Number.isFinite(p.iat)||p.iat>Date.now()/1000+60||p.nonce!==nonce||p.email_verified!==true||p.email?.toLowerCase()!==allowedEmail.toLowerCase()||!p.sub) throw new Error('Conta não autorizada.');
  return {sub:p.sub,email:p.email,name:p.name||p.email};
}
export async function tokenRequest(params) {
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams(params),signal:AbortSignal.timeout(20000)});
  const data=await r.json();
  if(!r.ok) throw new Error('A autorização Google expirou ou foi recusada. Entre novamente.');
  return data;
}
export function googleRepository(config, session, saveSession) {
  async function accessToken() {
    if(session.token.expiresAt>Date.now()+60000) return session.token.access_token;
    if(!session.token.refresh_token) throw new Error('Entre novamente para renovar o acesso Google.');
    const t=await tokenRequest({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'refresh_token',refresh_token:session.token.refresh_token});
    session.token={...session.token,...t,expiresAt:Date.now()+t.expires_in*1000};saveSession(session);
    return t.access_token;
  }
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}`;
  async function request(path,body) {
    const token=await accessToken();
    const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const data=await r.json();
    if(!r.ok) {const e=new Error(body?'A gravação não foi confirmada. Atualize a lista antes de tentar novamente.':'Não foi possível ler a planilha. Verifique sua autorização e acesso.');e.status=502;throw e;}
    return data;
  }
  async function read(sheet,range) {return (await request(`/values/${encodeURIComponent(`'${sheet}'!${range}`)}`)).values||[];}
  async function metadata() {
    const m=await request('?fields=sheets.properties');
    return m.sheets.map(s=>s.properties);
  }
  async function dashboard() {
    const meta=await metadata();
    for(const title of ['Orientandos','Para minha aprovação','Registro de reuniões']) if(!meta.some(s=>s.title===title)) throw new Error(`Aba ausente: ${title}`);
    const [a,b,c]=await Promise.all([read('Orientandos','A1:S100'),read('Para minha aprovação','A1:N500'),read('Registro de reuniões','A1:K500')]);
    return {students:students(a),approvals:approvals(b),meetings:meetings(c),loadedAt:new Date().toISOString(),mode:'google'};
  }
  async function decide(row, input) {
    const meta=await metadata();
    const sheet=meta.find(s=>s.title==='Para minha aprovação');
    const header=(await read(sheet.title,'A1:N1'))[0];
    if(header?.[7]!=='Decisão'||header?.[8]!=='Observação da orientadora'||header?.[11]!=='Aprovar'||header?.[12]!=='Revisar'||header?.[13]!=='Descartar') throw new Error('A estrutura da fila mudou. A gravação foi bloqueada para preservar os dados.');
    const before=(await read(sheet.title,`A${row}:N${row}`))[0];
    if(!before?.[1]||revision(before)!==input.version) {const e=new Error('O item mudou desde sua leitura. Atualize a lista antes de decidir.');e.status=409;throw e;}
    // Preserve the existing H formula; write only the user's note and controls.
    await request(':batchUpdate',{requests:[
      {updateCells:{range:{sheetId:sheet.sheetId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:8,endColumnIndex:9},rows:[{values:[{userEnteredValue:{stringValue:input.note}}]}],fields:'userEnteredValue'}},
      {updateCells:{range:{sheetId:sheet.sheetId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:11,endColumnIndex:14},rows:[{values:decisionValues(input.status).map(boolValue=>({userEnteredValue:{boolValue}}))}],fields:'userEnteredValue'}}
    ]});
    const after=(await read(sheet.title,`A${row}:N${row}`))[0];
    if(after?.[7]!==input.status||(after?.[8]||'')!==input.note) throw new Error('Gravação enviada, mas a confirmação divergiu. Atualize antes de tentar novamente.');
    return {before,after};
  }
  async function noShow(row,input) {
    const meta=await metadata();const sheet=meta.find(s=>s.title==='Registro de reuniões');
    const header=(await read(sheet.title,'A1:K1'))[0];
    if(header?.[3]!=='Não ocorreu?') throw new Error('A estrutura do registro mudou.');
    const before=(await read(sheet.title,`A${row}:K${row}`))[0];
    if(!before?.[1]||revision(before)!==input.version){const e=new Error('O registro mudou. Atualize a página.');e.status=409;throw e;}
    // Existing actions and notes are preserved. The scheduled workflow interprets this checkbox.
    await request(':batchUpdate',{requests:[{updateCells:{range:{sheetId:sheet.sheetId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:3,endColumnIndex:4},rows:[{values:[{userEnteredValue:{boolValue:input.noShow}}]}],fields:'userEnteredValue'}}]});
    const after=(await read(sheet.title,`A${row}:K${row}`))[0];
    if((after?.[3]==='TRUE')!==input.noShow)throw new Error('Confirmação divergente. Atualize a página.');
    return {before,after};
  }
  return {dashboard,decide,noShow};
}

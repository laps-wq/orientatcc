import http from 'node:http';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createStore } from './lib/store.mjs';
import { googleRepository, tokenRequest, verifyIdentity } from './lib/google.mjs';
import { previewRepository } from './lib/preview.mjs';
import { validateDecision } from './lib/records.mjs';
import { validateTranscript } from './lib/transcripts.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const random=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function configuration(env=process.env, preview=process.argv.includes('--preview')) {
  const port=Number(env.PORT||4180), production=env.NODE_ENV==='production';
  const origin=new URL(env.APP_ORIGIN||`http://localhost:${port}`);
  const host=env.HOST||(production?'0.0.0.0':'127.0.0.1');
  if(origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password) throw Error('APP_ORIGIN deve conter somente protocolo e domínio.');
  if(!['https:','http:'].includes(origin.protocol)) throw Error('Protocolo inválido.');
  if(preview&&(production||!['127.0.0.1','localhost','::1'].includes(host)||!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))) throw Error('Prévia permitida somente em loopback, fora de produção.');
  if(!preview&&origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)) throw Error('O login exige HTTPS fora do localhost.');
  const dir=resolve(root,preview?'data-preview':env.DATA_DIR||'data');
  let key=env.TOKEN_ENCRYPTION_KEY;
  if(preview){mkdirSync(dir,{recursive:true});const path=resolve(dir,'preview.key');if(!existsSync(path))writeFileSync(path,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});key=readFileSync(path,'utf8');}
  if(!/^[a-f0-9]{64}$/i.test(key||''))throw Error('Configure TOKEN_ENCRYPTION_KEY no .env. Use --preview para a demonstração fictícia.');
  const config={port,production,origin:origin.origin,host,preview,dir,key,clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,allowedEmail:(env.ALLOWED_EMAIL||'orientador@example.org').toLowerCase(),spreadsheetId:env.SPREADSHEET_ID||'CONFIGURE_SPREADSHEET_ID'};
  if(production&&(!config.clientId||!config.clientSecret||origin.protocol!=='https:'))throw Error('Produção exige Google OAuth configurado e APP_ORIGIN HTTPS.');
  return config;
}
export function createApp(config) {
  const store=createStore(config.dir,config.key), demo=previewRepository(store);
  let writes=Promise.resolve();
  const serial=fn=>{const next=writes.then(fn);writes=next.catch(()=>{});return next;};
  const secure=config.origin.startsWith('https:');
  const cookie=(id,age=28800)=>`otcc=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
  const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/student-detail.js':['student-detail.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/brand.png':['brand.png','image/png']};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    const redirect=url=>{res.writeHead(302,{Location:url});res.end();};
    try {
      if(req.headers.host!==new URL(config.origin).host)throw fail(403,'Endereço não autorizado.');
      const url=new URL(req.url,config.origin), path=url.pathname;
      let sid=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('otcc='))?.slice(5), session=store.get(sid);
      if(path==='/api/session'&&req.method==='GET'){
        if(config.preview&&!session?.user){session={user:{email:'previa@local',name:'Prévia local'},csrf:random(),mode:'preview'};sid=store.create(session);res.setHeader('Set-Cookie',cookie(sid));}
        return json(200,{user:session?.user||null,csrf:session?.user?session.csrf:null,mode:config.preview?'preview':'google',configured:!!(config.clientId&&config.clientSecret)});
      }
      if(path==='/auth/google'&&req.method==='GET'){
        if(config.preview||!config.clientId||!config.clientSecret)throw fail(503,'Configure as credenciais OAuth antes de conectar.');
        const state=random(),nonce=random(),verifier=random();store.remove(sid);sid=store.create({state,nonce,verifier},600000);res.setHeader('Set-Cookie',cookie(sid,600));
        const params=new URLSearchParams({client_id:config.clientId,redirect_uri:config.origin+'/auth/callback',response_type:'code',scope:'openid email profile https://www.googleapis.com/auth/spreadsheets',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'offline',prompt:'consent',login_hint:config.allowedEmail});
        return redirect('https://accounts.google.com/o/oauth2/v2/auth?'+params);
      }
      if(path==='/auth/callback'&&req.method==='GET'){
        if(config.preview||!session?.state||!equal(url.searchParams.get('state'),session.state)||!url.searchParams.get('code'))throw fail(403,'Login inválido ou expirado. Volte ao painel e tente novamente.');
        store.remove(sid);
        const t=await tokenRequest({client_id:config.clientId,client_secret:config.clientSecret,code:url.searchParams.get('code'),code_verifier:session.verifier,grant_type:'authorization_code',redirect_uri:config.origin+'/auth/callback'});
        const user=await verifyIdentity(t.id_token,config.clientId,session.nonce,config.allowedEmail);
        const id=store.create({user,csrf:random(),mode:'google',token:{access_token:t.access_token,refresh_token:t.refresh_token,expiresAt:Date.now()+t.expires_in*1000}});
        res.setHeader('Set-Cookie',cookie(id));return redirect('/');
      }
      if(path.startsWith('/api/')||path==='/auth/logout'){
        if(!session?.user||session.mode!==(config.preview?'preview':'google'))throw fail(401,'Entre com sua conta autorizada.');
        if(!config.preview&&session.user.email.toLowerCase()!==config.allowedEmail)throw fail(403,'Conta não autorizada.');
        if(req.method!=='GET'){
          if(req.method!=='POST'||req.headers.origin!==config.origin||!equal(req.headers['x-csrf-token'],session.csrf))throw fail(403,'Solicitação não autorizada. Atualize a página.');
        }
        if(path==='/auth/logout'&&req.method==='POST'){store.remove(sid);res.setHeader('Set-Cookie',cookie('',0));return json(200,{ok:true});}
        const repo=config.preview?demo:googleRepository(config,session,v=>store.save(sid,v));
        if(path==='/api/dashboard'&&req.method==='GET')return json(200,await repo.dashboard());
        if(path==='/api/history'&&req.method==='GET')return json(200,store.history());
        if(path==='/api/transcripts'&&req.method==='GET')return json(200,store.transcripts());
        if(path==='/api/transcripts'&&req.method==='POST'){
          if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'Envie JSON.');
          let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>450000)throw fail(413,'Transcrição muito grande.');}
          let input;try{input=JSON.parse(body);}catch{throw fail(400,'JSON inválido.');}
          const dashboard=await repo.dashboard();
          let transcript;try{transcript=validateTranscript(input,dashboard.students);}catch(e){throw fail(400,e.message);}
          const added=store.transcriptPut(transcript);
          if(added)store.audit(session.user.email,'Transcrição recebida — revisão pendente',transcript.id,{studentId:transcript.studentId,date:transcript.date});
          return json(200,{ok:true,duplicate:!added});
        }
        const approval=/^\/api\/approvals\/(\d+)$/.exec(path),meeting=/^\/api\/meetings\/(\d+)\/no-show$/.exec(path);
        if(req.method==='POST'&&(approval||meeting)){
          if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'Envie JSON.');
          let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>20000)throw fail(413,'Solicitação muito grande.');}
          let input;try{input=JSON.parse(body);}catch{throw fail(400,'JSON inválido.');}
          const row=Number((approval||meeting)[1]);if(!Number.isInteger(row)||row<2||row>500)throw fail(400,'Linha inválida.');
          try{if(approval)validateDecision(input);else if(typeof input.noShow!=='boolean'||!/^[a-f0-9]{64}$/i.test(input.version||''))throw Error('Registro inválido.');}catch(e){throw fail(400,e.message);}
          const action=approval?'Decisão':'Reunião não ocorreu';
          await serial(async()=>{store.audit(session.user.email,'Solicitação: '+action,path,{row,input});try{const result=await(approval?repo.decide(row,input):repo.noShow(row,input));store.audit(session.user.email,'Confirmado: '+action,path,result);}catch(e){store.audit(session.user.email,'Não confirmado: '+action,path,{status:e.status||502});throw e;}});
          return json(200,{ok:true});
        }
        throw fail(404,'Recurso não encontrado.');
      }
      if(req.method==='GET'&&assets[path]){const [file,type]=assets[path];res.writeHead(200,{'Content-Type':type});return res.end(readFileSync(resolve(root,'public',file)));}
      throw fail(404,'Página não encontrada.');
    }catch(e){json(e.status||502,{error:e.status?e.message:'Não foi possível concluir. Atualize o painel antes de repetir uma gravação; se necessário, entre novamente.'});}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  server.on('close',()=>store.close());return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const c=configuration();createApp(c).listen(c.port,c.host,()=>console.log(`OrientaTCC: ${c.origin} — ${c.preview?'PRÉVIA FICTÍCIA':'login Google obrigatório'}`));}catch(e){console.error(e.message);process.exitCode=1;}
}

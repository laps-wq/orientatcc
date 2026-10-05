import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

export function createStore(dir, keyHex) {
  const key=Buffer.from(keyHex,'hex');
  if(key.length!==32) throw new Error('TOKEN_ENCRYPTION_KEY deve conter 64 caracteres hexadecimais.');
  mkdirSync(dir,{recursive:true});
  const db=new DatabaseSync(resolve(dir,'orientatcc.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS preview(id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transcripts(id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL);`);
  function encrypt(value) {const iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',key,iv);const bytes=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]).toString('base64');}
  function decrypt(value) {const b=Buffer.from(value,'base64');const d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}
  const hash=id=>createHash('sha256').update(id).digest('hex');
  return {
    transcriptPut(value) {const expiry=new Date();expiry.setUTCMonth(expiry.getUTCMonth()+6);return db.prepare('INSERT OR IGNORE INTO transcripts VALUES(?,?,?)').run(value.id,encrypt(value),expiry.getTime()).changes>0;},
    transcripts() {db.prepare('DELETE FROM transcripts WHERE expires<=?').run(Date.now());return db.prepare('SELECT payload FROM transcripts ORDER BY rowid DESC').all().map(r=>decrypt(r.payload));},
    create(payload,ttl=8*3600000) {const id=randomBytes(32).toString('base64url');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(id),encrypt(payload),Date.now()+ttl);return id;},
    get(id) {if(!id)return null;const row=db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(hash(id),Date.now());if(!row)return null;try{return decrypt(row.payload);}catch{return null;}},
    save(id,payload) {db.prepare('UPDATE sessions SET payload=? WHERE id=?').run(encrypt(payload),hash(id));},
    remove(id) {if(id)db.prepare('DELETE FROM sessions WHERE id=?').run(hash(id));},
    audit(actor,action,target,payload) {db.prepare('INSERT INTO audit(at,actor,action,target,payload) VALUES(?,?,?,?,?)').run(new Date().toISOString(),actor,action,target,encrypt(payload));},
    history() {return db.prepare('SELECT id,at,actor,action,target FROM audit ORDER BY id DESC LIMIT 100').all();},
    previewGet(id) {const r=db.prepare('SELECT value FROM preview WHERE id=?').get(id);return r?JSON.parse(r.value):null;},
    previewSet(id,value) {db.prepare('INSERT INTO preview VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,JSON.stringify(value));},
    close(){db.close();}
  };
}

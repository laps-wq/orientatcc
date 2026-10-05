import { createHash } from 'node:crypto';

export const revision = row => createHash('sha256').update(JSON.stringify(row)).digest('hex');
export const truth = value => value === true || value === 'TRUE';
export function rows(values) {
  return (values || []).slice(1).map((r, i) => ({row:i + 2, values:r, version:revision(r)})).filter(r => r.values[1]);
}
export function approvals(values) {
  return rows(values).map(({row, values:r, version}) => ({row, version, date:r[0], studentId:r[1], student:r[2], type:r[3], title:r[4], evidence:r[5], impact:r[6], status:[r[11],r[12],r[13]].filter(truth).length > 1 ? 'Conflito' : r[7] || 'Pendente', note:r[8] || '', source:r[9], updated:r[10]}));
}
export function students(values) {
  return rows(values).map(({values:r})=>({id:r[0],name:r[1],email:r[2],topic:r[3],stage:r[4],deadline:r[5],activity:r[8],status:r[9],summary:r[10],group:r[0].includes('2027')?'TCC1':'TCC2', github:r[16],gitStatus:r[17],lastCommit:r[18]}));
}
export function meetings(values) {
  return rows(values).map(({row,values:r,version})=>({row,version,date:r[0],studentId:r[1],student:r[2],noShow:truth(r[3]),status:r[4],tactiq:r[5],actions:r[6],pending:r[7],next:r[8],approval:r[9],note:r[10]}));
}
export function validateDecision(input) {
  if (!input || !['Aprovado','Revisar','Descartado','Pendente'].includes(input.status) || typeof input.version !== 'string' || input.version.length !== 64 || typeof input.note !== 'string' || input.note.length > 4000) throw new Error('Dados de decisão inválidos.');
  if(input.status==='Revisar' && !input.note.trim()) throw new Error('Descreva o ajuste solicitado.');
  return input;
}
export function decisionValues(status) {return [status==='Aprovado',status==='Revisar',status==='Descartado'];}

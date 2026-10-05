import { createHash } from 'node:crypto';

export function validateTranscript(input, students) {
  if (!input || typeof input.text !== 'string' || input.text.trim().length < 20 || input.text.length > 100000) throw new Error('Cole entre 20 e 100.000 caracteres da transcrição.');
  const student = students.find(s => s.id === input.studentId);
  if (!student) throw new Error('Selecione um aluno cadastrado.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0,10) !== input.date) throw new Error('Data da reunião inválida.');
  let source;
  try { source = new URL(input.source); } catch { throw new Error('Informe o link da fonte.'); }
  if (source.protocol !== 'https:' || source.username || source.password || !['drive.google.com','docs.google.com','app.tactiq.io'].includes(source.hostname)) throw new Error('Use um link HTTPS do Drive, Google Docs ou Tactiq.');
  const text = input.text.replace(/\r\n/g,'\n').trim();
  const id = createHash('sha256').update(JSON.stringify([student.id,input.date,text])).digest('hex');
  return {id, studentId:student.id, student:student.name, date:input.date, source:source.href, text, status:'Aguardando revisão', receivedAt:new Date().toISOString()};
}

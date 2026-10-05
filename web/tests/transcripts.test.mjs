import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateTranscript} from '../lib/transcripts.mjs';
import {createStore} from '../lib/store.mjs';

test('Transcrições: validação, duplicação, persistência cifrada e revisão pendente',()=>{
  const students=[{id:'demo',name:'Aluno fictício'}];
  const input={studentId:'demo',date:'2026-09-30',source:'https://drive.google.com/file/d/demo/view',text:'Texto fictício da reunião, sem decisões aprovadas.'};
  const value=validateTranscript(input,students);
  assert.equal(value.status,'Aguardando revisão');
  for(const patch of [{date:'2026-02-30'},{studentId:'outro'},{source:'javascript:alert(1)'},{text:'curto'}])assert.throws(()=>validateTranscript({...input,...patch},students));
  const dir=mkdtempSync(join(tmpdir(),'otcc-transcripts-'));
  let store=createStore(dir,'ab'.repeat(32));
  try{
    assert.equal(store.transcriptPut(value),true);assert.equal(store.transcriptPut(value),false);
    assert.equal(store.transcripts().length,1);store.close();
    assert.equal(readFileSync(join(dir,'orientatcc.sqlite')).includes(Buffer.from(input.text)),false);
    store=createStore(dir,'ab'.repeat(32));assert.equal(store.transcripts()[0].text,input.text);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

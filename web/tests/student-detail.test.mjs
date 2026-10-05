import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studentDetail,sourceLinks} from '../public/student-detail.js';
test('Ficha individual não mistura alunos e ordena reuniões por data',()=>{
  const data={students:[{id:'a'},{id:'b'}],meetings:[{studentId:'a',date:'30/09/2026',row:2},{studentId:'b',date:'02/10/2026',row:3},{studentId:'a',date:'01/10/2026',row:4,noShow:true}],approvals:[{studentId:'a',status:'Pendente'},{studentId:'b',status:'Aprovado'}]};
  const detail=studentDetail(data,'a');assert.equal(detail.meetings.length,2);assert.equal(detail.meetings[0].row,4);assert.equal(detail.meetings[0].noShow,true);assert.equal(detail.approvals.length,1);
});
test('Fontes permitem apenas links HTTPS conhecidos sem credenciais',()=>{
  assert.deepEqual(sourceLinks('https://app.tactiq.io/m/123 https://app.tactiq.io/m/123 javascript:alert(1) https://app.tactiq.io.evil.test/m https://user:pass@github.com/repo'),['https://app.tactiq.io/m/123']);
});

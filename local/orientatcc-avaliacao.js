/* Avaliação assistida: nenhuma nota inferida de volume de atividade ou fonte ausente. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const validScore = value => value === '' || (typeof value === 'string' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10);
  const definitions = [
    ['Entrega do texto', ['Clareza do problema e dos objetivos', 'Fundamentação e rastreabilidade das referências', 'Coerência metodológica e organização do texto']],
    ['Processo de desenvolvimento', ['Progresso em relação aos compromissos acordados', 'Dedicação documentada nas atividades e revisões', 'Cumprimento dos prazos acordados']]
  ];
  window.validEvaluationRecord = r => !!r && r.version === 1 && ['draft','reviewed'].includes(r.status) && typeof r.feedback === 'string' && r.feedback.length <= 12000 && typeof r.cutoff === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.cutoff) && Number.isFinite(Date.parse(r.updatedAt)) && typeof r.confirmed === 'boolean' && Array.isArray(r.criteria) && r.criteria.length === 6 && r.criteria.every(c => typeof c.label === 'string' && c.label.length <= 200 && validScore(c.score) && typeof c.evidence === 'string' && c.evidence.length <= 600) && validScore(r.finalDelivery) && validScore(r.finalProcess);
  const cards = [...document.querySelectorAll('.student-card[data-student-id]')];
  cards.forEach(card => {const o = document.createElement('option');o.value=card.dataset.studentId;o.textContent=card.querySelector('.student-name').textContent;$('evaluationStudent').append(o);});
  let key = '', activeStudent = '', activeCycle = '', snapshot = '', record = null, dirty = false;
  const controls = [];
  definitions.forEach(([title,labels],group) => {
    const fieldset=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent=title;fieldset.append(legend);
    labels.forEach((name,index) => {
      const n=group*3+index;
      const make=(caption,tag,id) => {const l=document.createElement('label');l.htmlFor=id;l.textContent=caption;const el=document.createElement(tag);el.id=id;fieldset.append(l,el);return el;};
      const label=make('Critério proposto (editável)','input',`evalLabel${n}`);label.value=name;label.maxLength=200;
      const score=make('Pontuação de 0 a 10; vazio = não avaliado','input',`evalScore${n}`);score.type='number';score.min=0;score.max=10;score.step='0.1';
      const evidence=make('Evidência e data / link / compromisso conferido','textarea',`evalEvidence${n}`);evidence.maxLength=600;evidence.style.minHeight='70px';
      controls.push({label,score,evidence});
    });$('evaluationCriteria').append(fieldset);
  });
  function suggestion(start) {
    const entries=controls.slice(start,start+3);
    if(!$('evaluationRubricConfirmed').checked || entries.some(c=>!c.label.value.trim() || c.score.value==='' || !validScore(c.score.value) || !c.evidence.value.trim()))return null;
    return Math.round(entries.reduce((sum,c)=>sum+Number(c.score.value),0)/3*10)/10;
  }
  function refresh(){[['evaluationDelivery',0],['evaluationProcess',3]].forEach(([id,start])=>{const n=suggestion(start);$(id).textContent=n===null?'Sem sugestão numérica validada. Informe sua nota.':`Sugestão da rubrica revisada: ${n.toFixed(1)} / 10`;});}
  function load(){
    if(dirty && !confirm('Há alterações não salvas. Descartar essas alterações para carregar outra avaliação?')){$('evaluationStudent').value=activeStudent;$('evaluationCycle').value=activeCycle;return;}
    const cycle=$('evaluationCycle').value.trim();if(!/^[A-Za-z0-9-]{1,60}$/.test(cycle)){alert('Use letras, números e hífens no identificador.');return;}
    const card=cards.find(c=>c.dataset.studentId===$('evaluationStudent').value);if(!card)return;
    activeStudent=card.dataset.studentId;activeCycle=cycle;key=`orientatcc:evaluation:v1:${activeStudent}:${cycle}`;
    snapshot=card.querySelector('.student-body').innerText || card.querySelector('.student-body').textContent;
    $('evaluationHistory').textContent=snapshot;card.id=card.id||`ficha-${activeStudent}`;$('evaluationSource').href='#'+card.id;
    record=null;
    try {const raw=localStorage.getItem(key);if(raw){const r=JSON.parse(raw);if(!window.validEvaluationRecord(r))throw Error('Registro inválido');record=r;}}catch(e){$('evaluationStatus').textContent='Não foi possível carregar a avaliação: '+e.message;key='';return;}
    controls.forEach((c,i)=>{c.label.value=record?.criteria[i].label??definitions[Math.floor(i/3)][1][i%3];c.score.value=record?.criteria[i].score??'';c.evidence.value=record?.criteria[i].evidence??'';});
    $('evaluationDeadline').value=record?.cutoff||'2026-10-13';$('evaluationRubricConfirmed').checked=record?.confirmed||false;
    $('evaluationFinalDelivery').value=record?.finalDelivery??'';$('evaluationFinalProcess').value=record?.finalProcess??'';
    const summary=card.querySelector('.student-body > p')?.textContent||'Sem resumo disponível.';
    const pending=[...card.querySelectorAll('.clean-list li')].map(x=>x.textContent).join('\n');
    $('evaluationFeedback').value=record?.feedback??`Com base no último registro: ${summary}\n\nAntes de fechar a avaliação, conferir a versão entregue e o cumprimento dos compromissos acordados.`;
    dirty=false;refresh();$('evaluationStatus').textContent=record?`${record.status==='reviewed'?'Revisada pela orientadora':'Rascunho'} · ${record.updatedAt}`:'Rascunho novo. Pontuações aguardam critérios e evidências revisados.';
  }
  function save(reviewed=false){
    if(!key)return null;
    if($('evaluationStudent').value!==activeStudent||$('evaluationCycle').value.trim()!==activeCycle){alert('Clique em Carregar avaliação para trocar de estudante ou avaliação.');return null;}
    const r={version:1,studentId:activeStudent,cycle:activeCycle,cutoff:$('evaluationDeadline').value,criteria:controls.map(c=>({label:c.label.value,score:c.score.value,evidence:c.evidence.value})),confirmed:$('evaluationRubricConfirmed').checked,feedback:$('evaluationFeedback').value,finalDelivery:$('evaluationFinalDelivery').value,finalProcess:$('evaluationFinalProcess').value,status:reviewed?'reviewed':'draft',updatedAt:new Date().toISOString()};
    if(!window.validEvaluationRecord(r)){alert('Confira a data e as notas: use valores de 0 a 10.');return null;}
    if(reviewed && (!r.feedback.trim()||r.finalDelivery===''||r.finalProcess==='')){alert('Informe as duas notas e revise o feedback antes de confirmar.');return null;}
    if(reviewed&&!confirm('Confirmar estas notas e este feedback como revisados por você? Nada será enviado.'))return null;
    try{localStorage.setItem(key,JSON.stringify(r));record=r;dirty=false;$('evaluationStatus').textContent=reviewed?'Avaliação revisada e salva localmente. Nada foi enviado.':'Rascunho salvo localmente. Pendente do seu aval.';return r;}catch(e){$('evaluationStatus').textContent='Falha ao salvar: '+e.message;return null;}
  }
  $('avaliacao').addEventListener('input',e=>{if(['evaluationStudent','evaluationCycle'].includes(e.target.id))return;dirty=true;refresh();$('evaluationStatus').textContent='Alterações não salvas · rascunho pendente de revisão.';});
  $('evaluationLoad').onclick=load;$('evaluationSave').onclick=()=>save();$('evaluationApprove').onclick=()=>save(true);
  $('evaluationStudent').onchange=load;
  $('evaluationExport').onclick=()=>{const r=dirty?save():record;if(!r){alert('Salve o rascunho antes de exportar.');return;}const blob=new Blob([JSON.stringify({...r,suggestions:{delivery:suggestion(0),process:suggestion(3)},historySnapshot:snapshot},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`avaliacao-${activeStudent}-${activeCycle}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  load();
})();

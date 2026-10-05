export function dateOrder(value) {
  const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value));
  return match ? Date.UTC(+match[3],+match[2]-1,+match[1]) : 0;
}
export function studentDetail(data,id) {
  return {
    student:data.students.find(s=>s.id===id),
    meetings:data.meetings.filter(m=>m.studentId===id).sort((a,b)=>dateOrder(b.date)-dateOrder(a.date)||b.row-a.row),
    approvals:data.approvals.filter(a=>a.studentId===id)
  };
}
export function sourceLinks(text) {
  return [...new Set((String(text||'').match(/https:\/\/[^\s<>"']+/g)||[]).map(s=>s.replace(/[.,;)]$/,'')))].filter(s=>{
    try {const u=new URL(s);return !u.username&&!u.password&&['app.tactiq.io','docs.google.com','drive.google.com','github.com'].includes(u.hostname);}catch{return false;}
  });
}

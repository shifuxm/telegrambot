// ── NAVIGATION ───────────────────────────────────────────────
const TABS = {
  sched:  { label:'Jadval',   fa:'fa-solid fa-calendar-days' },
  att:    { label:'Davomat',  fa:'fa-solid fa-clipboard-check' },
  groups: { label:'Guruhlar', fa:'fa-solid fa-users' },
  rating: { label:'Reyting',  fa:'fa-solid fa-trophy' },
};

function tNav(tab) {
  Object.keys(TABS).forEach(t=>{
    const btn=document.getElementById('tab_'+t);
    if(btn){
      btn.className='btab'+(t===tab?' on':'');
      btn.innerHTML=`<div class="btab-icon"><i class="${TABS[t].fa}"></i></div><span>${TABS[t].label}</span>`;
    }
  });
  document.getElementById('pgTitle').textContent=TABS[tab].label;
  const el=document.getElementById('content'); el.innerHTML=ldHtml();
  ({sched:rSchedule,att:rAttendance,groups:rMyGroups,rating:rRating})[tab]?.(el);
}

// ── JADVAL ────────────────────────────────────────────────────
async function rSchedule(el) {
  const today=await G('/schedule/today');
  el.innerHTML=`
    <div class="st"><i class="fa-solid fa-calendar-day"></i> BUGUNGI DARSLAR</div>
    ${today.length===0
      ? `<div class="card card-body" style="text-align:center;color:var(--tx3);margin-bottom:14px"><i class="fa-solid fa-moon" style="font-size:32px;margin-bottom:8px;display:block"></i>Bugun dars yo'q</div>`
      : `<div class="card" style="margin-bottom:14px">${today.map(s=>`<div class="li" style="cursor:default">
          ${faCircle('fa-solid fa-chalkboard','var(--ps)','var(--p)')}
          <div style="flex:1;margin-left:12px">
            <div style="font-size:15px;font-weight:700">${s.group.name}</div>
            <div style="font-size:12px;color:var(--tx2)"><i class="fa-solid fa-book" style="font-size:10px"></i> ${s.group.subject.name} · <i class="fa-solid fa-users" style="font-size:10px"></i> ${s.group._count?.groupStudents||0}</div>
          </div>
          <div style="font-size:14px;font-weight:800;color:var(--p)"><i class="fa-solid fa-clock" style="font-size:11px"></i> ${s.startTime}–${s.endTime}</div>
        </div>`).join('')}</div>`}
    <button class="btn bs" onclick="showWeek()"><i class="fa-solid fa-calendar-week"></i> Haftalik jadval</button>`;

  window.showWeek=async()=>{
    el.innerHTML=ldHtml(); const week=await G('/schedule/week');
    el.innerHTML=`<button class="back-btn" onclick="rSchedule(document.getElementById('content'))"><i class="fa-solid fa-arrow-left"></i> Orqaga</button>
      ${week.map(day=>`<div style="margin-bottom:14px">
        <div class="st">${day.day} — ${new Date(day.date).toLocaleDateString('uz-UZ')}</div>
        ${day.schedules.length===0
          ? `<div style="font-size:13px;color:var(--tx3);font-style:italic">Dars yo'q</div>`
          : `<div class="card">${day.schedules.map(s=>`<div class="li" style="cursor:default">
              ${faCircle('fa-solid fa-chalkboard','var(--ps)','var(--p)',40)}
              <div style="flex:1;margin-left:12px"><div style="font-size:14px;font-weight:700">${s.group.name}</div><div style="font-size:12px;color:var(--tx2)">${s.group.subject.name}</div></div>
              <div style="font-size:13px;font-weight:800;color:var(--p)">${s.startTime}–${s.endTime}</div>
            </div>`).join('')}</div>`}
      </div>`).join('')}`;
  };
}

// ── DAVOMAT ───────────────────────────────────────────────────
async function rAttendance(el) {
  const groups=await G('/groups/my');
  if(!groups.length){el.innerHTML=emHtml("Guruhlaringiz yo'q");return;}
  el.innerHTML=`<div class="st"><i class="fa-solid fa-clipboard-check"></i> GURUH TANLANG</div>
    <div class="card">${groups.map(g=>`<div class="li" onclick="attG(${g.id})">
      ${faCircle('fa-solid fa-users','var(--oks)','var(--ok)')}
      <div style="flex:1;margin-left:12px">
        <div style="font-size:15px;font-weight:700">${g.name}</div>
        <div style="font-size:12px;color:var(--tx2)"><i class="fa-solid fa-book" style="font-size:10px"></i> ${g.subject?.name||''} · <i class="fa-solid fa-users" style="font-size:10px"></i> ${g._count?.groupStudents||0}</div>
      </div>
      <i class="fa-solid fa-chevron-right" style="color:var(--bdr)"></i>
    </div>`).join('')}</div>`;

  window.attG=async gid=>{
    const resp=await G(`/schedule/today/${gid}`).catch(()=>({hasLesson:false,schedule:null})); const {hasLesson,schedule}=resp;
    if(!hasLesson){
      el.innerHTML=`<button class="back-btn" onclick="rAttendance(document.getElementById('content'))"><i class="fa-solid fa-arrow-left"></i> Orqaga</button>
        <div class="empty"><div class="empty-ico"><i class="fa-solid fa-calendar-xmark" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">Bugun dars belgilanmagan</div></div>`;
      return;
    }
    const res=await G(`/attendance/sheet/${schedule.id}`);
    const allSts=res.allStudents||res.students;
    const alreadyTaken=res.alreadyTaken;
    let pIds=new Set(alreadyTaken?allSts.filter(s=>s.isPresent).map(s=>s.groupStudentId):allSts.map(s=>s.groupStudentId));

    function drawSheet(){
      const pct=allSts.length?Math.round(pIds.size/allSts.length*100):0;
      el.innerHTML=`<button class="back-btn" onclick="rAttendance(document.getElementById('content'))"><i class="fa-solid fa-arrow-left"></i> Orqaga</button>
        ${alreadyTaken?`<div class="att-warn"><i class="fa-solid fa-triangle-exclamation"></i> Davomat avval olingan — o'zgartirib saqlashingiz mumkin.</div>`:''}
        <div style="background:linear-gradient(135deg,var(--p),var(--pd));border-radius:20px;padding:16px 20px;margin-bottom:14px;color:#fff">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:11px;opacity:.8;font-weight:800"><i class="fa-solid fa-clipboard-check"></i> DAVOMAT</div>
              <div style="font-size:32px;font-weight:900" id="attCntVal">${pIds.size}/${allSts.length}</div>
              <div style="font-size:13px;opacity:.9">${pct}% keldi</div>
            </div>
            <i class="fa-solid fa-clipboard-list" style="font-size:44px;opacity:.8"></i>
          </div>
          <div style="height:8px;background:rgba(255,255,255,.25);border-radius:4px;overflow:hidden;margin-top:10px">
            <div id="attPctBar" style="height:100%;width:${pct}%;background:#fff;border-radius:4px;transition:width .4s ease"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn bs" style="flex:1;font-size:13px" id="attAllBtn"><i class="fa-solid fa-check-double"></i> Hammasi keldi</button>
          <button class="btn bs" style="flex:1;font-size:13px" id="attClrBtn"><i class="fa-solid fa-rotate-left"></i> Tozalash</button>
        </div>
        <div class="card" style="margin-bottom:12px">
          ${allSts.map(s=>`<div class="chk-row" id="attrow${s.groupStudentId}">
            ${avHtml(s.firstName,s.lastName,40)}
            <div style="flex:1;margin-left:12px"><div style="font-size:15px;font-weight:700">${s.firstName} ${s.lastName}</div></div>
            <div class="chk${pIds.has(s.groupStudentId)?' on':''}" id="att_${s.groupStudentId}">${pIds.has(s.groupStudentId)?'✓':''}</div>
          </div>`).join('')}
        </div>
        <button class="btn bp" id="attSaveBtn"><i class="fa-solid fa-floppy-disk"></i> Davomatni saqlash</button>`;

      function updUI(){const pct2=allSts.length?Math.round(pIds.size/allSts.length*100):0;const bar=document.getElementById('attPctBar');if(bar)bar.style.width=pct2+'%';const cnt=document.getElementById('attCntVal');if(cnt)cnt.textContent=pIds.size+'/'+allSts.length;}
      function updRow(gsid){const cb=document.getElementById('att_'+gsid);if(cb){cb.className='chk'+(pIds.has(gsid)?' on':'');cb.textContent=pIds.has(gsid)?'✓':'';}};

      allSts.forEach(s=>{
        document.getElementById('attrow'+s.groupStudentId)?.addEventListener('click',()=>{
          if(pIds.has(s.groupStudentId))pIds.delete(s.groupStudentId);else pIds.add(s.groupStudentId);
          updRow(s.groupStudentId);updUI();
        });
      });
      document.getElementById('attAllBtn')?.addEventListener('click',()=>{pIds=new Set(allSts.map(s=>s.groupStudentId));allSts.forEach(s=>updRow(s.groupStudentId));updUI();});
      document.getElementById('attClrBtn')?.addEventListener('click',()=>{pIds=new Set();allSts.forEach(s=>updRow(s.groupStudentId));updUI();});
      document.getElementById('attSaveBtn')?.addEventListener('click',async()=>{
        const btn=document.getElementById('attSaveBtn');
        if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saqlanmoqda...';}
        try{
          await P(`/attendance/save/${schedule.id}`,{presentIds:Array.from(pIds)});
          toast('Davomat muvaffaqiyatli saqlandi ✅','success');
          // Davomat bo'limiga qaytish
          setTimeout(()=>rAttendance(document.getElementById('content')),1200);
        }catch(e){
          toast(e.message,'error');
          if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Davomatni saqlash';}
        }
      });
    }
    drawSheet();
  };
}

// ── GURUHLARIM ─────────────────────────────────────────────────
async function rMyGroups(el) {
  const groups=await G('/groups/my');
  if(!groups.length){el.innerHTML=emHtml("Guruhlaringiz yo'q");return;}
  const now=new Date();
  let selMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const months=[-1,0,1].map(i=>{const d=new Date(now.getFullYear(),now.getMonth()+i,1);return{k:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,l:mLabel(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}; });

  window._drawGroups = null;
  function drawGroups(){
    window._drawGroups = drawGroups;
    el.innerHTML=`<div class="mp-wrap">${months.map(m=>`<button class="mpb${m.k===selMonth?' on':''}" onclick="mgSelM('${m.k}')">${m.l}</button>`).join('')}</div>
      ${groups.map(g=>`<div class="card card-body" style="margin-bottom:12px;cursor:pointer" onclick="mgG(${g.id})">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:17px;font-weight:800">${g.name}</div>
            <div style="font-size:13px;color:var(--tx2);margin-top:3px"><i class="fa-solid fa-book"></i> ${g.subject?.name||''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:28px;font-weight:900;color:var(--p)">${g._count?.groupStudents||0}</div>
            <div style="font-size:11px;color:var(--tx3)">o'quvchi</div>
          </div>
        </div>
      </div>`).join('')}`;
    window.mgSelM=m=>{selMonth=m;drawGroups();};
  }
  drawGroups();

  window.mgG=async id=>{
    el.innerHTML=ldHtml();
    const g=groups.find(x=>x.id===id);
    const[sts,ratingData]=await Promise.all([G(`/groups/${id}/students`),G(`/ratings/group/${id}?month=${selMonth}`).catch(()=>[])]);
    const rMap={}; (ratingData||[]).forEach(r=>{rMap[r.studentId]=r.rating?.score??null;});
    const maxScore = Math.max(...Object.values(rMap).filter(v=>v!==null),0)||1;

    el.innerHTML=`<button class="back-btn" onclick="window._drawGroups?window._drawGroups():rMyGroups(document.getElementById('content'))"><i class="fa-solid fa-arrow-left"></i> Orqaga</button>
      <div class="hero-card" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
        <div style="position:relative;z-index:1">
          <div style="font-size:11px;opacity:.8;font-weight:800">${g?.subject?.name?.toUpperCase()||''}</div>
          <div style="font-size:22px;font-weight:900;margin:4px 0">${g?.name}</div>
          <div style="font-size:13px;opacity:.9">${sts.length} o'quvchi · ${mLabel(selMonth)}</div>
        </div>
        <i class="fa-solid fa-book-open" style="font-size:44px;opacity:.9;position:relative;z-index:1"></i>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="st"><i class="fa-solid fa-graduation-cap"></i> O'QUVCHILAR</div>
        <button onclick="openRatingForm(${id})" style="background:var(--p);color:#fff;border:none;border-radius:12px;padding:8px 14px;font-size:12px;font-weight:800;cursor:pointer;font-family:'Nunito',sans-serif">
          <i class="fa-solid fa-star"></i> Ball
        </button>
      </div>
      <div class="card">
        ${sts.length===0?`<div style="padding:20px;text-align:center;color:var(--tx3)">O'quvchilar yo'q</div>`:
        sts.sort((a,b)=>(rMap[b.id]??-1)-(rMap[a.id]??-1)).map((s,i,arr)=>{
          const score = rMap[s.id];
          // Rang: guruh ichidagi nisbiy pozitsiya asosida
          let nameColor='var(--tx)', scoreColor='var(--tx3)';
          if(score!==null&&score!==undefined){
            const total=arr.length;
            const pos=arr.findIndex(x=>x.id===s.id);
            const pct=total>1?(total-1-pos)/(total-1):1;
            if(pct>=0.7){nameColor='var(--ok)';scoreColor='var(--ok)';}
            else if(pct>=0.4){nameColor='var(--w)';scoreColor='var(--w)';}
            else{nameColor='var(--r)';scoreColor='var(--r)';}
          }
          return `<div class="li" id="mgst${s.id}">
            <div style="font-size:20px;width:28px;text-align:center">${i===0?'🥇':i===1?'🥈':i===2?'🥉':`<span style="font-size:13px;font-weight:800;color:var(--tx3)">${i+1}</span>`}</div>
            ${avHtml(s.firstName,s.lastName,38)}
            <div style="flex:1;margin:0 10px">
              <div style="font-size:14px;font-weight:800;color:${nameColor}">${s.firstName} ${s.lastName}</div>
              <div style="font-size:12px;margin-top:2px;color:${scoreColor}">
                ${score!==null&&score!==undefined?`<i class="fa-solid fa-star"></i> ${score} ball`:"Ball berilmagan"}
              </div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color:var(--bdr)"></i>
          </div>`;
        }).join('')}
      </div>`;

    sts.forEach(s=>{ document.getElementById('mgst'+s.id)?.addEventListener('click',()=>mgOpenStudent(s,g)); });
  };

  window.mgOpenStudent=(s,g)=>{
    openModal(`${s.firstName} ${s.lastName}`,`
      ${phoneRow("O'zi",s.phoneSelf)}${phoneRow("Otasi",s.phoneFather)}${phoneRow("Onasi",s.phoneMother)}
      ${!s.phoneSelf&&!s.phoneFather&&!s.phoneMother?`<div style="padding:10px;color:var(--tx3)">Telefon yo'q</div>`:''}
      <div style="padding:12px 0;border-bottom:1.5px solid var(--bdr2)">
        <div style="font-size:12px;color:var(--tx3)"><i class="fa-solid fa-users"></i> GURUH</div>
        <div style="font-weight:700;margin-top:4px">${g?.name||''} — ${g?.subject?.name||''}</div>
      </div>
      <button class="btn bp" style="margin-top:12px" onclick="showStudentAtt(${s.id},${g?.id||0},'${s.firstName} ${s.lastName}')">
        <i class="fa-solid fa-calendar-check"></i> Davomatini ko'rish (kalendar)
      </button>`);
  };

  window.showStudentAtt=async(sid,gid,name)=>{
    const now2=new Date();
    const months2=[-2,-1,0].map(i=>{const d=new Date(now2.getFullYear(),now2.getMonth()+i,1);return{k:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),l:mLabel(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'))};});
    let sm2=months2[2].k;
    async function drawAtt(){
      const scheds=await G(`/schedule/group/${gid}?month=${sm2}`).catch(()=>[]);
      const atts=await G(`/attendance/student/${sid}?groupId=${gid}&month=${sm2}`).catch(()=>[]);
      const attMap={}; (atts||[]).forEach(a=>{attMap[a.scheduleId]=a.isPresent;});
      let present=0,absent=0;

      const[y,m2n]=sm2.split('-').map(Number);
      const dim=new Date(y,m2n,0).getDate();
      const fd=new Date(y,m2n-1,1).getDay(); const adj=fd===0?6:fd-1;
      const today=todayStr();
      const dayNames=['Du','Se','Ch','Pa','Ju','Sh','Ya'];

      const dayMap={};
      scheds.forEach(sch=>{const ds=sch.lessonDate?.slice(0,10)||'';if(!dayMap[ds])dayMap[ds]=[];dayMap[ds].push({sid:sch.id,st:sch.startTime,en:sch.endTime,present:attMap[sch.id]});});

      let cells='';
      for(let i=0;i<adj;i++) cells+='<div></div>';
      for(let d=1;d<=dim;d++){
        const ds=y+'-'+String(m2n).padStart(2,'0')+'-'+String(d).padStart(2,'0');
        const isToday=ds===today; const isFuture=ds>today;
        const lessons=dayMap[ds]||[];
        if(lessons.length&&!isFuture){lessons.forEach(l=>{if(l.present===true)present++;else if(l.present===false)absent++;});}
        let dotColor='transparent';let dot='';
        if(lessons.length>0){
          const allP=lessons.every(l=>l.present===true); const anyA=lessons.some(l=>l.present===false);
          dotColor=isFuture?'var(--ps)':allP?'var(--ok)':anyA?'var(--r)':'var(--tx3)';
          dot=`<div style="width:6px;height:6px;border-radius:50%;background:${dotColor};margin:1px auto 0"></div>`;
        }
        const bg=isToday?'var(--p)':lessons.length?'var(--ps)':'#fff';
        const txc=isToday?'#fff':lessons.length?'var(--p)':'var(--tx)';
        cells+=`<div style="aspect-ratio:1;border-radius:10px;border:1.5px solid ${isToday?'var(--p)':'var(--bdr)'};display:flex;flex-direction:column;align-items:center;justify-content:center;background:${bg}">
          <div style="font-size:12px;font-weight:700;color:${txc}">${d}</div>${dot}</div>`;
      }
      const total=present+absent;
      const pct=total>0?Math.round(present/total*100):0;

      openModal(`<i class="fa-solid fa-calendar-check"></i> ${name}`,`
        <div class="mp-wrap">${months2.map(m=>`<button class="mpb${m.k===sm2?' on':''}" onclick="sm2='${m.k}';drawAtt()">${m.l}</button>`).join('')}</div>
        <div style="background:${pct>=75?'var(--ok)':pct>=50?'var(--w)':'var(--r)'};border-radius:18px;padding:16px 20px;margin-bottom:14px;color:#fff">
          <div style="font-size:48px;font-weight:900;line-height:1">${pct}%</div>
          <div style="font-size:13px;opacity:.9;margin-top:4px">${present}/${total} dars · ${absent} kelmagan</div>
          <div style="height:8px;background:rgba(255,255,255,.25);border-radius:4px;overflow:hidden;margin-top:10px">
            <div style="height:100%;width:${pct}%;background:#fff;border-radius:4px"></div>
          </div>
        </div>
        <div class="card card-body" style="margin-bottom:14px">
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:6px">
            ${dayNames.map(d=>`<div style="text-align:center;font-size:10px;font-weight:800;color:var(--tx3)">${d}</div>`).join('')}
          </div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">${cells}</div>
        </div>
        <div style="display:flex;gap:12px;font-size:12px;color:var(--tx3);font-weight:600">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--ok);margin-right:4px"></span>Keldi</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--r);margin-right:4px"></span>Kelmadi</span>
        </div>`);
    }
    window.drawAtt=drawAtt; window.sm2=sm2;
    drawAtt();
  };

  window.openRatingForm=async gid=>{
    const sts=await G(`/groups/${gid}/students`).catch(()=>[]);
    const curR=await G(`/ratings/group/${gid}?month=${selMonth}`).catch(()=>[]);
    const rMap2={}; (curR||[]).forEach(r=>{rMap2[r.studentId]=r.rating?.score??0;});
    openModal(`<i class="fa-solid fa-star"></i> Ball qo'shish — ${mLabel(selMonth)}`,`
      <div style="background:var(--ps);border-radius:14px;padding:12px;margin-bottom:14px;font-size:13px;color:var(--tx2)">
        <i class="fa-solid fa-circle-info"></i> O'quvchini bosing va ball kiriting. Eski oyga ball qo'sib bo'lmaydi.
      </div>
      <div class="card">${sts.sort((a,b)=>(rMap2[b.id]??-1)-(rMap2[a.id]??-1)).map((s,i)=>`
        <div class="li" onclick="openAddScore(${s.id},'${s.firstName} ${s.lastName}',${rMap2[s.id]||0},${gid})">
          <div style="font-size:18px;width:28px;text-align:center">${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)}</div>
          ${avHtml(s.firstName,s.lastName,36)}
          <div style="flex:1;margin-left:10px">
            <div style="font-size:14px;font-weight:800">${s.firstName} ${s.lastName}</div>
            <div style="font-size:12px;color:var(--tx3)">Hozir: <b style="color:var(--p)">${rMap2[s.id]??0}</b></div>
          </div>
          <i class="fa-solid fa-chevron-right" style="color:var(--bdr)"></i>
        </div>`).join('')}</div>`);
  };

  window.openAddScore=(sid,name,cur,gid)=>{
    closeModal();
    openModal(`<i class="fa-solid fa-star"></i> ${name}`,`
      <div style="text-align:center;padding:8px 0 20px">
        <div style="font-size:13px;color:var(--tx3);font-weight:700;margin-bottom:8px">HOZIRGI BALL</div>
        <div style="font-size:52px;font-weight:900;color:var(--p)">${cur}</div>
      </div>
      <div class="ig"><label class="il">QO'SHILADIGAN BALL</label>
        <input id="addScoreInp" type="number" min="0" max="999" placeholder="masalan 10" class="score-inp"/>
      </div>
      <div class="ig"><label class="il">IZOH (ixtiyoriy)</label>
        <input id="addCommentInp" class="inp" placeholder="Faol ishtirok uchun..."/>
      </div>
      <button onclick="saveScore(${sid},${gid})" class="btn bp"><i class="fa-solid fa-check"></i> Ball qo'shish</button>`);
  };

  window.saveScore=async(sid,gid)=>{
    const add=parseInt(document.getElementById('addScoreInp').value);
    const comment=document.getElementById('addCommentInp').value.trim();
    if(isNaN(add)||add<0)return toast('Ball kiriting!','warn');
    try{
      await P(`/ratings/add/${sid}`,{groupId:gid,addScore:add,comment,monthYear:selMonth});
      closeModal(); toast(`+${add} ball qo'shildi 🌟`,'success'); mgG(gid);
    }catch(e){toast(e.message,'error');}
  };
}

// ── REYTING ───────────────────────────────────────────────────
async function rRating(el) {
  const groups=await G('/groups/my');
  if(!groups.length){el.innerHTML=emHtml("Guruhlaringiz yo'q");return;}
  const now=new Date();
  let selGroup=groups[0];
  let selMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const months=[-2,-1,0].map(i=>{const d=new Date(now.getFullYear(),now.getMonth()+i,1);return{k:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,l:mLabel(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}; });

  async function drawRating(){
    el.innerHTML=ldHtml();
    const students=await G(`/ratings/group/${selGroup.id}?month=${selMonth}`).catch(()=>[]);
    students.sort((a,b)=>(b.rating?.score??-1)-(a.rating?.score??-1));
    const avg=students.length?Math.round(students.reduce((s,x)=>s+(x.rating?.score??0),0)/students.length):0;
    const total=students.length;

    el.innerHTML=`
      ${groups.length>1?`<div class="mp-wrap">${groups.map(g=>`<button class="mpb${g.id===selGroup.id?' on':''}" onclick="rSelG(${g.id})">${g.name}</button>`).join('')}</div>`:''}
      <div class="mp-wrap">${months.map(m=>`<button class="mpb${m.k===selMonth?' on':''}" onclick="rSelM('${m.k}')">${m.l}</button>`).join('')}</div>
      <div style="background:linear-gradient(135deg,var(--pd),var(--p));border-radius:22px;padding:18px 20px;margin-bottom:14px;color:#fff">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:11px;opacity:.8;font-weight:800"><i class="fa-solid fa-trophy"></i> O'RTACHA BALL · ${mLabel(selMonth)}</div>
            <div style="font-size:40px;font-weight:900;line-height:1;margin:6px 0">${avg}</div>
            <div style="font-size:13px;opacity:.9">${selGroup.name} · ${total} o'quvchi</div>
          </div>
          <i class="fa-solid fa-ranking-star" style="font-size:48px;opacity:.8"></i>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="st"><i class="fa-solid fa-trophy"></i> REYTING</div>
        <button onclick="openRatingFormR(${selGroup.id})" style="background:var(--p);color:#fff;border:none;border-radius:12px;padding:8px 14px;font-size:12px;font-weight:800;cursor:pointer;font-family:'Nunito',sans-serif">
          <i class="fa-solid fa-star"></i> Ball qo'shish
        </button>
      </div>
      <div class="card">
        ${students.length===0
          ? `<div style="padding:24px;text-align:center;color:var(--tx3)"><i class="fa-solid fa-star" style="font-size:32px;margin-bottom:8px;display:block"></i>Hali ball berilmagan</div>`
          : students.map((s,i)=>{
              const score=s.rating?.score??null;
              // Rang: guruh ichidagi nisbiy pozitsiya asosida (absolyut ball emas)
              let nameColor='var(--tx)',scoreColor='var(--tx3)';
              if(score!==null){
                const pct=total>1?(total-1-i)/(total-1):1;
                if(pct>=0.7){nameColor='var(--ok)';scoreColor='var(--ok)';}
                else if(pct>=0.4){nameColor='var(--w)';scoreColor='var(--w)';}
                else{nameColor='var(--r)';scoreColor='var(--r)';}
              }
              return `<div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1.5px solid var(--bdr2)">
                <div style="font-size:20px;width:28px;text-align:center">${i===0?'🥇':i===1?'🥈':i===2?'🥉':`<span style="font-size:13px;font-weight:800;color:var(--tx3)">${i+1}</span>`}</div>
                ${avHtml(s.firstName,s.lastName,38)}
                <div style="flex:1;margin-left:10px">
                  <div style="font-size:14px;font-weight:800;color:${nameColor}">${s.firstName} ${s.lastName}</div>
                  ${s.rating?.comment?`<div style="font-size:11px;color:var(--tx3)">"${s.rating.comment}"</div>`:''}
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="font-size:22px;font-weight:900;color:${scoreColor}">${score!==null?score:'—'}</div>
                  <button class="r-btn" data-sid="${s.studentId}" data-name="${s.firstName} ${s.lastName}" data-cur="${score||0}" data-gid="${selGroup.id}" style="width:34px;height:34px;border-radius:10px;background:var(--p);color:#fff;border:none;font-size:16px;cursor:pointer">+</button>
                </div>
              </div>`;
            }).join('')}
      </div>`;

    window.rSelG=id=>{selGroup=groups.find(g=>g.id===id)||selGroup;drawRating();};
    window.rSelM=m=>{selMonth=m;drawRating();};
    el.querySelectorAll('.r-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{openAddScoreR(btn.dataset.sid,btn.dataset.name,btn.dataset.cur,btn.dataset.gid);});
    });
  }

  window.openRatingFormR=async gid=>{
    const sts=await G(`/groups/${gid}/students`).catch(()=>[]);
    const curR=await G(`/ratings/group/${gid}?month=${selMonth}`).catch(()=>[]);
    const rMap2={}; (curR||[]).forEach(r=>{rMap2[r.studentId]=r.rating?.score??0;});
    const total=sts.length;
    const sortedSts=sts.sort((a,b)=>(rMap2[b.id]??-1)-(rMap2[a.id]??-1));
    openModal(`<i class="fa-solid fa-star"></i> Ball qo'shish — ${mLabel(selMonth)}`,`
      <div class="card">${sortedSts.map((s,i)=>{
        const pct=total>1?(total-1-i)/(total-1):1;
        const col=pct>=0.7?'var(--ok)':pct>=0.4?'var(--w)':'var(--r)';
        return `<div class="li" onclick="openAddScoreR(${s.id},'${s.firstName} ${s.lastName}',${rMap2[s.id]||0},${gid})">
          <div style="font-size:18px;width:28px">${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)}</div>
          ${avHtml(s.firstName,s.lastName,36)}
          <div style="flex:1;margin-left:10px"><div style="font-size:14px;font-weight:800;color:${col}">${s.firstName} ${s.lastName}</div><div style="font-size:12px;color:${col}"><i class="fa-solid fa-star"></i> ${rMap2[s.id]??0}</div></div>
          <i class="fa-solid fa-chevron-right" style="color:var(--bdr)"></i>
        </div>`;}).join('')}</div>`);
  };

  window.openAddScoreR=(sid,name,cur,gid)=>{
    closeModal();
    openModal(`<i class="fa-solid fa-star"></i> ${name}`,`
      <div style="text-align:center;padding:8px 0 20px">
        <div style="font-size:13px;color:var(--tx3);font-weight:700;margin-bottom:8px">HOZIRGI BALL</div>
        <div style="font-size:52px;font-weight:900;color:var(--p)">${cur}</div>
      </div>
      <div class="ig"><label class="il">QO'SHILADIGAN BALL</label>
        <input id="rScoreInp" type="number" min="0" max="999" placeholder="masalan 10" class="score-inp"/>
      </div>
      <div class="ig"><label class="il">IZOH</label>
        <input id="rCommentInp" class="inp" placeholder="Ixtiyoriy..."/>
      </div>
      <button onclick="rSaveScore(${sid},${gid})" class="btn bp"><i class="fa-solid fa-check"></i> Ball qo'shish</button>`);
  };

  window.rSaveScore=async(sid,gid)=>{
    const add=parseInt(document.getElementById('rScoreInp').value);
    const comment=document.getElementById('rCommentInp').value.trim();
    if(isNaN(add)||add<0)return toast('Ball kiriting!','warn');
    try{await P(`/ratings/add/${sid}`,{groupId:gid,addScore:add,comment,monthYear:selMonth});closeModal();toast(`+${add} ball 🌟`,'success');await drawRating();}catch(e){toast(e.message,'error');}
  };

  drawRating();
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  try {
    await G('/auth/me');
    document.getElementById('loading').style.display='none';
    document.getElementById('app').style.display='block';
    tNav('sched');
  } catch(e) {
    document.getElementById('loading').innerHTML=`<div class="ld-ico"><i class="fa-solid fa-lock" style="color:var(--p)"></i></div><div style="font-size:18px;font-weight:800;color:var(--tx);margin-top:8px">O'qituvchi paneli</div><div style="font-size:14px;color:var(--tx2);margin-top:8px;text-align:center">Kirish uchun botda /start bosing</div>`;
  }
}
init();

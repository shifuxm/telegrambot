// ── STATE ─────────────────────────────────────────────────────
const urlSid = new URLSearchParams(location.search).get('studentId');
let profiles  = [];
let profIdx   = 0;
let activeTab = 'home';
let selMonth  = nowMonth();
let schedCache = {}; // sid → [{lessonDate, startTime, endTime, group, scheduleId}]
let attCache   = {}; // sid → { [scheduleId]: isPresent }

const DAYS_S = ['Du','Se','Ch','Pa','Ju','Sh','Ya'];
function curP() { return profiles[profIdx]||null; }

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  try {
    if (urlSid) {
      await loadProfile(parseInt(urlSid));
    } else {
      const tid = getTid();
      if (!tid) { showErr("Bot orqali kiring"); return; }
      const students = await G('/auth/student?telegramId='+tid);
      if (!students.length) { showErr("Profil topilmadi. Qabulxona bilan bog'laning."); return; }
      for (const s of students) await loadProfile(s.studentId);
    }
    document.getElementById('loading').style.display = 'none';
    render();
  } catch(e) {
    showErr(e.message || "Botdan /start bosib qayta urinib ko'ring");
  }
}

async function loadProfile(sid) {
  const [pData, rData, bData] = await Promise.all([
    G('/students/'+sid+'/profile'),
    G('/ratings/student/'+sid).catch(()=>[]),
    G('/student-balance/'+sid).catch(()=>null)
  ]);
  profiles.push({
    studentId:     sid,
    firstName:     pData.applicant?.firstName||'',
    lastName:      pData.applicant?.lastName||'',
    groupStudents: pData.groupStudents||[],
    payments:      pData.payments||[],
    ratings:       rData||[],
    attendanceStats: pData.attendanceStats||[],
    balance:       bData?.balance||'0',
    transactions:  bData?.transactions||[],
    monthlyStatus: bData?.monthlyStatus||[],
  });
  // Jadval + davomat yuklash
  const activeGs = (pData.groupStudents||[]).filter(gs=>gs.status==='active');
  if (activeGs.length) {
    const scheds = await Promise.all(activeGs.map(gs=>
      G('/schedule/group/'+gs.groupId+'?month=all').catch(()=>[])
    ));
    schedCache[sid] = scheds.flat().map(s=>({...s, lessonDate: s.lessonDate?.slice(0,10)||'', groupId: s.groupId}));

    // Davomat cache (joriy oy)
    const attResults = await Promise.all(activeGs.map(gs=>
      G(`/attendance/student/${sid}?groupId=${gs.groupId}&month=${nowMonth()}`).catch(()=>[])
    ));
    attCache[sid] = {};
    attResults.flat().forEach(a=>{ attCache[sid][a.scheduleId] = a.isPresent; });
  }
}

function showErr(msg) {
  document.getElementById('loading').innerHTML = `
    <div style="font-size:64px;margin-bottom:12px"><i class="fa-solid fa-lock" style="color:var(--p)"></i></div>
    <div style="font-size:18px;font-weight:800;color:var(--tx)">${msg}</div>`;
}

// ── RENDER ────────────────────────────────────────────────────
function render() {
  const p = curP(); if (!p) return;
  const app = document.getElementById('app');
  const activeGs = p.groupStudents.filter(g=>g.status==='active');
  const thisAtt  = (p.attendanceStats||[]).find(a=>a.month===nowMonth());
  const lastRating = (p.ratings||[]).sort((a,b)=>b.monthYear.localeCompare(a.monthYear))[0];
  // hasPaid - monthlyStatus dan (yangi balans tizimi)
  const curPlans = (p.monthlyStatus||[]).filter(ms=>ms.monthYear===nowMonth());
  const hasPaid  = curPlans.length>0 ? curPlans.every(ms=>ms.isPaid) : (p.payments||[]).some(pay=>pay.monthYear===nowMonth());
  const bal      = Number(p.balance);

  const switcher = profiles.length>1 ? `<div class="switcher">${profiles.map((pr,i)=>`
    <button class="sw-btn${i===profIdx?' on':''}" onclick="switchProf(${i})">
      <i class="fa-solid fa-user"></i> ${pr.firstName}
    </button>`).join('')}</div>` : '';

  app.innerHTML = `
    <div class="hero-student">
      ${switcher}
      <div style="display:flex;align-items:center;gap:16px;position:relative;z-index:1">
        <div class="student-avatar"><i class="fa-solid fa-graduation-cap" style="font-size:28px"></i></div>
        <div>
          <div style="font-size:22px;font-weight:900;color:#fff">Salom, ${p.firstName}! 👋</div>
          <div style="font-size:13px;color:rgba(255,255,255,.8);font-weight:600;margin-top:4px">
            ${activeGs.map(gs=>gs.group?.name).join(' · ')||"Guruh yo'q"}
          </div>
        </div>
      </div>
    </div>
    <div class="mini-stats-student">
      <div class="mst">
        <i class="fa-solid fa-trophy" style="font-size:24px;color:var(--gold);margin-bottom:4px;display:block"></i>
        <div class="mini-val" style="color:${lastRating?(lastRating.score>=70?'var(--ok)':lastRating.score>=40?'var(--w)':'var(--r)'):'var(--tx3)'}">
          ${lastRating?.score??'—'}
        </div>
        <div class="mini-lbl">Ball</div>
      </div>
      <div class="mst">
        <i class="fa-solid fa-clipboard-check" style="font-size:24px;color:var(--p);margin-bottom:4px;display:block"></i>
        <div class="mini-val" style="color:${thisAtt?(thisAtt.percent>=75?'var(--ok)':thisAtt.percent>=50?'var(--w)':'var(--r)'):'var(--tx3)'}">
          ${thisAtt?thisAtt.percent+'%':'—'}
        </div>
        <div class="mini-lbl">Davomat</div>
      </div>
      <div class="mst">
        <i class="fa-solid fa-credit-card" style="font-size:24px;color:var(--p);margin-bottom:4px;display:block"></i>
        <div class="mini-val" style="color:${hasPaid?'var(--ok)':'var(--r)'}">${hasPaid?'OK':'Qarz'}</div>
        <div class="mini-lbl">To'lov</div>
      </div>
    </div>
    <div id="tabContent" style="padding:0 16px 92px"></div>`;

  document.getElementById('botnav').style.display='flex';
  setTabBtns();
  renderTab();
}

window.switchProf = i => { profIdx=i; render(); };
window.setTab = t => { activeTab=t; setTabBtns(); renderTab(); };

function setTabBtns() {
  ['home','sched','rate','att','pay'].forEach(t=>{
    const btn = document.getElementById('tab_'+t);
    if (btn) btn.className='btab'+(t===activeTab?' on':'');
  });
}

function renderTab() {
  const tc = document.getElementById('tabContent');
  if (!tc||!curP()) return;
  switch (activeTab) {
    case 'home':  tc.innerHTML = renderHome(curP()); break;
    case 'sched': tc.innerHTML = renderSchedule(curP()); break;
    case 'rate':  tc.innerHTML = renderRating(curP()); break;
    case 'att':   renderAttendance(curP(), tc); break;
    case 'pay':
      tc.innerHTML = ldHtml();
      renderPayment(curP()).then(h=>{ tc.innerHTML=h||''; }).catch(e=>{ tc.innerHTML=emHtml(e.message); });
      break;
  }
}

// ── HOME ──────────────────────────────────────────────────────
function renderHome(p) {
  const activeGs = p.groupStudents.filter(g=>g.status==='active');
  const lastRating = p.ratings?.sort((a,b)=>b.monthYear.localeCompare(a.monthYear))[0];
  const bal = Number(p.balance);
  let html = '';

  // Balans
  const balGrad = bal>=200000?'#10B981,#059669':bal>0?'#F59E0B,#D97706':'#EF4444,#DC2626';
  html += `<div style="background:linear-gradient(135deg,${balGrad});border-radius:22px;padding:18px 20px;margin-bottom:14px;color:#fff">
    <div style="font-size:11px;opacity:.8;font-weight:800;text-transform:uppercase;margin-bottom:6px">
      <i class="fa-solid fa-wallet"></i> Balans
    </div>
    <div style="font-size:36px;font-weight:900">${fmt(bal)}</div>
    <div style="font-size:13px;opacity:.9;margin-top:4px">Joriy hisobingiz</div>
  </div>`;

  // Reyting
  if (lastRating) {
    const score = lastRating.score;
    const faIco = score>=90?'fa-trophy':score>=70?'fa-star':score>=50?'fa-chart-line':'fa-fire';
    const txtColor = score>=70?'var(--ok)':score>=40?'var(--w)':'var(--r)';
    html += `<div class="rating-hero" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="position:relative;z-index:1">
        <div style="font-size:11px;opacity:.8;font-weight:800">${lastRating.group?.name||''} · ${mLabel(lastRating.monthYear)}</div>
        <div style="font-size:52px;font-weight:900;line-height:1;margin:6px 0">${score}</div>
        <div style="font-size:13px;opacity:.9">${score>=90?'Ajoyib!':score>=70?'Yaxshi':score>=50?'Qoniqarli':'Harakating davom etsin'}</div>
      </div>
      <i class="fa-solid ${faIco}" style="font-size:52px;opacity:.9;position:relative;z-index:1"></i>
    </div>`;
  }

  // Guruhlar
  if (activeGs.length) {
    html += `<div class="st"><i class="fa-solid fa-users"></i> GURUHLAR</div>
    <div class="card" style="margin-bottom:14px">
      ${activeGs.map(gs=>`<div class="li" style="cursor:default">
        ${faCircle('fa-solid fa-chalkboard-user','var(--ps)','var(--p)')}
        <div style="flex:1;margin-left:12px">
          <div style="font-size:15px;font-weight:800">${gs.group?.name||''}</div>
          <div style="font-size:12px;color:var(--tx2);margin-top:3px">
            <i class="fa-solid fa-book" style="font-size:10px"></i> ${gs.group?.subject?.name||''}
            ${gs.group?.teacher?` · <i class="fa-solid fa-chalkboard-user" style="font-size:10px"></i> ${gs.group.teacher.firstName} ${gs.group.teacher.lastName}`:''}
          </div>
          ${gs.group?.teacher?.phone?`<a href="tel:${gs.group.teacher.phone}" style="font-size:12px;color:var(--p);font-weight:700;display:flex;align-items:center;gap:4px;margin-top:4px"><i class="fa-solid fa-phone" style="font-size:10px"></i>${gs.group.teacher.phone}</a>`:''}
        </div>
      </div>`).join('')}
    </div>`;
  }

  if (!html) html = `<div class="empty"><div class="empty-ico"><i class="fa-solid fa-inbox" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">Ma'lumot yo'q</div></div>`;
  return html;
}

// ── SCHEDULE (kalendar + davomat belgilari) ───────────────────
function renderSchedule(p) {
  const cache = schedCache[p.studentId]||[];
  if (!cache.length) return `<div class="empty"><div class="empty-ico"><i class="fa-solid fa-calendar-xmark" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">Dars jadvali belgilanmagan</div></div>`;

  const now   = new Date();
  const today = todayStr();
  const att   = attCache[p.studentId]||{};

  // 6 hafta ko'rsatamiz
  const weekStart = new Date(now);
  weekStart.setHours(0,0,0,0);
  const dow = weekStart.getDay(); weekStart.setDate(weekStart.getDate()-(dow===0?6:dow-1));

  let html = `<div class="st"><i class="fa-solid fa-calendar-days"></i> DARS JADVALI — HAFTALIK KO'RINISH</div>`;

  for (let i=0;i<7;i++) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate()+i);
    const ds = d.toISOString().slice(0,10);
    const isToday = ds===today;
    const dayLessons = cache.filter(s=>s.lessonDate?.slice(0,10)===ds);

    html += `<div class="week-card">
      <div class="day-badge${isToday?' today':dayLessons.length?' has-les':''}">
        <div class="dn">${DAYS_S[i]}</div>
        <div class="dd">${String(d.getDate()).padStart(2,'0')}</div>
      </div>
      <div style="flex:1">
        ${dayLessons.length===0
          ? `<div style="font-size:12px;color:var(--tx3);font-style:italic;margin-top:16px">Dars yo'q</div>`
          : dayLessons.map(s=>{
              const sid  = s.scheduleId||s.id;
              const isP  = att[sid];
              const attDot = ds<=today
                ? `<div style="width:10px;height:10px;border-radius:50%;background:${isP===true?'var(--ok)':isP===false?'var(--r)':'var(--tx3)'};flex-shrink:0"></div>`
                : '';
              return `<div class="card" style="padding:10px 14px;margin-bottom:6px">
                <div style="display:flex;align-items:center;justify-content:space-between">
                  <div style="font-size:14px;font-weight:800">${s.group?.name||s.groupId||''}</div>
                  <div style="display:flex;align-items:center;gap:6px">
                    ${attDot}
                    <span style="font-size:12px;font-weight:800;color:var(--p)"><i class="fa-solid fa-clock" style="font-size:10px"></i> ${s.startTime}–${s.endTime}</span>
                  </div>
                </div>
                <div style="font-size:12px;color:var(--tx2);margin-top:3px"><i class="fa-solid fa-book" style="font-size:10px"></i> ${s.group?.subject?.name||''}</div>
              </div>`;
            }).join('')}
      </div>
    </div>`;
  }

  // Davomat izoh
  html += `<div style="display:flex;gap:14px;padding:10px 0;font-size:12px;color:var(--tx3);font-weight:600">
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--ok);margin-right:5px"></span>Keldi</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--r);margin-right:5px"></span>Kelmadi</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--tx3);margin-right:5px"></span>Ma'lumot yo'q</span>
  </div>`;
  return html;
}

// ── RATING ────────────────────────────────────────────────────
function renderRating(p) {
  const ratings = p.ratings||[];
  const now = new Date();
  const months = [-2,-1,0].map(i=>{
    const d = new Date(now.getFullYear(),now.getMonth()+i,1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  });

  let html = `<div class="mpw">${months.map(m=>`<button class="mp${m===selMonth?' on':''}" onclick="selRMonth('${m}')">${mLabel(m)}</button>`).join('')}</div>`;
  window.selRMonth = m => { selMonth=m; renderTab(); };

  const monthRatings = ratings.filter(r=>r.monthYear===selMonth);
  if (!monthRatings.length) return html+`<div class="empty"><div class="empty-ico"><i class="fa-solid fa-trophy" style="font-size:52px;color:var(--gold)"></i></div><div class="empty-txt">${mLabel(selMonth)} uchun reyting yo'q</div></div>`;

  monthRatings.forEach(r=>{
    const score = r.score;
    const color = score>=70?'var(--ok)':score>=40?'var(--w)':'var(--r)';
    const faIco = score>=90?'fa-trophy':score>=70?'fa-star':score>=50?'fa-chart-line':'fa-fire';
    html += `<div class="rating-hero" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1">
        <div>
          <div style="font-size:11px;opacity:.8;font-weight:800"><i class="fa-solid fa-users"></i> ${r.group?.name||''} · <i class="fa-solid fa-book"></i> ${r.group?.subject?.name||''}</div>
          <div style="font-size:56px;font-weight:900;line-height:1;margin:6px 0">${score}</div>
          <div style="font-size:13px;opacity:.9">${score>=90?'Ajoyib! 🎉':score>=70?'Yaxshi ⭐':score>=50?'Qoniqarli 📈':'Harakating davom etsin 💪'}</div>
        </div>
        <i class="fa-solid ${faIco}" style="font-size:52px;opacity:.9;position:relative;z-index:1"></i>
      </div>
      <div style="background:rgba(255,255,255,.2);border-radius:8px;height:10px;overflow:hidden;margin-top:14px;position:relative;z-index:1">
        <div style="width:${Math.min(score,100)}%;height:100%;background:#fff;border-radius:8px;transition:width .8s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.7);font-weight:700;margin-top:5px;position:relative;z-index:1">
        <span>0</span><span>50</span><span>100+</span>
      </div>
      ${r.comment?`<div style="margin-top:12px;padding:10px 14px;background:rgba(255,255,255,.15);border-radius:12px;font-size:13px;font-style:italic;position:relative;z-index:1"><i class="fa-solid fa-quote-left"></i> ${r.comment}</div>`:''}
    </div>`;
  });
  return html;
}

// ── ATTENDANCE — kalendar ko'rinishida ────────────────────────
async function renderAttendance(p, tc) {
  tc.innerHTML = ldHtml();
  const stats = p.attendanceStats||[];
  const now   = new Date();
  const months= [-2,-1,0].map(i=>{
    const d=new Date(now.getFullYear(),now.getMonth()+i,1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  });

  const activeGs = p.groupStudents.filter(g=>g.status==='active');
  let selGid = activeGs[0]?.groupId||null;

  async function drawAtt() {
    const att = stats.find(s=>s.month===selMonth);
    const pct = att?.percent??0;
    const barColor = pct>=75?'var(--ok)':pct>=50?'var(--w)':'var(--r)';

    // Jadval darslarini olish
    const scheds = selGid
      ? await G(`/schedule/group/${selGid}?month=${selMonth}`).catch(()=>[])
      : [];
    const attList = selGid
      ? await G(`/attendance/student/${p.studentId}?groupId=${selGid}&month=${selMonth}`).catch(()=>[])
      : [];
    const attMap = {}; (attList||[]).forEach(a=>{attMap[a.scheduleId]=a.isPresent;});

    // Kalendar qurish
    const [y,m2] = selMonth.split('-').map(Number);
    const dim = new Date(y,m2,0).getDate();
    const fd  = new Date(y,m2-1,1).getDay(); const adj=fd===0?6:fd-1;
    const dayNames=['Du','Se','Ch','Pa','Ju','Sh','Ya'];
    const today = todayStr();

    // Har kunda dars va davomat
    const dayMap = {};
    scheds.forEach(sch=>{
      const ds = sch.lessonDate?.slice(0,10)||'';
      if (!dayMap[ds]) dayMap[ds] = [];
      dayMap[ds].push({ sid: sch.id, st: sch.startTime, en: sch.endTime, present: attMap[sch.id] });
    });

    let cells='';
    for(let i=0;i<adj;i++) cells+='<div></div>';
    for(let d=1;d<=dim;d++){
      const ds=y+'-'+String(m2).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      const isToday=ds===today; const isFuture=ds>today;
      const lessons=dayMap[ds]||[];
      let dotColor='transparent'; let dot='';
      if(lessons.length>0){
        const allPresent=lessons.every(l=>l.present===true);
        const anyAbsent=lessons.some(l=>l.present===false);
        dotColor = isFuture?'var(--ps)':allPresent?'var(--ok)':anyAbsent?'var(--r)':'var(--tx3)';
        dot=`<div style="width:6px;height:6px;border-radius:50%;background:${dotColor};margin:1px auto 0"></div>`;
      }
      const bg=isToday?'var(--p)':lessons.length?'var(--ps)':'#fff';
      const txc=isToday?'#fff':lessons.length?'var(--p)':'var(--tx)';
      cells+=`<div style="aspect-ratio:1;border-radius:10px;border:1.5px solid ${isToday?'var(--p)':'var(--bdr)'};display:flex;flex-direction:column;align-items:center;justify-content:center;background:${bg};cursor:${lessons.length?'pointer':'default'}" ${lessons.length&&!isFuture?`onclick="showDayAtt('${ds}',${JSON.stringify(lessons).replace(/"/g,"'")})"`:''}>
        <div style="font-size:13px;font-weight:700;color:${txc}">${d}</div>
        ${dot}
      </div>`;
    }

    tc.innerHTML = `
      <div class="mpw">${months.map(m=>`<button class="mp${m===selMonth?' on':''}" onclick="selAttMonth('${m}')">${mLabel(m)}</button>`).join('')}</div>
      ${activeGs.length>1?`<div class="mp-wrap" style="margin-bottom:12px">${activeGs.map(gs=>`<button class="mpb${gs.groupId===selGid?' on':''}" onclick="selAttGid(${gs.groupId})">${gs.group?.name||''}</button>`).join('')}</div>`:''}
      <div style="background:${barColor};border-radius:22px;padding:18px 20px;margin-bottom:14px;color:#fff">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:11px;opacity:.8;font-weight:800"><i class="fa-solid fa-calendar-check"></i> ${mLabel(selMonth).toUpperCase()}</div>
            <div style="font-size:48px;font-weight:900;line-height:1;margin:6px 0">${pct}%</div>
            <div style="font-size:13px;opacity:.9">${att?.present??0}/${att?.total??0} dars · ${att?.absent??0} kelmagan</div>
          </div>
          <i class="fa-solid fa-clipboard-check" style="font-size:48px;opacity:.8"></i>
        </div>
        <div style="background:rgba(255,255,255,.25);height:10px;border-radius:5px;overflow:hidden;margin-top:12px">
          <div style="width:${pct}%;height:100%;background:#fff;border-radius:5px;transition:width .8s ease"></div>
        </div>
      </div>
      <div class="card card-body" style="margin-bottom:14px">
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:8px">
          ${dayNames.map(d=>`<div style="text-align:center;font-size:10px;font-weight:800;color:var(--tx3)">${d}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${cells}</div>
      </div>
      <div style="display:flex;gap:14px;font-size:12px;color:var(--tx3);font-weight:600;margin-bottom:14px">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--ok);margin-right:4px"></span>Keldi</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--r);margin-right:4px"></span>Kelmadi</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--ps);margin-right:4px"></span>Dars</span>
      </div>`;

    window.selAttMonth = month => { selMonth=month; drawAtt(); };
    window.selAttGid   = gid   => { selGid=gid; drawAtt(); };
    window.showDayAtt  = (ds, lessons) => {
      const dateArr = ds.split('-');
      const dateLabel = `${dateArr[2]}.${dateArr[1]}.${dateArr[0]}`;
      openModal(`<i class="fa-solid fa-calendar-day"></i> ${dateLabel}`, `
        <div class="card">
          ${lessons.map(l=>`<div class="li" style="cursor:default">
            ${faCircle(l.present===true?'fa-solid fa-circle-check':l.present===false?'fa-solid fa-circle-xmark':'fa-solid fa-circle-question',
              l.present===true?'var(--oks)':l.present===false?'var(--rs)':'var(--bg)',
              l.present===true?'var(--ok)':l.present===false?'var(--r)':'var(--tx3)')}
            <div style="flex:1;margin-left:12px">
              <div style="font-size:14px;font-weight:800">${l.st}–${l.en}</div>
              <div style="font-size:13px;color:${l.present===true?'var(--ok)':l.present===false?'var(--r)':'var(--tx3)'}">
                ${l.present===true?'✅ Keldi':l.present===false?'❌ Kelmadi':"Ma'lumot yo'q"}
              </div>
            </div>
          </div>`).join('')}
        </div>`);
    };
  }

  window.selAttMonth = month => { selMonth=month; drawAtt(); };
  drawAtt();
}

// ── PAYMENT ───────────────────────────────────────────────────
async function renderPayment(p) {
  // Avval cache dan foydalan, yo'q bo'lsa qayta yukla
  let balData2 = null;
  if (p.monthlyStatus?.length || p.transactions?.length) {
    balData2 = { balance: p.balance, monthlyStatus: p.monthlyStatus||[], transactions: p.transactions||[] };
  } else {
    balData2 = await G('/student-balance/'+p.studentId).catch(()=>null);
  }
  const monthlyStatus = balData2?.monthlyStatus||[];
  const txs  = balData2?.transactions||p.transactions||[];
  const pays = p.payments||[];

  // Joriy oy to'lov holati — MonthlyPaymentPlan dan
  const curMonthPlans = monthlyStatus.filter(ms=>ms.monthYear===nowMonth());
  const hasPaid = curMonthPlans.length>0 && curMonthPlans.every(ms=>ms.isPaid);
  const hasAnyPlan = curMonthPlans.length>0;
  const bal = Number(balData2?.balance||p.balance||0);

  let html = '';

  // Joriy oy holati
  if (hasAnyPlan) {
    html += hasPaid
      ? `<div style="background:linear-gradient(135deg,#10B981,#059669);border-radius:22px;padding:18px 20px;margin-bottom:14px;color:#fff;display:flex;align-items:center;gap:16px">
          <i class="fa-solid fa-circle-check" style="font-size:48px;opacity:.9"></i>
          <div>
            <div style="font-size:11px;opacity:.8;font-weight:800">JORIY OY · ${mLabel(nowMonth())}</div>
            <div style="font-size:20px;font-weight:900;margin-top:4px">To'lov amalga oshirildi ✅</div>
          </div>
        </div>`
      : `<div style="background:linear-gradient(135deg,#F59E0B,#D97706);border-radius:22px;padding:18px 20px;margin-bottom:14px;color:#fff;display:flex;align-items:center;gap:16px">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:48px;opacity:.9"></i>
          <div>
            <div style="font-size:11px;opacity:.8;font-weight:800">JORIY OY · ${mLabel(nowMonth())}</div>
            <div style="font-size:20px;font-weight:900;margin-top:4px">To'lov kutilmoqda ⚠️</div>
          </div>
        </div>`;
  }

  // Balans
  const balGrad = bal>=200000?'var(--ok)':bal>0?'var(--w)':'var(--r)';
  html += `<div class="card card-body" style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:13px;color:var(--tx2);font-weight:700"><i class="fa-solid fa-wallet"></i> Balans</div>
      <div style="font-size:24px;font-weight:900;color:${balGrad}">${fmt(bal)}</div>
    </div>
  </div>`;

  // Oylik rejalar (so'nggi 3 oy)
  if (monthlyStatus.length) {
    html += `<div class="st"><i class="fa-solid fa-calendar-check"></i> OYLIK TO'LOV REJASI</div>
    <div class="card" style="margin-bottom:14px">
      ${monthlyStatus.map(ms=>`<div class="li" style="cursor:default">
        ${faCircle(ms.isPaid?'fa-solid fa-circle-check':'fa-solid fa-circle-xmark',
          ms.isPaid?'var(--oks)':'var(--rs)',
          ms.isPaid?'var(--ok)':'var(--r)', 40)}
        <div style="flex:1;margin-left:12px">
          <div style="font-size:14px;font-weight:800">${ms.groupName}</div>
          <div style="font-size:12px;color:var(--tx3)">${mLabel(ms.monthYear)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:15px;font-weight:900;color:${ms.isPaid?'var(--ok)':'var(--r)'}">
            ${ms.amount?fmt(ms.amount):"Belgilanmagan"}
          </div>
          <div style="font-size:11px;color:var(--tx3)">${ms.isPaid?"To'landi":"Kutilmoqda"}</div>
        </div>
      </div>`).join('')}
    </div>`;
  }

  // Tranzaksiyalar
  if (txs.length) {
    html += `<div class="st"><i class="fa-solid fa-clock-rotate-left"></i> OXIRGI TRANZAKSIYALAR</div>
    <div class="card" style="margin-bottom:14px">
      ${txs.slice(0,8).map(t=>`<div class="li" style="cursor:default">
        ${faCircle(t.type==='deposit'?'fa-solid fa-arrow-down':t.type==='refund'?'fa-solid fa-rotate-left':'fa-solid fa-arrow-up',
          t.type!=='deduct'?'var(--oks)':'var(--rs)',
          t.type!=='deduct'?'var(--ok)':'var(--r)', 36)}
        <div style="flex:1;margin-left:10px">
          <div style="font-size:13px;font-weight:700">${t.description}</div>
          <div style="font-size:11px;color:var(--tx3)">${new Date(t.createdAt).toLocaleDateString('uz-UZ')}</div>
        </div>
        <div style="font-size:14px;font-weight:900;color:${t.type!=='deduct'?'var(--ok)':'var(--r)'}">
          ${t.type!=='deduct'?'+':'-'}${fmt(t.amount)}
        </div>
      </div>`).join('')}
    </div>`;
  }

  if (!html) {
    html = `<div class="empty"><div class="empty-ico"><i class="fa-solid fa-credit-card" style="font-size:48px;color:var(--tx3)"></i></div><div class="empty-txt">To'lov ma'lumotlari yo'q</div></div>`;
  }
  return html;
}


init();

// ── NAVIGATION ───────────────────────────────────────────────
const ADMIN_NAV = [
  { id:'stats',    label:'Statistika',      ico:'fa-solid fa-chart-bar' },
  { id:'students', label:"O'quvchilar",     ico:'fa-solid fa-graduation-cap' },
  { id:'staff',    label:'Hodimlar',        ico:'fa-solid fa-user-tie' },
  { id:'schedule', label:'Jadval',          ico:'fa-solid fa-calendar-days' },
  { id:'debtors',  label:'Qarzdorlar',      ico:'fa-solid fa-triangle-exclamation' },
  { id:'att',      label:'Davomat',         ico:'fa-solid fa-clipboard-check' },
  { id:'deleted',  label:"O'chirilganlar",  ico:'fa-solid fa-trash-can' },
  { id:'settings', label:'Sozlamalar',      ico:'fa-solid fa-gear' },
  { id:'delstaff', label:"Hodim o'chirish", ico:'fa-solid fa-user-minus' },
];
const TITLES = {
  stats:'Statistika', students:"O'quvchilar", staff:'Hodimlar', schedule:'Jadval',
  debtors:'Qarzdorlar', att:'Davomat hisoboti', deleted:"O'chirilganlar",
  settings:'Sozlamalar', delstaff:"Hodim o'chirish"
};
let curPage = 'stats';

function setupSidebar(user) {
  const name = `${user.firstName||''} ${user.lastName||''}`.trim() || 'Admin';
  document.getElementById('sbName').textContent = name;
  const av = document.getElementById('sbAvatar');
  if (av) av.innerHTML = `<i class="fa-solid fa-shield-halved" style="font-size:26px"></i>`;
  document.getElementById('sbNav').innerHTML = ADMIN_NAV.map(n => `
    <div class="nl${n.id===curPage?' active':''}" id="nl_${n.id}" onclick="nav('${n.id}')">
      <div class="nic"><i class="${n.ico}"></i></div>
      <span>${n.label}</span>
    </div>`).join('');
}

function nav(page) {
  curPage = page;
  document.getElementById('pgTitle').textContent = TITLES[page] || page;
  document.querySelectorAll('.nl').forEach(el => el.classList.toggle('active', el.id===`nl_${page}`));
  sbClose();
  const el = document.getElementById('content'); el.innerHTML = ldHtml();
  ({stats:rStats,students:rStudents,staff:rStaff,schedule:rSchedule,
    debtors:rDebtors,att:rAttendance,deleted:rDeleted,
    settings:rSettings,delstaff:rDelStaff})[page]?.(el);
}
function sbOpen()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sbOv').classList.add('open'); }
function sbClose() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sbOv').classList.remove('open'); }

// ── STATISTIKA ────────────────────────────────────────────────
async function rStats(el) {
  const months = sixMonths(); let sel = nowMonth();
  async function load() {
    el.innerHTML = ldHtml();
    try {
      const d = await G(`/statistics?monthYear=${sel}`);
      if (d.noData) {
        el.innerHTML = `<div class="mp-wrap">${months.map(m=>`<button class="mpb${m===sel?' on':''}" onclick="statSel('${m}')">${mLabel(m)}</button>`).join('')}</div>`
          + `<div class="empty"><div class="empty-ico"><i class="fa-solid fa-chart-bar" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">Ma'lumot yo'q</div></div>`;
        return;
      }

      // Guruhlar statistikasi
      const groups = await G('/groups').catch(()=>[]);

      el.innerHTML = `
        <div class="mp-wrap">${months.map(m=>`<button class="mpb${m===sel?' on':''}" onclick="statSel('${m}')">${mLabel(m)}</button>`).join('')}</div>

        <div class="hero-card" style="margin-bottom:14px">
          <div style="position:relative;z-index:1">
            <div style="font-size:11px;opacity:.8;font-weight:800"><i class="fa-solid fa-wallet"></i> JAMI BALANSGA KIRIM · ${mLabel(sel)}</div>
            <div style="font-size:36px;font-weight:900;margin:6px 0">${fmt(d.deposits)}</div>
            <div style="font-size:13px;opacity:.9"><i class="fa-solid fa-arrow-up"></i> Balansga to'ldirilgan</div>
          </div>
        </div>

        <div class="stat-2" style="margin-bottom:14px">
          <div class="sc">
            <div class="sc-ico"><i class="fa-solid fa-graduation-cap" style="color:var(--p)"></i></div>
            <div class="sc-val" style="color:var(--p)">${d.totalStudents}</div>
            <div class="sc-lbl">Faol o'quvchi</div>
          </div>
          <div class="sc">
            <div class="sc-ico"><i class="fa-solid fa-users" style="color:var(--ok)"></i></div>
            <div class="sc-val" style="color:var(--ok)">${d.groupsCount}</div>
            <div class="sc-lbl">Faol guruh</div>
          </div>
          <div class="sc">
            <div class="sc-ico"><i class="fa-solid fa-circle-check" style="color:var(--ok)"></i></div>
            <div class="sc-val" style="color:var(--ok)">${d.paidStudents}</div>
            <div class="sc-lbl">To'langan (plan)</div>
          </div>
          <div class="sc">
            <div class="sc-ico"><i class="fa-solid fa-triangle-exclamation" style="color:var(--r)"></i></div>
            <div class="sc-val" style="color:var(--r)">${d.debtors||0}</div>
            <div class="sc-lbl">Qarzdor</div>
          </div>
        </div>

        <div class="card card-body" style="margin-bottom:14px">
          <div class="st"><i class="fa-solid fa-arrow-right-arrow-left"></i> KASSA HARAKATI · ${mLabel(sel)}</div>
          <div style="display:flex;gap:10px;margin-bottom:12px">
            <div style="flex:1;background:var(--oks);border-radius:14px;padding:14px;text-align:center">
              <div style="font-size:11px;font-weight:800;color:var(--ok)"><i class="fa-solid fa-arrow-down"></i> KIRIM (DEPOSIT)</div>
              <div style="font-size:20px;font-weight:900;color:var(--ok);margin-top:6px">${fmt(d.deposits)}</div>
            </div>
            <div style="flex:1;background:var(--rs);border-radius:14px;padding:14px;text-align:center">
              <div style="font-size:11px;font-weight:800;color:var(--r)"><i class="fa-solid fa-arrow-up"></i> CHIQIM (OYLIK)</div>
              <div style="font-size:20px;font-weight:900;color:var(--r);margin-top:6px">${fmt(d.deducts)}</div>
            </div>
          </div>
          <div style="display:flex;gap:10px">
            <div style="flex:1;text-align:center">
              <div style="font-size:11px;color:var(--tx3);font-weight:700"><i class="fa-solid fa-money-bill"></i> NAQD</div>
              <div style="font-size:16px;font-weight:800;color:var(--p);margin-top:4px">${fmt(d.balance?.cash||0)}</div>
            </div>
            <div style="flex:1;text-align:center">
              <div style="font-size:11px;color:var(--tx3);font-weight:700"><i class="fa-solid fa-credit-card"></i> KARTA</div>
              <div style="font-size:16px;font-weight:800;color:var(--p);margin-top:4px">${fmt(d.balance?.card||0)}</div>
            </div>
            <div style="flex:1;text-align:center">
              <div style="font-size:11px;color:var(--tx3);font-weight:700"><i class="fa-solid fa-wallet"></i> JAMI</div>
              <div style="font-size:18px;font-weight:900;color:var(--p);margin-top:4px">${fmt(d.balance?.total||0)}</div>
            </div>
          </div>
        </div>

        <div class="card card-body" style="margin-bottom:14px">
          <div class="st"><i class="fa-solid fa-money-bill-transfer"></i> XARAJATLAR · ${mLabel(sel)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:11px;color:var(--tx3)"><i class="fa-solid fa-money-bill"></i> Naqd</div>
              <div style="font-size:16px;font-weight:800;color:var(--r);margin-top:4px">${fmt(d.expense?.cash||0)}</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--tx3)"><i class="fa-solid fa-credit-card"></i> Karta</div>
              <div style="font-size:16px;font-weight:800;color:var(--r);margin-top:4px">${fmt(d.expense?.card||0)}</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--tx3)"><i class="fa-solid fa-sigma"></i> Jami</div>
              <div style="font-size:18px;font-weight:900;color:var(--r);margin-top:4px">${fmt(d.expense?.total||0)}</div>
            </div>
          </div>
        </div>

        ${d.prevMonth ? `<div class="card card-body" style="margin-bottom:14px">
          <div class="st"><i class="fa-solid fa-calendar-minus"></i> O'TGAN OY · ${mLabel(d.prevMonth.month)}</div>
          <div style="display:flex;gap:16px">
            <div style="flex:1"><div style="font-size:11px;color:var(--tx3)">Kirim</div><div style="font-weight:800;color:var(--ok);margin-top:4px">${fmt(d.prevMonth.income)}</div></div>
            <div style="flex:1"><div style="font-size:11px;color:var(--tx3)">Chiqim</div><div style="font-weight:800;color:var(--r);margin-top:4px">${fmt(d.prevMonth.expense)}</div></div>
          </div>
        </div>` : ''}

        <div class="st"><i class="fa-solid fa-users"></i> GURUHLAR BO'YICHA</div>
        <div class="card">
          ${groups.map(g=>`<div class="li" style="cursor:default">
            ${faCircle('fa-solid fa-chalkboard','var(--ps)','var(--p)',40)}
            <div style="flex:1;margin-left:12px">
              <div style="font-size:14px;font-weight:700">${g.name}</div>
              <div style="font-size:12px;color:var(--tx2)">${g.subject?.name||''} · ${g.teacher?.firstName||''} ${g.teacher?.lastName||''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:20px;font-weight:900;color:var(--p)">${g._count?.groupStudents||0}</div>
              <div style="font-size:11px;color:var(--tx3)">o'quvchi</div>
            </div>
          </div>`).join('')||`<div style="padding:14px;text-align:center;color:var(--tx3)">Guruhlar yo'q</div>`}
        </div>`;
    } catch(e) { el.innerHTML = `<div class="empty"><div class="empty-ico"><i class="fa-solid fa-circle-exclamation" style="font-size:52px;color:var(--r)"></i></div><div class="empty-txt">Xatolik: ${e.message}</div></div>`; }
  }
  window.statSel = m => { sel=m; load(); };
  load();
}

// ── O'QUVCHILAR ───────────────────────────────────────────────
async function rStudents(el) {
  let srch = '';
  el.innerHTML = `
    <div class="sbox"><i class="fa-solid fa-magnifying-glass"></i><input class="inp" placeholder="Ism yoki familya..." oninput="stSrch(this.value)"/></div>
    <div id="stList"></div>`;
  window.stSrch = v => { srch=v; loadSt(); };

  async function loadSt() {
    const data = await G(`/students${srch?`?search=${encodeURIComponent(srch)}`:''}`);
    const list = document.getElementById('stList');
    if (!data.length) { list.innerHTML = `<div class="empty"><div class="empty-ico"><i class="fa-solid fa-graduation-cap" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">O'quvchilar yo'q</div></div>`; return; }
    list.innerHTML = `<div class="card">${data.map(s=>`
      <div class="li" onclick="openStudent(${s.id})">
        ${avHtml(s.applicant.firstName, s.applicant.lastName)}
        <div style="flex:1;margin-left:12px">
          <div style="font-size:15px;font-weight:700">${s.applicant.firstName} ${s.applicant.lastName}</div>
          <div style="font-size:12px;color:var(--tx3);margin-top:2px">
            ${s.groupStudents.filter(g=>g.status==='active').map(gs=>gs.group?.subject?.name).join(', ')||'Guruhsiz'}
            ${s.debtStatus?`<span style="color:var(--r);font-weight:700"> · Qarz</span>`:''}
          </div>
        </div>
        <i class="fa-solid fa-chevron-right" style="color:var(--bdr)"></i>
      </div>`).join('')}</div>`;
  }

  window.openStudent = async id => {
    const s = await G(`/students/${id}/profile`);
    const bal = await G(`/student-balance/${id}`).catch(()=>null);
    const a = s.applicant;
    const activeGs = s.groupStudents.filter(g=>g.status==='active');

    openModal(`${a.firstName} ${a.lastName}`, `
      <div style="background:linear-gradient(135deg,var(--p),var(--pd));border-radius:16px;padding:16px;margin-bottom:16px;color:#fff;display:flex;align-items:center;gap:14px">
        ${avHtml(a.firstName,a.lastName,48)}
        <div>
          <div style="font-size:16px;font-weight:800">${a.firstName} ${a.lastName}</div>
          <div style="font-size:13px;opacity:.8;margin-top:4px">
            <i class="fa-solid fa-wallet"></i> ${fmt(bal?.balance||0)}
            ${s.debtStatus?`<span style="background:rgba(255,0,0,.3);padding:2px 8px;border-radius:8px;margin-left:8px;font-size:11px;font-weight:800">QARZ</span>`:''}
          </div>
        </div>
      </div>

      ${phoneRow("O'zi", a.phoneSelf)}${phoneRow("Otasi", a.phoneFather)}${phoneRow("Onasi", a.phoneMother)}

      <div style="margin-top:14px">
        <div class="st"><i class="fa-solid fa-users"></i> GURUHLAR</div>
        ${s.groupStudents.map(gs=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1.5px solid var(--bdr2)">
          <div>
            <div style="font-size:14px;font-weight:700">${gs.group?.name||''}</div>
            <div style="font-size:12px;color:var(--tx3)">${gs.group?.subject?.name||''}</div>
          </div>
          <span class="badge ${gs.status==='active'?'bok':'bbad'}">${gs.status==='active'?'Faol':'Arxiv'}</span>
        </div>`).join('')}
      </div>

      <div style="margin-top:14px">
        <div class="st"><i class="fa-solid fa-clipboard-check"></i> DAVOMAT</div>
        ${(s.attendanceStats||[]).filter(a=>a.total>0).map(a=>`
          <div style="padding:8px 0;border-bottom:1.5px solid var(--bdr2)">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px">
              <span style="font-size:13px;font-weight:600">${a.monthLabel}</span>
              <span style="font-size:13px;font-weight:800;color:${a.percent>=75?'var(--ok)':a.percent>=50?'var(--w)':'var(--r)'}">${a.percent}% (${a.present}/${a.total})</span>
            </div>
            <div class="prog-wrap"><div class="prog-fill" style="width:${a.percent}%;background:${a.percent>=75?'var(--ok)':a.percent>=50?'var(--w)':'var(--r)'}"></div></div>
          </div>`).join('')||`<div style="color:var(--tx3);padding:8px;font-size:13px">Davomat ma'lumoti yo'q</div>`}
      </div>

      <div style="margin-top:14px">
        <div class="st"><i class="fa-solid fa-calendar-check"></i> OYLIK REJALAR</div>
        ${(bal?.monthlyStatus||[]).map(ms=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1.5px solid var(--bdr2)">
          <div>
            <div style="font-size:13px;font-weight:700">${ms.groupName} · ${mLabel(ms.monthYear)}</div>
            <div style="font-size:12px;color:var(--tx3)">${ms.amount?fmt(ms.amount):"Belgilanmagan"}</div>
          </div>
          <span class="badge ${ms.isPaid?'bok':ms.hasPlan?'bbad':'bblue'}">${ms.isPaid?'<i class="fa-solid fa-check"></i> To\'landi':ms.hasPlan?'<i class="fa-solid fa-clock"></i> Qarz':"Yo'q"}</span>
        </div>`).join('')||`<div style="color:var(--tx3);padding:8px;font-size:13px">Oy rejalari yo'q</div>`}
      </div>

      <div style="margin-top:16px">
        <div class="st"><i class="fa-solid fa-wallet"></i> BALANS BOSHQARUVI</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <button class="btn bp bsm" onclick="adminDeposit(${id},'${a.firstName} ${a.lastName}')">
            <i class="fa-solid fa-plus"></i> Kirim
          </button>
          <button class="btn bd bsm" onclick="adminPayMonth(${id},'${a.firstName} ${a.lastName}',${JSON.stringify(activeGs).replace(/"/g,'&quot;')})">
            <i class="fa-solid fa-minus"></i> Oylik to'lov
          </button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          ${activeGs.map(gs=>`<button onclick="showAttJadval(${id},${gs.groupId},'${gs.group?.name||''}','${gs.group?.subject?.name||''}')" class="btn bs bsm" style="flex:1;font-size:11px">
            <i class="fa-solid fa-calendar-check"></i> ${gs.group?.name}
          </button>`).join('')}
        </div>
      </div>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
        <button class="btn bd" onclick="softDelStudent(${id},'${a.firstName} ${a.lastName}')">
          <i class="fa-solid fa-trash"></i> O'chirib yuborish
        </button>
      </div>`);

    window.adminDeposit = (sid, name) => {
      openModal(`<i class="fa-solid fa-plus"></i> Balansga kirim — ${name}`, `
        <div class="ig"><label class="il"><i class="fa-solid fa-sack-dollar"></i> SUMMA (so'm)</label><input id="dep_amt" class="inp" type="number" placeholder="500000"/></div>
        <div class="ig"><label class="il"><i class="fa-solid fa-coins"></i> TURI</label><select id="dep_type" class="inp"><option value="cash">💵 Naqd</option><option value="card">💳 Karta</option></select></div>
        <div class="ig"><label class="il">IZOH</label><input id="dep_note" class="inp" placeholder="Ixtiyoriy..."/></div>
        <button class="btn bp" onclick="saveAdminDeposit(${sid})"><i class="fa-solid fa-check"></i> Saqlash</button>`);
      window.saveAdminDeposit = async sid2 => {
        const amt=document.getElementById('dep_amt').value, pt=document.getElementById('dep_type').value, note=document.getElementById('dep_note').value;
        if(!amt||Number(amt)<=0) return toast('Summa kiriting','warn');
        try { await P(`/student-balance/${sid2}/deposit`,{amount:parseInt(amt),paymentType:pt,note}); closeModal(); toast(`${fmt(amt)} kirim qilindi ✅`,'success'); openStudent(id); }
        catch(e) { toast(e.message,'error'); }
      };
    };

    window.adminPayMonth = (sid, name, activeGs2) => {
      if(typeof activeGs2==='string') activeGs2=JSON.parse(activeGs2);
      const months2=sixMonths();
      openModal(`<i class="fa-solid fa-calendar-check"></i> Oylik to'lov — ${name}`, `
        <div class="ig"><label class="il"><i class="fa-solid fa-users"></i> GURUH</label><select id="pm_g" class="inp">
          <option value="">Guruh tanlang</option>
          ${activeGs2.map(gs=>`<option value="${gs.groupId}">${gs.group?.name} — ${gs.group?.subject?.name} (${fmt(gs.defaultFee||0)})</option>`).join('')}
        </select></div>
        <div class="ig"><label class="il"><i class="fa-solid fa-calendar"></i> OY</label><select id="pm_m" class="inp">${months2.map(m=>`<option value="${m}" ${m===nowMonth()?'selected':''}>${mLabel(m)}</option>`).join('')}</select></div>
        <div class="ig"><label class="il"><i class="fa-solid fa-sack-dollar"></i> SUMMA (so'm)</label><input id="pm_a" class="inp" type="number" placeholder="500000" oninput="pmAmtHint()"/></div>
        <div id="pm_hint" style="font-size:12px;color:var(--tx3);margin:-10px 0 12px"></div>
        <button class="btn bp" onclick="saveAdminPayMonth(${sid})"><i class="fa-solid fa-check"></i> Balansdan ayirish</button>`);
      window.pmAmtHint = () => {
        const gid=document.getElementById('pm_g').value;
        const gs2=activeGs2.find(g=>g.groupId===parseInt(gid));
        if(gs2&&gs2.defaultFee) document.getElementById('pm_hint').textContent=`Standart narx: ${fmt(gs2.defaultFee)}`;
      };
      document.getElementById('pm_g')?.addEventListener('change', window.pmAmtHint);
      window.saveAdminPayMonth = async sid2 => {
        const gid=document.getElementById('pm_g').value, my=document.getElementById('pm_m').value, amt=document.getElementById('pm_a').value;
        if(!gid) return toast('Guruh tanlang','warn');
        if(!amt||Number(amt)<=0) return toast('Summa kiriting','warn');
        try { await P(`/student-balance/${sid2}/pay-month`,{groupId:parseInt(gid),monthYear:my,amount:parseInt(amt)}); closeModal(); toast('Oylik to\'lov belgilandi va ayirildi ✅','success'); openStudent(id); }
        catch(e) { toast(e.message,'error'); }
      };
    };

    window.softDelStudent = (sid2, name2) => {
      openModal("<i class='fa-solid fa-trash'></i> O'chirishni tasdiqlang", `
        <div style="font-size:14px;color:var(--tx2);margin-bottom:16px"><b>${name2}</b> ni o'chirishni tasdiqlaysizmi?<br>Statistikada sana bilan ko'rinib qoladi.</div>
        <div class="ig"><label class="il">Sabab</label><input id="del_reason" class="inp" placeholder="Ixtiyoriy sabab..."/></div>
        <button class="btn bd" onclick="doSoftDel(${sid2})"><i class="fa-solid fa-check"></i> Tasdiqlash</button>
        <button class="btn bs" style="margin-top:8px" onclick="closeModal()">Bekor</button>`);
      window.doSoftDel = async sid3 => {
        const reason = document.getElementById('del_reason')?.value||'';
        try { await D(`/students/${sid3}?action=softdelete&reason=${encodeURIComponent(reason)}`); closeModal(); toast("O'chirildi",'success'); loadSt(); }
        catch(e) { toast(e.message,'error'); }
      };
    };
  };

  window.showAttJadval = async (studentId, groupId, groupName, subjectName) => {
    const now2=new Date(); let html='';
    for (let i=2;i>=0;i--) {
      const d=new Date(now2.getFullYear(),now2.getMonth()-i,1);
      const monthStr=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      try {
        const scheds=await G('/schedule/group/'+groupId+'?month='+monthStr);
        if(!scheds.length){html+=`<div style="margin-bottom:12px"><div class="st">${mLabel(monthStr)}</div><div style="font-size:13px;color:var(--tx3)">Dars yo'q</div></div>`;continue;}
        const atts=await G('/attendance/student/'+studentId+'?groupId='+groupId+'&month='+monthStr);
        const attMap={}; (atts||[]).forEach(a=>{attMap[a.scheduleId]=a.isPresent;});
        let present=0,absent=0;
        const rows=scheds.map(sch=>{
          const dt=new Date(sch.lessonDate);
          const ds=String(dt.getDate()).padStart(2,'0')+'.'+String(dt.getMonth()+1).padStart(2,'0');
          const att=attMap[sch.id];
          if(att===true)present++;else if(att===false)absent++;
          return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1.5px solid var(--bdr2)">
            <span style="font-size:13px;color:var(--tx2)">${ds} ${sch.startTime}</span>
            <span style="font-size:15px;font-weight:700;color:${att===true?'var(--ok)':att===false?'var(--r)':'var(--tx3)'}">${att===true?'✓':att===false?'✗':'—'}</span>
          </div>`;
        }).join('');
        const total=present+absent, pct=total>0?Math.round(present/total*100):0;
        html+=`<div style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <div class="st" style="margin:0">${mLabel(monthStr)}</div>
            <span style="font-size:13px;font-weight:800;color:${pct>=75?'var(--ok)':pct>=50?'var(--w)':'var(--r)'}">${pct}% (${present}/${total})</span>
          </div>
          <div class="prog-wrap" style="margin-bottom:8px"><div class="prog-fill" style="width:${pct}%;background:${pct>=75?'var(--ok)':pct>=50?'var(--w)':'var(--r)'}"></div></div>
          ${rows}
        </div>`;
      } catch(e) {}
    }
    openModal(`<i class="fa-solid fa-calendar-check"></i> ${groupName}`, `<div style="font-size:13px;color:var(--tx2);margin-bottom:14px">${subjectName}</div>${html}`);
  };
  loadSt();
}

// ── HODIMLAR ──────────────────────────────────────────────────
async function rStaff(el) {
  async function load() {
    const [staff,subs] = await Promise.all([G('/staff'),G('/subjects')]);
    const subsJson = JSON.stringify(subs).replace(/"/g,'&quot;');
    el.innerHTML = `<button class="btn bp" style="margin-bottom:14px" onclick='openSF(null,${subsJson})'><i class="fa-solid fa-plus"></i> Hodim qo'shish</button>
      ${!staff.length?`<div class="empty"><div class="empty-ico"><i class="fa-solid fa-user-tie" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">Hodimlar yo'q</div></div>`:
      `<div class="card">${staff.map(s=>`<div class="li" onclick='openSF(${JSON.stringify(s).replace(/"/g,'&quot;')},${subsJson})'>
        ${avHtml(s.firstName,s.lastName)}
        <div style="flex:1;margin-left:12px">
          <div style="font-size:15px;font-weight:700">${s.firstName} ${s.lastName}</div>
          <div style="font-size:12px;color:var(--tx3)">${s.role==='teacher'?"O'qituvchi":'Qabulxona'}${s.subject?' · '+s.subject:''}${s.phone?' · '+s.phone:''}</div>
        </div>
        <span class="badge ${s.role==='teacher'?'bblue':'bok'}"><i class="fa-solid fa-${s.role==='teacher'?'chalkboard-user':'headset'}"></i></span>
      </div>`).join('')}</div>`}`;
  }
  window.openSF = (data,subs) => {
    if(typeof subs==='string')subs=JSON.parse(subs); if(data&&typeof data==='string')data=JSON.parse(data);
    const isEdit=!!data;
    openModal(isEdit?'Hodimni tahrirlash':"<i class='fa-solid fa-plus'></i> Hodim qo'shish",`
      ${!isEdit?`<div class="ig"><label class="il"><i class="fa-brands fa-telegram"></i> TELEGRAM ID</label><input id="sf_tid" class="inp" placeholder="123456789"/></div>`:''}
      <div class="ig"><label class="il">ROL</label><select id="sf_role" class="inp" onchange="sfRC()">
        <option value="teacher" ${data?.role==='teacher'?'selected':''}>O'qituvchi</option>
        <option value="receptionist" ${data?.role==='receptionist'?'selected':''}>Qabulxona</option>
      </select></div>
      <div class="ig"><label class="il">ISMI</label><input id="sf_fn" class="inp" value="${data?.firstName||''}"/></div>
      <div class="ig"><label class="il">FAMILYASI</label><input id="sf_ln" class="inp" value="${data?.lastName||''}"/></div>
      <div class="ig"><label class="il">TELEFON</label><input id="sf_ph" class="inp" value="${data?.phone||''}"/></div>
      <div id="sf_sd" class="ig"><label class="il">FAN</label><select id="sf_sub" class="inp">${subs.map(s=>`<option value="${s.name}" ${data?.subject===s.name?'selected':''}>${s.name}</option>`).join('')}</select></div>
      <button class="btn bp" onclick="saveSF(${isEdit?data.id:'null'})"><i class="fa-solid fa-check"></i> Saqlash</button>`);
    sfRC();
  };
  window.sfRC=()=>{const d=document.getElementById('sf_sd');const r=document.getElementById('sf_role')?.value;if(d)d.style.display=r==='teacher'?'block':'none';};
  window.saveSF=async id=>{
    const body={role:document.getElementById('sf_role').value,firstName:document.getElementById('sf_fn').value,lastName:document.getElementById('sf_ln').value,phone:document.getElementById('sf_ph').value,subject:document.getElementById('sf_sub')?.value||''};
    if(!id) body.telegramId=document.getElementById('sf_tid').value;
    try{if(id)await U(`/staff/${id}`,body);else await P('/staff',body);closeModal();toast('Saqlandi ✅','success');load();}catch(e){toast(e.message,'error');}
  };
  load();
}

// ── JADVAL ────────────────────────────────────────────────────
async function rSchedule(el) {
  async function loadMain() {
    el.innerHTML = ldHtml();
    const today = await G('/schedule/today');
    el.innerHTML = `
      <div class="st"><i class="fa-solid fa-calendar-day"></i> BUGUNGI DARSLAR</div>
      ${!today.length
        ? `<div class="card card-body" style="text-align:center;color:var(--tx3);margin-bottom:14px"><i class="fa-solid fa-moon" style="font-size:32px;margin-bottom:8px;display:block"></i>Bugun dars yo'q</div>`
        : `<div class="card" style="margin-bottom:14px">${today.map(s=>`<div class="li" style="cursor:default">
            ${faCircle('fa-solid fa-chalkboard','var(--ps)','var(--p)',40)}
            <div style="flex:1;margin-left:12px">
              <div style="font-size:15px;font-weight:700">${s.group.name}</div>
              <div style="font-size:12px;color:var(--tx2)"><i class="fa-solid fa-book" style="font-size:10px"></i> ${s.group.subject.name} · ${s.group._count?.groupStudents||0} o'quvchi</div>
            </div>
            <div style="font-size:13px;font-weight:800;color:var(--p)"><i class="fa-solid fa-clock" style="font-size:11px"></i> ${s.startTime}–${s.endTime}</div>
          </div>`).join('')}</div>`}
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <button class="btn bs" style="flex:1" onclick="showWeek()"><i class="fa-solid fa-calendar-week"></i> Haftalik</button>
        <button class="btn bp" style="flex:1" onclick="showAddSch()"><i class="fa-solid fa-plus"></i> Jadval qo'shish</button>
      </div>`;

    window.showWeek = async () => {
      el.innerHTML = ldHtml();
      const week = await G('/schedule/week');
      el.innerHTML = `<button class="back-btn" onclick="loadMain()"><i class="fa-solid fa-arrow-left"></i> Orqaga</button>
        <div class="st"><i class="fa-solid fa-calendar-week"></i> HAFTALIK JADVAL</div>
        ${week.map(day=>`<div style="margin-bottom:14px">
          <div style="font-size:13px;font-weight:800;color:${day.schedules.length?'var(--p)':'var(--tx3)'};margin-bottom:8px">${day.day} — ${new Date(day.date).toLocaleDateString('uz-UZ')}</div>
          ${!day.schedules.length
            ? `<div style="font-size:13px;color:var(--tx3);font-style:italic">Dars yo'q</div>`
            : `<div class="card">${day.schedules.map(s=>`<div class="li" style="cursor:default">
                ${faCircle('fa-solid fa-chalkboard','var(--ps)','var(--p)',40)}
                <div style="flex:1;margin-left:12px"><div style="font-size:14px;font-weight:700">${s.group.name}</div><div style="font-size:12px;color:var(--tx2)">${s.group.subject.name}</div></div>
                <div style="font-size:13px;font-weight:800;color:var(--p)">${s.startTime}–${s.endTime}</div>
              </div>`).join('')}</div>`}
        </div>`).join('')}`;
    };

    window.showAddSch = async () => {
      const subs = await G('/subjects');
      el.innerHTML = `<button class="back-btn" onclick="loadMain()"><i class="fa-solid fa-arrow-left"></i> Orqaga</button>
        <div class="ig"><label class="il"><i class="fa-solid fa-book"></i> FAN</label><select id="schSub" class="inp" onchange="schLoadG()"><option value="">Fan tanlang</option>${subs.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
        <div id="schGSec" style="display:none" class="ig"><label class="il"><i class="fa-solid fa-users"></i> GURUH</label><select id="schG" class="inp" onchange="schLoadCal()"><option value="">Guruh tanlang</option></select></div>
        <div id="schCalSec"></div>`;
      window.schLoadG = async () => {
        const sid=document.getElementById('schSub').value; if(!sid)return;
        const gs=await G(`/groups?subjectId=${sid}`);
        document.getElementById('schG').innerHTML=`<option value="">Guruh tanlang</option>`+gs.map(g=>`<option value="${g.id}">${g.name} — ${g.teacher?.firstName||''} ${g.teacher?.lastName||''}</option>`).join('');
        document.getElementById('schGSec').style.display='block';
        document.getElementById('schCalSec').innerHTML='';
      };
      window.schLoadCal = () => { const gid=document.getElementById('schG').value; if(!gid)return; buildCal(gid,'schCalSec'); };
    };
  }

  // Kalendar builder — 2 SLOT
  window.buildCal = async (gid, containerId) => {
    const days=['Du','Se','Ch','Pa','Ju','Sh','Ya'];
    const mns=['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr'];
    const now=new Date(); let calY=now.getFullYear(), calM=now.getMonth();
    let selDates=[];
    const todayS=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    try {
      const ex=await G('/schedule/group/'+gid+'?month='+calY+'-'+String(calM+1).padStart(2,'0'));
      selDates=ex.map(s=>s.lessonDate?.slice(0,10)||'');
    } catch(e){}
    window.calSlots=[{st:'09:00',en:'11:00'}];

    function draw(){
      const calEl=document.getElementById(containerId); if(!calEl)return;
      const dim=new Date(calY,calM+1,0).getDate();
      const fd=new Date(calY,calM,1).getDay(); const adj=fd===0?6:fd-1;
      let cells='';
      for(let i=0;i<adj;i++) cells+='<div></div>';
      for(let d=1;d<=dim;d++){
        const ds=calY+'-'+String(calM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
        const isPast=ds<todayS, isSel=selDates.includes(ds), isTd=ds===todayS;
        cells+=`<div class="cald${isSel?' sel':''}${isTd&&!isSel?' td':''}${isPast?' past':''}" id="cd_${ds}">${d}</div>`;
      }
      calEl.innerHTML=`
        <div class="card" style="padding:16px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <button onclick="calPrev()" style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--bdr);background:#fff;cursor:pointer"><i class="fa-solid fa-chevron-left"></i></button>
            <div style="text-align:center">
              <div style="font-weight:800">${mns[calM]} ${calY}</div>
              <div id="calCnt" style="font-size:12px;color:var(--p);font-weight:600;margin-top:2px">${selDates.length} kun</div>
            </div>
            <button onclick="calNext()" style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--bdr);background:#fff;cursor:pointer"><i class="fa-solid fa-chevron-right"></i></button>
          </div>
          <div class="cal-grid" style="margin-bottom:6px">${days.map(d=>`<div class="cal-hd">${d}</div>`).join('')}</div>
          <div class="cal-grid">${cells}</div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px">
          <button class="btn bs" style="flex:1;font-size:13px" onclick="calWday()"><i class="fa-solid fa-calendar-week"></i> Du–Ju</button>
          <button class="btn bd bsm" style="flex:1" onclick="calClr()"><i class="fa-solid fa-rotate-left"></i> Tozalash</button>
        </div>
        <div style="margin-bottom:14px">
          <div style="font-size:12px;font-weight:800;color:var(--tx3);text-transform:uppercase;margin-bottom:10px">
            <i class="fa-solid fa-clock"></i> VAQT SLOTLARI (max 3)
          </div>
          <div id="calSlotsWrap"></div>
          <button onclick="calAddSlot()" class="btn bs" style="font-size:13px"><i class="fa-solid fa-plus"></i> Slot qo'shish</button>
        </div>
        <button class="btn bp" onclick="calSave('${gid}')"><i class="fa-solid fa-floppy-disk"></i> Jadvalni saqlash</button>`;

      function renderSlots(){
        const w=document.getElementById('calSlotsWrap'); if(!w)return;
        w.innerHTML=window.calSlots.map((sl,idx)=>`
          <div class="slot-card" style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div style="width:24px;height:24px;border-radius:8px;background:var(--ps);color:var(--p);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">${idx+1}</div>
            <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div><label style="font-size:10px;font-weight:800;color:var(--tx3)">BOSHLANISH</label>
                <input type="time" class="inp" style="padding:10px" value="${sl.st}" oninput="calSlots[${idx}].st=this.value"/></div>
              <div><label style="font-size:10px;font-weight:800;color:var(--tx3)">TUGASH</label>
                <input type="time" class="inp" style="padding:10px" value="${sl.en}" oninput="calSlots[${idx}].en=this.value"/></div>
            </div>
            ${window.calSlots.length>1?`<button class="slot-del" onclick="calRemSlot(${idx})"><i class="fa-solid fa-xmark"></i></button>`:''}
          </div>`).join('');
      }
      window.calAddSlot=()=>{if(window.calSlots.length>=3)return toast('Maksimal 3 slot','warn');window.calSlots.push({st:'14:00',en:'16:00'});renderSlots();};
      window.calRemSlot=idx=>{window.calSlots.splice(idx,1);renderSlots();};
      renderSlots();

      for(let d=1;d<=dim;d++){
        const ds=calY+'-'+String(calM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
        const cel=document.getElementById(`cd_${ds}`);
        if(cel&&!cel.classList.contains('past')){
          cel.addEventListener('click',()=>{
            const i=selDates.indexOf(ds);
            if(i>-1){selDates.splice(i,1);cel.classList.remove('sel');}
            else{selDates.push(ds);cel.classList.add('sel');}
            const cnt=document.getElementById('calCnt'); if(cnt)cnt.textContent=selDates.length+' kun';
          });
        }
      }
    }

    window.calPrev=()=>{calM--;if(calM<0){calM=11;calY--;}draw();};
    window.calNext=()=>{calM++;if(calM>11){calM=0;calY++;}draw();};
    window.calWday=()=>{const dim=new Date(calY,calM+1,0).getDate();for(let d=1;d<=dim;d++){const ds=calY+'-'+String(calM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');const dow=new Date(ds).getDay();if(dow>=1&&dow<=5&&ds>=todayS&&!selDates.includes(ds))selDates.push(ds);}draw();};
    window.calClr=()=>{const prefix=calY+'-'+String(calM+1).padStart(2,'0');selDates=selDates.filter(ds=>!ds.startsWith(prefix));draw();};
    window.calSave=async gid2=>{
      if(!selDates.length)return toast('Kamida 1 kun tanlang','warn');
      const slots=(window.calSlots||[{st:'09:00',en:'11:00'}]).map(sl=>({dates:selDates,startTime:sl.st,endTime:sl.en}));
      try{await P('/schedule/group/'+gid2,{slots});toast(`Jadval saqlandi ✅ (${selDates.length} kun, ${slots.length} slot)`,'success');setTimeout(()=>loadMain(),800);}catch(e){toast(e.message,'error');}
    };
    draw();
  };
  loadMain();
}

// ── QARZDORLAR ────────────────────────────────────────────────
async function rDebtors(el) {
  const months=sixMonths(); let sm=nowMonth(); let ma='';
  async function load() {
    el.innerHTML=`<div class="mp-wrap">${months.map(m=>`<button class="mpb${m===sm?' on':''}" onclick="debtSel('${m}')">${mLabel(m)}</button>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input class="inp" style="flex:1" placeholder="Maks. summa (bo'sh=hammasi)..." oninput="debtMa(this.value)"/>
        <button class="btn bp bsm" onclick="loadDebt()"><i class="fa-solid fa-magnifying-glass"></i></button>
      </div><div id="dbt"></div>`;
    window.debtSel=m=>{sm=m;load();}; window.debtMa=v=>{ma=v;};
    window.loadDebt=loadDebt; loadDebt();
  }
  async function loadDebt() {
    const dbt=document.getElementById('dbt'); if(!dbt)return;
    dbt.innerHTML=ldHtml();
    const data=await G(`/debtors?monthYear=${sm}${ma?`&maxAmount=${ma}`:''}`);
    if(!data.length){dbt.innerHTML=`<div class="empty"><div class="empty-ico"><i class="fa-solid fa-circle-check" style="font-size:52px;color:var(--ok)"></i></div><div class="empty-txt">Qarzdorlar yo'q!</div></div>`;return;}
    const total=data.reduce((s,g)=>s+g.students.length,0);
    dbt.innerHTML=`<div class="hero-card" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
      <div style="position:relative;z-index:1">
        <div style="font-size:11px;opacity:.8;font-weight:800"><i class="fa-solid fa-triangle-exclamation"></i> QARZDORLAR · ${mLabel(sm)}</div>
        <div style="font-size:40px;font-weight:900">${total}</div>
        <div style="font-size:13px;opacity:.9">${data.length} ta guruhda</div>
      </div>
      <i class="fa-solid fa-triangle-exclamation" style="font-size:52px;opacity:.8;position:relative;z-index:1"></i>
    </div>
    ${data.map(g=>`<div class="st"><i class="fa-solid fa-book"></i> ${g.subjectName} — ${g.groupName}</div>
      <div class="card" style="margin-bottom:8px">
        ${g.students.map(s=>`<div class="li" style="cursor:default">
          ${avHtml(s.firstName,s.lastName,38)}
          <div style="flex:1;margin-left:10px">
            <div style="font-size:14px;font-weight:700">${s.firstName} ${s.lastName}</div>
            <div style="font-size:12px;color:var(--tx3)"><i class="fa-solid fa-phone" style="font-size:10px"></i> ${s.phoneSelf||s.phoneFather||'—'}</div>
          </div>
          <div style="text-align:right">
            <span class="badge ${s.noPay?'bbad':'bwarn'}">${s.noPay?"To'lamagan":'Qisman'}</span>
            ${s.remainingAmount?`<div style="font-size:11px;color:var(--r);font-weight:700;margin-top:3px">-${fmt(s.remainingAmount)}</div>`:''}
          </div>
        </div>`).join('')}
      </div>
      <button onclick="notifyDebt(${g.groupId})" class="btn bs" style="margin-bottom:14px;font-size:13px"><i class="fa-solid fa-paper-plane"></i> Xabar yuborish</button>`).join('')}`;
    window.notifyDebt=async gid=>{try{const r=await P('/debtors/notify',{groupId:gid,monthYear:sm});toast(`${r.sent} ta xabar yuborildi`,'success');}catch(e){toast(e.message,'error');}};
  }
  load();
}

// ── DAVOMAT HISOBOTI ──────────────────────────────────────────
async function rAttendance(el) {
  const months=sixMonths(); let selMonth=nowMonth(); let selGroupId=null; let groups=[];
  const loadGroups=async()=>{ groups=await G('/groups'); draw(); };
  function draw(){
    el.innerHTML=`<div class="mp-wrap">${months.map(m=>`<button class="mpb${m===selMonth?' on':''}" onclick="attSel('${m}')">${mLabel(m)}</button>`).join('')}</div>
      <div class="ig"><label class="il"><i class="fa-solid fa-users"></i> GURUH</label>
        <select class="inp" onchange="attGrp(this.value)">
          <option value="">Barcha guruhlar</option>
          ${groups.map(g=>`<option value="${g.id}" ${g.id===selGroupId?'selected':''}>${g.name} — ${g.subject?.name||''}</option>`).join('')}
        </select></div>
      <button class="btn bp" onclick="loadAttData()"><i class="fa-solid fa-chart-bar"></i> Hisobotni ko'rish</button>
      <div id="attResult" style="margin-top:16px"></div>`;
    window.attSel=m=>{selMonth=m;draw();};
    window.attGrp=v=>{selGroupId=v?parseInt(v):null;};
    window.loadAttData=async()=>{
      const res=document.getElementById('attResult'); if(!res)return;
      res.innerHTML=ldHtml();
      try{
        const grpsToShow=selGroupId?[groups.find(g=>g.id===selGroupId)].filter(Boolean):groups;
        let html='';
        for(const g of grpsToShow){
          const gs=await G(`/groups/${g.id}/students?status=active`);
          const scheds=await G(`/schedule/group/${g.id}?month=${selMonth}`);
          if(!scheds.length){html+=`<div class="st">${g.name}</div><div class="card card-body" style="margin-bottom:12px;color:var(--tx3)">Dars yo'q</div>`;continue;}
          const total=scheds.length;
          let gHtml=`<div class="st"><i class="fa-solid fa-book"></i> ${g.name} — ${g.subject?.name||''}</div><div class="card" style="margin-bottom:12px">`;
          for(const st of gs){
            const atts=await G(`/attendance/student/${st.id}?groupId=${g.id}&month=${selMonth}`).catch(()=>[]);
            const present=(atts||[]).filter(a=>a.isPresent).length;
            const pct=total>0?Math.round(present/total*100):0;
            gHtml+=`<div style="display:flex;align-items:center;padding:10px 14px;border-bottom:1.5px solid var(--bdr2)">
              ${avHtml(st.firstName,st.lastName,36)}
              <div style="flex:1;margin-left:10px"><div style="font-size:14px;font-weight:700">${st.firstName} ${st.lastName}</div></div>
              <div style="text-align:right;min-width:80px">
                <div style="font-size:15px;font-weight:900;color:${pct>=75?'var(--ok)':pct>=50?'var(--w)':'var(--r)'}">${pct}%</div>
                <div style="font-size:11px;color:var(--tx3)">${present}/${total}</div>
              </div>
            </div>`;
          }
          gHtml+='</div>'; html+=gHtml;
        }
        res.innerHTML=html||`<div class="empty"><div class="empty-ico"><i class="fa-solid fa-clipboard-check" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">Ma'lumot yo'q</div></div>`;
      }catch(e){res.innerHTML=`<div class="empty"><div class="empty-ico"><i class="fa-solid fa-circle-exclamation" style="font-size:52px;color:var(--r)"></i></div><div class="empty-txt">${e.message}</div></div>`;}
    };
  }
  loadGroups();
}

// ── O'CHIRILGANLAR ────────────────────────────────────────────
async function rDeleted(el) {
  el.innerHTML=ldHtml();
  const data=await G('/students?showDeleted=true').catch(()=>[]);
  if(!data.length){el.innerHTML=`<div class="empty"><div class="empty-ico"><i class="fa-solid fa-circle-check" style="font-size:52px;color:var(--ok)"></i></div><div class="empty-txt">O'chirilgan o'quvchilar yo'q</div></div>`;return;}
  el.innerHTML=`<div class="st"><i class="fa-solid fa-trash-can"></i> O'CHIRILGANLAR (${data.length} ta)</div>
    ${data.map(s=>`<div class="del-card">
      <div class="del-name">${s.applicant?.firstName||''} ${s.applicant?.lastName||''}</div>
      ${s.deletedAt?`<div class="del-date"><i class="fa-solid fa-calendar-xmark"></i> O'chirilgan: ${new Date(s.deletedAt).toLocaleDateString('uz-UZ')}</div>`:''}
      ${s.deleteReason?`<div class="del-reason"><i class="fa-solid fa-note-sticky"></i> Sabab: ${s.deleteReason}</div>`:''}
      <div style="margin-top:6px;font-size:12px;color:var(--tx2)">
        ${s.groupStudents?.map(gs=>gs.group?.subject?.name||'').filter(Boolean).join(', ')||"Guruh ma'lumoti yo'q"}
      </div>
      ${s.applicant?.phoneSelf?`<div style="margin-top:8px"><a href="tel:${s.applicant.phoneSelf}" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;background:var(--p);color:#fff;text-decoration:none;font-size:13px;font-weight:700"><i class="fa-solid fa-phone"></i> Qo'ng'iroq</a></div>`:''}
    </div>`).join('')}`;
}

// ── SOZLAMALAR ────────────────────────────────────────────────
async function rSettings(el) {
  async function load(){
    const[settings,subs]=await Promise.all([G('/settings'),G('/subjects')]);
    el.innerHTML=`
      <div class="card card-body" style="margin-bottom:14px">
        <div class="st"><i class="fa-solid fa-paper-plane"></i> KANAL SOZLAMALARI</div>
        <div class="ig"><label class="il">Hisobot kanali ID</label><input id="set_report" class="inp" value="${settings.report_channel_id||''}" placeholder="-1001234567890"/></div>
        <div class="ig"><label class="il">Davomat kanali ID</label><input id="set_att" class="inp" value="${settings.attendance_channel_id||''}" placeholder="-1001234567891"/></div>
        <div class="ig"><label class="il">Qabul kanali ID</label><input id="set_app" class="inp" value="${settings.applicant_channel_id||''}" placeholder="-1001234567892"/></div>
        <button class="btn bp" onclick="saveSettings()"><i class="fa-solid fa-floppy-disk"></i> Saqlash</button>
      </div>
      <div class="card card-body">
        <div class="st"><i class="fa-solid fa-book-open"></i> FANLAR</div>
        <button class="btn bp" style="margin-bottom:12px" onclick="addSub()"><i class="fa-solid fa-plus"></i> Fan qo'shish</button>
        <div class="card">${!subs.length?`<div style="padding:14px;text-align:center;color:var(--tx3)">Fanlar yo'q</div>`:subs.map(s=>`<div class="li"><div style="flex:1;font-weight:700">${s.name}</div><button class="btn bd bsm" onclick="delSub(${s.id})"><i class="fa-solid fa-trash"></i></button></div>`).join('')}</div>
      </div>`;
    window.saveSettings=async()=>{try{await U('/settings',{report_channel_id:document.getElementById('set_report').value,attendance_channel_id:document.getElementById('set_att').value,applicant_channel_id:document.getElementById('set_app').value});toast('Saqlandi ✅','success');}catch(e){toast(e.message,'error');}};
    window.addSub=()=>openModal("<i class='fa-solid fa-plus'></i> Fan qo'shish",`<div class="ig"><label class="il">Fan nomi</label><input id="sn" class="inp" placeholder="Matematika"/></div><button class="btn bp" onclick="saveSb()"><i class="fa-solid fa-check"></i> Saqlash</button>`);
    window.saveSb=async()=>{const n=document.getElementById('sn').value.trim();if(!n)return toast('Fan nomi kerak','warn');try{await P('/subjects',{name:n});closeModal();toast('Saqlandi ✅','success');load();}catch(e){toast(e.message,'error');}};
    window.delSub=async id=>{if(!confirm("O'chirishni tasdiqlaysizmi?"))return;try{await D(`/subjects/${id}`);toast("O'chirildi",'success');load();}catch(e){toast(e.message,'error');}};
  }
  load();
}

// ── HODIM O'CHIRISH ───────────────────────────────────────────
async function rDelStaff(el) {
  async function load(){
    const staff=await G('/staff');
    el.innerHTML=`<div class="st"><i class="fa-solid fa-user-minus"></i> HODIMLARNI O'CHIRISH</div>
      ${!staff.length?`<div class="empty"><div class="empty-ico"><i class="fa-solid fa-users" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">Hodimlar yo'q</div></div>`:
      `<div class="card">${staff.map(s=>`<div class="li">
        ${avHtml(s.firstName,s.lastName)}
        <div style="flex:1;margin-left:12px">
          <div style="font-size:15px;font-weight:700">${s.firstName} ${s.lastName}</div>
          <div style="font-size:12px;color:var(--tx3)">${s.role==='teacher'?"O'qituvchi":'Qabulxona'}${s.subject?' · '+s.subject:''}</div>
        </div>
        <button class="btn bd bsm" onclick="dsConf(${s.id},'${s.firstName} ${s.lastName}')"><i class="fa-solid fa-trash"></i></button>
      </div>`).join('')}</div>`}`;
    window.dsConf=(id,name)=>{
      openModal("<i class='fa-solid fa-trash'></i> O'chirishni tasdiqlang",`<div style="font-size:14px;color:var(--tx2);margin-bottom:16px"><b>${name}</b> ni o'chirishni tasdiqlaysizmi?</div>
        <button class="btn bd" onclick="doDs(${id})"><i class="fa-solid fa-check"></i> O'chirish</button>
        <button class="btn bs" style="margin-top:8px" onclick="closeModal()">Bekor</button>`);
      window.doDs=async id2=>{try{await D(`/staff/${id2}?action=delete`);closeModal();toast("O'chirildi",'success');load();}catch(e){toast(e.message,'error');}};
    };
  }
  load();
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  try {
    const user = await G('/auth/me');
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    setupSidebar(user);
    nav('stats');
  } catch(e) {
    const ld = document.getElementById('loading');
    ld.innerHTML = `<div class="ld-ico"><i class="fa-solid fa-lock" style="color:var(--p)"></i></div>
      <div style="font-size:20px;font-weight:900;color:var(--tx);margin-top:8px">Admin paneli</div>
      <div style="font-size:14px;color:var(--tx2);margin-top:8px;text-align:center;padding:0 20px">Kirish uchun botda /start bosing</div>`;
  }
}
init();

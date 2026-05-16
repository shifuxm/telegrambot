// ── NAVIGATION ───────────────────────────────────────────────
const REC_NAV = [
  { id:'applist',    label:"Qabul ro'yxati",  ico:'fa-solid fa-list-check' },
  { id:'applicants', label:'Yangi qabul',      ico:'fa-solid fa-user-plus' },
  { id:'balance',    label:'Balans',           ico:'fa-solid fa-scale-balanced' },
  { id:'groups',     label:'Guruhlar',         ico:'fa-solid fa-users' },
  { id:'payments',   label:"To'lovlar",        ico:'fa-solid fa-credit-card' },
  { id:'expenses',   label:'Chiqimlar',        ico:'fa-solid fa-money-bill-transfer' },
  { id:'debtors',    label:'Qarzdorlar',       ico:'fa-solid fa-triangle-exclamation' },
  { id:'edit',       label:'Tahrirlash',       ico:'fa-solid fa-pen-to-square' },
  { id:'conversion', label:'Konversiya',       ico:'fa-solid fa-arrows-spin' },
  { id:'archive',    label:'Arxiv',            ico:'fa-solid fa-box-archive' },
];
const TITLES = {
  applist:"Qabul ro'yxati", applicants:'Yangi qabul', balance:'Balans',
  groups:'Guruhlar', payments:"To'lovlar", expenses:'Chiqimlar',
  debtors:'Qarzdorlar', edit:'Tahrirlash', conversion:'Konversiya', archive:'Arxiv'
};
let curPage = 'applist';

function setupSidebar(user) {
  const name = `${user.firstName||''} ${user.lastName||''}`.trim() || 'Qabulxona';
  document.getElementById('sbName').textContent = name;
  const av = document.getElementById('sbAvatar');
  if (av) av.innerHTML = `<i class="fa-solid fa-user-tie" style="font-size:24px"></i>`;
  document.getElementById('sbNav').innerHTML = REC_NAV.map(n => `
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
  ({applist:rAppList,applicants:rApplicants,balance:rBalance,groups:rGroups,payments:rPayments,expenses:rExpenses,debtors:rDebtors,edit:rEdit,conversion:rConversion,archive:rArchive})[page]?.(el);
}
function sbOpen()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sbOv').classList.add('open'); }
function sbClose() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sbOv').classList.remove('open'); }

// ── APPLIST ───────────────────────────────────────────────────
async function rAppList(el) {
  let srch = '';
  el.innerHTML = `<div class="sbox"><i class="fa-solid fa-magnifying-glass"></i><input class="inp" placeholder="Ism yoki familya..." oninput="alSrch(this.value)"/></div><div id="alList"></div>`;
  window.alSrch = v => { srch=v; load(); };

  async function load() {
    const data = await G(`/applicants${srch?`?search=${encodeURIComponent(srch)}`:''}`) ;
    const list = document.getElementById('alList');
    if (!data.length) { list.innerHTML = `<div class="empty"><div class="empty-ico"><i class="fa-solid fa-clipboard-list" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">Qabul ro'yxati bo'sh</div></div>`; return; }
    list.innerHTML = `<div class="card">${data.map(a => {
      const s = (a.applicantSubjects||[]).map(x=>x.subject?.name).join(', ')||'';
      const ph = a.phoneSelf||a.phoneFather||a.phoneMother||'—';
      const isPartial = a.status==='enrolled';
      return `<div class="li" onclick='alOpen(${JSON.stringify(a).replace(/'/g,"&#39;")})'>
        ${faCircle('fa-solid fa-user-graduate', isPartial?'var(--ws)':'var(--ps)', isPartial?'var(--w)':'var(--p)')}
        <div style="flex:1;margin-left:12px">
          <div style="font-size:15px;font-weight:700">${a.firstName} ${a.lastName}
            ${isPartial?`<span style="font-size:10px;font-weight:700;color:var(--w);background:var(--ws);padding:2px 7px;border-radius:8px;margin-left:4px">qisman</span>`:''}
          </div>
          <div style="font-size:12px;color:var(--tx3);margin-top:2px">${s}</div>
          <div style="font-size:12px;color:var(--tx3)"><i class="fa-solid fa-phone" style="font-size:10px;margin-right:4px"></i>${ph}</div>
        </div>
        <div style="font-size:11px;color:var(--tx3)">${new Date(a.createdAt).toLocaleDateString('uz-UZ')}</div>
      </div>`;
    }).join('')}</div>`;
  }

  window.alOpen = async a => {
    if (typeof a==='string') a=JSON.parse(a);
    const subs = (a.applicantSubjects||[]).map(x=>x.subject?.name||'');
    openModal(`${a.firstName} ${a.lastName}`, `
      ${phoneRow("O'zi", a.phoneSelf)}${phoneRow("Otasi", a.phoneFather)}${phoneRow("Onasi", a.phoneMother)}
      <div style="padding:10px 0"><span style="color:var(--tx3);font-size:13px"><i class="fa-solid fa-book"></i> Fanlar</span><div style="font-weight:700;margin-top:4px">${subs.join(', ')||'—'}</div></div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn bd bsm" style="flex:1" onclick="alDel(${a.id})"><i class="fa-solid fa-trash"></i> O'chirish</button>
        <button class="btn bp" style="flex:2" onclick='alEnroll(${JSON.stringify(a).replace(/"/g,"&quot;")})'>
          <i class="fa-solid fa-user-check"></i> Biriktirish
        </button>
      </div>`);
  };
  window.alDel = async id => { try { await D(`/applicants/${id}`); closeModal(); toast("O'chirildi",'success'); load(); } catch(e) { toast(e.message,'error'); } };
  window.alEnroll = async a => {
    if (typeof a==='string') a=JSON.parse(a);
    const allSubjItems = (a.applicantSubjects||[]);
    if (!allSubjItems.length) return toast("Fan biriktirilmagan",'warn');
    let subjItems = allSubjItems;
    if (a.status==='enrolled'&&a.student) {
      const enrolledSubjIds = new Set((a.student.groupStudents||[]).filter(gs=>gs.status==='active').map(gs=>gs.group?.subjectId||gs.group?.subject?.id));
      const remaining = allSubjItems.filter(si=>!enrolledSubjIds.has(si.subjectId||si.subject?.id));
      if (remaining.length>0) subjItems=remaining;
    }
    const choices = {}; subjItems.forEach(si=>{ choices[si.subjectId||si.subject?.id]={type:'wait',groupId:null}; });
    const subs2 = await G('/subjects');
    const groupsMap = {};
    await Promise.all(subjItems.map(async si=>{ const sid=si.subjectId||si.subject?.id; groupsMap[sid]=await G(`/groups?subjectId=${sid}`); }));
    openModal(`${a.firstName} — Biriktirish`, '<div id="epBody"></div><button class="btn bp" style="margin-top:8px" id="epSaveBtn"><i class="fa-solid fa-check"></i> Saqlash</button>');
    function epRender() {
      const body=document.getElementById('epBody'); if(!body) return;
      let html='';
      subjItems.forEach(si=>{
        const sid=si.subjectId||si.subject?.id; const sName=si.subject?.name||subs2.find(s=>s.id===sid)?.name||'';
        const ch=choices[sid]; const gs=groupsMap[sid]||[];
        html+=`<div style="margin-bottom:14px;background:var(--bg);border-radius:14px;padding:14px">
          <div style="font-size:13px;font-weight:800;color:var(--p);margin-bottom:10px"><i class="fa-solid fa-book"></i> ${sName}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <div id="ep${sid}w" class="gpill${!ch.groupId?' on':''}" onclick="epPick(${sid},null)">Kutish</div>
            ${gs.map(g=>`<div id="ep${sid}g${g.id}" class="gpill${ch.groupId===g.id?' on':''}" onclick="epPick(${sid},${g.id})">${g.name}</div>`).join('')}
            ${gs.length===0?`<span style="font-size:12px;color:var(--tx3)">Guruh yo'q</span>`:''}
          </div>
        </div>`;
      });
      body.innerHTML=html;
    }
    window.epPick=(sid,gid)=>{ choices[sid]={type:gid?'group':'wait',groupId:gid}; epRender(); };
    epRender();
    document.getElementById('epSaveBtn')?.addEventListener('click', async()=>{
      const groupAssignments=Object.entries(choices).filter(([,v])=>v.type==='group'&&v.groupId).map(([,v])=>({groupId:v.groupId}));
      try { if(groupAssignments.length>0) await P(`/applicants/${a.id}/enroll`,{groupAssignments}); closeModal(); toast(groupAssignments.length>0?'Biriktirildi 🎓':'Saqlandi ✅','success'); load(); } catch(e) { toast(e.message,'error'); }
    });
  };
  load();
}

// ── APPLICANTS (Yangi qabul) ───────────────────────────────────
async function rApplicants(el) {
  const subs = await G('/subjects');
  let selSubs=[]; let subData={}; let curMode='wait';
  el.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--p);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0"><i class="fa-solid fa-user-plus"></i></div>
      <div><div style="font-size:15px;font-weight:800">Yangi qabul</div><div style="font-size:12px;color:var(--tx3)">Ism, telefon va fanlarni kiriting</div></div>
    </div>
    <div class="ig"><label class="il"><i class="fa-solid fa-user"></i> Ismi</label><input id="af_fn" class="inp" placeholder="Ismi"/></div>
    <div class="ig"><label class="il"><i class="fa-solid fa-user"></i> Familyasi</label><input id="af_ln" class="inp" placeholder="Familyasi"/></div>
    <div class="ig"><label class="il"><i class="fa-solid fa-graduation-cap"></i> Ta'lim</label><select id="af_edu" class="inp" onchange="afEduChg()"><option value="school">🏫 Maktab</option><option value="college">🎓 Kollej</option><option value="adult">👤 Katta yosh</option></select></div>
    <div id="af_gd" class="ig"><label class="il">Sinfi</label><input id="af_grade" type="number" min="1" max="11" class="inp" placeholder="1—11"/></div>
    <div class="ig"><label class="il"><i class="fa-solid fa-phone"></i> O'z telefoni</label><input id="af_ps" class="inp" placeholder="+998 xx xxx xx xx"/></div>
    <div class="ig"><label class="il"><i class="fa-solid fa-phone"></i> Otasi telefoni</label><input id="af_pf" class="inp" placeholder="+998 xx xxx xx xx"/></div>
    <div class="ig"><label class="il"><i class="fa-solid fa-phone"></i> Onasi telefoni</label><input id="af_pm" class="inp" placeholder="+998 xx xxx xx xx"/></div>
    <div class="ig"><label class="il"><i class="fa-solid fa-book-open"></i> Fanlar</label>
      <div class="card">${subs.length===0?`<div style="padding:14px;color:var(--tx3)">Fan yo'q</div>`:subs.map(s=>`<div class="chk-row" id="afrow_${s.id}" onclick="afTogSub(${s.id})"><div class="chk" id="afcb_${s.id}"></div><span style="font-size:15px;font-weight:600">${s.name}</span></div>`).join('')}</div>
    </div>
    <div id="af_mode" style="display:none;margin-bottom:16px">
      <div class="tabs-bar">
        <button id="modeWait" class="tab-item on" onclick="afSetMode('wait')"><i class="fa-solid fa-clock"></i> Kutish</button>
        <button id="modeEnroll" class="tab-item" onclick="afSetMode('enroll')"><i class="fa-solid fa-user-check"></i> Guruhga biriktirish</button>
      </div>
    </div>
    <div id="af_step2_wrap" style="display:none"></div>
    <button class="btn bp" id="afSaveBtn" style="display:none;margin-top:8px" onclick="afDoSave()"><i class="fa-solid fa-check"></i> Saqlash</button>`;

  window.afEduChg = () => { document.getElementById('af_gd').style.display = document.getElementById('af_edu').value==='school'?'block':'none'; };
  window.afTogSub = id => {
    const cb=document.getElementById('afcb_'+id); const i=selSubs.indexOf(id);
    if(i>-1){selSubs.splice(i,1);cb.classList.remove('on');cb.textContent='';}
    else{selSubs.push(id);cb.classList.add('on');cb.textContent='✓';}
    document.getElementById('af_mode').style.display=selSubs.length>0?'block':'none';
    document.getElementById('afSaveBtn').style.display=selSubs.length>0?'block':'none';
    if(curMode==='enroll') renderStep2();
  };
  window.afSetMode = async mode => {
    curMode=mode;
    document.getElementById('modeWait').className='tab-item'+(mode==='wait'?' on':'');
    document.getElementById('modeEnroll').className='tab-item'+(mode==='enroll'?' on':'');
    const wrap=document.getElementById('af_step2_wrap');
    if(mode==='enroll'){wrap.style.display='block';await renderStep2();}else{wrap.style.display='none';}
  };
  async function renderStep2(){
    const wrap=document.getElementById('af_step2_wrap'); if(!wrap||!selSubs.length){if(wrap)wrap.innerHTML='';return;}
    const subMap={}; subs.forEach(s=>subMap[s.id]=s.name);
    await Promise.all(selSubs.map(async sid=>{if(subData[sid])return;const gs=await G(`/groups?subjectId=${sid}`);subData[sid]={subName:subMap[sid]||'',groups:gs,selGroup:null};}));
    let html=`<div class="st"><i class="fa-solid fa-users-rectangle"></i> GURUH BIRIKTIRISH</div>`;
    selSubs.forEach(sid=>{
      const d=subData[sid]; if(!d)return;
      html+=`<div style="background:var(--bg);border-radius:14px;padding:14px;margin-bottom:12px">
        <div style="font-size:13px;font-weight:800;color:var(--p);margin-bottom:10px"><i class="fa-solid fa-book"></i> ${d.subName}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <div id="agwait_${sid}" class="gpill${!d.selGroup?' on':''}" onclick="afPickG(${sid},null)">Kutish</div>
          ${d.groups.map(g=>`<div id="agg_${sid}_${g.id}" class="gpill${d.selGroup===g.id?' on':''}" onclick="afPickG(${sid},${g.id})">${g.name}</div>`).join('')}
          ${d.groups.length===0?`<span style="font-size:12px;color:var(--tx3)">Guruh yo'q</span>`:''}
        </div>
      </div>`;
    });
    wrap.innerHTML=html;
  }
  window.afPickG=(sid,gid)=>{if(subData[sid])subData[sid].selGroup=gid;const w=document.getElementById('agwait_'+sid);if(w)w.classList.toggle('on',!gid);if(subData[sid])subData[sid].groups.forEach(g=>{const b=document.getElementById(`agg_${sid}_${g.id}`);if(b)b.classList.toggle('on',g.id===gid);});};
  window.afDoSave=async()=>{
    const fn=document.getElementById('af_fn').value.trim(),ln=document.getElementById('af_ln').value.trim();
    if(!fn)return toast('Ism kerak','warn'); if(!ln)return toast('Familya kerak','warn');
    const ps=document.getElementById('af_ps').value.trim(),pf=document.getElementById('af_pf').value.trim(),pm=document.getElementById('af_pm').value.trim();
    if(!ps&&!pf&&!pm)return toast('Kamida bitta telefon kerak','warn');
    if(!selSubs.length)return toast('Kamida bitta fan tanlang','warn');
    const body={firstName:fn,lastName:ln,educationType:document.getElementById('af_edu').value,grade:document.getElementById('af_grade')?.value||'',phoneSelf:ps,phoneFather:pf,phoneMother:pm,subjectIds:selSubs};
    try{
      const app=await P('/applicants',body);
      if(curMode==='enroll'){const asn=selSubs.map(sid=>subData[sid]?.selGroup?{groupId:subData[sid].selGroup}:null).filter(Boolean);if(asn.length)await P(`/applicants/${app.id}/enroll`,{groupAssignments:asn});toast(asn.length?'Guruhga biriktirildi 🎓':'Saqlandi ✅','success');}
      else{toast('Kutish holatida saqlandi ✅','success');}
      nav('applist');
    }catch(e){toast(e.message,'error');}
  };
}

// ── BALANCE ───────────────────────────────────────────────────
async function rBalance(el) {
  el.innerHTML = `
    <div class="hero-card" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="position:relative;z-index:1">
        <div style="font-size:11px;opacity:.8;font-weight:800">BALANS BOSHQARUVI</div>
        <div style="font-size:18px;font-weight:900;margin-top:6px">O'quvchi tanlang</div>
        <div style="font-size:13px;opacity:.9">Qidiruv orqali</div>
      </div>
      <div style="position:relative;z-index:1"><i class="fa-solid fa-scale-balanced" style="font-size:52px;opacity:.9"></i></div>
    </div>
    <div class="sbox"><i class="fa-solid fa-magnifying-glass"></i><input class="inp" placeholder="O'quvchi ismi..." oninput="balSrch(this.value)"/></div>
    <div id="balResult"></div>`;

  window.balSrch = async q => {
    if (!q||q.length<2) { document.getElementById('balResult').innerHTML=''; return; }
    const data = await G(`/students?search=${encodeURIComponent(q)}`);
    document.getElementById('balResult').innerHTML = `<div class="card">${data.map(s=>`
      <div class="li" onclick="balOpen(${s.id},'${s.applicant?.firstName} ${s.applicant?.lastName}')">
        ${avHtml(s.applicant?.firstName||'',s.applicant?.lastName||'')}
        <div style="flex:1;margin-left:12px">
          <div style="font-size:15px;font-weight:700">${s.applicant?.firstName||''} ${s.applicant?.lastName||''}</div>
          <div style="font-size:12px;color:var(--tx3)">${s.groupStudents?.map(gs=>gs.group?.subject?.name||'').join(', ')||''}</div>
        </div>
        <i class="fa-solid fa-chevron-right" style="color:var(--bdr)"></i>
      </div>`).join('')||`<div style="padding:16px;text-align:center;color:var(--tx3)">Topilmadi</div>`}</div>`;
  };

  window.balOpen = async (sid, name) => {
    const [balData, profile] = await Promise.all([
      G(`/student-balance/${sid}`),
      G(`/students/${sid}/profile`).catch(()=>({groupStudents:[]}))
    ]);
    const groups = (profile.groupStudents||[]).filter(gs=>gs.status==='active');
    const months = sixMonths();
    const bal = Number(balData.balance||0);
    const balColor = bal>=200000?'var(--ok)':bal>0?'var(--w)':'var(--r)';

    openModal(`<i class="fa-solid fa-wallet"></i> ${name}`, `
      <div style="background:linear-gradient(135deg,var(--p),var(--pd));border-radius:18px;padding:20px;margin-bottom:16px;color:#fff;text-align:center">
        <div style="font-size:11px;opacity:.8;font-weight:800;margin-bottom:6px"><i class="fa-solid fa-scale-balanced"></i> HOZIRGI BALANS</div>
        <div style="font-size:44px;font-weight:900;line-height:1">${fmt(bal)}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <button class="btn bp" style="flex-direction:column;gap:4px;padding:14px 10px" onclick="balDeposit(${sid},'${name}')">
          <i class="fa-solid fa-circle-plus" style="font-size:22px"></i>
          <span style="font-size:13px">Balansga to'lov</span>
        </button>
        <button class="btn bs" style="flex-direction:column;gap:4px;padding:14px 10px;border:1.5px solid var(--bdr)" onclick="balDeduct(${sid},'${name}',${JSON.stringify(groups).replace(/"/g,'&quot;')})">
          <i class="fa-solid fa-circle-minus" style="font-size:22px;color:var(--w)"></i>
          <span style="font-size:13px">Balansdan ayirish</span>
        </button>
      </div>

      <div class="st"><i class="fa-solid fa-clock-rotate-left"></i> SO'NGGI TRANZAKSIYALAR</div>
      <div class="card">
        ${(balData.transactions||[]).slice(0,12).map(t=>{
          const isIn = t.type!=='deduct';
          return `<div class="li" style="cursor:default">
            ${faCircle(isIn?'fa-solid fa-arrow-down':'fa-solid fa-arrow-up', isIn?'var(--oks)':'var(--rs)', isIn?'var(--ok)':'var(--r)', 40)}
            <div style="flex:1;margin-left:12px">
              <div style="font-size:14px;font-weight:700">${t.description}</div>
              <div style="font-size:11px;color:var(--tx3)">${new Date(t.createdAt).toLocaleDateString('uz-UZ')}</div>
            </div>
            <div style="font-weight:800;color:${isIn?'var(--ok)':'var(--r)'}">
              ${isIn?'+':'-'}${fmt(t.amount)}
            </div>
          </div>`;
        }).join('')||`<div style="padding:14px;text-align:center;color:var(--tx3)"><i class="fa-solid fa-inbox" style="font-size:32px;margin-bottom:8px;display:block"></i>Tranzaksiya yo'q</div>`}
      </div>`);

    window.balDeposit = (sid2, name2) => {
      openModal(`<i class="fa-solid fa-plus"></i> Balansga to'lov — ${name2}`, `
        <div style="background:var(--oks);border-radius:14px;padding:14px;margin-bottom:16px;font-size:13px;color:#065f46;font-weight:600">
          <i class="fa-solid fa-circle-info"></i> To'lov balansga qo'shiladi. Keyin oylik to'lov uchun balansdan ayirib olish mumkin.
        </div>
        <div class="ig"><label class="il"><i class="fa-solid fa-sack-dollar"></i> SUMMA (so'm)</label><input id="dep_amt" class="inp" type="number" placeholder="500000"/></div>
        <div class="ig"><label class="il"><i class="fa-solid fa-coins"></i> TO'LOV TURI</label><select id="dep_type" class="inp"><option value="cash">💵 Naqd</option><option value="card">💳 Karta</option></select></div>
        <div class="ig"><label class="il"><i class="fa-solid fa-pen"></i> IZOH (ixtiyoriy)</label><input id="dep_desc" class="inp" placeholder="Oldindan to'lov..."/></div>
        <button class="btn bp" onclick="saveDeposit(${sid2},'${name2}')"><i class="fa-solid fa-check"></i> Balansga qo'shish</button>`);
    };
    window.saveDeposit = async (sid2, name2) => {
      const amt=document.getElementById('dep_amt').value, desc=document.getElementById('dep_desc').value, pt=document.getElementById('dep_type')?.value||'cash';
      if(!amt||amt<=0) return toast("Summa kiriting",'warn');
      try { await P(`/student-balance/${sid2}/deposit`,{amount:parseInt(amt),description:desc,paymentType:pt}); closeModal(); toast(`${fmt(amt)} qo'shildi ✅`,'success'); balOpen(sid2,name2); } catch(e) { toast(e.message,'error'); }
    };

    window.balDeduct = (sid2, name2, groups2) => {
      if (typeof groups2==='string') groups2=JSON.parse(groups2);
      const months2=sixMonths();
      openModal(`<i class="fa-solid fa-minus"></i> Oylik ayirish — ${name2}`, `
        <div style="background:var(--ws);border-radius:14px;padding:14px;margin-bottom:16px;font-size:13px;color:#92400e;font-weight:600">
          <i class="fa-solid fa-triangle-exclamation"></i> Balansdan ayirilgandan keyin Payment yozuvi ham yaratiladi.
        </div>
        <div class="ig"><label class="il"><i class="fa-solid fa-users"></i> GURUH</label>
          <select id="ded_grp" class="inp">
            <option value="">Guruh tanlang</option>
            ${groups2.map(g=>`<option value="${g.groupId}">${g.group?.name} — ${g.group?.subject?.name}</option>`).join('')}
          </select>
        </div>
        <div class="ig"><label class="il"><i class="fa-solid fa-calendar"></i> OY</label>
          <select id="ded_month" class="inp">${months2.map(m=>`<option value="${m}" ${m===nowMonth()?'selected':''}>${mLabel(m)}</option>`).join('')}</select>
        </div>
        <div class="ig"><label class="il"><i class="fa-solid fa-sack-dollar"></i> SUMMA (so'm)</label><input id="ded_amt" class="inp" type="number" placeholder="500000"/></div>
        <div class="ig"><label class="il"><i class="fa-solid fa-pen"></i> IZOH</label><input id="ded_desc" class="inp" placeholder="Oylik to'lov..."/></div>
        <button class="btn bd" onclick="saveDeduct(${sid2},'${name2}')"><i class="fa-solid fa-minus"></i> Balansdan ayirish</button>`);
    };
    window.saveDeduct = async (sid2, name2) => {
      const amt=document.getElementById('ded_amt').value, groupId=document.getElementById('ded_grp').value, monthYear=document.getElementById('ded_month').value, desc=document.getElementById('ded_desc').value;
      if(!amt||amt<=0) return toast("Summa kiriting",'warn');
      if(!groupId) return toast("Guruh tanlang",'warn');
      try { await P(`/student-balance/${sid2}/deduct`,{amount:parseInt(amt),groupId:parseInt(groupId),monthYear,description:desc}); closeModal(); toast(`${fmt(amt)} ayirildi`,'success'); balOpen(sid2,name2); } catch(e) { toast(e.message,'error'); }
    };
  };
}

// ── GROUPS ────────────────────────────────────────────────────
async function rGroups(el) {
  async function load() {
    const gs = await G('/groups');
    el.innerHTML = `<button class="btn bp" style="margin-bottom:12px" onclick="openAddGroup()"><i class="fa-solid fa-plus"></i> Guruh qo'shish</button>
      <div class="card">${gs.length===0?`<div style="padding:20px;text-align:center;color:var(--tx3)"><i class="fa-solid fa-users" style="font-size:32px;margin-bottom:8px;display:block"></i>Guruhlar yo'q</div>`:gs.map(g=>`
        <div class="li" onclick="gOpen(${g.id})">
          ${faCircle('fa-solid fa-users', 'var(--oks)', 'var(--ok)')}
          <div style="flex:1;margin-left:12px">
            <div style="font-size:15px;font-weight:700">${g.name}</div>
            <div style="font-size:12px;color:var(--tx2)">${g.subject?.name||''} · ${g.teacher?.firstName||''} ${g.teacher?.lastName||''}</div>
          </div>
          <div style="text-align:right"><div style="font-size:22px;font-weight:900;color:var(--p)">${g._count?.groupStudents||0}</div><div style="font-size:11px;color:var(--tx3)">o'quvchi</div></div>
        </div>`).join('')}</div>`;
  }
  window.openAddGroup = async () => {
    const subs=await G('/subjects');
    openModal("<i class='fa-solid fa-plus'></i> Guruh qo'shish",`
      <div class="ig"><label class="il">Fan</label><select id="gg_sub" class="inp" onchange="ggSubChange()"><option value="">Fan tanlang</option>${subs.map(s=>`<option value="${s.id}" data-name="${s.name}">${s.name}</option>`).join('')}</select></div>
      <div class="ig"><label class="il">O'qituvchi</label><select id="gg_teacher" class="inp"><option value="">Avval fan tanlang</option></select></div>
      <div class="ig"><label class="il">Guruh nomi</label><input id="gg_name" class="inp" placeholder="Guruh-A"/></div>
      <div class="ig"><label class="il">Oylik narx (so'm)</label><input id="gg_price" class="inp" type="number" placeholder="500000"/></div>
      <button class="btn bp" onclick="saveGroup()"><i class="fa-solid fa-check"></i> Yaratish</button>`);
    window.ggSubChange=async()=>{const sel=document.getElementById('gg_sub');const sName=sel.options[sel.selectedIndex]?.dataset.name;if(!sName)return;const ts=await G(`/staff/teachers?subject=${encodeURIComponent(sName)}`);document.getElementById('gg_teacher').innerHTML=`<option value="">O'qituvchi tanlang</option>`+ts.map(t=>`<option value="${t.id}">${t.firstName} ${t.lastName}</option>`).join('');};
    window.saveGroup=async()=>{const body={subjectId:document.getElementById('gg_sub').value,teacherId:document.getElementById('gg_teacher').value,name:document.getElementById('gg_name').value.trim(),monthlyPrice:parseInt(document.getElementById('gg_price').value)||0};if(!body.subjectId)return toast('Fan tanlang','warn');if(!body.teacherId)return toast("O'qituvchi tanlang",'warn');if(!body.name)return toast('Guruh nomi kerak','warn');try{await P('/groups',body);closeModal();toast('Yaratildi ✅','success');load();}catch(e){toast(e.message,'error');}};
  };
  window.gOpen=async id=>{const[gs2,sts]=await Promise.all([G('/groups'),G(`/groups/${id}/students`)]);const g=gs2.find(x=>x.id===id);openModal(g?.name||'Guruh',`<div style="font-size:13px;color:var(--tx2);margin-bottom:14px">${g?.subject?.name} · ${g?.teacher?.firstName||''} ${g?.teacher?.lastName||''}</div><div class="st"><i class="fa-solid fa-users"></i> O'QUVCHILAR (${sts.length})</div><div class="card">${sts.length===0?`<div style="padding:14px;text-align:center;color:var(--tx3)">O'quvchilar yo'q</div>`:sts.map((s,i)=>`<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1.5px solid var(--bdr2)">${avHtml(s.firstName,s.lastName,36)}<div style="margin-left:8px"><div style="font-weight:700;font-size:14px">${s.firstName} ${s.lastName}</div><div style="font-size:12px;color:var(--tx3)">${s.phoneSelf||s.phoneFather||'—'}</div></div></div>`).join('')}</div>`);};
  load();
}

// ── PAYMENTS ──────────────────────────────────────────────────
async function rPayments(el) {
  let ftab='search';
  function drawTabs(){
    el.innerHTML=`<div class="tabs-bar"><button class="tab-item${ftab==='search'?' on':''}" onclick="pTab('search')"><i class="fa-solid fa-magnifying-glass"></i> Qidiruv</button><button class="tab-item${ftab==='group'?' on':''}" onclick="pTab('group')"><i class="fa-solid fa-users"></i> Guruh</button></div><div id="payC"></div>`;
    window.pTab=t=>{ftab=t;drawTabs();if(t==='search')paySearch();else payGroup();};
    if(ftab==='search')paySearch();else payGroup();
  }
  function paySearch(){
    const pc=document.getElementById('payC');
    pc.innerHTML=`<div class="sbox"><i class="fa-solid fa-magnifying-glass"></i><input class="inp" placeholder="O'quvchi ismi..." oninput="psrch(this.value)"/></div><div id="psRes"></div>`;
    window.psrch=async q=>{if(!q||q.length<2){document.getElementById('psRes').innerHTML='';return;}const data=await G(`/payments/search?q=${encodeURIComponent(q)}`);document.getElementById('psRes').innerHTML=`<div class="card">${data.map(s=>`<div class="li" onclick='payOpen(${JSON.stringify(s).replace(/"/g,"&quot;")})'>${avHtml(s.applicant?.firstName||'',s.applicant?.lastName||'')}<div style="flex:1;margin-left:12px"><div style="font-size:15px;font-weight:700">${s.applicant?.firstName||''} ${s.applicant?.lastName||''}</div><div style="font-size:12px;color:var(--tx3)">${s.groupStudents?.map(g=>g.group?.subject?.name||'').join(', ')||''}</div></div><i class="fa-solid fa-chevron-right" style="color:var(--bdr)"></i></div>`).join('')||`<div style="padding:14px;text-align:center;color:var(--tx3)">Topilmadi</div>`}</div>`;};
  }
  async function payGroup(){
    const pc=document.getElementById('payC');pc.innerHTML=ldHtml();
    const gs=await G('/groups');const months=sixMonths();let sm=nowMonth();
    pc.innerHTML=`<div class="mp-wrap">${months.map(m=>`<button class="mpb${m===sm?' on':''}" onclick="pgSel('${m}')">${mLabel(m)}</button>`).join('')}</div>
      <div class="card">${gs.map(g=>`<div class="li" onclick="pgOpen(${g.id})">${faCircle('fa-solid fa-users','var(--ps)','var(--p)')}<div style="flex:1;margin-left:12px"><div style="font-size:15px;font-weight:700">${g.name}</div><div style="font-size:12px;color:var(--tx3)">${g.subject?.name||''}</div></div><i class="fa-solid fa-chevron-right" style="color:var(--bdr)"></i></div>`).join('')}</div>`;
    window.pgSel=m=>{sm=m;payGroup();};
    window.pgOpen=async gid=>{const sts=await G(`/groups/${gid}/students?monthYear=${sm}`);const g=gs.find(x=>x.id===gid);openModal(g?.name||'',`<div class="st"><i class="fa-solid fa-calendar-check"></i> ${mLabel(sm)}</div><div class="card">${sts.map(s=>`<div class="li" onclick='payOpen(${JSON.stringify({id:s.id,applicant:{firstName:s.firstName,lastName:s.lastName},groupStudents:[{groupId:gid,group:{name:g?.name,subject:{name:g?.subject?.name}}}]}).replace(/"/g,"&quot;")})'>${avHtml(s.firstName,s.lastName)}<div style="flex:1;margin-left:12px"><div style="font-weight:700">${s.firstName} ${s.lastName}</div></div><span class="badge ${s.hasPaid?'bok':'bbad'}">${s.hasPaid?'✅':'⚠️'}</span></div>`).join('')}</div>`);};
  }
  window.payOpen=async s=>{
    if(typeof s==='string')s=JSON.parse(s);
    const months2=sixMonths();const name=`${s.applicant?.firstName||''} ${s.applicant?.lastName||''}`;
    openModal(`<i class="fa-solid fa-credit-card"></i> ${name}`,`
      <div class="ig"><label class="il"><i class="fa-solid fa-users"></i> GURUH</label><select id="pay_g" class="inp"><option value="">Guruh tanlang</option>${(s.groupStudents||[]).map(gs=>`<option value="${gs.groupId}">${gs.group?.name} — ${gs.group?.subject?.name}</option>`).join('')}</select></div>
      <div class="ig"><label class="il"><i class="fa-solid fa-calendar"></i> OY</label><select id="pay_m" class="inp">${months2.map(m=>`<option value="${m}" ${m===nowMonth()?'selected':''}>${mLabel(m)}</option>`).join('')}</select></div>
      <div class="ig"><label class="il"><i class="fa-solid fa-sack-dollar"></i> SUMMA</label><input id="pay_a" class="inp" type="number" placeholder="500000"/></div>
      <div class="ig"><label class="il"><i class="fa-solid fa-coins"></i> TO'LOV TURI</label><select id="pay_t" class="inp"><option value="cash">💵 Naqd</option><option value="card">💳 Karta</option></select></div>
      <div class="ig"><label class="il"><i class="fa-solid fa-pen"></i> IZOH</label><input id="pay_n" class="inp" placeholder="Ixtiyoriy..."/></div>
      <div class="ig" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="pay_bal" style="width:20px;height:20px;cursor:pointer;accent-color:var(--p)"/>
        <label for="pay_bal" style="font-size:14px;font-weight:600;cursor:pointer"><i class="fa-solid fa-scale-balanced" style="color:var(--p)"></i> Balansdan ayirish</label>
      </div>
      <button class="btn bp" onclick="savePay(${s.id})"><i class="fa-solid fa-check"></i> Saqlash</button>`);
    window.savePay=async sid=>{
      const gid=document.getElementById('pay_g').value,my=document.getElementById('pay_m').value,amt=document.getElementById('pay_a').value,pt=document.getElementById('pay_t').value,n=document.getElementById('pay_n').value,useBal=document.getElementById('pay_bal')?.checked;
      if(!gid)return toast('Guruh tanlang','warn');if(!amt)return toast('Summa kiriting','warn');
      try{
        if(useBal){
          // Oylik plan belgilash + balansdan ayirish (bitta amal)
          await P(`/student-balance/${sid}/pay-month`,{groupId:parseInt(gid),monthYear:my,amount:parseInt(amt)});
        }else{
          // To'g'ridan-to'g'ri to'lov qabul qilish
          await P('/payments',{studentId:sid,groupId:parseInt(gid),monthYear:my,amount:parseInt(amt),paymentType:pt,note:n});
        }
        closeModal();toast(`${fmt(amt)} qabul qilindi ✅`,'success');
      }catch(e){toast(e.message,'error');}
    };
  };
  drawTabs();
}

// ── EXPENSES ──────────────────────────────────────────────────
async function rExpenses(el) {
  const staff=await G('/staff');let cat='staff',pt='cash';const months=sixMonths();let sm=nowMonth();
  function draw(){
    el.innerHTML=`<div class="tabs-bar"><button class="tab-item${cat==='staff'?' on':''}" onclick="xc('staff')"><i class="fa-solid fa-user-tie"></i> Hodim</button><button class="tab-item${cat==='communal'?' on':''}" onclick="xc('communal')"><i class="fa-solid fa-bolt"></i> Komunal</button><button class="tab-item${cat==='other'?' on':''}" onclick="xc('other')"><i class="fa-solid fa-box"></i> Boshqa</button></div>
      ${cat==='staff'?`<div class="ig"><label class="il"><i class="fa-solid fa-user-tie"></i> Hodim</label><select id="xs" class="inp"><option value="">Tanlang</option>${staff.map(s=>`<option value="${s.id}">${s.firstName} ${s.lastName}</option>`).join('')}</select></div>`:''}
      ${cat==='communal'?`<div class="ig"><label class="il">Tur</label><select id="xcomm" class="inp"><option value="Soliq">Soliq</option><option value="Suv">Suv</option><option value="Elektr">Elektr</option><option value="Gaz">Gaz</option></select></div>`:''}
      <div class="ig"><label class="il"><i class="fa-solid fa-calendar"></i> OY</label><select id="xm" class="inp">${months.map(m=>`<option value="${m}" ${m===sm?'selected':''}>${mLabel(m)}</option>`).join('')}</select></div>
      <div class="ig"><label class="il"><i class="fa-solid fa-sack-dollar"></i> SUMMA</label><input id="xa" class="inp" type="number" placeholder="500000"/></div>
      <div class="ig"><label class="il"><i class="fa-solid fa-coins"></i> TO'LOV TURI</label><select id="xpt" class="inp"><option value="cash">💵 Naqd</option><option value="card">💳 Karta</option></select></div>
      <div class="ig"><label class="il"><i class="fa-solid fa-pen"></i> IZOH</label><input id="xn" class="inp" placeholder="Ixtiyoriy..."/></div>
      <button class="btn bp" onclick="xSave()"><i class="fa-solid fa-check"></i> Saqlash</button>`;
    window.xc=c=>{cat=c;draw();};
    window.xSave=async()=>{const body={category:cat,staffId:cat==='staff'?document.getElementById('xs')?.value||null:null,subcategory:cat==='communal'?document.getElementById('xcomm')?.value:null,monthYear:document.getElementById('xm').value,amount:document.getElementById('xa').value,paymentType:document.getElementById('xpt').value,note:document.getElementById('xn').value};if(!body.amount)return toast('Summa kiriting','warn');try{await P('/expenses',body);toast('Chiqim saqlandi 💸','success');draw();}catch(e){toast(e.message,'error');}};
  }
  draw();
}

// ── DEBTORS ───────────────────────────────────────────────────
async function rDebtors(el) {
  const months=sixMonths();let sm=nowMonth();let ma='';
  function draw(){
    el.innerHTML=`<div class="mp-wrap">${months.map(m=>`<button class="mpb${m===sm?' on':''}" onclick="dm('${m}')">${mLabel(m)}</button>`).join('')}</div>
      <div class="ig"><label class="il"><i class="fa-solid fa-filter"></i> Maksimal summa (bo'sh = hammasi)</label><input id="dma" type="number" class="inp" placeholder="" value="${ma}" oninput="dmi(this.value)"/></div>
      <button class="btn bp" onclick="loadDebt()"><i class="fa-solid fa-triangle-exclamation"></i> Qarzdorlarni ko'rish</button>
      <div id="dRes" style="margin-top:16px"></div>`;
    window.dm=m=>{sm=m;draw();};window.dmi=v=>{ma=v;};
    window.loadDebt=async()=>{
      const dRes=document.getElementById('dRes');dRes.innerHTML=ldHtml();
      const data=await G(`/debtors?monthYear=${sm}${ma?`&maxAmount=${ma}`:''}`);
      if(!data.length){dRes.innerHTML=`<div class="empty"><div class="empty-ico"><i class="fa-solid fa-circle-check" style="font-size:52px;color:var(--ok)"></i></div><div class="empty-txt">Qarzdorlar yo'q!</div></div>`;return;}
      const total=data.reduce((s,g)=>s+g.students.length,0);
      dRes.innerHTML=`<div class="hero-card" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
        <div style="position:relative;z-index:1"><div style="font-size:11px;opacity:.8;font-weight:800">QARZDORLAR · ${mLabel(sm)}</div><div style="font-size:40px;font-weight:900">${total}</div></div>
        <i class="fa-solid fa-triangle-exclamation" style="font-size:52px;opacity:.9;position:relative;z-index:1"></i>
      </div>
      ${data.map(g=>`<div class="st"><i class="fa-solid fa-book"></i> ${g.subjectName} — ${g.groupName}</div>
        <div class="card" style="margin-bottom:8px">${g.students.map(s=>`<div class="li" style="cursor:default">
          ${avHtml(s.firstName,s.lastName)}
          <div style="flex:1;margin-left:12px"><div style="font-size:14px;font-weight:700">${s.firstName} ${s.lastName}</div><div style="font-size:12px;color:var(--tx3)"><i class="fa-solid fa-phone" style="font-size:10px"></i> ${s.phoneSelf||s.phoneFather||'—'}</div></div>
          <span class="badge ${s.noPay?'bbad':'bwarn'}">${s.noPay?"To'lamagan":'Qisman'}</span>
        </div>`).join('')}</div>
        <button onclick="notifyDebt(${g.groupId})" class="btn bs" style="margin-bottom:14px;font-size:13px"><i class="fa-solid fa-paper-plane"></i> Xabar yuborish</button>`).join('')}`;
      window.notifyDebt=async gid=>{try{const r=await P('/debtors/notify',{groupId:gid,monthYear:sm});toast(`${r.sent} ta xabar yuborildi 📤`,'success');}catch(e){toast(e.message,'error');}};
    };
  }
  draw();
}

// ── EDIT ──────────────────────────────────────────────────────
async function rEdit(el) {
  const gs=await G('/groups');
  el.innerHTML=`<div class="tabs-bar"><button class="tab-item on" id="et1" onclick="eTab('students')"><i class="fa-solid fa-graduation-cap"></i> O'quvchilar</button><button class="tab-item" id="et2" onclick="eTab('groups')"><i class="fa-solid fa-users"></i> Guruhlar</button></div><div id="editC"></div>`;
  window.eTab=t=>{document.getElementById('et1').className='tab-item'+(t==='students'?' on':'');document.getElementById('et2').className='tab-item'+(t==='groups'?' on':'');if(t==='students')editSts();else editGps();};
  editSts();

  function editSts(){
    const ec=document.getElementById('editC');
    ec.innerHTML=`<div class="st"><i class="fa-solid fa-users"></i> GURUH TANLANG</div><div class="card">${gs.map(g=>`<div class="li" onclick="eOpenG(${g.id})">${faCircle('fa-solid fa-users','var(--ps)','var(--p)')}<div style="flex:1;margin-left:12px"><div style="font-weight:700">${g.name}</div><div style="font-size:12px;color:var(--tx3)">${g.subject?.name}</div></div><i class="fa-solid fa-chevron-right" style="color:var(--bdr)"></i></div>`).join('')}</div>`;
    window.eOpenG=async gid=>{
      const sts=await G(`/groups/${gid}/students`);
      ec.innerHTML=`<button class="back-btn" onclick="editSts()"><i class="fa-solid fa-arrow-left"></i> Orqaga</button><div class="card">${sts.length===0?`<div style="padding:14px;text-align:center;color:var(--tx3)">O'quvchilar yo'q</div>`:sts.map(s=>`<div class="li" onclick='eOpenSt(${JSON.stringify(s).replace(/"/g,"&quot;")},${gid})'>${avHtml(s.firstName,s.lastName)}<div style="flex:1;margin-left:12px"><div style="font-weight:700">${s.firstName} ${s.lastName}</div><div style="font-size:12px;color:var(--tx3)">${s.phoneSelf||s.phoneFather||'—'}</div></div><i class="fa-solid fa-pen" style="color:var(--p)"></i></div>`).join('')}</div>`;
      window.eOpenSt=async(s,gid2)=>{
        if(typeof s==='string')s=JSON.parse(s);
        const allGs=await G('/groups');
        openModal(`<i class="fa-solid fa-user-pen"></i> ${s.firstName} ${s.lastName}`,`
          <div class="ig"><label class="il">Ismi</label><input id="es_fn" class="inp" value="${s.firstName}"/></div>
          <div class="ig"><label class="il">Familyasi</label><input id="es_ln" class="inp" value="${s.lastName}"/></div>
          <div class="ig"><label class="il">O'zi</label><input id="es_ps" class="inp" value="${s.phoneSelf||''}"/></div>
          <div class="ig"><label class="il">Otasi</label><input id="es_pf" class="inp" value="${s.phoneFather||''}"/></div>
          <div class="ig"><label class="il">Onasi</label><input id="es_pm" class="inp" value="${s.phoneMother||''}"/></div>
          <button class="btn bp" style="margin-bottom:12px" onclick="esSave(${s.id},${gid2})"><i class="fa-solid fa-check"></i> Saqlash</button>
          <div class="ig"><label class="il"><i class="fa-solid fa-right-to-bracket"></i> Yangi guruhga qo'shish</label><select id="es_addg" class="inp"><option value="">Guruh tanlang</option>${allGs.filter(g=>g.id!==gid2).map(g=>`<option value="${g.id}">${g.name} — ${g.subject?.name}</option>`).join('')}</select></div>
          <button class="btn bs" style="margin-bottom:12px" onclick="esAddG(${s.id})"><i class="fa-solid fa-plus"></i> Qo'shish</button>
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <button class="btn bs" style="flex:1;font-size:12px" onclick="esDetach(${s.id},${gid2})"><i class="fa-solid fa-user-xmark"></i> Uzish</button>
            <button class="btn bs" style="flex:1;font-size:12px" onclick='esMove(${s.id},${gid2},${JSON.stringify(allGs).replace(/"/g,"&quot;")})'>Ko'chirish</button>
          </div>
          <button class="btn bd" onclick="softDelSt(${s.id},'${s.firstName} ${s.lastName}')"><i class="fa-solid fa-trash"></i> O'chirib yuborish</button>`);
        window.esSave=async(id,g)=>{try{await U(`/students/${id}`,{firstName:document.getElementById('es_fn').value,lastName:document.getElementById('es_ln').value,phoneSelf:document.getElementById('es_ps').value,phoneFather:document.getElementById('es_pf').value,phoneMother:document.getElementById('es_pm').value});closeModal();toast('Saqlandi ✅','success');eOpenG(g);}catch(e){toast(e.message,'error');}};
        window.esAddG=async id=>{const nGid=document.getElementById('es_addg').value;if(!nGid)return toast('Guruh tanlang','warn');try{await P(`/students/${id}/groups`,{groupId:nGid});closeModal();toast("Qo'shildi ✅",'success');eOpenG(gid2);}catch(e){toast(e.message,'error');}};
        window.esDetach=async(sid2,g)=>{try{await D(`/students/${sid2}/groups/${g}`);closeModal();toast('Guruhdan uzildi','success');eOpenG(g);}catch(e){toast(e.message,'error');}};
        window.esMove=(sid2,g,allG2)=>{if(typeof allG2==='string')allG2=JSON.parse(allG2);openModal("Ko'chirish",`<div class="card">${allG2.filter(x=>x.id!==g).map(x=>`<div class="li" onclick="doMove(${sid2},${g},${x.id})">${avHtml(x.name,'',44)}<div style="margin-left:12px"><div style="font-weight:700">${x.name}</div><div style="font-size:12px;color:var(--tx3)">${x.subject?.name}</div></div></div>`).join('')}</div>`);window.doMove=async(s2,og,ng)=>{try{await U(`/students/${s2}/groups/${og}/move`,{newGroupId:ng});closeModal();toast("Ko'chirildi ✅",'success');eOpenG(og);}catch(e){toast(e.message,'error');}};};
        window.softDelSt=(id2,name2)=>{openModal("<i class='fa-solid fa-trash'></i> O'chirishni tasdiqlang",`<div style="font-size:14px;color:var(--tx2);margin-bottom:14px"><b>${name2}</b> o'chirilsinmi? Statistikada ko'rinib qoladi.</div><div class="ig"><label class="il">Sabab</label><input id="del_r" class="inp" placeholder="Ixtiyoriy..."/></div><button class="btn bd" onclick="doSDel(${id2})"><i class="fa-solid fa-check"></i> Tasdiqlash</button><button class="btn bs" style="margin-top:8px" onclick="closeModal()">Bekor</button>`);window.doSDel=async sid2=>{const r=document.getElementById('del_r')?.value||'';try{await D(`/students/${sid2}?action=softdelete&reason=${encodeURIComponent(r)}`);closeModal();toast("O'chirildi",'success');eOpenG(gid2);}catch(e){toast(e.message,'error');}};};
      };
    };
  }

  function editGps(){
    const ec=document.getElementById('editC');
    ec.innerHTML=`<div class="card">${gs.map(g=>`<div class="li" onclick="eOpenGH(${g.id})">${faCircle('fa-solid fa-users','var(--oks)','var(--ok)')}<div style="flex:1;margin-left:12px"><div style="font-weight:700">${g.name}</div><div style="font-size:12px;color:var(--tx3)">${g.subject?.name} · ${g.teacher?.firstName||''} ${g.teacher?.lastName||''}</div></div><i class="fa-solid fa-pen" style="color:var(--p)"></i></div>`).join('')}</div>`;
    window.eOpenGH=async gid=>{
      const[hist,teachers]=await Promise.all([G(`/groups/${gid}/teacher-history`),G('/staff/teachers')]);
      const g=gs.find(x=>x.id===gid);
      openModal(`<i class="fa-solid fa-pen-to-square"></i> ${g?.name||'Guruh'}`,`
        <div class="ig"><label class="il">Guruh nomi</label><input id="eg_name" class="inp" value="${g?.name||''}"/></div>
        <div class="ig"><label class="il"><i class="fa-solid fa-chalkboard-user"></i> O'qituvchi</label><select id="eg_t" class="inp"><option value="">O'zgartirish...</option>${teachers.map(t=>`<option value="${t.id}">${t.firstName} ${t.lastName}${t.subject?' — '+t.subject:''}</option>`).join('')}</select></div>
        <button class="btn bp" style="margin-bottom:16px" id="egSaveBtn"><i class="fa-solid fa-check"></i> Saqlash</button>
        <div class="st"><i class="fa-solid fa-clock-rotate-left"></i> O'QITUVCHILAR TARIXI</div>
        ${hist.map(h=>`<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1.5px solid var(--bdr2)"><div><div style="font-weight:700">${h.teacher.firstName} ${h.teacher.lastName}</div><div style="font-size:12px;color:var(--tx3)">${h.teacher.subject||''}</div></div><div style="text-align:right;font-size:12px;color:var(--tx3)"><div>${new Date(h.startDate).toLocaleDateString('uz-UZ')}</div><div>${h.endDate?new Date(h.endDate).toLocaleDateString('uz-UZ'):'Hozir'}</div></div></div>`).join('')||`<div style="color:var(--tx3);padding:8px">Tarix yo'q</div>`}`);
      document.getElementById('egSaveBtn')?.addEventListener('click',async()=>{const newName=document.getElementById('eg_name').value.trim();const tid=document.getElementById('eg_t').value;const body={};if(newName&&newName!==g?.name)body.name=newName;if(tid)body.teacherId=parseInt(tid);if(!Object.keys(body).length)return toast("Hech narsa o'zgarmadi",'warn');try{await U('/groups/'+gid,body);closeModal();toast('Saqlandi ✅','success');editGps();}catch(e){toast(e.message,'error');}});
    };
  }
}

// ── CONVERSION ────────────────────────────────────────────────
async function rConversion(el) {
  let type='cash_to_card',from='',to='';
  function draw(){
    const isCTC=type==='cash_to_card';
    el.innerHTML=`<div class="tabs-bar"><button class="tab-item${isCTC?' on':''}" onclick="cvt('cash_to_card')"><i class="fa-solid fa-arrow-right-arrow-left"></i> Naqd → Karta</button><button class="tab-item${!isCTC?' on':''}" onclick="cvt('card_to_cash')"><i class="fa-solid fa-arrow-right-arrow-left"></i> Karta → Naqd</button></div>
      <div class="card card-body" style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:800;color:var(--tx3);margin-bottom:8px"><i class="fa-solid fa-money-bills"></i> ${isCTC?'Naqd berildi':'Kartadan olindi'}</div>
        <input id="cv_f" type="number" class="inp" style="font-size:24px;font-weight:700" placeholder="500 000" value="${from}" oninput="cvfm('from',this.value)"/>
        <div id="cv_ff" style="font-size:14px;color:var(--tx2);margin-top:4px;${from?'':'display:none'}">${from?fmt(from):''}</div>
      </div>
      <div style="text-align:center;font-size:28px;color:var(--bdr);margin-bottom:12px"><i class="fa-solid fa-arrow-down"></i></div>
      <div class="card card-body" style="margin-bottom:16px;background:var(--ps);border-color:var(--p)">
        <div style="font-size:12px;font-weight:800;color:var(--p);margin-bottom:8px"><i class="fa-solid fa-credit-card"></i> ${isCTC?'Karta qabul':'Naqd olindi'}</div>
        <input id="cv_t" type="number" class="inp" style="font-size:24px;font-weight:700;color:var(--p)" placeholder="505 000" value="${to}" oninput="cvfm('to',this.value)"/>
        <div id="cv_tf" style="font-size:14px;color:var(--p);margin-top:4px;${to?'':'display:none'}">${to?fmt(to):''}</div>
      </div>
      <button class="btn bp" onclick="cvSave()"><i class="fa-solid fa-check"></i> Saqlash</button>`;
    window.cvt=t=>{type=t;draw();};
    window.cvfm=(side,v)=>{if(side==='from')from=v;else to=v;const e=document.getElementById(`cv_${side==='from'?'ff':'tf'}`);if(v){e.style.display='block';e.textContent=fmt(v);}else e.style.display='none';};
    window.cvSave=async()=>{const f=document.getElementById('cv_f').value,t=document.getElementById('cv_t').value;if(!f||!t)return toast('Ikkala summani kiriting','warn');try{await P('/conversions',{type,fromAmount:parseInt(f),toAmount:parseInt(t)});toast('Saqlandi ✅','success');from='';to='';draw();}catch(e){toast(e.message,'error');};};
  }
  draw();
}

// ── ARCHIVE ───────────────────────────────────────────────────
async function rArchive(el) {
  let tab='active';
  async function load(){
    const groups=await G('/groups');
    if(tab==='active'){
      el.innerHTML=`<div class="tabs-bar"><button class="tab-item on" id="tabAct"><i class="fa-solid fa-circle-check"></i> Faol</button><button class="tab-item" id="tabArch"><i class="fa-solid fa-box-archive"></i> Arxiv</button></div>
        <div class="st"><i class="fa-solid fa-users"></i> GURUH TANLANG</div><div class="card" id="archGList"></div>`;
      document.getElementById('archGList').innerHTML=groups.map(g=>`<div class="li" id="ag${g.id}">${faCircle('fa-solid fa-users','var(--oks)','var(--ok)')}<div style="flex:1;margin-left:12px"><div style="font-weight:700">${g.name}</div><div style="font-size:12px;color:var(--tx3)">${g.subject?.name||''}</div></div><i class="fa-solid fa-chevron-right" style="color:var(--bdr)"></i></div>`).join('');
      groups.forEach(g=>{document.getElementById('ag'+g.id)?.addEventListener('click',()=>showGroup(g,groups));});
    }else{
      el.innerHTML=`<div class="tabs-bar"><button class="tab-item" id="tabAct"><i class="fa-solid fa-circle-check"></i> Faol</button><button class="tab-item on" id="tabArch"><i class="fa-solid fa-box-archive"></i> Arxiv</button></div>${ldHtml()}`;
      const all=await Promise.all(groups.map(g=>G('/groups/'+g.id+'/students?status=archived').then(sts=>({g,sts})).catch(()=>({g,sts:[]}))));
      const hasData=all.filter(x=>x.sts.length>0);
      const dv=el.querySelector('.spinner').closest('div');
      if(dv) dv.outerHTML=hasData.length===0?`<div class="empty"><div class="empty-ico"><i class="fa-solid fa-box-archive" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">Arxiv bo'sh</div></div>`:hasData.map(({g,sts})=>`<div style="margin-bottom:14px"><div class="st"><i class="fa-solid fa-users"></i> ${g.name} — ${g.subject?.name||''}</div><div class="card">${sts.map(s=>`<div class="li">${avHtml(s.firstName,s.lastName)}<div style="flex:1;margin-left:12px"><div style="font-weight:700">${s.firstName} ${s.lastName}</div><div style="font-size:12px;color:var(--tx3)">${s.phoneSelf||s.phoneFather||'—'}</div></div><button class="btn bp bsm" id="rest${s.id}x${g.id}">Qaytarish</button></div>`).join('')}</div></div>`).join('');
      hasData.forEach(({g,sts})=>{sts.forEach(s=>{document.getElementById('rest'+s.id+'x'+g.id)?.addEventListener('click',async()=>{try{await P('/students/'+s.id+'/groups',{groupId:g.id});toast('Qaytarildi ✅','success');load();}catch(e){toast(e.message,'error');}});});});
    }
    document.getElementById('tabAct')?.addEventListener('click',()=>{tab='active';load();});
    document.getElementById('tabArch')?.addEventListener('click',()=>{tab='archived';load();});
  }
  async function showGroup(g,allGroups){
    const sts=await G('/groups/'+g.id+'/students');
    el.innerHTML=`<button class="back-btn" id="archBk"><i class="fa-solid fa-arrow-left"></i> Orqaga</button>
      <div style="font-size:18px;font-weight:800;margin-bottom:4px">${g.name}</div>
      <div style="font-size:13px;color:var(--tx2);margin-bottom:14px">${g.subject?.name||''}</div>
      ${sts.length===0?`<div class="empty"><div class="empty-ico"><i class="fa-solid fa-users" style="font-size:52px;color:var(--tx3)"></i></div><div class="empty-txt">O'quvchilar yo'q</div></div>`:`<div class="card">${sts.map(s=>`<div class="li">${avHtml(s.firstName,s.lastName)}<div style="flex:1;margin-left:12px"><div style="font-weight:700">${s.firstName} ${s.lastName}</div><div style="font-size:12px;color:var(--tx3)">${s.phoneSelf||s.phoneFather||'—'}</div></div><button class="btn bd bsm" id="archd${s.id}"><i class="fa-solid fa-box-archive"></i></button></div>`).join('')}</div>`}`;
    document.getElementById('archBk')?.addEventListener('click',load);
    sts.forEach(s=>{document.getElementById('archd'+s.id)?.addEventListener('click',async()=>{try{await D('/students/'+s.id+'/groups/'+g.id);toast('Arxivlandi','success');showGroup(g,allGroups);}catch(e){toast(e.message,'error');}});});
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
    nav('applist');
  } catch(e) {
    document.getElementById('loading').innerHTML = `<div class="ld-ico"><i class="fa-solid fa-lock" style="color:var(--p)"></i></div><div style="font-size:18px;font-weight:800;color:var(--tx);margin-top:8px">Qabulxona</div><div style="font-size:14px;color:var(--tx2);margin-top:8px;text-align:center;padding:0 20px">Kirish uchun botda /start bosing</div>`;
  }
}
init();

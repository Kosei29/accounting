// Accounting special-flow + integrity v2
(function(){
  const origOpenTxn=window.openTxn;
  const origTxnType=window.txnType;
  window.txnType=function(old={}){
    origTxnType(old);
    const sel=document.getElementById('tc');
    if(sel)[...sel.options].forEach(o=>{if(['Debt Payment','Money Lent','Receivable Payment'].includes(o.textContent))o.remove()});
    const debt=document.getElementById('tdebt');if(debt&&!old.debtId)debt.closest('label')?.remove();
  };
  window.openTxn=function(existing=null){if(existing&&(existing.debtId||existing.receivableId)){alert('Special transactions are managed from the Debts or Receivables page.');return}return origOpenTxn(existing)};

  function snap(){return JSON.stringify({accounts,transactions,debts,receivables,rTx})}
  function restore(s){const x=JSON.parse(s);accounts.splice(0,accounts.length,...x.accounts);transactions.splice(0,transactions.length,...x.transactions);debts.splice(0,debts.length,...x.debts);receivables.splice(0,receivables.length,...x.receivables);rTx.splice(0,rTx.length,...x.rTx);save()}
  function atomic(label,mutate){const before=snap();try{mutate();rebuild();const a=window.integrityAudit?.();if(a?.issues?.length)throw new Error(a.issues.join(' '));toast(label);return true}catch(e){restore(before);alert(`Nothing was saved. ${e.message||'The operation failed.'}`);return false}}
  function uid(p){return p+Date.now()+Math.random().toString(36).slice(2,7)}
  function today(){return new Date().toISOString().slice(0,10)}

  window.openDebtPayment=function(id){
    const d=debts.find(x=>x.id===id);if(!d||d.balance<=0)return;
    const unlinked=transactions.filter(x=>x.type==='expense'&&x.category==='Debt Payment'&&!x.debtId);
    const linkBox=unlinked.length?`<div class="account" style="margin-bottom:10px"><b>Existing unlinked Debt Payment</b><div class="debt-meta">You already have ${unlinked.length} payment transaction${unlinked.length>1?'s':''} not attached to a debt.</div><select id="fix_link_tx">${unlinked.map(x=>`<option value="${x.id}">${esc(x.date)} · ${money(x.amount)} · ${esc(x.description||'Debt Payment')}</option>`).join('')}</select><button class="btn secondary" style="margin-top:8px" onclick="fixLinkDebtPayment('${id}')">Link Existing Payment</button></div>`:'';
    modal(`<h2>Pay Debt</h2><div class="form">${linkBox}<label>Debt<input value="${esc(d.name)} — ${money(d.balance)} remaining" disabled></label><label>Amount Paid<input id="fix_dpa" type="number" min="1" max="${d.balance}" step="1"></label><label>Date<input id="fix_dpd" type="date" value="${today()}"></label><label>Pay From<select id="fix_dpc">${accounts.map(a=>`<option value="${a.id}">${esc(a.name)} — ${money(a.balance)}</option>`).join('')}</select></label><label>Details<input id="fix_dpn" placeholder="Optional note"></label><div class="form-actions"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="fixRecordDebtPayment('${id}')">Record Debt Payment</button></div></div>`);
  };
  window.fixLinkDebtPayment=function(id){
    const d=debts.find(x=>x.id===id),txId=document.getElementById('fix_link_tx')?.value,tx=transactions.find(x=>x.id===txId);
    if(!d||!tx||tx.debtId)return alert('That payment cannot be linked.');
    if(+tx.amount>d.balance)return alert('That payment is larger than this debt balance.');
    if(atomic(`${money(tx.amount)} payment linked to ${d.name}`,()=>{tx.debtId=id;tx.metadata={...(tx.metadata||{}),special_kind:'debt_payment',linked_at:new Date().toISOString()}}))closeModal(),nav('debts');
  };
  window.fixRecordDebtPayment=function(id){
    const d=debts.find(x=>x.id===id),amt=+document.getElementById('fix_dpa').value||0,acct=document.getElementById('fix_dpc').value,a=getAccount(acct);
    if(!d||amt<=0||amt>d.balance)return alert('Enter a valid payment amount');if(!a||+a.balance<amt)return alert('Insufficient funds in the selected account');
    const date=document.getElementById('fix_dpd').value,notes=document.getElementById('fix_dpn').value.trim();
    if(atomic(`${money(amt)} payment recorded for ${d.name}`,()=>{transactions.push({id:uid('t'),date,type:'expense',category:'Debt Payment',account:acct,amount:amt,description:notes||`Payment for ${d.name}`,debtId:id,metadata:{special_kind:'debt_payment'}})}))closeModal(),nav('debts');
  };

  window.fixOpenReceivable=function(){
    modal(`<h2>New Receivable</h2><div class="form"><label>Person<input id="fix_rp" placeholder="Who owes you?"></label><label>Amount Lent<input id="fix_ra" type="number" min="1" step="1"></label><label>Date<input id="fix_rd" type="date" value="${today()}"></label><label>Lend From<select id="fix_rac">${accounts.map(a=>`<option value="${a.id}">${esc(a.name)} — ${money(a.balance)}</option>`).join('')}</select></label><label>Due Date <span class="muted">optional</span><input id="fix_rdue" type="date"></label><label>Notes <span class="muted">optional</span><input id="fix_rn"></label><div class="form-actions"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="fixLend()">Record Lent Money</button></div></div>`);
  };
  window.fixLend=function(){
    const person=document.getElementById('fix_rp').value.trim(),amt=+document.getElementById('fix_ra').value||0,acct=document.getElementById('fix_rac').value,a=getAccount(acct);
    if(!person||amt<=0)return alert('Enter a person and amount');if(!a||+a.balance<amt)return alert('Insufficient funds in the selected account');
    const date=document.getElementById('fix_rd').value,notes=document.getElementById('fix_rn').value.trim(),dueDate=document.getElementById('fix_rdue').value,id=uid('r');
    if(atomic(`${money(amt)} lent to ${person}`,()=>{receivables.push({id,person,original:amt,balance:amt,date,dueDate,notes});rTx.push({id:uid('rt'),date,type:'lend',receivableId:id,account:a.name,amount:amt,description:notes||`Money lent to ${person}`,metadata:{special_kind:'receivable_lend'}});transactions.push({id:uid('t'),date,type:'expense',category:'Money Lent',account:acct,amount:amt,description:notes||`Money lent to ${person}`,receivableId:id,metadata:{special_kind:'receivable_lend'}})}))closeModal(),nav('receivables');
  };

  window.fixReceivePayment=function(id){
    const r=receivables.find(x=>x.id===id);if(!r||r.balance<=0)return;
    modal(`<h2>Receive Payment</h2><div class="form"><label>Person<input value="${esc(r.person)}" disabled></label><label>Remaining<input value="${money(r.balance)}" disabled></label><label>Amount Received<input id="fix_pa" type="number" min="1" max="${r.balance}" step="1"></label><label>Date<input id="fix_pd" type="date" value="${today()}"></label><label>Receive Into<select id="fix_pac">${accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label><label>Notes<input id="fix_pn"></label><div class="form-actions"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="fixRecordPayment('${id}')">Record Payment</button></div></div>`);
  };
  window.fixRecordPayment=function(id){
    const r=receivables.find(x=>x.id===id),amt=+document.getElementById('fix_pa').value||0,acct=document.getElementById('fix_pac').value,a=getAccount(acct);
    if(!r||amt<=0||amt>r.balance)return alert('Enter a valid payment amount');if(!a)return alert('Choose a receiving account');
    const date=document.getElementById('fix_pd').value,notes=document.getElementById('fix_pn').value.trim();
    if(atomic(`${money(amt)} received from ${r.person}`,()=>{rTx.push({id:uid('rt'),date,type:'payment',receivableId:id,account:a.name,amount:amt,description:notes||`Payment from ${r.person}`,metadata:{special_kind:'receivable_payment'}});transactions.push({id:uid('t'),date,type:'income',category:'Receivable Payment',account:acct,amount:amt,description:notes||`Payment from ${r.person}`,receivableId:id,metadata:{special_kind:'receivable_payment'}})}))closeModal(),nav('receivables');
  };

  const oldDashboard=window.dashboard;window.dashboard=function(){oldDashboard();const cards=document.querySelectorAll('.cards .card .value');if(cards.length>=3){const inc=transactions.filter(x=>x.type==='income'&&!x.receivableId).reduce((s,x)=>s+ +x.amount,0),exp=transactions.filter(x=>x.type==='expense'&&!x.debtId&&!x.receivableId).reduce((s,x)=>s+ +x.amount,0);cards[1].textContent=money(inc);cards[2].textContent=money(exp)}};
  const oldStatistics=window.statistics;window.statistics=function(){oldStatistics();const ex=transactions.filter(x=>x.type==='expense'&&!x.debtId&&!x.receivableId),sum=ex.reduce((s,x)=>s+ +x.amount,0),by={};ex.forEach(x=>by[x.category]=(by[x.category]||0)+ +x.amount);const rows=Object.entries(by).sort((a,b)=>b[1]-a[1]),big=ex.slice().sort((a,b)=>b.amount-a.amount)[0],days={};ex.forEach(x=>days[x.date]=(days[x.date]||0)+ +x.amount);const peak=Object.entries(days).sort((a,b)=>b[1]-a[1])[0],avg=ex.length?sum/ex.length:0,cards=document.querySelectorAll('.cards .card .value');if(cards.length>=4){cards[0].textContent=money(sum);cards[1].textContent=money(avg);cards[2].textContent=money(big?.amount||0);cards[3].textContent=peak?peak[0]:'—'}const chart=document.querySelector('.chart');if(chart)chart.innerHTML=rows.slice(0,10).map(([c,v])=>`<div class="chartrow"><span>${esc(c)}</span><div class="bar"><span style="width:${sum?v/sum*100:0}%"></span></div><b>${money(v)}</b></div>`).join('')||'<div class="empty">No spending data yet.</div>'};
  const oldDebtsPage=window.debtsPage;window.debtsPage=function(){oldDebtsPage();document.querySelectorAll('.debt-card .actions .btn').forEach(b=>{const m=(b.getAttribute('onclick')||'').match(/openTxn\('([^']+)'\)/);if(m)b.setAttribute('onclick',`openDebtPayment('${m[1]}')`)})};
  const oldReceivablesPage=window.receivablesPage;window.receivablesPage=function(){oldReceivablesPage();document.querySelectorAll('.receivable-card .actions .btn').forEach(b=>{const m=(b.getAttribute('onclick')||'').match(/receivePayment\('([^']+)'\)/);if(m)b.setAttribute('onclick',`fixReceivePayment('${m[1]}')`)})};
  window.openReceivable=window.fixOpenReceivable;window.receivePayment=window.fixReceivePayment;
  nav('dashboard');
})();

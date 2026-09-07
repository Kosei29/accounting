// Accounting special-flow fix: debt and receivable actions create linked ledger transactions.
(function(){
  const origOpenTxn=window.openTxn;
  const origTxnType=window.txnType;
  window.txnType=function(old={}){
    origTxnType(old);
    const sel=document.getElementById('tc');
    if(sel){[...sel.options].forEach(o=>{if(['Debt Payment','Money Lent','Receivable Payment'].includes(o.textContent))o.remove()});}
    const debt=document.getElementById('tdebt'); if(debt && !old.debtId) debt.closest('label')?.remove();
  };
  window.openTxn=function(existing=null){ if(existing && (existing.debtId||existing.receivableId)){ alert('Special transactions are managed from the Debts or Receivables page.'); return; } return origOpenTxn(existing); };
  window.openDebtPayment=function(id){
    const d=debts.find(x=>x.id===id); if(!d||d.balance<=0)return;
    modal(`<h2>Pay Debt</h2><div class="form"><label>Debt<input value="${esc(d.name)} — ${money(d.balance)} remaining" disabled></label><label>Amount Paid<input id="fix_dpa" type="number" min="1" max="${d.balance}" step="1"></label><label>Date<input id="fix_dpd" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>Pay From<select id="fix_dpc">${accounts.map(a=>`<option value="${a.id}">${esc(a.name)} — ${money(a.balance)}</option>`).join('')}</select></label><label>Details<input id="fix_dpn" placeholder="Optional note"></label><div class="form-actions"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="fixRecordDebtPayment('${id}')">Record Debt Payment</button></div></div>`);
  };
  window.fixRecordDebtPayment=function(id){
    const d=debts.find(x=>x.id===id), amt=+document.getElementById('fix_dpa').value||0, acct=document.getElementById('fix_dpc').value, a=getAccount(acct);
    if(!d||amt<=0||amt>d.balance)return alert('Enter a valid payment amount');
    if(!a||+a.balance<amt)return alert('Insufficient funds in the selected account');
    transactions.push({id:'t'+Date.now(),date:document.getElementById('fix_dpd').value,type:'expense',category:'Debt Payment',account:acct,amount:amt,description:document.getElementById('fix_dpn').value.trim()||`Payment for ${d.name}`,debtId:id});
    rebuild();closeModal();toast(`${money(amt)} payment recorded for ${d.name}`);nav('debts');
  };
  window.fixOpenReceivable=function(){
    modal(`<h2>New Receivable</h2><div class="form"><label>Person<input id="fix_rp" placeholder="Who owes you?"></label><label>Amount Lent<input id="fix_ra" type="number" min="1" step="1"></label><label>Date<input id="fix_rd" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>Lend From<select id="fix_rac">${accounts.map(a=>`<option value="${a.id}">${esc(a.name)} — ${money(a.balance)}</option>`).join('')}</select></label><label>Due Date <span class="muted">optional</span><input id="fix_rdue" type="date"></label><label>Notes <span class="muted">optional</span><input id="fix_rn"></label><div class="form-actions"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="fixLend()">Record Lent Money</button></div></div>`);
  };
  window.fixLend=function(){
    const person=document.getElementById('fix_rp').value.trim(),amt=+document.getElementById('fix_ra').value||0,acct=document.getElementById('fix_rac').value,a=getAccount(acct);
    if(!person||amt<=0)return alert('Enter a person and amount'); if(!a||+a.balance<amt)return alert('Insufficient funds in the selected account');
    const id='r'+Date.now(),date=document.getElementById('fix_rd').value,notes=document.getElementById('fix_rn').value.trim();
    receivables.push({id,person,original:amt,balance:amt,date,dueDate:document.getElementById('fix_rdue').value,notes});
    rTx.push({id:'rt'+Date.now(),date,type:'lend',receivableId:id,account:a.name,amount:amt,description:notes||`Money lent to ${person}`});
    transactions.push({id:'t'+Date.now(),date,type:'expense',category:'Money Lent',account:acct,amount:amt,description:notes||`Money lent to ${person}`,receivableId:id});
    rebuild();closeModal();toast(`${money(amt)} lent to ${person}; account reduced and receivable created`);nav('receivables');
  };
  window.fixReceivePayment=function(id){
    const r=receivables.find(x=>x.id===id); if(!r||r.balance<=0)return;
    modal(`<h2>Receive Payment</h2><div class="form"><label>Person<input value="${esc(r.person)}" disabled></label><label>Remaining<input value="${money(r.balance)}" disabled></label><label>Amount Received<input id="fix_pa" type="number" min="1" max="${r.balance}" step="1"></label><label>Date<input id="fix_pd" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>Receive Into<select id="fix_pac">${accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label><label>Notes<input id="fix_pn"></label><div class="form-actions"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="fixRecordPayment('${id}')">Record Payment</button></div></div>`);
  };
  window.fixRecordPayment=function(id){
    const r=receivables.find(x=>x.id===id),amt=+document.getElementById('fix_pa').value||0,acct=document.getElementById('fix_pac').value,a=getAccount(acct);
    if(!r||amt<=0||amt>r.balance)return alert('Enter a valid payment amount'); if(!a)return alert('Choose a receiving account');
    const date=document.getElementById('fix_pd').value,notes=document.getElementById('fix_pn').value.trim();
    rTx.push({id:'rt'+Date.now(),date,type:'payment',receivableId:id,account:a.name,amount:amt,description:notes||`Payment from ${r.person}`});
    transactions.push({id:'t'+Date.now(),date,type:'income',category:'Receivable Payment',account:acct,amount:amt,description:notes||`Payment from ${r.person}`,receivableId:id});
    rebuild();closeModal();toast(`${money(amt)} received from ${r.person}; account increased and receivable reduced`);nav('receivables');
  };
  const oldDebtsPage=window.debtsPage;
  window.debtsPage=function(){ oldDebtsPage(); document.querySelectorAll('.debt-card .actions .btn').forEach(b=>{const m=(b.getAttribute('onclick')||'').match(/openTxn\('([^']+)'\)/); if(m)b.setAttribute('onclick',`openDebtPayment('${m[1]}')`);}); };
  const oldReceivablesPage=window.receivablesPage;
  window.receivablesPage=function(){ oldReceivablesPage(); document.querySelectorAll('.receivable-card .actions .btn').forEach(b=>{const m=(b.getAttribute('onclick')||'').match(/receivePayment\('([^']+)'\)/); if(m)b.setAttribute('onclick',`fixReceivePayment('${m[1]}')`);}); };
  window.openReceivable=window.fixOpenReceivable;
  window.receivePayment=window.fixReceivePayment;
  nav('dashboard');
})();

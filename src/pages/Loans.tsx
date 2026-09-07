import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../features/auth/AuthProvider'
import type { Account, Loan } from '../types/database.types'

const peso = (n: number) => `₱${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)
const assets = (accounts: Account[]) => accounts.filter(a => !a.is_system && !['income','expense','loan','credit_card','other_liability','equity'].includes(a.account_type))

export function Loans() {
  const { session } = useAuth()
  const [items,setItems] = useState<Loan[]>([])
  const [accounts,setAccounts] = useState<Account[]>([])
  const [name,setName] = useState(''); const [lender,setLender] = useState(''); const [principal,setPrincipal] = useState('')
  const [rate,setRate] = useState('0'); const [account,setAccount] = useState(''); const [date,setDate] = useState(today()); const [dueDate,setDueDate] = useState(''); const [message,setMessage] = useState('')
  const [principalPay,setPrincipalPay] = useState<Record<string,string>>({}); const [interestPay,setInterestPay] = useState<Record<string,string>>({}); const [paymentAccount,setPaymentAccount] = useState<Record<string,string>>({})

  async function load() {
    const [{data:l},{data:a}] = await Promise.all([
      supabase.from('loans').select('*').order('start_date',{ascending:false}),
      supabase.from('accounts').select('*').eq('status','active').order('name')
    ])
    const ac=assets((a??[]) as Account[]); setItems((l??[]) as Loan[]); setAccounts((a??[]) as Account[]); if(!account&&ac[0]) setAccount(ac[0].id)
  }
  useEffect(()=>{if(session)load()},[session])

  async function addLoan(event: FormEvent) {
    event.preventDefault(); setMessage(''); const value=Number(principal)
    if(!name.trim()||!lender.trim()||value<=0||!account)return setMessage('Enter the loan, lender, principal, and receiving account.')
    const {error}=await supabase.rpc('create_loan',{p_name:name.trim(),p_lender:lender.trim(),p_principal:value,p_account_id:account,p_interest_rate:Number(rate)||0,p_date:date,p_due_date:dueDate||null})
    if(error)setMessage(error.message); else {setMessage('Loan received. Cash increased and the loan liability was recorded.');setName('');setLender('');setPrincipal('');setDueDate('');await load()}
  }
  async function pay(id:string) {
    setMessage(''); const p=Number(principalPay[id])||0; const i=Number(interestPay[id])||0; const selected=paymentAccount[id]||assets(accounts)[0]?.id
    if(p+i<=0||!selected)return setMessage('Enter a principal or interest payment and account.')
    const {error}=await supabase.rpc('pay_loan',{p_loan_id:id,p_principal:p,p_interest:i,p_account_id:selected,p_date:today()})
    if(error)setMessage(error.message); else {setPrincipalPay(v=>({...v,[id]:''}));setInterestPay(v=>({...v,[id]:''}));setMessage('Loan payment recorded. Principal reduces the loan; interest is counted as an expense.');await load()}
  }
  const active=useMemo(()=>items.filter(x=>x.status==='active'),[items]); const total=active.reduce((s,x)=>s+Number(x.balance),0); const ac=assets(accounts)

  return <div className="page">
    <div className="page-header"><div><p className="eyebrow">Formal borrowing</p><h2>Loans</h2><p className="muted">Loans are separate from ordinary debts. Receiving principal increases cash and loan liability; principal repayment is not an expense, while interest is.</p></div></div>
    <section className="summary-grid">
      <article className="summary-card"><span>Loan principal remaining</span><strong>{peso(total)}</strong></article>
      <article className="summary-card"><span>Active loans</span><strong>{active.length}</strong></article>
      <article className="summary-card"><span>Paid off</span><strong>{items.filter(x=>x.status==='paid').length}</strong></article>
    </section>
    <form className="panel form-grid" onSubmit={addLoan} style={{marginTop:18}}>
      <label>Loan name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Personal loan" required /></label>
      <label>Lender<input value={lender} onChange={e=>setLender(e.target.value)} placeholder="Bank / person" required /></label>
      <label>Principal<input type="number" min="0.01" step="0.01" value={principal} onChange={e=>setPrincipal(e.target.value)} required /></label>
      <label>Interest rate %<input type="number" min="0" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} /></label>
      <label>Receive into<select value={account} onChange={e=>setAccount(e.target.value)}>{ac.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>Start date<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
      <label>Due date<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} /></label>
      <button>Record loan</button>
    </form>
    {message&&<p className={message.includes('recorded')||message.includes('increased')?'success':'error'}>{message}</p>}
    <section className="cards">
      {items.length===0?<div className="panel"><strong>No loans yet.</strong><p className="muted">Use this for formal borrowing with principal and optional interest.</p></div>:items.map(l=><article className="card" key={l.id}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12}}><div><strong style={{fontSize:18}}>{l.name}</strong><small>{l.lender} · {l.status} · {Number(l.interest_rate)}% interest</small></div><strong>{peso(l.balance)}</strong></div>
        <div className="muted">Principal {peso(l.principal)} · Started {new Date(l.start_date).toLocaleDateString()}{l.due_date?` · Due ${new Date(l.due_date).toLocaleDateString()}`:''}</div>
        {l.status==='active'&&<div className="form-grid" style={{marginTop:6}}>
          <label>Principal<input type="number" min="0" max={l.balance} step="0.01" value={principalPay[l.id]||''} onChange={e=>setPrincipalPay(v=>({...v,[l.id]:e.target.value}))} placeholder="0" /></label>
          <label>Interest<input type="number" min="0" step="0.01" value={interestPay[l.id]||''} onChange={e=>setInterestPay(v=>({...v,[l.id]:e.target.value}))} placeholder="0" /></label>
          <label>Pay from<select value={paymentAccount[l.id]||ac[0]?.id||''} onChange={e=>setPaymentAccount(v=>({...v,[l.id]:e.target.value}))}>{ac.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <button type="button" onClick={()=>pay(l.id)}>Pay loan</button>
        </div>}
      </article>)}
    </section>
  </div>
}

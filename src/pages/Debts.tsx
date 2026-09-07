import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../features/auth/AuthProvider'
import type { Account, Debt } from '../types/database.types'

const peso = (n: number) => `₱${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)
const assets = (accounts: Account[]) => accounts.filter(a => !a.is_system && !['income','expense','loan','credit_card','other_liability','equity'].includes(a.account_type))

export function Debts() {
  const { session } = useAuth()
  const [items, setItems] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [name, setName] = useState('')
  const [creditor, setCreditor] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [message, setMessage] = useState('')
  const [payment, setPayment] = useState<Record<string,string>>({})
  const [paymentAccount, setPaymentAccount] = useState<Record<string,string>>({})

  async function load() {
    const [{ data: d }, { data: a }] = await Promise.all([
      supabase.from('debts').select('*').order('incurred_date', { ascending: false }),
      supabase.from('accounts').select('*').eq('status', 'active').order('name'),
    ])
    setItems((d ?? []) as Debt[]); setAccounts((a ?? []) as Account[])
  }
  useEffect(() => { if (session) load() }, [session])

  async function addDebt(event: FormEvent) {
    event.preventDefault(); setMessage('')
    const value = Number(amount)
    if (!name.trim() || !creditor.trim() || value <= 0) return setMessage('Enter the debt name, creditor, and amount.')
    const { error } = await supabase.rpc('create_debt', { p_name:name.trim(), p_creditor:creditor.trim(), p_amount:value, p_date:date, p_due_date:dueDate || null })
    if (error) setMessage(error.message)
    else { setMessage('Debt recorded. It is now a liability, not a cash expense until paid.'); setName(''); setCreditor(''); setAmount(''); setDueDate(''); await load() }
  }

  async function pay(id: string) {
    setMessage('')
    const value = Number(payment[id]); const selected = paymentAccount[id] || assets(accounts)[0]?.id
    if (value <= 0 || !selected) return setMessage('Enter a payment amount and account.')
    const { error } = await supabase.rpc('pay_debt', { p_debt_id:id, p_amount:value, p_account_id:selected, p_date:today() })
    if (error) setMessage(error.message)
    else { setPayment(v=>({...v,[id]:''})); setMessage('Debt payment recorded and cash reduced.'); await load() }
  }

  const active = useMemo(() => items.filter(x => x.status === 'active'), [items])
  const total = active.reduce((s,x)=>s+Number(x.balance),0)
  const ac = assets(accounts)

  return <div className="page">
    <div className="page-header"><div><p className="eyebrow">Money you owe</p><h2>Debts</h2><p className="muted">Ordinary unpaid obligations. Recording a debt creates the expense and liability; paying it later reduces cash and the liability.</p></div></div>
    <section className="summary-grid">
      <article className="summary-card"><span>Debt remaining</span><strong>{peso(total)}</strong></article>
      <article className="summary-card"><span>Active debts</span><strong>{active.length}</strong></article>
      <article className="summary-card"><span>Paid off</span><strong>{items.filter(x=>x.status==='paid').length}</strong></article>
    </section>
    <form className="panel form-grid" onSubmit={addDebt} style={{marginTop:18}}>
      <label>Debt name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Internet bill" required /></label>
      <label>Creditor<input value={creditor} onChange={e=>setCreditor(e.target.value)} placeholder="Provider" required /></label>
      <label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required /></label>
      <label>Incurred date<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
      <label>Due date<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} /></label>
      <button>Record debt</button>
    </form>
    {message && <p className={message.includes('recorded') || message.includes('reduced') ? 'success' : 'error'}>{message}</p>}
    <section className="cards">
      {items.length===0 ? <div className="panel"><strong>No debts yet.</strong><p className="muted">Use this for obligations you already owe but have not paid.</p></div> : items.map(d => <article className="card" key={d.id}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12}}><div><strong style={{fontSize:18}}>{d.name}</strong><small>Owe {d.creditor} · {d.status}</small></div><strong>{peso(d.balance)}</strong></div>
        <div className="muted">Original {peso(d.original_amount)} · Incurred {new Date(d.incurred_date).toLocaleDateString()}{d.due_date ? ` · Due ${new Date(d.due_date).toLocaleDateString()}` : ''}</div>
        {d.status==='active' && <div className="form-grid" style={{marginTop:6}}>
          <label>Pay<input type="number" min="0.01" max={d.balance} step="0.01" value={payment[d.id]||''} onChange={e=>setPayment(v=>({...v,[d.id]:e.target.value}))} placeholder={String(d.balance)} /></label>
          <label>Pay from<select value={paymentAccount[d.id]||ac[0]?.id||''} onChange={e=>setPaymentAccount(v=>({...v,[d.id]:e.target.value}))}>{ac.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <button type="button" onClick={()=>pay(d.id)}>Pay debt</button>
        </div>}
      </article>)}
    </section>
  </div>
}

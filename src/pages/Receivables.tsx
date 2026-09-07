import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../features/auth/AuthProvider'
import type { Account, Receivable } from '../types/database.types'

const peso = (n: number) => `₱${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)
const assets = (accounts: Account[]) => accounts.filter(a => !a.is_system && !['income','expense','loan','credit_card','other_liability','equity'].includes(a.account_type))

export function Receivables() {
  const { session } = useAuth()
  const [items, setItems] = useState<Receivable[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [person, setPerson] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [account, setAccount] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [payment, setPayment] = useState<Record<string,string>>({})
  const [paymentAccount, setPaymentAccount] = useState<Record<string,string>>({})

  async function load() {
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from('receivables').select('*').order('lent_date', { ascending: false }),
      supabase.from('accounts').select('*').eq('status', 'active').order('name'),
    ])
    const ac = assets((a ?? []) as Account[])
    setItems((r ?? []) as Receivable[])
    setAccounts((a ?? []) as Account[])
    if (!account && ac[0]) setAccount(ac[0].id)
  }

  useEffect(() => { if (session) load() }, [session])

  async function lend(event: FormEvent) {
    event.preventDefault(); setMessage('')
    const value = Number(amount)
    if (!person.trim() || value <= 0 || !account) return setMessage('Enter the person, amount, and account.')
    const { error } = await supabase.rpc('create_receivable', {
      p_person: person.trim(), p_amount: value, p_account_id: account,
      p_date: date, p_due_date: dueDate || null, p_notes: notes.trim() || null,
    })
    if (error) setMessage(error.message)
    else { setMessage('Money lent and account balance updated.'); setPerson(''); setAmount(''); setNotes(''); setDueDate(''); await load() }
  }

  async function collect(id: string) {
    setMessage('')
    const value = Number(payment[id])
    const selected = paymentAccount[id] || assets(accounts)[0]?.id
    if (value <= 0 || !selected) return setMessage('Enter a payment amount and receiving account.')
    const { error } = await supabase.rpc('pay_receivable', { p_receivable_id: id, p_amount: value, p_account_id: selected, p_date: today() })
    if (error) setMessage(error.message)
    else { setPayment(v => ({ ...v, [id]: '' })); setMessage('Receivable payment recorded and account balance updated.'); await load() }
  }

  const active = useMemo(() => items.filter(x => x.status === 'active'), [items])
  const total = active.reduce((s, x) => s + Number(x.balance), 0)
  const ac = assets(accounts)

  return <div className="page">
    <div className="page-header"><div><p className="eyebrow">Money owed to you</p><h2>Receivables</h2><p className="muted">Money you lent out. Lending reduces cash and increases your receivable asset.</p></div></div>
    <section className="summary-grid">
      <article className="summary-card"><span>Owed to me</span><strong>{peso(total)}</strong></article>
      <article className="summary-card"><span>People owing</span><strong>{active.length}</strong></article>
      <article className="summary-card"><span>Accounting effect</span><strong>Cash → Receivable</strong></article>
    </section>

    <form className="panel form-grid" onSubmit={lend} style={{marginTop:18}}>
      <label>Person<input value={person} onChange={e => setPerson(e.target.value)} placeholder="Nanay" required /></label>
      <label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100" required /></label>
      <label>Lend from<select value={account} onChange={e => setAccount(e.target.value)}>{ac.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>Due date<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
      <label>Notes<input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></label>
      <button>Lend money</button>
    </form>
    {message && <p className={message.includes('updated') || message.includes('recorded') ? 'success' : 'error'}>{message}</p>}

    <section className="cards">
      {items.length === 0 ? <div className="panel"><strong>No receivables yet.</strong><p className="muted">Use this page whenever you lend someone money.</p></div> : items.map(r => {
        const selected = paymentAccount[r.id] || ac[0]?.id || ''
        return <article className="card" key={r.id}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12}}><div><strong style={{fontSize:18}}>{r.person}</strong><small>{r.status}</small></div><strong>{peso(r.balance)}</strong></div>
          <div className="muted">Original {peso(r.original_amount)} · Lent {new Date(r.lent_date).toLocaleDateString()}{r.due_date ? ` · Due ${new Date(r.due_date).toLocaleDateString()}` : ''}</div>
          {r.notes && <div className="muted">{r.notes}</div>}
          {r.status === 'active' && <div className="form-grid" style={{marginTop:6}}>
            <label>Payment<input type="number" min="0.01" max={r.balance} step="0.01" value={payment[r.id] || ''} onChange={e => setPayment(v => ({...v,[r.id]:e.target.value}))} placeholder={String(r.balance)} /></label>
            <label>Receive into<select value={selected} onChange={e => setPaymentAccount(v => ({...v,[r.id]:e.target.value}))}>{ac.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <button type="button" onClick={() => collect(r.id)}>Receive payment</button>
          </div>}
        </article>
      })}
    </section>
  </div>
}

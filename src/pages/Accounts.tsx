import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Account, AccountType } from '../types/database.types'
import { useAuth } from '../features/auth/AuthProvider'

const types: AccountType[] = ['cash','bank','ewallet','savings','investment','credit_card','other_asset','other_liability']
const peso = (n:number) => `₱${Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`

export function Accounts() {
  const { session } = useAuth()
  const [accounts,setAccounts] = useState<Account[]>([])
  const [name,setName] = useState('')
  const [type,setType] = useState<AccountType>('cash')
  const [opening,setOpening] = useState('0')
  const [error,setError] = useState('')

  async function load() {
    const {data,error}=await supabase.from('accounts').select('*').eq('is_system',false).order('name')
    if(error)setError(error.message); else setAccounts((data??[]) as Account[])
  }
  useEffect(()=>{if(session)load()},[session])

  async function addAccount(event:FormEvent) {
    event.preventDefault();setError('');if(!session||!name.trim())return
    const {error}=await supabase.from('accounts').insert({owner_id:session.user.id,name:name.trim(),account_type:type,opening_balance:Number(opening)||0,opening_balance_date:new Date().toISOString().slice(0,10),is_system:false})
    if(error)setError(error.message);else{setName('');setOpening('0');await load()}
  }

  return <div className="page">
    <div className="page-header"><div><p className="eyebrow">Where money lives</p><h2>Accounts</h2><p className="muted">Your spendable accounts live here. Accounting control accounts for debts, loans, receivables, income, and expenses stay in the background.</p></div></div>
    <form className="panel form-grid" onSubmit={addAccount}>
      <label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Cash on Hand" required /></label>
      <label>Type<select value={type} onChange={e=>setType(e.target.value as AccountType)}>{types.map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}</select></label>
      <label>Opening balance<input type="number" min="0" step="0.01" value={opening} onChange={e=>setOpening(e.target.value)} /></label>
      <button>Add account</button>
    </form>
    {error&&<p className="error">{error}</p>}
    <section className="cards">{accounts.length?accounts.map(account=><article className="card" key={account.id}><span>{account.name}</span><small>{account.account_type.replace('_',' ')}</small><strong>{peso(Number(account.opening_balance))}</strong></article>):<div className="panel"><strong>No accounts yet.</strong><p className="muted">Start with Cash on Hand, then add your bank or e-wallet accounts.</p></div>}</section>
  </div>
}

import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Account, Category, Transaction, TransactionType } from '../types/database.types'
import { useAuth } from '../features/auth/AuthProvider'

export function Transactions() {
  const { session } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [type, setType] = useState<TransactionType>('expense')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState('')
  const [category, setCategory] = useState('')
  const [fromAccount, setFromAccount] = useState('')
  const [toAccount, setToAccount] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    const [{ data: tx }, { data: ac }, { data: cat }] = await Promise.all([
      supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(30),
      supabase.from('accounts').select('*').eq('status', 'active').order('name'),
      supabase.from('categories').select('*').eq('active', true).order('name'),
    ])
    setTransactions((tx ?? []) as Transaction[])
    setAccounts((ac ?? []) as Account[])
    setCategories((cat ?? []) as Category[])
    const assetAccounts = (ac ?? []).filter(a => !['income', 'expense'].includes(a.account_type))
    if (!account && assetAccounts[0]) setAccount(assetAccounts[0].id)
    if (!fromAccount && assetAccounts[0]) setFromAccount(assetAccounts[0].id)
    if (!toAccount && assetAccounts[1]) setToAccount(assetAccounts[1].id)
  }

  useEffect(() => { if (session) load() }, [session])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    const value = Number(amount)
    if (!value || value <= 0 || !description.trim()) return setMessage('Enter a description and amount.')

    const assetAccounts = accounts.filter(a => !['income', 'expense'].includes(a.account_type))
    let debit = account
    let credit = account
    if (type === 'transfer') { debit = toAccount; credit = fromAccount }
    if (type === 'income') {
      const incomeAccount = accounts.find(a => a.account_type === 'income')
      if (!incomeAccount) return setMessage('Create an Income account first in Accounts.')
      debit = account; credit = incomeAccount.id
    }
    if (type === 'expense') {
      const expenseAccount = accounts.find(a => a.account_type === 'expense')
      if (!expenseAccount) return setMessage('Create an Expense account first in Accounts.')
      debit = expenseAccount.id; credit = account
    }
    if (!assetAccounts.length || !debit || !credit || debit === credit) return setMessage('Choose valid, different accounts.')

    const { error } = await supabase.rpc('post_transaction', {
      p_transaction_date: new Date().toISOString(),
      p_transaction_type: type,
      p_description: description.trim(),
      p_category_id: category || null,
      p_debit_account_id: debit,
      p_credit_account_id: credit,
      p_amount: value,
    })
    if (error) setMessage(error.message)
    else { setMessage('Transaction posted.'); setDescription(''); setAmount(''); await load() }
  }

  const assetAccounts = accounts.filter(a => !['income', 'expense'].includes(a.account_type))
  return <div className="page">
    <div className="page-header"><div><h2>Transactions</h2><p className="muted">Every movement becomes a balanced ledger entry.</p></div></div>
    <form className="panel form-grid" onSubmit={submit}>
      <label>Type<select value={type} onChange={e => setType(e.target.value as TransactionType)}><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option></select></label>
      <label>Description<input value={description} onChange={e => setDescription(e.target.value)} placeholder="Jeep fare" required /></label>
      <label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required /></label>
      {type !== 'transfer' ? <label>Account<select value={account} onChange={e => setAccount(e.target.value)}>{assetAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label> : <><label>From<select value={fromAccount} onChange={e => setFromAccount(e.target.value)}>{assetAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>To<select value={toAccount} onChange={e => setToAccount(e.target.value)}>{assetAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></>}
      <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="">None</option>{categories.filter(c => c.category_type === type || c.category_type === 'other').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <button>Post transaction</button>
    </form>
    {message && <p className={message.includes('posted') ? 'success' : 'error'}>{message}</p>}
    <section className="panel table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Status</th></tr></thead><tbody>{transactions.map(tx => <tr key={tx.id}><td>{new Date(tx.transaction_date).toLocaleDateString()}</td><td>{tx.transaction_type}</td><td>{tx.description}</td><td>{tx.status}</td></tr>)}</tbody></table></section>
  </div>
}

export type AccountType =
  | 'cash' | 'bank' | 'ewallet' | 'savings' | 'investment'
  | 'credit_card' | 'loan' | 'other_asset' | 'other_liability'
  | 'equity' | 'income' | 'expense'

export type AccountStatus = 'active' | 'inactive' | 'closed'
export type TransactionType = 'income' | 'expense' | 'transfer' | 'adjustment'
export type TransactionStatus = 'draft' | 'posted' | 'voided'
export type CategoryType = 'income' | 'expense' | 'transfer' | 'other'

export interface Account {
  id: string
  owner_id: string
  name: string
  account_type: AccountType
  status: AccountStatus
  currency: string
  opening_balance: number
  opening_balance_date: string
  description: string | null
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  owner_id: string
  name: string
  category_type: CategoryType
  parent_id: string | null
  active: boolean
  created_at: string
}

export interface Transaction {
  id: string
  owner_id: string
  transaction_no: number
  transaction_date: string
  transaction_type: TransactionType
  status: TransactionStatus
  description: string
  category_id: string | null
  reference_no: string | null
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  posted_at: string | null
  voided_at: string | null
  void_reason: string | null
}

export interface AccountBalance extends Account {
  balance: number
}

export interface Receivable {
  id: string
  owner_id: string
  person: string
  original_amount: number
  balance: number
  lent_date: string
  due_date: string | null
  notes: string | null
  status: 'active' | 'paid' | 'cancelled'
}

export interface Debt {
  id: string
  owner_id: string
  name: string
  creditor: string
  original_amount: number
  balance: number
  incurred_date: string
  due_date: string | null
  notes: string | null
  status: 'active' | 'paid' | 'cancelled'
}

export interface Loan {
  id: string
  owner_id: string
  name: string
  lender: string
  principal: number
  balance: number
  interest_rate: number
  start_date: string
  due_date: string | null
  notes: string | null
  status: 'active' | 'paid' | 'cancelled'
}

export interface PostTransactionInput {
  p_transaction_date: string
  p_transaction_type: TransactionType
  p_description: string
  p_category_id?: string | null
  p_debit_account_id: string
  p_credit_account_id: string
  p_amount: number
  p_reference_no?: string | null
  p_notes?: string | null
}

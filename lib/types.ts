// User types
export type UserRole = "ADMIN" | "SALES" | "ACCOUNTANT"

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  created_at: string
  updated_at: string
}

// Vehicle types
export type VehicleStatus = "AVAILABLE" | "PENDING" | "SOLD"

export interface Vehicle {
  id: string
  stock_number: string
  vin: string
  year: number
  make: string
  model: string
  trim?: string
  exterior_color?: string
  interior_color?: string
  colour?: string
  mileage: number
  odometer?: number
  purchase_price: number
  asking_price?: number
  selling_price?: number
  status: VehicleStatus
  date_acquired: string
  date_sold?: string
  notes?: string
  photos: string[]
  // Cost fields (Purchase & Costs section)
  tax_rate?: number
  miscellaneous_cost?: number
  safety_cost?: number
  safety_estimate?: number
  gas?: number
  warranty_cost?: number
  floorplan_interest_cost?: number
  // Sale fields (Sale Info section)
  safety_charge?: number
  warranty_charge?: number
  omvic_fee?: number
  registration_fee?: number  // Not taxable
  referral_amount?: number   // Not taxable - income to dealership
  buyer_name?: string
  payment_method?: string
  deposit_amount?: number
  salesperson_id?: string
  salesperson?: User
  deleted_at?: string
  created_at: string
  updated_at: string
}

// Vehicle calculation helpers
export interface VehicleCalculations {
  totalCost: number
  lotDays: number
  grossProfit: number
  netProfit: number
  profitMargin: number
}

// Customer types
export interface Customer {
  id: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  date_of_birth?: string
  drivers_license?: string
  notes?: string
  created_at: string
  updated_at: string
}

// Lead types
export type LeadStatus = "NEW_LEAD" | "CONTACTED" | "NEGOTIATING" | "CLOSED"
export type LeadSource = "WALK_IN" | "PHONE" | "WEB" | "REFERRAL" | "SOCIAL" | "OTHER"

export interface Lead {
  id: string
  customer_id: string
  assigned_to?: string
  status: LeadStatus
  source: LeadSource
  notes?: string
  created_at: string
  updated_at: string
  customer?: Customer
  assigned_user?: User
}

// Deal types
export type DealStage = "OPEN" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "CLOSED_WON" | "CLOSED_LOST"

export interface Deal {
  id: string
  deal_number: string
  vehicle_id: string
  lead_id?: string
  salesperson_id?: string
  stage: DealStage
  sale_price?: number
  trade_in_value?: number
  down_payment?: number
  gross_profit?: number
  deal_date?: string
  notes?: string
  created_at: string
  updated_at: string
  vehicle?: Vehicle
  lead?: Lead
  salesperson?: User
}

// Interaction types
export type InteractionChannel = "CALL" | "EMAIL" | "SMS" | "VISIT" | "NOTE" | "OTHER"

export interface Interaction {
  id: string
  lead_id: string
  user_id: string
  channel: InteractionChannel
  summary: string
  created_at: string
  user?: User
}

// Task types
export type TaskStatus = "OPEN" | "DONE" | "CANCELLED"

export interface Task {
  id: string
  lead_id: string
  assigned_to: string
  title: string
  description?: string
  due_date: string
  status: TaskStatus
  created_at: string
  updated_at: string
  assigned_user?: User
}

// Accounting types
export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE"
export type NormalBalance = "DEBIT" | "CREDIT"
export type JournalStatus = "DRAFT" | "POSTED"

export interface GLAccount {
  id: string
  code: string
  name: string
  account_type: AccountType
  normal_balance: NormalBalance
  parent_id?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface JournalEntry {
  id: string
  entry_number: string
  entry_date: string
  description: string
  status: JournalStatus
  deal_id?: string
  created_by: string
  posted_at?: string
  created_at: string
  updated_at: string
  line_items?: JournalLineItem[]
  created_by_user?: User
}

export interface JournalLineItem {
  id: string
  journal_entry_id: string
  account_id: string
  debit: number
  credit: number
  memo?: string
  created_at: string
  account?: GLAccount
}

// Vendor types
export interface Vendor {
  id: string
  name: string
  contact_name?: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// Vehicle Expense types
export type VehicleExpenseType = "REPAIR" | "PARTS" | "DETAILING" | "INSPECTION" | "TOWING" | "REGISTRATION" | "ADVERTISING" | "OTHER"

export interface VehicleExpense {
  id: string
  vehicle_id: string
  expense_date: string
  expense_type: VehicleExpenseType
  description: string
  notes?: string
  amount: number
  tax_amount: number
  total_amount: number
  is_taxable: boolean
  vendor_id?: string
  journal_entry_id?: string
  created_by?: string
  created_at: string
  updated_at: string
  vendor?: Vendor
  journal_entry?: JournalEntry
}

// Accounts Payable types
export type APARStatus = "UNPAID" | "PARTIAL" | "PAID"

export interface AccountsPayable {
  id: string
  vendor_id?: string
  vehicle_id?: string
  bill_number?: string
  bill_date: string
  due_date?: string
  description: string
  amount: number
  tax_amount: number
  total_amount: number
  amount_paid: number
  status: APARStatus
  journal_entry_id?: string
  payment_journal_entry_id?: string
  created_at: string
  updated_at: string
  vendor?: Vendor
  vehicle?: Vehicle
  journal_entry?: JournalEntry
}

// Accounts Receivable types
export interface AccountsReceivable {
  id: string
  customer_id?: string
  vehicle_id?: string
  deal_id?: string
  invoice_number: string
  invoice_date: string
  due_date?: string
  description: string
  subtotal: number
  tax_amount: number
  total_amount: number
  amount_paid: number
  status: APARStatus
  journal_entry_id?: string
  payment_journal_entry_id?: string
  created_at: string
  updated_at: string
  customer?: Customer
  vehicle?: Vehicle
  deal?: Deal
  journal_entry?: JournalEntry
}

// Accounting Summary types
export interface AccountingSummary {
  accountBalances: AccountBalance[]
  apSummary: {
    total: number
    paid: number
    outstanding: number
    unpaidCount: number
  }
  arSummary: {
    total: number
    collected: number
    outstanding: number
    unpaidCount: number
  }
  financials: {
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
    totalRevenue: number
    totalExpenses: number
    netIncome: number
    cashBalance: number
  }
  recentEntries: JournalEntry[]
}

export interface AccountBalance {
  code: string
  name: string
  type: AccountType
  normalBalance: NormalBalance
  debits: number
  credits: number
  balance: number
}

// Dashboard types
export interface DashboardStats {
  totalVehicles: number
  availableVehicles: number
  pendingVehicles: number
  soldVehicles: number
  totalDeals: number
  closedDeals: number
  totalRevenue: number
  totalProfit: number
  totalCost: number
  activeLeads: number
  conversionRate: number
  avgDaysOnLot: number
  avgProfitPerVehicle: number
}

export interface SalesTrend {
  month: string
  sales: number
  profit: number
  count: number
}

export interface InventoryFinancials {
  totalPurchaseCost: number
  totalSafetyCost: number
  totalWarrantyCost: number
  totalFloorplanCost: number
  totalGas: number
  totalInvestment: number
  potentialRevenue: number
  potentialProfit: number
}

-- DMS Database Schema for Supabase
-- This creates all the necessary tables for the Dealer Management System

-- Create custom ENUM types
CREATE TYPE user_role AS ENUM ('ADMIN', 'SALES', 'ACCOUNTANT');
CREATE TYPE vehicle_status AS ENUM ('AVAILABLE', 'PENDING', 'SOLD');
CREATE TYPE lead_status AS ENUM ('NEW_LEAD', 'CONTACTED', 'NEGOTIATING', 'CLOSED');
CREATE TYPE lead_source AS ENUM ('WALK_IN', 'PHONE', 'WEB', 'REFERRAL', 'SOCIAL', 'OTHER');
CREATE TYPE customer_vehicle_role AS ENUM ('INTERESTED', 'BUYER', 'CO_BUYER');
CREATE TYPE deal_stage AS ENUM ('OPEN', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');
CREATE TYPE interaction_channel AS ENUM ('CALL', 'EMAIL', 'SMS', 'VISIT', 'NOTE', 'OTHER');
CREATE TYPE crm_task_status AS ENUM ('OPEN', 'DONE', 'CANCELLED');
CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE normal_balance AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE journal_status AS ENUM ('DRAFT', 'POSTED');
CREATE TYPE audit_entity_type AS ENUM ('VEHICLE', 'DEAL');

-- Users table (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'SALES',
  supabase_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicles table (core inventory)
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_purchased DATE NOT NULL,
  vin TEXT NOT NULL,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT NOT NULL,
  colour TEXT NOT NULL,
  odometer INTEGER NOT NULL,
  status vehicle_status DEFAULT 'AVAILABLE',
  
  -- Purchase costs
  purchase_price DECIMAL(12, 2) NOT NULL,
  safety_estimate DECIMAL(12, 2),
  safety_cost DECIMAL(12, 2) DEFAULT 0,
  floorplan_interest_cost DECIMAL(12, 2) DEFAULT 0,
  gas DECIMAL(12, 2) DEFAULT 0,
  warranty_cost DECIMAL(12, 2) DEFAULT 0,
  
  -- Sale details
  date_sold DATE,
  selling_price DECIMAL(12, 2),
  safety_charge DECIMAL(12, 2),
  warranty_charge DECIMAL(12, 2),
  omvic_fee DECIMAL(12, 2),
  
  -- Buyer info
  buyer_name TEXT,
  referral_amount DECIMAL(12, 2) DEFAULT 0,
  payment_method TEXT,
  deposit_amount DECIMAL(12, 2),
  
  -- Salesperson
  sales_person_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sales_person_name TEXT,
  
  -- GL Journal references
  gl_revenue_journal_id UUID UNIQUE,
  gl_cogs_journal_id UUID UNIQUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_vehicles_date_sold ON vehicles(date_sold);
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_sales_person ON vehicles(sales_person_id);
CREATE INDEX idx_vehicles_vin ON vehicles(vin);
CREATE INDEX idx_vehicles_deleted ON vehicles(deleted_at);

-- Customers table (CRM)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_name ON customers(full_name);
CREATE INDEX idx_customers_deleted ON customers(deleted_at);

-- Customer-Vehicle links (many-to-many)
CREATE TABLE IF NOT EXISTS customer_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  role customer_vehicle_role DEFAULT 'INTERESTED',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, vehicle_id)
);

CREATE INDEX idx_customer_vehicles_vehicle ON customer_vehicles(vehicle_id);
CREATE INDEX idx_customer_vehicles_customer ON customer_vehicles(customer_id);

-- Leads table (sales pipeline)
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status lead_status DEFAULT 'NEW_LEAD',
  source lead_source DEFAULT 'OTHER',
  summary TEXT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_customer ON leads(customer_id);
CREATE INDEX idx_leads_vehicle ON leads(vehicle_id);
CREATE INDEX idx_leads_deleted ON leads(deleted_at);

-- Deals table (sales opportunities)
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value DECIMAL(12, 2),
  stage deal_stage DEFAULT 'OPEN',
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_deals_customer ON deals(customer_id);
CREATE INDEX idx_deals_vehicle ON deals(vehicle_id);
CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_deleted ON deals(deleted_at);

-- Customer Notes
CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_notes_customer ON customer_notes(customer_id);

-- Interaction Logs
CREATE TABLE IF NOT EXISTS interaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel interaction_channel NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_id UUID
);

CREATE INDEX idx_interaction_logs_customer ON interaction_logs(customer_id);
CREATE INDEX idx_interaction_logs_occurred ON interaction_logs(occurred_at);

-- CRM Tasks
CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  status crm_task_status DEFAULT 'OPEN',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_crm_tasks_customer ON crm_tasks(customer_id);
CREATE INDEX idx_crm_tasks_deal ON crm_tasks(deal_id);
CREATE INDEX idx_crm_tasks_due ON crm_tasks(due_at);
CREATE INDEX idx_crm_tasks_status ON crm_tasks(status);
CREATE INDEX idx_crm_tasks_deleted ON crm_tasks(deleted_at);

-- Vehicle Ledger Entries (simple accounting)
CREATE TABLE IF NOT EXISTS vehicle_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  occurred_on DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vehicle_ledger_vehicle ON vehicle_ledger_entries(vehicle_id);

-- GL Accounts (Chart of Accounts)
CREATE TABLE IF NOT EXISTS gl_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type account_type NOT NULL,
  normal_balance normal_balance NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT,
  parent_id UUID REFERENCES gl_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gl_accounts_type ON gl_accounts(type);
CREATE INDEX idx_gl_accounts_parent ON gl_accounts(parent_id);

-- Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_num SERIAL UNIQUE,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  memo TEXT,
  status journal_status DEFAULT 'DRAFT',
  posted_at TIMESTAMPTZ,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX idx_journal_entries_created ON journal_entries(created_at);
CREATE INDEX idx_journal_entries_status ON journal_entries(status);
CREATE INDEX idx_journal_entries_vehicle ON journal_entries(vehicle_id);

-- Add foreign key references to vehicles for GL journals
ALTER TABLE vehicles 
  ADD CONSTRAINT fk_gl_revenue_journal 
  FOREIGN KEY (gl_revenue_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL;
  
ALTER TABLE vehicles 
  ADD CONSTRAINT fk_gl_cogs_journal 
  FOREIGN KEY (gl_cogs_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL;

-- Journal Lines (double-entry)
CREATE TABLE IF NOT EXISTS journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  account_id UUID NOT NULL REFERENCES gl_accounts(id) ON DELETE RESTRICT,
  debit_amount DECIMAL(14, 2) DEFAULT 0,
  credit_amount DECIMAL(14, 2) DEFAULT 0,
  memo TEXT,
  UNIQUE(journal_entry_id, line_number)
);

CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);

-- Audit Log
CREATE TABLE IF NOT EXISTS entity_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type audit_entity_type NOT NULL,
  entity_id TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  changes JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON entity_audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON entity_audit_logs(created_at);
CREATE INDEX idx_audit_logs_actor ON entity_audit_logs(actor_user_id);

-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: All authenticated users can read/write for now
-- In production, you'd want role-based policies

-- Users policies
CREATE POLICY "Users can view all users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage users" ON users FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE supabase_user_id = auth.uid() AND role = 'ADMIN'));

-- Vehicles policies (all authenticated users)
CREATE POLICY "Authenticated users can view vehicles" ON vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert vehicles" ON vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update vehicles" ON vehicles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete vehicles" ON vehicles FOR DELETE TO authenticated USING (true);

-- Customers policies
CREATE POLICY "Authenticated users can view customers" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customers" ON customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customers" ON customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete customers" ON customers FOR DELETE TO authenticated USING (true);

-- Customer vehicles policies
CREATE POLICY "Authenticated users can view customer_vehicles" ON customer_vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customer_vehicles" ON customer_vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customer_vehicles" ON customer_vehicles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete customer_vehicles" ON customer_vehicles FOR DELETE TO authenticated USING (true);

-- Leads policies
CREATE POLICY "Authenticated users can view leads" ON leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert leads" ON leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update leads" ON leads FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete leads" ON leads FOR DELETE TO authenticated USING (true);

-- Deals policies
CREATE POLICY "Authenticated users can view deals" ON deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert deals" ON deals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update deals" ON deals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete deals" ON deals FOR DELETE TO authenticated USING (true);

-- Customer notes policies
CREATE POLICY "Authenticated users can view customer_notes" ON customer_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customer_notes" ON customer_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customer_notes" ON customer_notes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete customer_notes" ON customer_notes FOR DELETE TO authenticated USING (true);

-- Interaction logs policies
CREATE POLICY "Authenticated users can view interaction_logs" ON interaction_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert interaction_logs" ON interaction_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update interaction_logs" ON interaction_logs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete interaction_logs" ON interaction_logs FOR DELETE TO authenticated USING (true);

-- CRM tasks policies
CREATE POLICY "Authenticated users can view crm_tasks" ON crm_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_tasks" ON crm_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_tasks" ON crm_tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_tasks" ON crm_tasks FOR DELETE TO authenticated USING (true);

-- Vehicle ledger entries policies
CREATE POLICY "Authenticated users can view vehicle_ledger_entries" ON vehicle_ledger_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert vehicle_ledger_entries" ON vehicle_ledger_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update vehicle_ledger_entries" ON vehicle_ledger_entries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete vehicle_ledger_entries" ON vehicle_ledger_entries FOR DELETE TO authenticated USING (true);

-- GL accounts policies
CREATE POLICY "Authenticated users can view gl_accounts" ON gl_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountants can manage gl_accounts" ON gl_accounts FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE supabase_user_id = auth.uid() AND role IN ('ADMIN', 'ACCOUNTANT')));

-- Journal entries policies
CREATE POLICY "Authenticated users can view journal_entries" ON journal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountants can manage journal_entries" ON journal_entries FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE supabase_user_id = auth.uid() AND role IN ('ADMIN', 'ACCOUNTANT')));

-- Journal lines policies
CREATE POLICY "Authenticated users can view journal_lines" ON journal_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountants can manage journal_lines" ON journal_lines FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM users WHERE supabase_user_id = auth.uid() AND role IN ('ADMIN', 'ACCOUNTANT')));

-- Entity audit logs policies
CREATE POLICY "Authenticated users can view entity_audit_logs" ON entity_audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert entity_audit_logs" ON entity_audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger for auto-creating user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, supabase_user_id)
  VALUES (
    gen_random_uuid(),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'SALES'),
    NEW.id
  )
  ON CONFLICT (supabase_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crm_tasks_updated_at BEFORE UPDATE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicle_ledger_entries_updated_at BEFORE UPDATE ON vehicle_ledger_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_gl_accounts_updated_at BEFORE UPDATE ON gl_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

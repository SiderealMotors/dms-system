"use client"

import { useState, useEffect, useMemo } from "react"
import useSWR from "swr"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, Trash2, AlertCircle, CheckCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import type { GLAccount, JournalEntry, Vehicle } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface JournalEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  entry?: JournalEntry | null
  vehicleId?: string // For auto-populating from vehicle sale
}

interface LineItem {
  id: string
  account_id: string
  debit: number
  credit: number
  memo: string
}

// Common journal entry templates for a car dealership
const ENTRY_TEMPLATES = [
  { value: "vehicle_sale", label: "Vehicle Sale (Auto-populate from vehicle)" },
  { value: "vehicle_purchase", label: "Vehicle Purchase" },
  { value: "safety_expense", label: "Safety/Reconditioning Expense" },
  { value: "warranty_expense", label: "Warranty Cost" },
  { value: "floorplan_payment", label: "Floorplan Interest Payment" },
  { value: "rent_expense", label: "Rent Payment" },
  { value: "advertising_expense", label: "Advertising Expense" },
  { value: "utility_expense", label: "Utility Payment" },
  { value: "salary_expense", label: "Salaries & Wages" },
  { value: "commission_expense", label: "Sales Commission" },
  { value: "referral_expense", label: "Referral Fee" },
  { value: "gas_expense", label: "Fuel/Gas Expense" },
  { value: "office_supplies", label: "Office Supplies" },
  { value: "insurance_expense", label: "Insurance Premium" },
  { value: "owner_draw", label: "Owner Draw/Distribution" },
  { value: "owner_contribution", label: "Owner Contribution" },
  { value: "customer_deposit", label: "Customer Deposit Received" },
  { value: "custom", label: "Custom Entry" },
]

export function JournalEntryDialog({ open, onOpenChange, onSuccess, entry, vehicleId }: JournalEntryDialogProps) {
  const [description, setDescription] = useState("")
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])
  const [selectedTemplate, setSelectedTemplate] = useState("custom")
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), account_id: "", debit: 0, credit: 0, memo: "" },
    { id: crypto.randomUUID(), account_id: "", debit: 0, credit: 0, memo: "" },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const { data: accountsData } = useSWR("/api/accounting/accounts", fetcher)
  const { data: vehiclesData } = useSWR(
    vehicleId ? `/api/vehicles/${vehicleId}` : null,
    fetcher
  )
  const { data: soldVehiclesData } = useSWR(
    selectedTemplate === "vehicle_sale" ? "/api/vehicles?status=SOLD" : null,
    fetcher
  )

  const accounts: GLAccount[] = accountsData?.data || []
  const vehicle: Vehicle | null = vehiclesData?.data || null
  const soldVehicles: Vehicle[] = soldVehiclesData?.data || []

  // Group accounts by type for easier selection
  const groupedAccounts = useMemo(() => {
    const groups: Record<string, GLAccount[]> = {
      ASSET: [],
      LIABILITY: [],
      EQUITY: [],
      REVENUE: [],
      EXPENSE: [],
    }
    accounts.forEach((acc) => {
      if (groups[acc.account_type]) {
        groups[acc.account_type].push(acc)
      }
    })
    return groups
  }, [accounts])

  // Calculate totals
  const totals = useMemo(() => {
    const totalDebits = lineItems.reduce((sum, item) => sum + (item.debit || 0), 0)
    const totalCredits = lineItems.reduce((sum, item) => sum + (item.credit || 0), 0)
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01
    return { totalDebits, totalCredits, isBalanced }
  }, [lineItems])

  // Get account by code
  const getAccountByCode = (code: string) => accounts.find((a) => a.code === code)

  // Auto-populate based on template
  const handleTemplateChange = (template: string) => {
    setSelectedTemplate(template)
    
    if (template === "custom") {
      setLineItems([
        { id: crypto.randomUUID(), account_id: "", debit: 0, credit: 0, memo: "" },
        { id: crypto.randomUUID(), account_id: "", debit: 0, credit: 0, memo: "" },
      ])
      setDescription("")
      return
    }

    // Template-based auto-population
    const cashAccount = getAccountByCode("1000")
    const apAccount = getAccountByCode("2000")
    const inventoryAccount = getAccountByCode("1200")
    const revenueAccount = getAccountByCode("4000")
    const cogsAccount = getAccountByCode("5000")
    const safetyExpenseAccount = getAccountByCode("5100")
    const warrantyExpenseAccount = getAccountByCode("5200")
    const floorplanAccount = getAccountByCode("5400")
    const rentAccount = getAccountByCode("6200")
    const utilitiesAccount = getAccountByCode("6300")
    const advertisingAccount = getAccountByCode("6500")
    const salariesAccount = getAccountByCode("6000")
    const commissionsAccount = getAccountByCode("6100")
    const referralAccount = getAccountByCode("7000")
    const gasAccount = getAccountByCode("6900")
    const officeAccount = getAccountByCode("6600")
    const insuranceAccount = getAccountByCode("6400")
    const ownerEquityAccount = getAccountByCode("3000")
    const ownerDrawsAccount = getAccountByCode("3200")
    const customerDepositsAccount = getAccountByCode("2300")

    let newLines: LineItem[] = []
    let desc = ""

    switch (template) {
      case "vehicle_purchase":
        desc = "Vehicle Purchase"
        newLines = [
          { id: crypto.randomUUID(), account_id: inventoryAccount?.id || "", debit: 0, credit: 0, memo: "Vehicle added to inventory" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "safety_expense":
        desc = "Safety/Reconditioning Expense"
        newLines = [
          { id: crypto.randomUUID(), account_id: safetyExpenseAccount?.id || "", debit: 0, credit: 0, memo: "Safety inspection/repairs" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "warranty_expense":
        desc = "Warranty Cost"
        newLines = [
          { id: crypto.randomUUID(), account_id: warrantyExpenseAccount?.id || "", debit: 0, credit: 0, memo: "Warranty cost" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "floorplan_payment":
        desc = "Floorplan Interest Payment"
        newLines = [
          { id: crypto.randomUUID(), account_id: floorplanAccount?.id || "", debit: 0, credit: 0, memo: "Floorplan interest" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "rent_expense":
        desc = "Rent Payment"
        newLines = [
          { id: crypto.randomUUID(), account_id: rentAccount?.id || "", debit: 0, credit: 0, memo: "Monthly rent" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "advertising_expense":
        desc = "Advertising Expense"
        newLines = [
          { id: crypto.randomUUID(), account_id: advertisingAccount?.id || "", debit: 0, credit: 0, memo: "Advertising/marketing" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "utility_expense":
        desc = "Utility Payment"
        newLines = [
          { id: crypto.randomUUID(), account_id: utilitiesAccount?.id || "", debit: 0, credit: 0, memo: "Utilities" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "salary_expense":
        desc = "Salaries & Wages"
        newLines = [
          { id: crypto.randomUUID(), account_id: salariesAccount?.id || "", debit: 0, credit: 0, memo: "Salaries & wages" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "commission_expense":
        desc = "Sales Commission"
        newLines = [
          { id: crypto.randomUUID(), account_id: commissionsAccount?.id || "", debit: 0, credit: 0, memo: "Sales commission" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "referral_expense":
        desc = "Referral Fee"
        newLines = [
          { id: crypto.randomUUID(), account_id: referralAccount?.id || "", debit: 0, credit: 0, memo: "Referral fee" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "gas_expense":
        desc = "Fuel/Gas Expense"
        newLines = [
          { id: crypto.randomUUID(), account_id: gasAccount?.id || "", debit: 0, credit: 0, memo: "Fuel/gas" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "office_supplies":
        desc = "Office Supplies"
        newLines = [
          { id: crypto.randomUUID(), account_id: officeAccount?.id || "", debit: 0, credit: 0, memo: "Office supplies" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "insurance_expense":
        desc = "Insurance Premium"
        newLines = [
          { id: crypto.randomUUID(), account_id: insuranceAccount?.id || "", debit: 0, credit: 0, memo: "Insurance premium" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash payment" },
        ]
        break
      case "owner_draw":
        desc = "Owner Draw/Distribution"
        newLines = [
          { id: crypto.randomUUID(), account_id: ownerDrawsAccount?.id || "", debit: 0, credit: 0, memo: "Owner draw" },
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash withdrawal" },
        ]
        break
      case "owner_contribution":
        desc = "Owner Contribution"
        newLines = [
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash deposit" },
          { id: crypto.randomUUID(), account_id: ownerEquityAccount?.id || "", debit: 0, credit: 0, memo: "Owner contribution" },
        ]
        break
      case "customer_deposit":
        desc = "Customer Deposit Received"
        newLines = [
          { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: 0, credit: 0, memo: "Cash received" },
          { id: crypto.randomUUID(), account_id: customerDepositsAccount?.id || "", debit: 0, credit: 0, memo: "Customer deposit liability" },
        ]
        break
      default:
        newLines = [
          { id: crypto.randomUUID(), account_id: "", debit: 0, credit: 0, memo: "" },
          { id: crypto.randomUUID(), account_id: "", debit: 0, credit: 0, memo: "" },
        ]
    }

    setLineItems(newLines)
    setDescription(desc)
  }

  // Auto-populate from sold vehicle
  const handleVehicleSaleSelect = (vehicleId: string) => {
    const selectedVehicle = soldVehicles.find((v) => v.id === vehicleId)
    if (!selectedVehicle) return

    const cashAccount = getAccountByCode("1000")
    const revenueAccount = getAccountByCode("4000")
    const safetyRevenueAccount = getAccountByCode("4100")
    const warrantyRevenueAccount = getAccountByCode("4200")
    const cogsAccount = getAccountByCode("5000")
    const inventoryAccount = getAccountByCode("1200")
    const hstAccount = getAccountByCode("2200")

    // Calculate values
    const sellingPrice = selectedVehicle.selling_price || 0
    const safetyCharge = selectedVehicle.safety_charge || 0
    const warrantyCharge = selectedVehicle.warranty_charge || 0
    const omvicFee = selectedVehicle.omvic_fee || 0
    const subtotal = sellingPrice + safetyCharge + warrantyCharge + omvicFee
    const hst = subtotal * 0.13
    const totalReceived = subtotal + hst

    // Cost of goods sold (what we paid for the vehicle)
    const purchasePrice = selectedVehicle.purchase_price || 0
    const purchaseTax = purchasePrice * 0.13
    const safetyCost = (selectedVehicle.safety_cost || 0) * 1.13
    const warrantyCost = (selectedVehicle.warranty_cost || 0) * 1.13
    const floorplanCost = selectedVehicle.floorplan_interest_cost || 0
    const gasCost = (selectedVehicle.gas || 0) * 1.13
    const referralAmount = selectedVehicle.referral_amount || 0
    const totalCOGS = purchasePrice + purchaseTax + safetyCost + warrantyCost + floorplanCost + gasCost + referralAmount

    const newLines: LineItem[] = [
      // Debit: Cash (what we received)
      { id: crypto.randomUUID(), account_id: cashAccount?.id || "", debit: totalReceived, credit: 0, memo: `Cash received for ${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` },
      // Credit: Vehicle Sales Revenue
      { id: crypto.randomUUID(), account_id: revenueAccount?.id || "", debit: 0, credit: sellingPrice, memo: "Vehicle sale price" },
      // Credit: Safety Charge Revenue (if any)
      ...(safetyCharge > 0 ? [{ id: crypto.randomUUID(), account_id: safetyRevenueAccount?.id || "", debit: 0, credit: safetyCharge, memo: "Safety charge to customer" }] : []),
      // Credit: Warranty Revenue (if any)
      ...(warrantyCharge > 0 ? [{ id: crypto.randomUUID(), account_id: warrantyRevenueAccount?.id || "", debit: 0, credit: warrantyCharge, memo: "Warranty charge to customer" }] : []),
      // Credit: HST Payable
      { id: crypto.randomUUID(), account_id: hstAccount?.id || "", debit: 0, credit: hst, memo: "HST collected" },
      // Debit: Cost of Goods Sold
      { id: crypto.randomUUID(), account_id: cogsAccount?.id || "", debit: totalCOGS, credit: 0, memo: "Cost of vehicle sold" },
      // Credit: Inventory (remove vehicle from inventory)
      { id: crypto.randomUUID(), account_id: inventoryAccount?.id || "", debit: 0, credit: totalCOGS, memo: "Vehicle removed from inventory" },
    ]

    setLineItems(newLines)
    setDescription(`Vehicle Sale - ${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model} (Stock #${selectedVehicle.stock_number})`)
    setEntryDate(selectedVehicle.date_sold?.split("T")[0] || new Date().toISOString().split("T")[0])
  }

  const addLineItem = () => {
    setLineItems([...lineItems, { id: crypto.randomUUID(), account_id: "", debit: 0, credit: 0, memo: "" }])
  }

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 2) return
    setLineItems(lineItems.filter((item) => item.id !== id))
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(lineItems.map((item) => 
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!totals.isBalanced) {
      setError("Debits and credits must be equal")
      return
    }

    if (lineItems.some((item) => !item.account_id)) {
      setError("All line items must have an account selected")
      return
    }

    setSaving(true)
    try {
      const payload = {
        description,
        entry_date: entryDate,
        line_items: lineItems.map((item) => ({
          account_id: item.account_id,
          debit: item.debit || 0,
          credit: item.credit || 0,
          memo: item.memo,
        })),
      }

      const res = await fetch("/api/accounting/journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save journal entry")
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {entry ? "Edit Journal Entry" : "New Journal Entry"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Entry Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Entry Template</Label>
                  <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select entry type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTRY_TEMPLATES.map((template) => (
                        <SelectItem key={template.value} value={template.value}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Entry Date</Label>
                  <Input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Vehicle Selection for Vehicle Sale */}
              {selectedTemplate === "vehicle_sale" && (
                <div className="space-y-2">
                  <Label>Select Sold Vehicle (Auto-populate)</Label>
                  <Select onValueChange={handleVehicleSaleSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a sold vehicle to auto-populate" />
                    </SelectTrigger>
                    <SelectContent>
                      {soldVehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.year} {v.make} {v.model} - Stock #{v.stock_number} - {formatCurrency(v.selling_price || 0)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter journal entry description"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Line Items</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Line
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground">
                  <div className="col-span-4">Account</div>
                  <div className="col-span-2">Debit</div>
                  <div className="col-span-2">Credit</div>
                  <div className="col-span-3">Memo</div>
                  <div className="col-span-1"></div>
                </div>

                {/* Line Items */}
                {lineItems.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Select
                        value={item.account_id || "none"}
                        onValueChange={(value) => updateLineItem(item.id, "account_id", value === "none" ? "" : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select account...</SelectItem>
                          {Object.entries(groupedAccounts).map(([type, accts]) => (
                            <div key={type}>
                              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted">
                                {type}
                              </div>
                              {accts.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  {acc.code} - {acc.name}
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.debit || ""}
                        onChange={(e) => updateLineItem(item.id, "debit", parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.credit || ""}
                        onChange={(e) => updateLineItem(item.id, "credit", parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        value={item.memo}
                        onChange={(e) => updateLineItem(item.id, "memo", e.target.value)}
                        placeholder="Optional memo"
                      />
                    </div>
                    <div className="col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLineItem(item.id)}
                        disabled={lineItems.length <= 2}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Totals */}
                <div className="grid grid-cols-12 gap-2 pt-3 border-t font-medium">
                  <div className="col-span-4 text-right">Totals:</div>
                  <div className="col-span-2">{formatCurrency(totals.totalDebits)}</div>
                  <div className="col-span-2">{formatCurrency(totals.totalCredits)}</div>
                  <div className="col-span-4 flex items-center gap-2">
                    {totals.isBalanced ? (
                      <Badge variant="success" className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Balanced
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> 
                        Off by {formatCurrency(Math.abs(totals.totalDebits - totals.totalCredits))}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive rounded-md text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !totals.isBalanced}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {entry ? "Save Changes" : "Post Journal Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

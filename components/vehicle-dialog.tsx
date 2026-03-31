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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, Car, DollarSign, TrendingUp, Calculator, Plus, Trash2 } from "lucide-react"
import { formatCurrency, calculateLotDays, formatDate } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AddExpenseDialog } from "@/components/add-expense-dialog"
import type { Vehicle, VehicleStatus, User } from "@/lib/types"

interface VehicleExpense {
  id: string
  expense_date: string
  expense_type: string
  description: string
  notes: string | null
  amount: number
  tax_amount: number
  total_amount: number
  vendor?: { id: string; name: string } | null
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// Ontario HST Tax Rate
const TAX_RATE = 0.13

interface VehicleDialogProps {
  open: boolean
  onClose: () => void
  vehicle: Vehicle | null
}

const initialFormState = {
  stock_number: "",
  vin: "",
  year: new Date().getFullYear(),
  make: "",
  model: "",
  trim: "",
  exterior_color: "",
  colour: "",
  mileage: 0,
  status: "AVAILABLE" as VehicleStatus,
  date_acquired: new Date().toISOString().split("T")[0],
  date_sold: "",
  // Purchase field
  purchase_price: 0,
  asking_price: 0,
  // Cost fields (Purchase & Costs section)
  miscellaneous_cost: 0,
  safety_estimate: 0,
  safety_cost: 0,
  gas: 0,
  warranty_cost: 0,
  floorplan_interest_cost: 0,
  floorplan_fees: 0,
  // Sale fields (Sale Info section)
  selling_price: 0,
  safety_charge: 0,
  warranty_charge: 0,
  omvic_fee: 0,
  registration_fee: 0,  // Not taxable
  referral_amount: 0,   // Not taxable - income to dealership
  buyer_name: "",
  salesperson_id: "",
  payment_method: "",
  deposit_amount: 0,
  notes: "",
}

export function VehicleDialog({ open, onClose, vehicle }: VehicleDialogProps) {
  const [form, setForm] = useState(initialFormState)
  const [saving, setSaving] = useState(false)
  const [vinLoading, setVinLoading] = useState(false)
  const [vinError, setVinError] = useState("")
  const [activeTab, setActiveTab] = useState("basic")
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false)
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null)

  const { data: usersData } = useSWR("/api/users?role=SALES", fetcher)
  const salesUsers: User[] = usersData?.data || []

  // Fetch expenses for existing vehicles
  const { data: expensesData, mutate: mutateExpenses } = useSWR<{ data: VehicleExpense[] }>(
    vehicle?.id && open ? `/api/vehicles/${vehicle.id}/expenses` : null,
    fetcher
  )
  const expenses = expensesData?.data || []
  const totalExpenses = expenses.reduce((sum, e) => sum + e.total_amount, 0)

  useEffect(() => {
    if (vehicle) {
      setForm({
        stock_number: vehicle.stock_number || "",
        vin: vehicle.vin || "",
        year: vehicle.year || new Date().getFullYear(),
        make: vehicle.make || "",
        model: vehicle.model || "",
        trim: vehicle.trim || "",
        exterior_color: vehicle.exterior_color || "",
        colour: vehicle.colour || "",
        mileage: vehicle.mileage || 0,
        status: vehicle.status || "AVAILABLE",
        date_acquired: vehicle.date_acquired?.split("T")[0] || new Date().toISOString().split("T")[0],
        date_sold: vehicle.date_sold?.split("T")[0] || "",
        purchase_price: vehicle.purchase_price || 0,
        asking_price: vehicle.asking_price || 0,
        miscellaneous_cost: vehicle.miscellaneous_cost || 0,
        safety_estimate: vehicle.safety_estimate || 0,
        safety_cost: vehicle.safety_cost || 0,
        gas: vehicle.gas || 0,
        warranty_cost: vehicle.warranty_cost || 0,
        floorplan_interest_cost: vehicle.floorplan_interest_cost || 0,
        floorplan_fees: vehicle.floorplan_fees || 0,
        selling_price: vehicle.selling_price || 0,
        safety_charge: vehicle.safety_charge || 0,
        warranty_charge: vehicle.warranty_charge || 0,
        omvic_fee: vehicle.omvic_fee || 0,
        registration_fee: vehicle.registration_fee || 0,
        referral_amount: vehicle.referral_amount || 0,
        buyer_name: vehicle.buyer_name || "",
        salesperson_id: vehicle.salesperson_id || "",
        payment_method: vehicle.payment_method || "",
        deposit_amount: vehicle.deposit_amount || 0,
        notes: vehicle.notes || "",
      })
    } else {
      setForm(initialFormState)
    }
    setActiveTab("basic")
    setVinError("")
  }, [vehicle, open])

  // ========== AUTO-CALCULATED FIELDS (Ontario 13% HST) ==========
  const calculations = useMemo(() => {
    // ===== PURCHASE & COSTS SECTION (Pre-tax costs for profit calculation) =====
    // Purchase
    const purchaseTax = form.purchase_price * TAX_RATE
    const totalPurchasePrice = form.purchase_price + purchaseTax
    
    // Miscellaneous Cost
    const miscellaneousTax = form.miscellaneous_cost * TAX_RATE
    const totalMiscellaneousCost = form.miscellaneous_cost + miscellaneousTax
    
    // Safety
    const safetyTax = form.safety_cost * TAX_RATE
    const totalSafetyCost = form.safety_cost + safetyTax
    
    // Gas
    const gasTax = form.gas * TAX_RATE
    const totalGasCost = form.gas + gasTax
    
    // Warranty Cost
    const warrantyCostTax = form.warranty_cost * TAX_RATE
    const totalWarrantyCost = form.warranty_cost + warrantyCostTax
    
    // Floorplan Interest (no tax - it's interest)
    const totalFloorplanInterest = form.floorplan_interest_cost
    
    // Floorplan Fees (no tax - it's fees)
    const totalFloorplanFees = form.floorplan_fees
    
    // Combined floorplan total
    const totalFloorplanCost = totalFloorplanInterest + totalFloorplanFees
    
    // Pre-tax cost total (for profit calculation - excludes taxes we paid)
    const preTaxCost = form.purchase_price + form.miscellaneous_cost + form.safety_cost + form.gas + form.warranty_cost + form.floorplan_interest_cost + form.floorplan_fees
    
    // Total All-In Cost including taxes (what we actually paid out)
    const totalCostWithTax = totalPurchasePrice + totalMiscellaneousCost + totalSafetyCost + totalGasCost + totalWarrantyCost + totalFloorplanCost
    
    // ===== SALE INFO SECTION =====
    // Taxable items: Safety Charge, Warranty Charge, OMVIC Fee
    const safetyChargeTax = form.safety_charge * TAX_RATE
    const warrantyChargeTax = form.warranty_charge * TAX_RATE
    const omvicFeeTax = form.omvic_fee * TAX_RATE
    const sellingPriceTax = form.selling_price * TAX_RATE
    
    // Non-taxable items: Registration Fee, Referral Amount
    // Registration Fee is a pass-through, Referral is income
    
    // Sale subtotal (taxable items before tax)
    const taxableSaleSubtotal = form.selling_price + form.safety_charge + form.warranty_charge + form.omvic_fee
    const saleTax = taxableSaleSubtotal * TAX_RATE
    
    // Total sale including tax and non-taxable items
    const totalSalePrice = taxableSaleSubtotal + saleTax + form.registration_fee
    
    // ===== PROFIT CALCULATION (PRE-TAX BASED) =====
    // Pre-tax Revenue = Selling Price + Safety Charge + Warranty Charge + OMVIC Fee + Referral Amount
    // Note: Registration Fee is pass-through (not profit), Referral IS income
    const preTaxRevenue = form.selling_price + form.safety_charge + form.warranty_charge + form.omvic_fee + form.referral_amount
    
    // Profit = Pre-Tax Revenue - Pre-Tax Costs
    // NOTE: Taxes are pass-through and NOT included in profit calculation
    const grossProfit = form.selling_price > 0 
      ? preTaxRevenue - preTaxCost
      : 0
    
    // Estimated profit using asking price (for unsold vehicles)
    const estimatedRevenue = form.asking_price + form.safety_charge + form.warranty_charge + form.omvic_fee + form.referral_amount
    const estimatedProfit = form.asking_price > 0
      ? estimatedRevenue - preTaxCost
      : 0
    
    const profitMargin = form.selling_price > 0 
      ? (grossProfit / form.selling_price) * 100 
      : 0

    return {
      // Purchase taxes
      purchaseTax,
      totalPurchasePrice,
      // Cost taxes
      miscellaneousTax,
      totalMiscellaneousCost,
      safetyTax,
      totalSafetyCost,
      gasTax,
      totalGasCost,
      warrantyCostTax,
      totalWarrantyCost,
      totalFloorplanInterest,
      totalFloorplanFees,
      totalFloorplanCost,
      // Totals
      preTaxCost,
      totalCost: totalCostWithTax,
      // Sale taxes
      safetyChargeTax,
      warrantyChargeTax,
      omvicFeeTax,
      sellingPriceTax,
      saleTax,
      totalSalePrice,
      // Profit (pre-tax based)
      preTaxRevenue,
      grossProfit,
      estimatedProfit,
      profitMargin,
    }
  }, [form])

  const lotDays = calculateLotDays(form.date_acquired, form.date_sold)
  
  const getLotDaysColor = () => {
    if (lotDays < 30) return "bg-green-100 text-green-800 border-green-300"
    if (lotDays < 60) return "bg-yellow-100 text-yellow-800 border-yellow-300"
    return "bg-red-100 text-red-800 border-red-300"
  }

  const handleDecodeVIN = async () => {
    if (form.vin.length !== 17) {
      setVinError("VIN must be exactly 17 characters")
      return
    }
    setVinLoading(true)
    setVinError("")
    try {
      const res = await fetch(`/api/vin-decode?vin=${form.vin}`)
      const data = await res.json()
      if (data.error) {
        setVinError(data.error)
        return
      }
      const decoded = data.data
      setForm((prev) => ({
        ...prev,
        year: decoded.year || prev.year,
        make: decoded.make || prev.make,
        model: decoded.model || prev.model,
        trim: decoded.trim || prev.trim,
      }))
    } catch {
      setVinError("Failed to decode VIN")
    } finally {
      setVinLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        date_sold: form.date_sold || null,
        salesperson_id: form.salesperson_id || null,
        tax_rate: TAX_RATE,
      }
      console.log("[v0] Submitting vehicle payload:", {
        id: vehicle?.id,
        purchase_price: payload.purchase_price,
        floorplan_interest_cost: payload.floorplan_interest_cost,
        floorplan_fees: payload.floorplan_fees,
      })
      const url = vehicle ? `/api/vehicles/${vehicle.id}` : "/api/vehicles"
      const method = vehicle ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Failed to save vehicle")
      onClose()
    } catch (error) {
      console.error("Error saving vehicle:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!vehicle || !confirm("Are you sure you want to delete this vehicle?")) return
    setSaving(true)
    try {
      await fetch(`/api/vehicles/${vehicle.id}`, { method: "DELETE" })
      onClose()
    } catch (error) {
      console.error("Error deleting vehicle:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteExpense = async (expenseId: string) => {
    if (!vehicle || !confirm("Are you sure you want to delete this expense? The associated journal entry will also be deleted.")) return
    setDeletingExpenseId(expenseId)
    try {
      await fetch(`/api/vehicles/${vehicle.id}/expenses/${expenseId}`, { method: "DELETE" })
      mutateExpenses()
    } catch (error) {
      console.error("Error deleting expense:", error)
    } finally {
      setDeletingExpenseId(null)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {vehicle ? `Edit Vehicle - ${vehicle.stock_number}` : "Add New Vehicle"}
          </DialogTitle>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-lg font-bold">{formatCurrency(calculations.totalCost)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Est. Profit</p>
                <p className={`text-lg font-bold ${calculations.estimatedProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(calculations.estimatedProfit)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div>
              <p className="text-xs text-muted-foreground">Lot Days</p>
              <div className={`inline-block px-2 py-1 rounded border text-lg font-bold ${getLotDaysColor()}`}>
                {lotDays}
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={form.status === "AVAILABLE" ? "success" : form.status === "PENDING" ? "warning" : "default"} className="text-sm mt-1">
                {form.status}
              </Badge>
            </div>
          </Card>
          {form.selling_price > 0 && (
            <Card className={`p-3 ${calculations.grossProfit >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <div>
                <p className="text-xs text-muted-foreground">Actual Profit</p>
                <p className={`text-lg font-bold ${calculations.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(calculations.grossProfit)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {calculations.profitMargin.toFixed(1)}% margin
                </p>
              </div>
            </Card>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="purchase">Purchase & Costs</TabsTrigger>
              <TabsTrigger value="expenses" disabled={!vehicle}>
                Expenses {expenses.length > 0 && `(${expenses.length})`}
              </TabsTrigger>
              <TabsTrigger value="sale">Sale Info</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            {/* BASIC INFO TAB */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="vin">VIN</Label>
                <div className="flex gap-2">
                  <Input
                    id="vin"
                    value={form.vin}
                    onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
                    placeholder="Enter 17-character VIN"
                    maxLength={17}
                    className="font-mono"
                    required
                  />
                  <Button type="button" variant="outline" onClick={handleDecodeVIN} disabled={vinLoading}>
                    {vinLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="ml-1">Decode</span>
                  </Button>
                </div>
                {vinError && <p className="text-sm text-destructive">{vinError}</p>}
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stock_number">Stock #</Label>
                  <Input id="stock_number" value={form.stock_number} onChange={(e) => setForm({ ...form, stock_number: e.target.value })} placeholder="Auto-generated" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) || 0 })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="make">Make</Label>
                  <Input id="make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input id="model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trim">Trim</Label>
                  <Input id="trim" value={form.trim} onChange={(e) => setForm({ ...form, trim: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="colour">Colour</Label>
                  <Input id="colour" value={form.colour || form.exterior_color} onChange={(e) => setForm({ ...form, colour: e.target.value, exterior_color: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mileage">Odometer (km)</Label>
                  <Input id="mileage" type="number" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={form.status} onValueChange={(value: VehicleStatus) => setForm({ ...form, status: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AVAILABLE">Available</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="SOLD">Sold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date_acquired">Date Purchased</Label>
                  <Input id="date_acquired" type="date" value={form.date_acquired} onChange={(e) => setForm({ ...form, date_acquired: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asking_price">Asking Price</Label>
                  <Input id="asking_price" type="number" step="0.01" value={form.asking_price} onChange={(e) => setForm({ ...form, asking_price: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
            </TabsContent>

            {/* PURCHASE & COSTS TAB */}
            <TabsContent value="purchase" className="space-y-4 mt-4">
              {/* Vehicle Purchase */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    Vehicle Purchase
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Purchase Price (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Purchase Tax (13% HST) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.purchaseTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Purchase Price <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.totalPurchasePrice)} disabled className="bg-muted font-semibold" />
                  </div>
                </CardContent>
              </Card>

              {/* Miscellaneous Cost */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Miscellaneous Cost</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Miscellaneous Cost (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.miscellaneous_cost} onChange={(e) => setForm({ ...form, miscellaneous_cost: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Miscellaneous Tax (13%) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.miscellaneousTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Miscellaneous <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.totalMiscellaneousCost)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* Safety Inspection */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Safety Inspection</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Safety Estimate <span className="text-xs text-muted-foreground">(info)</span></Label>
                    <Input type="number" step="0.01" value={form.safety_estimate} onChange={(e) => setForm({ ...form, safety_estimate: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Safety Cost (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.safety_cost} onChange={(e) => setForm({ ...form, safety_cost: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Safety Tax (13%) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.safetyTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Safety Cost <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.totalSafetyCost)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* Gas */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Gas</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Gas (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.gas} onChange={(e) => setForm({ ...form, gas: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Gas Tax (13%) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.gasTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Gas <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.totalGasCost)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* Cost of Warranty Sold */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Cost of Warranty Sold</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Warranty Cost (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.warranty_cost} onChange={(e) => setForm({ ...form, warranty_cost: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Warranty Cost Tax (13%) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.warrantyCostTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Warranty Cost <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.totalWarrantyCost)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* Floorplan Interest */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Floorplan Interest</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Floorplan Interest <span className="text-xs text-muted-foreground">(no tax)</span></Label>
                    <Input type="number" step="0.01" value={form.floorplan_interest_cost} onChange={(e) => setForm({ ...form, floorplan_interest_cost: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Interest</Label>
                    <Input type="text" value={formatCurrency(calculations.totalFloorplanInterest)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* Floorplan Fees */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Floorplan Fees</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Floorplan Fees <span className="text-xs text-muted-foreground">(no tax)</span></Label>
                    <Input type="number" step="0.01" value={form.floorplan_fees} onChange={(e) => setForm({ ...form, floorplan_fees: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Fees</Label>
                    <Input type="text" value={formatCurrency(calculations.totalFloorplanFees)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* Cost Summary */}
              <Card className="bg-muted/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Cost Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pre-Tax Total Cost</Label>
                    <Input type="text" value={formatCurrency(calculations.preTaxCost)} disabled className="bg-background font-semibold" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total All-In Cost (with taxes)</Label>
                    <Input type="text" value={formatCurrency(calculations.totalCost)} disabled className="bg-background font-bold text-lg" />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* SALE INFO TAB */}
            <TabsContent value="sale" className="space-y-4 mt-4">
              {/* Sale Date and Buyer */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Sale Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Date Sold</Label>
                    <Input type="date" value={form.date_sold} onChange={(e) => setForm({ ...form, date_sold: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Buyer Name</Label>
                    <Input value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Salesperson</Label>
                    <Select value={form.salesperson_id || "none"} onValueChange={(value) => setForm({ ...form, salesperson_id: value === "none" ? "" : value })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {salesUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Selling Price */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Selling Price</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Selling Price (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Sale Tax (13% HST) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.sellingPriceTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total with Tax <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(form.selling_price + calculations.sellingPriceTax)} disabled className="bg-muted font-semibold" />
                  </div>
                </CardContent>
              </Card>

              {/* Safety Charge (Taxable) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Safety Charge <span className="text-xs font-normal text-muted-foreground">(taxable)</span></CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Safety Charge (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.safety_charge} onChange={(e) => setForm({ ...form, safety_charge: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Safety Charge Tax (13%) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.safetyChargeTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Safety Charge <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(form.safety_charge + calculations.safetyChargeTax)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* Warranty Charge (Taxable) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Warranty Charge <span className="text-xs font-normal text-muted-foreground">(taxable)</span></CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Warranty Charge (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.warranty_charge} onChange={(e) => setForm({ ...form, warranty_charge: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Warranty Charge Tax (13%) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.warrantyChargeTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Warranty Charge <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(form.warranty_charge + calculations.warrantyChargeTax)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* OMVIC Fee (Taxable) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">OMVIC Fee <span className="text-xs font-normal text-muted-foreground">(taxable)</span></CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>OMVIC Fee (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.omvic_fee} onChange={(e) => setForm({ ...form, omvic_fee: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>OMVIC Fee Tax (13%) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.omvicFeeTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total OMVIC Fee <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(form.omvic_fee + calculations.omvicFeeTax)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* Registration Fee (NOT Taxable) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Registration Fee <span className="text-xs font-normal text-green-600">(not taxable)</span></CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Registration Fee</Label>
                    <Input type="number" step="0.01" value={form.registration_fee} onChange={(e) => setForm({ ...form, registration_fee: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-sm">Pass-through fee, no tax applied</Label>
                  </div>
                </CardContent>
              </Card>

              {/* Referral Amount (NOT Taxable - Income to dealership) */}
              <Card className="border-green-200 bg-green-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Referral Amount <span className="text-xs font-normal text-green-600">(income - not taxable)</span></CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Referral Amount Received</Label>
                    <Input type="number" step="0.01" value={form.referral_amount} onChange={(e) => setForm({ ...form, referral_amount: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-sm">Income to dealership, added to profit calculation</Label>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Payment Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select value={form.payment_method || "none"} onValueChange={(value) => setForm({ ...form, payment_method: value === "none" ? "" : value })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not specified</SelectItem>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="FINANCE">Finance</SelectItem>
                        <SelectItem value="CERTIFIED_CHEQUE">Certified Cheque</SelectItem>
                        <SelectItem value="BANK_DRAFT">Bank Draft</SelectItem>
                        <SelectItem value="E_TRANSFER">E-Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Deposit Amount</Label>
                    <Input type="number" step="0.01" value={form.deposit_amount} onChange={(e) => setForm({ ...form, deposit_amount: parseFloat(e.target.value) || 0 })} />
                  </div>
                </CardContent>
              </Card>

              {/* Sale Summary */}
              <Card className="bg-muted/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Sale Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Pre-Tax Revenue</Label>
                      <Input type="text" value={formatCurrency(calculations.preTaxRevenue)} disabled className="bg-background font-semibold" />
                    </div>
                    <div className="space-y-2">
                      <Label>Total Tax Collected</Label>
                      <Input type="text" value={formatCurrency(calculations.saleTax)} disabled className="bg-background" />
                    </div>
                    <div className="space-y-2">
                      <Label>Total Sale (with tax + reg)</Label>
                      <Input type="text" value={formatCurrency(calculations.totalSalePrice)} disabled className="bg-background font-bold text-lg" />
                    </div>
                  </div>
                  
                  {form.selling_price > 0 && (
                    <div className={`p-4 rounded-lg ${calculations.grossProfit >= 0 ? "bg-green-100 border border-green-300" : "bg-red-100 border border-red-300"}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium">Net Profit (Pre-Tax Based)</p>
                          <p className="text-xs text-muted-foreground">Revenue - Costs = Profit</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-bold ${calculations.grossProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                            {formatCurrency(calculations.grossProfit)}
                          </p>
                          <p className="text-sm text-muted-foreground">{calculations.profitMargin.toFixed(1)}% margin</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* EXPENSES TAB */}
            <TabsContent value="expenses" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Additional Expenses
                  </CardTitle>
                  <Button 
                    type="button" 
                    size="sm" 
                    onClick={() => setIsAddExpenseOpen(true)}
                    disabled={!vehicle}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Expense
                  </Button>
                </CardHeader>
                <CardContent>
                  {expenses.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No additional expenses recorded.</p>
                      <p className="text-sm mt-1">Click &quot;Add Expense&quot; to record repairs, parts, or other costs.</p>
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">HST</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {expenses.map((expense) => (
                            <TableRow key={expense.id}>
                              <TableCell>{formatDate(expense.expense_date)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{expense.expense_type}</Badge>
                              </TableCell>
                              <TableCell className="max-w-[200px]">
                                <div className="truncate">{expense.description}</div>
                                {expense.notes && (
                                  <div className="text-xs text-muted-foreground truncate">{expense.notes}</div>
                                )}
                              </TableCell>
                              <TableCell>{expense.vendor?.name || "-"}</TableCell>
                              <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(expense.tax_amount)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(expense.total_amount)}</TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  disabled={deletingExpenseId === expense.id}
                                >
                                  {deletingExpenseId === expense.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {/* Totals Summary */}
                      <div className="mt-4 p-3 bg-muted rounded-md">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Total Additional Expenses:</span>
                          <span className="text-lg font-bold">{formatCurrency(totalExpenses)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          These expenses are automatically recorded in the accounting system.
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* NOTES TAB */}
            <TabsContent value="notes" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  className="w-full min-h-[200px] p-3 border rounded-md resize-y"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Enter any notes about this vehicle..."
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex justify-between mt-6 pt-4 border-t">
            <div>
              {vehicle && (
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={saving}>
                  Delete Vehicle
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {vehicle ? "Save Changes" : "Add Vehicle"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    {/* Add Expense Dialog - rendered outside parent Dialog to avoid nesting issues */}
    {vehicle && (
      <AddExpenseDialog
        open={isAddExpenseOpen}
        onOpenChange={setIsAddExpenseOpen}
        vehicleId={vehicle.id}
        vehicleInfo={{
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          stock_number: vehicle.stock_number,
        }}
        onSuccess={() => mutateExpenses()}
      />
    )}
    </>
  )
}

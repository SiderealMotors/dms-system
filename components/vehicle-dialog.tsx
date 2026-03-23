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
import { Loader2, Search, Car, DollarSign, TrendingUp, Calculator } from "lucide-react"
import { formatCurrency, calculateLotDays } from "@/lib/utils"
import type { Vehicle, VehicleStatus, User } from "@/lib/types"

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
  // Purchase fields
  purchase_price: 0,
  asking_price: 0,
  // Cost fields (pre-tax)
  safety_estimate: 0,
  safety_cost: 0,
  warranty_cost: 0,
  floorplan_interest_cost: 0,
  gas: 0,
  // Sale fields
  selling_price: 0,
  safety_charge: 0,
  warranty_charge: 0,
  omvic_fee: 0,
  buyer_name: "",
  salesperson_id: "",
  referral_amount: 0,
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

  const { data: usersData } = useSWR("/api/users?role=SALES", fetcher)
  const salesUsers: User[] = usersData?.data || []

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
        safety_estimate: vehicle.safety_estimate || 0,
        safety_cost: vehicle.safety_cost || 0,
        warranty_cost: vehicle.warranty_cost || 0,
        floorplan_interest_cost: vehicle.floorplan_interest_cost || 0,
        gas: vehicle.gas || 0,
        selling_price: vehicle.selling_price || 0,
        safety_charge: vehicle.safety_charge || 0,
        warranty_charge: vehicle.warranty_charge || 0,
        omvic_fee: vehicle.omvic_fee || 0,
        buyer_name: vehicle.buyer_name || "",
        salesperson_id: vehicle.salesperson_id || "",
        referral_amount: vehicle.referral_amount || 0,
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
    // ===== PURCHASE SIDE (Pre-tax costs for profit calculation) =====
    const purchaseTax = form.purchase_price * TAX_RATE
    const totalPurchasePrice = form.purchase_price + purchaseTax
    
    const safetyTax = form.safety_cost * TAX_RATE
    const totalSafetyCost = form.safety_cost + safetyTax
    
    const warrantyTax = form.warranty_cost * TAX_RATE
    const totalWarrantyCost = form.warranty_cost + warrantyTax
    
    const gasTax = form.gas * TAX_RATE
    const totalGasCost = form.gas + gasTax
    
    // Pre-tax cost total (for profit calculation - excludes taxes we paid)
    const preTaxCost = form.purchase_price + form.safety_cost + form.warranty_cost + form.floorplan_interest_cost + form.gas
    
    // Total All-In Cost including taxes (what we actually paid out)
    const totalCostWithTax = totalPurchasePrice + totalSafetyCost + totalWarrantyCost + form.floorplan_interest_cost + totalGasCost
    
    // ===== SALE SIDE =====
    // Pre-tax revenue (for profit calculation)
    // Referral is income received by the dealership, so it's added to revenue
    const preTaxRevenue = form.selling_price + form.safety_charge + form.warranty_charge + form.omvic_fee + form.referral_amount
    
    const saleSubtotal = form.selling_price + form.safety_charge + form.warranty_charge + form.omvic_fee
    const saleTax = saleSubtotal * TAX_RATE
    const totalSalePrice = saleSubtotal + saleTax
    
    // ===== PROFIT CALCULATION (PRE-TAX BASED) =====
    // Profit = Pre-Tax Revenue - Pre-Tax Costs
    // Revenue includes: Selling Price + Safety Charge + Warranty Charge + OMVIC Fee + Referral Amount
    // Costs include: Purchase Price + Safety Cost + Warranty Cost + Floorplan Interest + Gas
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
      // Purchase taxes (displayed for reference)
      purchaseTax,
      totalPurchasePrice,
      safetyTax,
      totalSafetyCost,
      warrantyTax,
      totalWarrantyCost,
      gasTax,
      totalGasCost,
      // Totals
      preTaxCost,
      totalCost: totalCostWithTax,
      // Sale
      preTaxRevenue,
      saleSubtotal,
      saleTax,
      totalSalePrice,
      // Profit (pre-tax based)
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

  return (
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
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="purchase">Purchase & Costs</TabsTrigger>
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
                  <Label htmlFor="date_acquired">Date Purchased (YYYY-MM-DD)</Label>
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
              {/* Purchase Price Section */}
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
                    <Label>Tax (13% HST) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.purchaseTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Purchase Price <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.totalPurchasePrice)} disabled className="bg-muted font-semibold" />
                  </div>
                </CardContent>
              </Card>

              {/* Safety Section */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Safety Inspection</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Safety Estimate <span className="text-xs text-muted-foreground">(info only)</span></Label>
                    <Input type="number" step="0.01" value={form.safety_estimate} onChange={(e) => setForm({ ...form, safety_estimate: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Safety Cost (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.safety_cost} onChange={(e) => setForm({ ...form, safety_cost: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tax on Safety (13%) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.safetyTax)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* Warranty Section */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Warranty</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Warranty Cost (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.warranty_cost} onChange={(e) => setForm({ ...form, warranty_cost: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tax on Warranty (13%) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.warrantyTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Warranty Cost <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.totalWarrantyCost)} disabled className="bg-muted" />
                  </div>
                </CardContent>
              </Card>

              {/* Other Costs */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Other Costs</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Floorplan Interest + Fees</Label>
                    <Input type="number" step="0.01" value={form.floorplan_interest_cost} onChange={(e) => setForm({ ...form, floorplan_interest_cost: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Gas (Pre-Tax)</Label>
                    <Input type="number" step="0.01" value={form.gas} onChange={(e) => setForm({ ...form, gas: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Gas Tax (13%) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                    <Input type="text" value={formatCurrency(calculations.gasTax)} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Referral Amount</Label>
                    <Input type="number" step="0.01" value={form.referral_amount} onChange={(e) => setForm({ ...form, referral_amount: parseFloat(e.target.value) || 0 })} />
                  </div>
                </CardContent>
              </Card>

              {/* Total Cost Summary */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-lg font-medium">TOTAL VEHICLE COST (All-In)</span>
                      <p className="text-sm text-muted-foreground">Purchase + Safety + Warranty + Floorplan + Gas + Referral (all with taxes)</p>
                    </div>
                    <span className="text-3xl font-bold">{formatCurrency(calculations.totalCost)}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* SALE INFO TAB */}
            <TabsContent value="sale" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Sale Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date Sold (YYYY-MM-DD)</Label>
                      <Input type="date" value={form.date_sold} onChange={(e) => setForm({ ...form, date_sold: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Buyer Name</Label>
                      <Input value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Salesperson</Label>
                      <Select value={form.salesperson_id || "none"} onValueChange={(value) => setForm({ ...form, salesperson_id: value === "none" ? "" : value })}>
                        <SelectTrigger><SelectValue placeholder="Select salesperson" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not assigned</SelectItem>
                          {salesUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select value={form.payment_method || "none"} onValueChange={(value) => setForm({ ...form, payment_method: value === "none" ? "" : value })}>
                        <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not specified</SelectItem>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="CERTIFIED_CHEQUE">Certified Cheque</SelectItem>
                          <SelectItem value="BANK_DRAFT">Bank Draft</SelectItem>
                          <SelectItem value="E_TRANSFER">E-Transfer</SelectItem>
                          <SelectItem value="FINANCE">Finance</SelectItem>
                          <SelectItem value="DEBIT">Debit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Deposit Amount <span className="text-xs text-muted-foreground">(info only - not used in calculations)</span></Label>
                    <Input type="number" step="0.01" value={form.deposit_amount} onChange={(e) => setForm({ ...form, deposit_amount: parseFloat(e.target.value) || 0 })} />
                  </div>
                </CardContent>
              </Card>

              {/* Sale Pricing */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Sale Pricing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Selling Price (Pre-Tax)</Label>
                      <Input type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Safety Charge</Label>
                      <Input type="number" step="0.01" value={form.safety_charge} onChange={(e) => setForm({ ...form, safety_charge: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Warranty Charge</Label>
                      <Input type="number" step="0.01" value={form.warranty_charge} onChange={(e) => setForm({ ...form, warranty_charge: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <Label>OMVIC Fee</Label>
                      <Input type="number" step="0.01" value={form.omvic_fee} onChange={(e) => setForm({ ...form, omvic_fee: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Subtotal <span className="text-xs text-muted-foreground">(auto)</span></Label>
                      <Input type="text" value={formatCurrency(calculations.saleSubtotal)} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label>Sell Tax (13% HST) <span className="text-xs text-muted-foreground">(auto)</span></Label>
                      <Input type="text" value={formatCurrency(calculations.saleTax)} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label>Total Sale Price <span className="text-xs text-muted-foreground">(auto)</span></Label>
                      <Input type="text" value={formatCurrency(calculations.totalSalePrice)} disabled className="bg-muted font-semibold" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Profit Section */}
              {form.selling_price > 0 && (
                <Card className={`${calculations.grossProfit >= 0 ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Profit Calculation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Revenue (Vehicle + Safety + Warranty + OMVIC)</p>
                        <p className="text-xl font-semibold">{formatCurrency(calculations.saleSubtotal)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Total Cost (All-In)</p>
                        <p className="text-xl font-semibold">{formatCurrency(calculations.totalCost)}</p>
                      </div>
                    </div>
                    <hr className="my-4" />
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-lg font-medium">NET PROFIT</p>
                        <p className="text-sm text-muted-foreground">(Tax is pass-through, not included)</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-4xl font-bold ${calculations.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(calculations.grossProfit)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {calculations.profitMargin.toFixed(1)}% margin
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* NOTES TAB */}
            <TabsContent value="notes" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  className="w-full min-h-[200px] p-3 border rounded-md bg-background"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Enter any additional notes about this vehicle..."
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-between mt-6">
            <div>
              {vehicle && (
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={saving}>
                  Delete Vehicle
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
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
  )
}

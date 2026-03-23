"use client"

import { useState, useEffect } from "react"
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
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, Car, DollarSign, TrendingUp } from "lucide-react"
import { formatCurrency, calculateVehicleTotalCost, calculateLotDays, calculateNetProfit } from "@/lib/utils"
import type { Vehicle, VehicleStatus, User } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

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
  purchase_price: 0,
  asking_price: 0,
  selling_price: 0,
  safety_estimate: 0,
  safety_cost: 0,
  safety_charge: 0,
  warranty_cost: 0,
  warranty_charge: 0,
  floorplan_interest_cost: 0,
  gas: 0,
  omvic_fee: 0,
  referral_amount: 0,
  buyer_name: "",
  payment_method: "",
  deposit_amount: 0,
  salesperson_id: "",
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
        selling_price: vehicle.selling_price || 0,
        safety_estimate: vehicle.safety_estimate || 0,
        safety_cost: vehicle.safety_cost || 0,
        safety_charge: vehicle.safety_charge || 0,
        warranty_cost: vehicle.warranty_cost || 0,
        warranty_charge: vehicle.warranty_charge || 0,
        floorplan_interest_cost: vehicle.floorplan_interest_cost || 0,
        gas: vehicle.gas || 0,
        omvic_fee: vehicle.omvic_fee || 0,
        referral_amount: vehicle.referral_amount || 0,
        buyer_name: vehicle.buyer_name || "",
        payment_method: vehicle.payment_method || "",
        deposit_amount: vehicle.deposit_amount || 0,
        salesperson_id: vehicle.salesperson_id || "",
        notes: vehicle.notes || "",
      })
    } else {
      setForm(initialFormState)
    }
    setActiveTab("basic")
    setVinError("")
  }, [vehicle, open])

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

  const totalCost = calculateVehicleTotalCost(form)
  const lotDays = calculateLotDays(form.date_acquired, form.date_sold)
  const estimatedProfit = (form.asking_price || 0) - totalCost
  const actualProfit = form.status === "SOLD" ? calculateNetProfit({ ...form, purchase_price: form.purchase_price }) : null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {vehicle ? `Edit Vehicle - ${vehicle.stock_number}` : "Add New Vehicle"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-lg font-bold">{formatCurrency(totalCost)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Est. Profit</p>
                <p className={`text-lg font-bold ${estimatedProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(estimatedProfit)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Lot Days</p>
                <p className="text-lg font-bold">{lotDays}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <Badge variant={form.status === "AVAILABLE" ? "success" : form.status === "PENDING" ? "warning" : "default"} className="text-sm">
              {form.status}
            </Badge>
            {actualProfit !== null && (
              <p className={`text-sm font-medium mt-1 ${actualProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                Profit: {formatCurrency(actualProfit)}
              </p>
            )}
          </Card>
        </div>

        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="costs">Costs</TabsTrigger>
              <TabsTrigger value="sale">Sale Info</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

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
                  <Label htmlFor="mileage">Odometer</Label>
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

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date_acquired">Date Acquired</Label>
                  <Input id="date_acquired" type="date" value={form.date_acquired} onChange={(e) => setForm({ ...form, date_acquired: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchase_price">Purchase Price</Label>
                  <Input id="purchase_price" type="number" step="0.01" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asking_price">Asking Price</Label>
                  <Input id="asking_price" type="number" step="0.01" value={form.asking_price} onChange={(e) => setForm({ ...form, asking_price: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="costs" className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Safety Estimate</Label>
                  <Input type="number" step="0.01" value={form.safety_estimate} onChange={(e) => setForm({ ...form, safety_estimate: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Safety Cost (Actual)</Label>
                  <Input type="number" step="0.01" value={form.safety_cost} onChange={(e) => setForm({ ...form, safety_cost: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Safety Charge (to Customer)</Label>
                  <Input type="number" step="0.01" value={form.safety_charge} onChange={(e) => setForm({ ...form, safety_charge: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Warranty Cost</Label>
                  <Input type="number" step="0.01" value={form.warranty_cost} onChange={(e) => setForm({ ...form, warranty_cost: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Warranty Charge (to Customer)</Label>
                  <Input type="number" step="0.01" value={form.warranty_charge} onChange={(e) => setForm({ ...form, warranty_charge: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>OMVIC Fee</Label>
                  <Input type="number" step="0.01" value={form.omvic_fee} onChange={(e) => setForm({ ...form, omvic_fee: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Floorplan Interest</Label>
                  <Input type="number" step="0.01" value={form.floorplan_interest_cost} onChange={(e) => setForm({ ...form, floorplan_interest_cost: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Gas</Label>
                  <Input type="number" step="0.01" value={form.gas} onChange={(e) => setForm({ ...form, gas: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Referral Amount</Label>
                  <Input type="number" step="0.01" value={form.referral_amount} onChange={(e) => setForm({ ...form, referral_amount: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>

              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-medium">Total Vehicle Cost:</span>
                    <span className="text-2xl font-bold">{formatCurrency(totalCost)}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sale" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Selling Price</Label>
                  <Input type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Date Sold</Label>
                  <Input type="date" value={form.date_sold} onChange={(e) => setForm({ ...form, date_sold: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Buyer Name</Label>
                  <Input value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Salesperson</Label>
                  <Select value={form.salesperson_id || "none"} onValueChange={(value) => setForm({ ...form, salesperson_id: value === "none" ? "" : value })}>
                    <SelectTrigger><SelectValue placeholder="Select salesperson" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {salesUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={form.payment_method || "none"} onValueChange={(value) => setForm({ ...form, payment_method: value === "none" ? "" : value })}>
                    <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="FINANCE">Finance</SelectItem>
                      <SelectItem value="CERTIFIED_CHEQUE">Certified Cheque</SelectItem>
                      <SelectItem value="E_TRANSFER">E-Transfer</SelectItem>
                      <SelectItem value="BANK_DRAFT">Bank Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Deposit Amount</Label>
                  <Input type="number" step="0.01" value={form.deposit_amount} onChange={(e) => setForm({ ...form, deposit_amount: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>

              {form.selling_price > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Revenue</p>
                        <p className="text-xl font-bold">{formatCurrency((form.selling_price || 0) + (form.safety_charge || 0) + (form.warranty_charge || 0))}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Net Profit</p>
                        <p className={`text-xl font-bold ${calculateNetProfit({ ...form, purchase_price: form.purchase_price }) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(calculateNetProfit({ ...form, purchase_price: form.purchase_price }))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="notes" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Notes</Label>
                <textarea
                  className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Add any notes about this vehicle..."
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-between mt-6">
            {vehicle && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={saving}>Delete</Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
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

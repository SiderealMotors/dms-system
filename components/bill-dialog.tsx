"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import type { Vendor, Vehicle } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const TAX_RATE = 0.13 // Ontario HST

interface BillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendors: Vendor[]
  onSuccess?: () => void
}

// Common bill types for dealerships
const BILL_TYPES = [
  { value: "vehicle_purchase", label: "Vehicle Purchase", taxable: true },
  { value: "safety_inspection", label: "Safety Inspection", taxable: true },
  { value: "reconditioning", label: "Reconditioning/Repairs", taxable: true },
  { value: "parts", label: "Parts & Supplies", taxable: true },
  { value: "warranty_cost", label: "Warranty Cost", taxable: true },
  { value: "floorplan_interest", label: "Floorplan Interest", taxable: false },
  { value: "rent", label: "Rent", taxable: false },
  { value: "utilities", label: "Utilities", taxable: true },
  { value: "advertising", label: "Advertising", taxable: true },
  { value: "insurance", label: "Insurance", taxable: false },
  { value: "professional_fees", label: "Professional Fees", taxable: true },
  { value: "office_supplies", label: "Office Supplies", taxable: true },
  { value: "other", label: "Other Expense", taxable: true },
]

export function BillDialog({ open, onOpenChange, vendors, onSuccess }: BillDialogProps) {
  const { data: vehiclesData } = useSWR("/api/vehicles?status=AVAILABLE", fetcher)
  const vehicles: Vehicle[] = vehiclesData?.data || []

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    vendor_id: "",
    vehicle_id: "",
    bill_number: "",
    bill_date: new Date().toISOString().split("T")[0],
    due_date: "",
    bill_type: "",
    description: "",
    amount: 0,
    is_taxable: true,
    create_journal_entry: true,
  })

  // Calculate tax and total
  const calculations = useMemo(() => {
    const taxAmount = form.is_taxable ? form.amount * TAX_RATE : 0
    const totalAmount = form.amount + taxAmount
    return { taxAmount, totalAmount }
  }, [form.amount, form.is_taxable])

  const handleBillTypeChange = (value: string) => {
    const billType = BILL_TYPES.find(t => t.value === value)
    setForm(prev => ({
      ...prev,
      bill_type: value,
      is_taxable: billType?.taxable ?? true,
      description: billType?.label || "",
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const res = await fetch("/api/accounting/payables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: form.vendor_id || null,
          vehicle_id: form.vehicle_id || null,
          bill_number: form.bill_number || null,
          bill_date: form.bill_date,
          due_date: form.due_date || null,
          description: form.description,
          amount: form.amount,
          tax_amount: calculations.taxAmount,
          total_amount: calculations.totalAmount,
          createJournalEntry: form.create_journal_entry,
        }),
      })

      if (!res.ok) throw new Error("Failed to create bill")

      // Reset form
      setForm({
        vendor_id: "",
        vehicle_id: "",
        bill_number: "",
        bill_date: new Date().toISOString().split("T")[0],
        due_date: "",
        bill_type: "",
        description: "",
        amount: 0,
        is_taxable: true,
        create_journal_entry: true,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error("Error creating bill:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Bill / Expense</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Bill Type */}
          <div className="space-y-2">
            <Label>Bill Type</Label>
            <Select value={form.bill_type} onValueChange={handleBillTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {BILL_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label} {!type.taxable && "(No Tax)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vendor */}
          <div className="space-y-2">
            <Label>Vendor (Optional)</Label>
            <Select value={form.vendor_id || "none"} onValueChange={(v) => setForm(prev => ({ ...prev, vendor_id: v === "none" ? "" : v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select vendor..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Vendor</SelectItem>
                {vendors.map(vendor => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Link to Vehicle (for vehicle-related expenses) */}
          {(form.bill_type === "vehicle_purchase" || form.bill_type === "safety_inspection" || form.bill_type === "reconditioning" || form.bill_type === "parts") && (
            <div className="space-y-2">
              <Label>Link to Vehicle (Optional)</Label>
              <Select value={form.vehicle_id || "none"} onValueChange={(v) => setForm(prev => ({ ...prev, vehicle_id: v === "none" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Vehicle</SelectItem>
                  {vehicles.map(vehicle => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.stock_number} - {vehicle.year} {vehicle.make} {vehicle.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Bill Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Bill Number</Label>
              <Input
                value={form.bill_number}
                onChange={(e) => setForm(prev => ({ ...prev, bill_number: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Bill Date</Label>
              <Input
                type="date"
                value={form.bill_date}
                onChange={(e) => setForm(prev => ({ ...prev, bill_date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description of bill/expense"
              required
            />
          </div>

          {/* Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount (Pre-Tax)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.amount || ""}
                onChange={(e) => setForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm(prev => ({ ...prev, due_date: e.target.value }))}
              />
            </div>
          </div>

          {/* Tax checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_taxable"
              checked={form.is_taxable}
              onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_taxable: !!checked }))}
            />
            <Label htmlFor="is_taxable" className="text-sm font-normal">
              Subject to HST (13%)
            </Label>
          </div>

          {/* Calculated Totals */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal:</span>
              <span>{formatCurrency(form.amount)}</span>
            </div>
            {form.is_taxable && (
              <div className="flex justify-between text-sm">
                <span>HST (13%):</span>
                <span>{formatCurrency(calculations.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-2">
              <span>Total:</span>
              <span>{formatCurrency(calculations.totalAmount)}</span>
            </div>
          </div>

          {/* Auto Journal Entry */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="create_journal_entry"
              checked={form.create_journal_entry}
              onCheckedChange={(checked) => setForm(prev => ({ ...prev, create_journal_entry: !!checked }))}
            />
            <Label htmlFor="create_journal_entry" className="text-sm font-normal">
              Automatically create journal entry
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !form.description || form.amount <= 0}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Bill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

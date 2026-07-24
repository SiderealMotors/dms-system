"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"
import type { Vendor } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then(res => res.json())

const TAX_RATE = 0.13

const EXPENSE_TYPES = [
  { value: "REPAIR", label: "Repair / Mechanical Work" },
  { value: "PARTS", label: "Parts & Accessories" },
  { value: "DETAILING", label: "Detailing / Cleaning" },
  { value: "INSPECTION", label: "Inspection / Certification" },
  { value: "TOWING", label: "Towing / Transport" },
  { value: "REGISTRATION", label: "Registration / Licensing" },
  { value: "ADVERTISING", label: "Advertising / Marketing" },
  { value: "OTHER", label: "Other Expense" },
]

interface AddExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicleId: string
  vehicleInfo: {
    year: number
    make: string
    model: string
    stock_number: string
  }
  onSuccess?: () => void
}

export function AddExpenseDialog({
  open,
  onOpenChange,
  vehicleId,
  vehicleInfo,
  onSuccess,
}: AddExpenseDialogProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    expense_date: new Date().toISOString().split("T")[0],
    expense_type: "",
    description: "",
    notes: "",
    amount: 0,
    is_taxable: true,
    vendor_id: "",
  })

  // Fetch vendors for dropdown
  const { data: vendorsData } = useSWR<{ data: Vendor[] }>(
    open ? "/api/vendors" : null,
    fetcher
  )
  const vendors = vendorsData?.data || []

  // Calculate tax and total
  const calculations = useMemo(() => {
    const taxAmount = form.is_taxable ? form.amount * TAX_RATE : 0
    const totalAmount = form.amount + taxAmount
    return { taxAmount, totalAmount }
  }, [form.amount, form.is_taxable])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!form.expense_type) {
      setError("Please select an expense type")
      return
    }

    if (!form.description.trim()) {
      setError("Please enter a description")
      return
    }

    if (form.amount <= 0) {
      setError("Please enter a valid amount")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_date: form.expense_date,
          expense_type: form.expense_type,
          description: form.description,
          notes: form.notes || null,
          amount: form.amount,
          is_taxable: form.is_taxable,
          vendor_id: form.vendor_id || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to add expense")
      }

      // Reset form
      setForm({
        expense_date: new Date().toISOString().split("T")[0],
        expense_type: "",
        description: "",
        notes: "",
        amount: 0,
        is_taxable: true,
        vendor_id: "",
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add expense")
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {vehicleInfo.year} {vehicleInfo.make} {vehicleInfo.model} ({vehicleInfo.stock_number})
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Expense Date */}
            <div className="space-y-2">
              <Label htmlFor="expense_date">Date</Label>
              <Input
                id="expense_date"
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm(prev => ({ ...prev, expense_date: e.target.value }))}
                required
              />
            </div>

            {/* Expense Type */}
            <div className="space-y-2">
              <Label htmlFor="expense_type">Expense Type</Label>
              <Select
                value={form.expense_type}
                onValueChange={(value) => setForm(prev => ({ ...prev, expense_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="e.g., Oil change, New tires, Windshield repair"
              required
            />
          </div>

          {/* Vendor */}
          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor (Optional)</Label>
            <Select
              value={form.vendor_id || "none"}
              onValueChange={(value) => setForm(prev => ({ ...prev, vendor_id: value === "none" ? "" : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No vendor</SelectItem>
                {vendors.filter(v => v.id).map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (before tax)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount || ""}
                onChange={(e) => setForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                required
              />
            </div>

            {/* Tax Toggle */}
            <div className="space-y-2">
              <Label>Tax</Label>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="is_taxable"
                  checked={form.is_taxable}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_taxable: !!checked }))}
                />
                <Label htmlFor="is_taxable" className="text-sm font-normal">
                  HST Applicable (13%)
                </Label>
              </div>
            </div>
          </div>

          {/* Amount Summary */}
          {form.amount > 0 && (
            <div className="p-3 bg-muted rounded-md space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatCurrency(form.amount)}</span>
              </div>
              {form.is_taxable && (
                <div className="flex justify-between text-muted-foreground">
                  <span>HST (13%):</span>
                  <span>{formatCurrency(calculations.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium pt-1 border-t">
                <span>Total:</span>
                <span>{formatCurrency(calculations.totalAmount)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional details about this expense..."
              rows={3}
            />
          </div>

          {/* Info about automatic accounting */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            This expense will be automatically recorded in the accounting system as a paid transaction.
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Expense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

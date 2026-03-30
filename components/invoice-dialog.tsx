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
import type { Customer, Vehicle } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const TAX_RATE = 0.13 // Ontario HST

interface InvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function InvoiceDialog({ open, onOpenChange, onSuccess }: InvoiceDialogProps) {
  const { data: customersData } = useSWR("/api/customers", fetcher)
  const { data: vehiclesData } = useSWR("/api/vehicles?status=SOLD", fetcher)
  
  const customers: Customer[] = customersData?.data || []
  const vehicles: Vehicle[] = vehiclesData?.data || []

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    customer_id: "",
    vehicle_id: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: "",
    description: "",
    subtotal: 0,
    is_taxable: true,
    create_journal_entry: true,
    mark_as_paid: false, // If true, skip AR and record as direct cash receipt
  })

  // Calculate tax and total
  const calculations = useMemo(() => {
    const taxAmount = form.is_taxable ? form.subtotal * TAX_RATE : 0
    const totalAmount = form.subtotal + taxAmount
    return { taxAmount, totalAmount }
  }, [form.subtotal, form.is_taxable])

  // Auto-populate from vehicle selection
  const handleVehicleChange = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (vehicle) {
      const sellingPrice = vehicle.selling_price || 0
      const safetyCharge = vehicle.safety_charge || 0
      const warrantyCharge = vehicle.warranty_charge || 0
      const omvicFee = vehicle.omvic_fee || 0
      const subtotal = sellingPrice + safetyCharge + warrantyCharge + omvicFee

      setForm(prev => ({
        ...prev,
        vehicle_id: vehicleId,
        description: `Vehicle Sale: ${vehicle.year} ${vehicle.make} ${vehicle.model} (Stock #${vehicle.stock_number})`,
        subtotal,
      }))
    } else {
      setForm(prev => ({ ...prev, vehicle_id: vehicleId }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const res = await fetch("/api/accounting/receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: form.customer_id || null,
          vehicle_id: form.vehicle_id || null,
          invoice_date: form.invoice_date,
          due_date: form.due_date || null,
          description: form.description,
          subtotal: form.subtotal,
          tax_amount: calculations.taxAmount,
          total_amount: calculations.totalAmount,
          createJournalEntry: form.create_journal_entry,
          markAsPaid: form.mark_as_paid,
        }),
      })

      if (!res.ok) throw new Error("Failed to create invoice")

      // Reset form
      setForm({
        customer_id: "",
        vehicle_id: "",
        invoice_date: new Date().toISOString().split("T")[0],
        due_date: "",
        description: "",
        subtotal: 0,
        is_taxable: true,
        create_journal_entry: true,
        mark_as_paid: false,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error("Error creating invoice:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Customer Invoice</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer */}
          <div className="space-y-2">
            <Label>Customer (Optional)</Label>
            <Select value={form.customer_id || "none"} onValueChange={(v) => setForm(prev => ({ ...prev, customer_id: v === "none" ? "" : v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Walk-in Customer</SelectItem>
                {customers.map(customer => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.first_name} {customer.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Link to Vehicle */}
          <div className="space-y-2">
            <Label>Vehicle Sale (Auto-populate)</Label>
            <Select value={form.vehicle_id || "none"} onValueChange={(v) => handleVehicleChange(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select sold vehicle..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Manual Entry</SelectItem>
                {vehicles.map(vehicle => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.stock_number} - {vehicle.year} {vehicle.make} {vehicle.model}
                    {vehicle.selling_price && ` - ${formatCurrency(vehicle.selling_price)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Invoice Date</Label>
              <Input
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm(prev => ({ ...prev, invoice_date: e.target.value }))}
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

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Invoice description"
              required
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>Subtotal (Pre-Tax)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.subtotal || ""}
              onChange={(e) => setForm(prev => ({ ...prev, subtotal: parseFloat(e.target.value) || 0 }))}
              required
            />
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
              <span>{formatCurrency(form.subtotal)}</span>
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

          {/* Mark as Paid */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="mark_as_paid"
              checked={form.mark_as_paid}
              onCheckedChange={(checked) => setForm(prev => ({ ...prev, mark_as_paid: !!checked }))}
            />
            <Label htmlFor="mark_as_paid" className="text-sm font-normal">
              Already paid (skip Accounts Receivable, record as direct cash receipt)
            </Label>
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
            <Button type="submit" disabled={isSubmitting || !form.description || form.subtotal <= 0}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Invoice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

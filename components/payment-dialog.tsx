"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Loader2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import type { AccountsPayable, AccountsReceivable } from "@/lib/types"

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: "payable" | "receivable"
  item: AccountsPayable | AccountsReceivable
  onSuccess?: () => void
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "eft", label: "EFT / Bank Transfer" },
  { value: "credit_card", label: "Credit Card" },
  { value: "debit", label: "Debit" },
  { value: "financing", label: "Financing" },
  { value: "other", label: "Other" },
]

export function PaymentDialog({ open, onOpenChange, type, item, onSuccess }: PaymentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    amount: item.total_amount - item.amount_paid,
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "check",
  })

  const remainingBalance = item.total_amount - item.amount_paid

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const res = await fetch("/api/accounting/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          id: item.id,
          amount: form.amount,
          payment_date: form.payment_date,
          payment_method: form.payment_method,
        }),
      })

      if (!res.ok) throw new Error("Failed to record payment")

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error("Error recording payment:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {type === "payable" ? "Record Payment" : "Record Receipt"}
          </DialogTitle>
          <DialogDescription>
            {type === "payable" 
              ? `Pay bill: ${item.description}`
              : `Receive payment for: ${item.description}`
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Balance Summary */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span>Total Amount:</span>
              <span>{formatCurrency(item.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Already {type === "payable" ? "Paid" : "Collected"}:</span>
              <span>{formatCurrency(item.amount_paid)}</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-2">
              <span>Remaining Balance:</span>
              <span className={remainingBalance > 0 ? "text-amber-600" : "text-green-600"}>
                {formatCurrency(remainingBalance)}
              </span>
            </div>
          </div>

          {/* Payment Amount */}
          <div className="space-y-2">
            <Label>Payment Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={remainingBalance}
              value={form.amount || ""}
              onChange={(e) => setForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
              required
            />
            <p className="text-xs text-muted-foreground">
              Max: {formatCurrency(remainingBalance)}
            </p>
          </div>

          {/* Payment Date */}
          <div className="space-y-2">
            <Label>Payment Date</Label>
            <Input
              type="date"
              value={form.payment_date}
              onChange={(e) => setForm(prev => ({ ...prev, payment_date: e.target.value }))}
              required
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select 
              value={form.payment_method} 
              onValueChange={(v) => setForm(prev => ({ ...prev, payment_method: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(method => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || form.amount <= 0 || form.amount > remainingBalance}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {type === "payable" ? "Record Payment" : "Record Receipt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

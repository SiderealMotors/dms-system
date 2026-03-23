"use client"

import { useState, useEffect } from "react"
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
import type { Deal, DealStage, Vehicle, Lead, User } from "@/lib/types"
import { formatCurrency } from "@/lib/utils"

interface DealDialogProps {
  open: boolean
  onClose: () => void
  deal: Deal | null
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const initialFormState = {
  vehicle_id: "",
  lead_id: "",
  salesperson_id: "",
  stage: "OPEN" as DealStage,
  sale_price: 0,
  trade_in_value: 0,
  down_payment: 0,
  notes: "",
}

export function DealDialog({ open, onClose, deal }: DealDialogProps) {
  const [form, setForm] = useState(initialFormState)
  const [loading, setLoading] = useState(false)

  const { data: vehiclesData } = useSWR("/api/vehicles?status=AVAILABLE", fetcher)
  const { data: leadsData } = useSWR("/api/leads", fetcher)
  const { data: usersData } = useSWR("/api/users?role=SALES", fetcher)

  const vehicles: Vehicle[] = vehiclesData?.data || []
  const leads: Lead[] = leadsData?.data || []
  const salesUsers: User[] = usersData?.data || []

  // Include current vehicle if editing
  const availableVehicles =
    deal?.vehicle && !vehicles.find((v) => v.id === deal.vehicle_id)
      ? [deal.vehicle, ...vehicles]
      : vehicles

  useEffect(() => {
    if (deal) {
      setForm({
        vehicle_id: deal.vehicle_id,
        lead_id: deal.lead_id || "",
        salesperson_id: deal.salesperson_id || "",
        stage: deal.stage,
        sale_price: deal.sale_price || 0,
        trade_in_value: deal.trade_in_value || 0,
        down_payment: deal.down_payment || 0,
        notes: deal.notes || "",
      })
    } else {
      setForm(initialFormState)
    }
  }, [deal])

  // Calculate gross profit
  const selectedVehicle = availableVehicles.find((v) => v.id === form.vehicle_id)
  const grossProfit = form.sale_price - (selectedVehicle?.purchase_price || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = deal ? `/api/deals/${deal.id}` : "/api/deals"
      const method = deal ? "PUT" : "POST"

      const payload = {
        ...form,
        lead_id: form.lead_id || null,
        salesperson_id: form.salesperson_id || null,
        gross_profit: grossProfit,
        deal_date:
          form.stage === "CLOSED_WON" ? new Date().toISOString().split("T")[0] : null,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        onClose()
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deal || !confirm("Are you sure you want to delete this deal?")) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/deals/${deal.id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        onClose()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{deal ? "Edit Deal" : "New Deal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle_id">Vehicle</Label>
              <Select
                value={form.vehicle_id}
                onValueChange={(value) =>
                  setForm({ ...form, vehicle_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {availableVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.stock_number} - {vehicle.year} {vehicle.make}{" "}
                      {vehicle.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lead_id">Lead/Customer</Label>
                <Select
                  value={form.lead_id}
                  onValueChange={(value) => setForm({ ...form, lead_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a lead" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.customer?.first_name} {lead.customer?.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="salesperson_id">Salesperson</Label>
                <Select
                  value={form.salesperson_id}
                  onValueChange={(value) =>
                    setForm({ ...form, salesperson_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select salesperson" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {salesUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stage">Stage</Label>
              <Select
                value={form.stage}
                onValueChange={(value) =>
                  setForm({ ...form, stage: value as DealStage })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="QUALIFIED">Qualified</SelectItem>
                  <SelectItem value="PROPOSAL">Proposal</SelectItem>
                  <SelectItem value="NEGOTIATION">Negotiation</SelectItem>
                  <SelectItem value="CLOSED_WON">Closed Won</SelectItem>
                  <SelectItem value="CLOSED_LOST">Closed Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sale_price">Sale Price</Label>
                <Input
                  id="sale_price"
                  type="number"
                  step="0.01"
                  value={form.sale_price}
                  onChange={(e) =>
                    setForm({ ...form, sale_price: parseFloat(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trade_in_value">Trade-In Value</Label>
                <Input
                  id="trade_in_value"
                  type="number"
                  step="0.01"
                  value={form.trade_in_value}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      trade_in_value: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="down_payment">Down Payment</Label>
                <Input
                  id="down_payment"
                  type="number"
                  step="0.01"
                  value={form.down_payment}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      down_payment: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            {selectedVehicle && (
              <div className="rounded-lg bg-muted p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Purchase Price:</span>
                    <div className="font-medium">
                      {formatCurrency(selectedVehicle.purchase_price)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sale Price:</span>
                    <div className="font-medium">
                      {formatCurrency(form.sale_price)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gross Profit:</span>
                    <div
                      className={`font-medium ${
                        grossProfit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(grossProfit)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <DialogFooter>
            {deal && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
              >
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !form.vehicle_id}>
              {loading ? "Saving..." : deal ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

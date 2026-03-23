"use client"

import { useState, useEffect } from "react"
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
import type { Vehicle, VehicleStatus } from "@/lib/types"

interface VehicleDialogProps {
  open: boolean
  onClose: () => void
  vehicle: Vehicle | null
}

const initialFormState = {
  vin: "",
  year: new Date().getFullYear(),
  make: "",
  model: "",
  trim: "",
  exterior_color: "",
  interior_color: "",
  mileage: 0,
  purchase_price: 0,
  asking_price: 0,
  status: "AVAILABLE" as VehicleStatus,
  notes: "",
}

export function VehicleDialog({ open, onClose, vehicle }: VehicleDialogProps) {
  const [form, setForm] = useState(initialFormState)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (vehicle) {
      setForm({
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim || "",
        exterior_color: vehicle.exterior_color || "",
        interior_color: vehicle.interior_color || "",
        mileage: vehicle.mileage,
        purchase_price: vehicle.purchase_price,
        asking_price: vehicle.asking_price || 0,
        status: vehicle.status,
        notes: vehicle.notes || "",
      })
    } else {
      setForm(initialFormState)
    }
  }, [vehicle])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = vehicle ? `/api/vehicles/${vehicle.id}` : "/api/vehicles"
      const method = vehicle ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (response.ok) {
        onClose()
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!vehicle || !confirm("Are you sure you want to delete this vehicle?")) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/vehicles/${vehicle.id}`, {
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
          <DialogTitle>
            {vehicle ? "Edit Vehicle" : "Add New Vehicle"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vin">VIN</Label>
                <Input
                  id="vin"
                  value={form.vin}
                  onChange={(e) => setForm({ ...form, vin: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={form.year}
                  onChange={(e) =>
                    setForm({ ...form, year: parseInt(e.target.value) })
                  }
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={form.make}
                  onChange={(e) => setForm({ ...form, make: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trim">Trim</Label>
                <Input
                  id="trim"
                  value={form.trim}
                  onChange={(e) => setForm({ ...form, trim: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exterior_color">Exterior Color</Label>
                <Input
                  id="exterior_color"
                  value={form.exterior_color}
                  onChange={(e) =>
                    setForm({ ...form, exterior_color: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interior_color">Interior Color</Label>
                <Input
                  id="interior_color"
                  value={form.interior_color}
                  onChange={(e) =>
                    setForm({ ...form, interior_color: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mileage">Mileage</Label>
                <Input
                  id="mileage"
                  type="number"
                  value={form.mileage}
                  onChange={(e) =>
                    setForm({ ...form, mileage: parseInt(e.target.value) })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm({ ...form, status: value as VehicleStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                <Label htmlFor="purchase_price">Purchase Price</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  step="0.01"
                  value={form.purchase_price}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      purchase_price: parseFloat(e.target.value),
                    })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asking_price">Asking Price</Label>
                <Input
                  id="asking_price"
                  type="number"
                  step="0.01"
                  value={form.asking_price}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      asking_price: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
            </div>

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
            {vehicle && (
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
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : vehicle ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Lead, LeadStatus, LeadSource, User } from "@/lib/types"

interface LeadDialogProps {
  open: boolean
  onClose: () => void
  lead: Lead | null
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const initialCustomerForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
}

const initialLeadForm = {
  status: "NEW_LEAD" as LeadStatus,
  source: "WALK_IN" as LeadSource,
  assigned_to: "",
  notes: "",
}

export function LeadDialog({ open, onClose, lead }: LeadDialogProps) {
  const [customerForm, setCustomerForm] = useState(initialCustomerForm)
  const [leadForm, setLeadForm] = useState(initialLeadForm)
  const [loading, setLoading] = useState(false)

  const { data: usersData } = useSWR("/api/users?role=SALES", fetcher)
  const salesUsers: User[] = usersData?.data || []

  useEffect(() => {
    if (lead) {
      setCustomerForm({
        first_name: lead.customer?.first_name || "",
        last_name: lead.customer?.last_name || "",
        email: lead.customer?.email || "",
        phone: lead.customer?.phone || "",
        address: lead.customer?.address || "",
        city: lead.customer?.city || "",
        state: lead.customer?.state || "",
        zip: lead.customer?.zip || "",
      })
      setLeadForm({
        status: lead.status,
        source: lead.source,
        assigned_to: lead.assigned_to || "",
        notes: lead.notes || "",
      })
    } else {
      setCustomerForm(initialCustomerForm)
      setLeadForm(initialLeadForm)
    }
  }, [lead])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (lead) {
        // Update existing lead
        await fetch(`/api/leads/${lead.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...leadForm,
            assigned_to: leadForm.assigned_to || null,
          }),
        })
      } else {
        // Create new customer first
        const customerResponse = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(customerForm),
        })
        const customerData = await customerResponse.json()

        if (customerData.data) {
          // Create lead with new customer
          await fetch("/api/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_id: customerData.data.id,
              ...leadForm,
              assigned_to: leadForm.assigned_to || null,
            }),
          })
        }
      }
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!lead || !confirm("Are you sure you want to delete this lead?")) {
      return
    }

    setLoading(true)
    try {
      await fetch(`/api/leads/${lead.id}`, { method: "DELETE" })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit Lead" : "Add New Lead"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="customer" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="customer">Customer Info</TabsTrigger>
              <TabsTrigger value="lead">Lead Details</TabsTrigger>
            </TabsList>

            <TabsContent value="customer" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={customerForm.first_name}
                    onChange={(e) =>
                      setCustomerForm({
                        ...customerForm,
                        first_name: e.target.value,
                      })
                    }
                    required
                    disabled={!!lead}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={customerForm.last_name}
                    onChange={(e) =>
                      setCustomerForm({
                        ...customerForm,
                        last_name: e.target.value,
                      })
                    }
                    required
                    disabled={!!lead}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={customerForm.email}
                    onChange={(e) =>
                      setCustomerForm({ ...customerForm, email: e.target.value })
                    }
                    disabled={!!lead}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={customerForm.phone}
                    onChange={(e) =>
                      setCustomerForm({ ...customerForm, phone: e.target.value })
                    }
                    disabled={!!lead}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={customerForm.address}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, address: e.target.value })
                  }
                  disabled={!!lead}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={customerForm.city}
                    onChange={(e) =>
                      setCustomerForm({ ...customerForm, city: e.target.value })
                    }
                    disabled={!!lead}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={customerForm.state}
                    onChange={(e) =>
                      setCustomerForm({ ...customerForm, state: e.target.value })
                    }
                    disabled={!!lead}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">ZIP</Label>
                  <Input
                    id="zip"
                    value={customerForm.zip}
                    onChange={(e) =>
                      setCustomerForm({ ...customerForm, zip: e.target.value })
                    }
                    disabled={!!lead}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="lead" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={leadForm.status}
                    onValueChange={(value) =>
                      setLeadForm({ ...leadForm, status: value as LeadStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NEW_LEAD">New Lead</SelectItem>
                      <SelectItem value="CONTACTED">Contacted</SelectItem>
                      <SelectItem value="NEGOTIATING">Negotiating</SelectItem>
                      <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Select
                    value={leadForm.source}
                    onValueChange={(value) =>
                      setLeadForm({ ...leadForm, source: value as LeadSource })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WALK_IN">Walk-In</SelectItem>
                      <SelectItem value="PHONE">Phone</SelectItem>
                      <SelectItem value="WEB">Web</SelectItem>
                      <SelectItem value="REFERRAL">Referral</SelectItem>
                      <SelectItem value="SOCIAL">Social</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assigned_to">Assigned To</Label>
                <Select
                  value={leadForm.assigned_to || "unassigned"}
                  onValueChange={(value) =>
                    setLeadForm({ ...leadForm, assigned_to: value === "unassigned" ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select salesperson" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {salesUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={leadForm.notes}
                  onChange={(e) =>
                    setLeadForm({ ...leadForm, notes: e.target.value })
                  }
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            {lead && (
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
              {loading ? "Saving..." : lead ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

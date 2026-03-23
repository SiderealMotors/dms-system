"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Phone, Mail, User } from "lucide-react"
import { formatDate } from "@/lib/utils"
import type { Lead, LeadStatus } from "@/lib/types"
import { LeadDialog } from "@/components/lead-dialog"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const statusColors: Record<LeadStatus, "default" | "secondary" | "warning" | "success"> = {
  NEW_LEAD: "default",
  CONTACTED: "secondary",
  NEGOTIATING: "warning",
  CLOSED: "success",
}

const statusLabels: Record<LeadStatus, string> = {
  NEW_LEAD: "New Lead",
  CONTACTED: "Contacted",
  NEGOTIATING: "Negotiating",
  CLOSED: "Closed",
}

export default function CRMPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const queryParams = new URLSearchParams()
  if (statusFilter !== "all") queryParams.set("status", statusFilter)

  const { data, mutate, isLoading } = useSWR(
    `/api/leads?${queryParams.toString()}`,
    fetcher
  )

  const leads: Lead[] = data?.data || []

  // Group leads by status for Kanban view
  const leadsByStatus = {
    NEW_LEAD: leads.filter((l) => l.status === "NEW_LEAD"),
    CONTACTED: leads.filter((l) => l.status === "CONTACTED"),
    NEGOTIATING: leads.filter((l) => l.status === "NEGOTIATING"),
    CLOSED: leads.filter((l) => l.status === "CLOSED"),
  }

  const handleEdit = (lead: Lead) => {
    setSelectedLead(lead)
    setDialogOpen(true)
  }

  const handleAdd = () => {
    setSelectedLead(null)
    setDialogOpen(true)
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    setSelectedLead(null)
    mutate()
  }

  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    await fetch(`/api/leads/${leadId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    mutate()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">CRM</h1>
          <p className="text-muted-foreground">Manage your leads and customers</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading leads...</div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {(Object.keys(leadsByStatus) as LeadStatus[]).map((status) => (
            <div key={status} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{statusLabels[status]}</h3>
                <Badge variant="outline">{leadsByStatus[status].length}</Badge>
              </div>
              <div className="space-y-3">
                {leadsByStatus[status].map((lead) => (
                  <Card
                    key={lead.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => handleEdit(lead)}
                  >
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {lead.customer?.first_name} {lead.customer?.last_name}
                        </span>
                      </div>
                      {lead.customer?.phone && (
                        <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {lead.customer.phone}
                        </div>
                      )}
                      {lead.customer?.email && (
                        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {lead.customer.email}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {lead.source.replace("_", " ")}
                        </Badge>
                        <span>{formatDate(lead.created_at)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {leadsByStatus[status].length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No leads
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <LeadDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        lead={selectedLead}
      />
    </div>
  )
}

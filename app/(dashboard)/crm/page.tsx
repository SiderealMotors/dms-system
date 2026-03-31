"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Users, UserPlus, Target, CheckCircle } from "lucide-react"
import type { Lead, LeadStatus } from "@/lib/types"
import { LeadDialog } from "@/components/lead-dialog"
import { LeadKanban } from "@/components/lead-kanban"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function CRMPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [view, setView] = useState<"kanban" | "list">("kanban")

  const { data, mutate, isLoading } = useSWR("/api/leads", fetcher)

  const leads: Lead[] = data?.data || []

  // Calculate stats
  const stats = {
    total: leads.length,
    newLeads: leads.filter((l) => l.status === "NEW_LEAD").length,
    contacted: leads.filter((l) => l.status === "CONTACTED").length,
    negotiating: leads.filter((l) => l.status === "NEGOTIATING").length,
    closed: leads.filter((l) => l.status === "CLOSED").length,
  }

  const conversionRate = stats.total > 0 ? ((stats.closed / stats.total) * 100).toFixed(1) : "0"

  const handleLeadClick = (lead: Lead) => {
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
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      mutate()
    } catch (error) {
      console.error("Failed to update lead status:", error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">CRM Pipeline</h1>
          <p className="text-muted-foreground">
            Manage your leads and track conversions
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Leads</CardTitle>
            <UserPlus className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.newLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contacted</CardTitle>
            <Target className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.contacted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Negotiating</CardTitle>
            <Target className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.negotiating}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground">{stats.closed} closed</p>
          </CardContent>
        </Card>
      </div>

      {/* Kanban Board */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Lead Pipeline</CardTitle>
            <Badge variant="outline">Drag and drop to change status</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-muted-foreground">Loading leads...</div>
            </div>
          ) : (
            <LeadKanban
              leads={leads}
              onLeadClick={handleLeadClick}
              onStatusChange={handleStatusChange}
              onAddLead={handleAdd}
            />
          )}
        </CardContent>
      </Card>

      <LeadDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        lead={selectedLead}
      />
    </div>
  )
}

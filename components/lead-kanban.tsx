"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Phone, Mail, User, GripVertical, Plus } from "lucide-react"
import type { Lead, LeadStatus } from "@/lib/types"

interface LeadKanbanProps {
  leads: Lead[]
  onLeadClick: (lead: Lead) => void
  onStatusChange: (leadId: string, newStatus: LeadStatus) => void
  onAddLead: () => void
}

const columns: { status: LeadStatus; title: string; color: string }[] = [
  { status: "NEW_LEAD", title: "New Leads", color: "bg-blue-500" },
  { status: "CONTACTED", title: "Contacted", color: "bg-yellow-500" },
  { status: "NEGOTIATING", title: "Negotiating", color: "bg-purple-500" },
  { status: "CLOSED", title: "Closed", color: "bg-green-500" },
]

export function LeadKanban({ leads, onLeadClick, onStatusChange, onAddLead }: LeadKanbanProps) {
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", lead.id)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedLead(null)
    setDragOverColumn(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverColumn(status)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, newStatus: LeadStatus) => {
      e.preventDefault()
      if (draggedLead && draggedLead.status !== newStatus) {
        onStatusChange(draggedLead.id, newStatus)
      }
      setDraggedLead(null)
      setDragOverColumn(null)
    },
    [draggedLead, onStatusChange]
  )

  const getLeadsByStatus = (status: LeadStatus) => {
    return leads.filter((lead) => lead.status === status)
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((column) => {
        const columnLeads = getLeadsByStatus(column.status)
        const isDropTarget = dragOverColumn === column.status

        return (
          <div
            key={column.status}
            className={`flex-shrink-0 w-80 rounded-lg border bg-muted/30 transition-colors ${
              isDropTarget ? "border-primary bg-primary/5" : ""
            }`}
            onDragOver={(e) => handleDragOver(e, column.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.status)}
          >
            <div className="p-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${column.color}`} />
                  <h3 className="font-semibold">{column.title}</h3>
                </div>
                <Badge variant="secondary">{columnLeads.length}</Badge>
              </div>
            </div>
            <div className="p-2 space-y-2 min-h-[400px]">
              {columnLeads.map((lead) => (
                <Card
                  key={lead.id}
                  className={`cursor-grab active:cursor-grabbing transition-all ${
                    draggedLead?.id === lead.id ? "opacity-50 scale-95" : "hover:shadow-md"
                  }`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, lead)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onLeadClick(lead)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {lead.customer?.first_name?.[0]}
                              {lead.customer?.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium truncate">
                            {lead.customer?.first_name} {lead.customer?.last_name}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          <Badge variant="outline" className="text-xs">
                            {lead.source.replace("_", " ")}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {lead.customer?.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              <span className="truncate">{lead.customer.phone}</span>
                            </div>
                          )}
                          {lead.customer?.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{lead.customer.email}</span>
                            </div>
                          )}
                          {lead.assigned_user && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span className="truncate">{lead.assigned_user.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {column.status === "NEW_LEAD" && (
                <Button
                  variant="ghost"
                  className="w-full border-2 border-dashed"
                  onClick={onAddLead}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Lead
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

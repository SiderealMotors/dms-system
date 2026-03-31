"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Deal, DealStage } from "@/lib/types"
import { DealDialog } from "@/components/deal-dialog"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const stageColors: Record<DealStage, "default" | "secondary" | "warning" | "success" | "destructive"> = {
  OPEN: "default",
  QUALIFIED: "secondary",
  PROPOSAL: "secondary",
  NEGOTIATION: "warning",
  CLOSED_WON: "success",
  CLOSED_LOST: "destructive",
}

const stageLabels: Record<DealStage, string> = {
  OPEN: "Open",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  CLOSED_WON: "Closed Won",
  CLOSED_LOST: "Closed Lost",
}

export default function DealsPage() {
  const [stageFilter, setStageFilter] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)

  const queryParams = new URLSearchParams()
  if (stageFilter !== "all") queryParams.set("stage", stageFilter)

  const { data, mutate, isLoading } = useSWR(
    `/api/deals?${queryParams.toString()}`,
    fetcher
  )

  const deals: Deal[] = data?.data || []

  const handleEdit = (deal: Deal) => {
    setSelectedDeal(deal)
    setDialogOpen(true)
  }

  const handleAdd = () => {
    setSelectedDeal(null)
    setDialogOpen(true)
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    setSelectedDeal(null)
    mutate()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Deals</h1>
          <p className="text-muted-foreground">Manage your sales deals</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          New Deal
        </Button>
      </div>

      <div className="mb-4">
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="QUALIFIED">Qualified</SelectItem>
            <SelectItem value="PROPOSAL">Proposal</SelectItem>
            <SelectItem value="NEGOTIATION">Negotiation</SelectItem>
            <SelectItem value="CLOSED_WON">Closed Won</SelectItem>
            <SelectItem value="CLOSED_LOST">Closed Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal #</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Salesperson</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Sale Price</TableHead>
              <TableHead className="text-right">Gross Profit</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : deals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  No deals found
                </TableCell>
              </TableRow>
            ) : (
              deals.map((deal) => (
                <TableRow
                  key={deal.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleEdit(deal)}
                >
                  <TableCell className="font-medium">{deal.deal_number}</TableCell>
                  <TableCell>
                    {deal.vehicle
                      ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {deal.lead?.customer
                      ? `${deal.lead.customer.first_name} ${deal.lead.customer.last_name}`
                      : "-"}
                  </TableCell>
                  <TableCell>{deal.salesperson?.name || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={stageColors[deal.stage]}>
                      {stageLabels[deal.stage]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {deal.sale_price ? formatCurrency(deal.sale_price) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {deal.gross_profit ? formatCurrency(deal.gross_profit) : "-"}
                  </TableCell>
                  <TableCell>
                    {deal.deal_date ? formatDate(deal.deal_date) : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DealDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        deal={selectedDeal}
      />
    </div>
  )
}

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Search } from "lucide-react"
import { formatCurrency, formatNumber } from "@/lib/utils"
import type { Vehicle, VehicleStatus } from "@/lib/types"
import { VehicleDialog } from "@/components/vehicle-dialog"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const statusColors: Record<VehicleStatus, "default" | "warning" | "success"> = {
  AVAILABLE: "success",
  PENDING: "warning",
  SOLD: "default",
}

export default function InventoryPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)

  const queryParams = new URLSearchParams()
  if (search) queryParams.set("search", search)
  if (statusFilter !== "all") queryParams.set("status", statusFilter)

  const { data, mutate, isLoading } = useSWR(
    `/api/vehicles?${queryParams.toString()}`,
    fetcher
  )

  const vehicles: Vehicle[] = data?.data || []

  const handleEdit = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle)
    setDialogOpen(true)
  }

  const handleAdd = () => {
    setSelectedVehicle(null)
    setDialogOpen(true)
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    setSelectedVehicle(null)
    mutate()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">
            Manage your vehicle inventory
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Vehicle
        </Button>
      </div>

      <div className="mb-4 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by stock number, VIN, make, or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="AVAILABLE">Available</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="SOLD">Sold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stock #</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Make</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Trim</TableHead>
              <TableHead>Mileage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Asking Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : vehicles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  No vehicles found
                </TableCell>
              </TableRow>
            ) : (
              vehicles.map((vehicle) => (
                <TableRow
                  key={vehicle.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleEdit(vehicle)}
                >
                  <TableCell className="font-medium">
                    {vehicle.stock_number}
                  </TableCell>
                  <TableCell>{vehicle.year}</TableCell>
                  <TableCell>{vehicle.make}</TableCell>
                  <TableCell>{vehicle.model}</TableCell>
                  <TableCell>{vehicle.trim || "-"}</TableCell>
                  <TableCell>{formatNumber(vehicle.mileage)}</TableCell>
                  <TableCell>
                    <Badge variant={statusColors[vehicle.status]}>
                      {vehicle.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {vehicle.asking_price
                      ? formatCurrency(vehicle.asking_price)
                      : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <VehicleDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        vehicle={selectedVehicle}
      />
    </div>
  )
}

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Search, Download, Car, DollarSign, Clock, TrendingUp } from "lucide-react"
import { 
  formatCurrency, 
  formatNumber, 
  calculateVehicleTotalCost, 
  calculateLotDays,
  calculateNetProfit 
} from "@/lib/utils"
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
  const [activeTab, setActiveTab] = useState("all")

  const queryParams = new URLSearchParams()
  if (search) queryParams.set("search", search)
  if (statusFilter !== "all") queryParams.set("status", statusFilter)

  const { data, mutate, isLoading } = useSWR(
    `/api/vehicles?${queryParams.toString()}`,
    fetcher
  )

  const vehicles: Vehicle[] = data?.data || []

  // Calculate inventory metrics
  const availableVehicles = vehicles.filter(v => v.status === "AVAILABLE")
  const pendingVehicles = vehicles.filter(v => v.status === "PENDING")
  const soldVehicles = vehicles.filter(v => v.status === "SOLD")

  const totalInvestment = availableVehicles.reduce((sum, v) => sum + calculateVehicleTotalCost(v), 0)
  const potentialRevenue = availableVehicles.reduce((sum, v) => sum + (v.asking_price || 0), 0)
  const avgDaysOnLot = availableVehicles.length > 0 
    ? Math.round(availableVehicles.reduce((sum, v) => sum + calculateLotDays(v.date_acquired), 0) / availableVehicles.length)
    : 0

  const totalProfit = soldVehicles.reduce((sum, v) => sum + calculateNetProfit(v), 0)

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

  const exportCSV = () => {
    const headers = ["Stock #", "VIN", "Year", "Make", "Model", "Trim", "Mileage", "Status", "Purchase Price", "Asking Price", "Total Cost", "Lot Days"]
    const rows = vehicles.map(v => [
      v.stock_number,
      v.vin,
      v.year,
      v.make,
      v.model,
      v.trim || "",
      v.mileage,
      v.status,
      v.purchase_price,
      v.asking_price || "",
      calculateVehicleTotalCost(v),
      calculateLotDays(v.date_acquired, v.date_sold)
    ])
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `inventory-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  const getFilteredVehicles = () => {
    switch (activeTab) {
      case "available": return availableVehicles
      case "pending": return pendingVehicles
      case "sold": return soldVehicles
      default: return vehicles
    }
  }

  const displayVehicles = getFilteredVehicles()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vehicle Inventory</h1>
          <p className="text-muted-foreground">
            Manage your vehicle inventory and track costs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Vehicle
          </Button>
        </div>
      </div>

      {/* Inventory Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Vehicles</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableVehicles.length}</div>
            <p className="text-xs text-muted-foreground">
              {pendingVehicles.length} pending, {soldVehicles.length} sold
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investment</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalInvestment)}</div>
            <p className="text-xs text-muted-foreground">
              In available inventory
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potential Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(potentialRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              Est. profit: {formatCurrency(potentialRevenue - totalInvestment)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Days on Lot</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgDaysOnLot}</div>
            <p className="text-xs text-muted-foreground">
              Total profit: {formatCurrency(totalProfit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">All ({vehicles.length})</TabsTrigger>
                <TabsTrigger value="available">Available ({availableVehicles.length})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({pendingVehicles.length})</TabsTrigger>
                <TabsTrigger value="sold">Sold ({soldVehicles.length})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search vehicles..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stock #</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>VIN</TableHead>
                <TableHead className="text-right">Mileage</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Asking Price</TableHead>
                <TableHead className="text-right">Lot Days</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : displayVehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    No vehicles found
                  </TableCell>
                </TableRow>
              ) : (
                displayVehicles.map((vehicle) => {
                  const totalCost = calculateVehicleTotalCost(vehicle)
                  const lotDays = calculateLotDays(vehicle.date_acquired, vehicle.date_sold)
                  const profit = vehicle.status === "SOLD" ? calculateNetProfit(vehicle) : null
                  
                  return (
                    <TableRow
                      key={vehicle.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleEdit(vehicle)}
                    >
                      <TableCell className="font-medium">
                        {vehicle.stock_number}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{vehicle.year} {vehicle.make} {vehicle.model}</div>
                        <div className="text-sm text-muted-foreground">{vehicle.trim || "-"}</div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{vehicle.vin}</TableCell>
                      <TableCell className="text-right">{formatNumber(vehicle.mileage || vehicle.odometer || 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalCost)}</TableCell>
                      <TableCell className="text-right">
                        {vehicle.status === "SOLD" ? (
                          <div>
                            <div>{formatCurrency(vehicle.selling_price || 0)}</div>
                            <div className={`text-xs ${profit && profit > 0 ? "text-green-600" : "text-red-600"}`}>
                              {profit !== null ? formatCurrency(profit) : "-"}
                            </div>
                          </div>
                        ) : (
                          vehicle.asking_price ? formatCurrency(vehicle.asking_price) : "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={lotDays > 60 ? "text-amber-600 font-medium" : ""}>
                          {lotDays}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColors[vehicle.status]}>
                          {vehicle.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <VehicleDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        vehicle={selectedVehicle}
      />
    </div>
  )
}

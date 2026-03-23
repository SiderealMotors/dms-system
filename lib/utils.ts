import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date))
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num)
}

// Vehicle calculation utilities

// Pre-tax cost (for profit calculation - excludes taxes)
export function calculateVehiclePreTaxCost(vehicle: {
  purchase_price: number
  miscellaneous_cost?: number
  safety_cost?: number
  warranty_cost?: number
  floorplan_interest_cost?: number
  gas?: number
}): number {
  return (
    (vehicle.purchase_price || 0) +
    (vehicle.miscellaneous_cost || 0) +
    (vehicle.safety_cost || 0) +
    (vehicle.warranty_cost || 0) +
    (vehicle.floorplan_interest_cost || 0) +
    (vehicle.gas || 0)
  )
}

// Total cost including taxes (what we actually paid)
export function calculateVehicleTotalCost(vehicle: {
  purchase_price: number
  miscellaneous_cost?: number
  safety_cost?: number
  warranty_cost?: number
  floorplan_interest_cost?: number
  gas?: number
}, taxRate: number = 0.13): number {
  const preTaxCost = calculateVehiclePreTaxCost(vehicle)
  // Add tax on taxable items (purchase, miscellaneous, safety, warranty, gas - not floorplan)
  const taxableItems = (vehicle.purchase_price || 0) + (vehicle.miscellaneous_cost || 0) + (vehicle.safety_cost || 0) + (vehicle.warranty_cost || 0) + (vehicle.gas || 0)
  return preTaxCost + (taxableItems * taxRate)
}

export function calculateLotDays(dateAcquired: string, dateSold?: string): number {
  const acquired = new Date(dateAcquired)
  const endDate = dateSold ? new Date(dateSold) : new Date()
  const diffTime = Math.abs(endDate.getTime() - acquired.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// Pre-tax revenue (for profit calculation)
// Referral is income received by dealership, so it's added to revenue
export function calculateVehiclePreTaxRevenue(vehicle: {
  selling_price?: number
  safety_charge?: number
  warranty_charge?: number
  omvic_fee?: number
  referral_amount?: number
}): number {
  return (
    (vehicle.selling_price || 0) +
    (vehicle.safety_charge || 0) +
    (vehicle.warranty_charge || 0) +
    (vehicle.omvic_fee || 0) +
    (vehicle.referral_amount || 0)
  )
}

// Profit = Pre-Tax Revenue - Pre-Tax Cost (taxes are pass-through)
export function calculateNetProfit(vehicle: {
  selling_price?: number
  purchase_price: number
  miscellaneous_cost?: number
  safety_cost?: number
  safety_charge?: number
  warranty_cost?: number
  warranty_charge?: number
  floorplan_interest_cost?: number
  gas?: number
  omvic_fee?: number
  referral_amount?: number
}): number {
  if (!vehicle.selling_price) return 0
  const revenue = calculateVehiclePreTaxRevenue(vehicle)
  const costs = calculateVehiclePreTaxCost(vehicle)
  return revenue - costs
}

export function calculateProfitMargin(netProfit: number, sellingPrice: number): number {
  if (!sellingPrice || sellingPrice === 0) return 0
  return (netProfit / sellingPrice) * 100
}

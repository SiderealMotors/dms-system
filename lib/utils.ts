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
export function calculateVehicleTotalCost(vehicle: {
  purchase_price: number
  safety_cost?: number
  warranty_cost?: number
  floorplan_interest_cost?: number
  gas?: number
  referral_amount?: number
}): number {
  return (
    (vehicle.purchase_price || 0) +
    (vehicle.safety_cost || 0) +
    (vehicle.warranty_cost || 0) +
    (vehicle.floorplan_interest_cost || 0) +
    (vehicle.gas || 0) +
    (vehicle.referral_amount || 0)
  )
}

export function calculateLotDays(dateAcquired: string, dateSold?: string): number {
  const acquired = new Date(dateAcquired)
  const endDate = dateSold ? new Date(dateSold) : new Date()
  const diffTime = Math.abs(endDate.getTime() - acquired.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

export function calculateGrossProfit(vehicle: {
  selling_price?: number
  purchase_price: number
  safety_charge?: number
  warranty_charge?: number
}): number {
  if (!vehicle.selling_price) return 0
  return (
    (vehicle.selling_price || 0) +
    (vehicle.safety_charge || 0) +
    (vehicle.warranty_charge || 0) -
    (vehicle.purchase_price || 0)
  )
}

export function calculateNetProfit(vehicle: {
  selling_price?: number
  purchase_price: number
  safety_cost?: number
  safety_charge?: number
  warranty_cost?: number
  warranty_charge?: number
  floorplan_interest_cost?: number
  gas?: number
  referral_amount?: number
}): number {
  if (!vehicle.selling_price) return 0
  const revenue = (vehicle.selling_price || 0) + (vehicle.safety_charge || 0) + (vehicle.warranty_charge || 0)
  const costs = calculateVehicleTotalCost(vehicle)
  return revenue - costs
}

export function calculateProfitMargin(netProfit: number, sellingPrice: number): number {
  if (!sellingPrice || sellingPrice === 0) return 0
  return (netProfit / sellingPrice) * 100
}

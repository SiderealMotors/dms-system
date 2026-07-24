import { NextRequest, NextResponse } from "next/server"

// NHTSA VIN Decoder API (free, no API key required)
const NHTSA_API_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/decodevin"

interface VINDecodeResult {
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  bodyClass: string | null
  driveType: string | null
  fuelType: string | null
  engineSize: string | null
  transmission: string | null
  doors: number | null
  error?: string
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const vin = searchParams.get("vin")

  if (!vin) {
    return NextResponse.json({ error: "VIN is required" }, { status: 400 })
  }

  // Basic VIN validation (17 characters)
  if (vin.length !== 17) {
    return NextResponse.json(
      { error: "VIN must be exactly 17 characters" },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(`${NHTSA_API_URL}/${vin}?format=json`)
    
    if (!response.ok) {
      throw new Error("Failed to decode VIN")
    }

    const data = await response.json()
    const results = data.Results

    // Helper to extract value from NHTSA response
    const getValue = (variableId: number): string | null => {
      const item = results.find((r: { VariableId: number }) => r.VariableId === variableId)
      return item?.Value && item.Value !== "Not Applicable" ? item.Value : null
    }

    const getNumericValue = (variableId: number): number | null => {
      const value = getValue(variableId)
      return value ? parseInt(value, 10) : null
    }

    const decoded: VINDecodeResult = {
      year: getNumericValue(29), // Model Year
      make: getValue(26), // Make
      model: getValue(28), // Model
      trim: getValue(38), // Trim
      bodyClass: getValue(5), // Body Class
      driveType: getValue(15), // Drive Type
      fuelType: getValue(24), // Fuel Type - Primary
      engineSize: getValue(13), // Displacement (L)
      transmission: getValue(37), // Transmission Style
      doors: getNumericValue(14), // Doors
    }

    // Check if we got valid data
    if (!decoded.make && !decoded.model && !decoded.year) {
      return NextResponse.json(
        { error: "Unable to decode VIN. Please verify the VIN is correct." },
        { status: 400 }
      )
    }

    return NextResponse.json({ data: decoded })
  } catch (error) {
    console.error("VIN decode error:", error)
    return NextResponse.json(
      { error: "Failed to decode VIN" },
      { status: 500 }
    )
  }
}

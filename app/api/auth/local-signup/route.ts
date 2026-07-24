import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, role } = await request.json()

    // Validate input
    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 400 }
      )
    }

    // Hash password using Node.js crypto
    const hashedPassword = crypto
      .createHash("sha256")
      .update(password + email)
      .digest("hex")

    // Create local auth ID (not using Supabase Auth)
    const localAuthId = crypto.randomUUID()

    // Create user record in public.users table
    const { data: newUser, error: userError } = await supabase
      .from("users")
      .insert({
        auth_id: localAuthId,
        email,
        name,
        role,
        is_active: true,
        password_hash: hashedPassword, // Store hashed password locally
      })
      .select()
      .single()

    if (userError) {
      console.error("[v0] User creation error:", userError)
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      )
    }

    // Create session token
    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    // Store session in a sessions table
    const { error: sessionError } = await supabase
      .from("sessions")
      .insert({
        user_id: newUser.id,
        token: sessionToken,
        expires_at: expiresAt.toISOString(),
      })

    if (sessionError) {
      console.error("[v0] Session creation error:", sessionError)
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      )
    }

    // Set cookie
    const response = NextResponse.json(
      { success: true, user: newUser },
      { status: 201 }
    )

    response.cookies.set("session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    })

    return response
  } catch (error) {
    console.error("[v0] Signup error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}

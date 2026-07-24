import { createAuthClient } from "@/lib/supabase/auth-server"
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

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

    // Use auth client with service role key for signup
    const authClient = createAuthClient()

    // Sign up user with Supabase Auth
    const { data: authData, error: authError } = await authClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email to skip confirmation requirement
      user_metadata: {
        name,
        role,
      },
    })

    if (authError) {
      console.error("[v0] Auth signup error:", authError)
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      )
    }

    // Create user record in public.users table using regular server client
    const supabase = await createClient()
    const { error: userError } = await supabase
      .from("users")
      .insert({
        auth_id: authData.user.id,
        email,
        name,
        role,
        is_active: true,
      })

    if (userError) {
      // If user record creation fails, we should ideally clean up the auth user
      // but for now just log it and return the error
      console.error("Error creating user record:", userError)
      return NextResponse.json(
        { error: "Failed to create user record: " + userError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: "Account created successfully. Please check your email to confirm.",
        user: {
          id: authData.user.id,
          email: authData.user.email,
          name,
          role,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Sign up error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}

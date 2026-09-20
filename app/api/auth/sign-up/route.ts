import { createAuthClient } from "@/lib/supabase/auth-server"
import { NextRequest, NextResponse } from "next/server"
import type { UserRole } from "@/lib/types"

const VALID_ROLES: UserRole[] = ["ADMIN", "SALES", "ACCOUNTANT"]

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, role } = await request.json()

    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      )
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    // Service-role client: creates the auth user AND the public.users row,
    // bypassing the admin-only INSERT policy on public.users.
    const admin = createAuthClient()

    // Auto-confirm so the account is immediately usable (internal DMS tool,
    // no public email delivery configured).
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    })

    if (authError || !authData.user) {
      const message = authError?.message ?? "Failed to create user"
      // Surface the actionable duplicate-account signal; keep others generic.
      const isDuplicate = /already|registered|exists/i.test(message)
      return NextResponse.json(
        { error: isDuplicate ? "An account with this email already exists." : message },
        { status: 400 },
      )
    }

    // The public.users profile row (id = auth user id) is created automatically
    // by the on_auth_user_created trigger, which reads name/role from the
    // user_metadata passed above. No explicit insert is needed here.

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error("[v0] Sign up error:", error)
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

// Development-only mock authentication
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Missing email or password" },
        { status: 400 }
      )
    }

    // For development: accept any email/password combination
    // In production, this would validate against a database
    const userId = crypto.randomUUID()
    const sessionToken = crypto.randomUUID()

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: userId,
          email,
          name: email.split("@")[0],
          role: "ADMIN",
          is_active: true,
        },
      },
      { status: 200 }
    )

    response.cookies.set("session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    })

    response.cookies.set(
      "user_info",
      JSON.stringify({
        id: userId,
        email,
        name: email.split("@")[0],
        role: "ADMIN",
      }),
      {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
      }
    )

    return response
  } catch (error) {
    console.error("[v0] Login error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}

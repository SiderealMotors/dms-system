import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host") // original origin before reverse proxy
      const proto = request.headers.get("x-forwarded-proto") // same
      const host = forwardedHost || request.headers.get("host")
      const protocol = proto || "https"
      return NextResponse.redirect(`${protocol}://${host}${next}`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${request.nextUrl.origin}/auth/auth-code-error`)
}

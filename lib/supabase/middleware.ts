import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Check for session token from local auth
  const sessionToken = request.cookies.get('session_token')?.value

  // Protected routes that require authentication
  const protectedPaths = ['/dashboard', '/inventory', '/crm', '/deals', '/accounting', '/reports']
  const isProtectedPath = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))
  
  if (isProtectedPath && !sessionToken) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  const authPaths = ['/auth/login', '/auth/sign-up', '/auth/sign-up-success']
  const isAuthPath = authPaths.some(path => request.nextUrl.pathname.startsWith(path))
  
  if (isAuthPath && sessionToken) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next({
    request,
  })
}

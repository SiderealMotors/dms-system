"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { User } from "@/lib/types"

type UserContextType = {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
})

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get user from localStorage (local auth mode)
    const getUser = async () => {
      if (typeof window !== "undefined") {
        const userStr = localStorage.getItem("user")
        if (userStr) {
          try {
            const userData = JSON.parse(userStr)
            setUser(userData)
          } catch (err) {
            console.error("Failed to parse user from localStorage:", err)
            setUser(null)
          }
        }
      }
      setLoading(false)
    }

    getUser()

    // Listen for storage changes (when user signs in/out in another tab)
    const handleStorageChange = () => {
      const userStr = localStorage.getItem("user")
      if (userStr) {
        try {
          const userData = JSON.parse(userStr)
          setUser(userData)
        } catch (err) {
          setUser(null)
        }
      } else {
        setUser(null)
      }
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [])

  const signOut = async () => {
    localStorage.removeItem("user")
    setUser(null)
    window.location.href = "/auth/login"
  }

  return (
    <UserContext.Provider value={{ user, loading, signOut }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}

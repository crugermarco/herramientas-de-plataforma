import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('admin_user')
    if (stored) return JSON.parse(stored)
    
    const params = new URLSearchParams(window.location.search)
    const urlUser = params.get('user')
    if (urlUser) {
      const userData = { name: urlUser, role: urlUser === 'Marco' ? 'admin' : 'user' }
      localStorage.setItem('admin_user', JSON.stringify(userData))
      return userData
    }
    
    return { name: 'Demo', role: 'user' }
  })

  useEffect(() => {
    localStorage.setItem('admin_user', JSON.stringify(user))
  }, [user])

  const login = (userData) => {
    setUser(userData)
    localStorage.setItem('admin_user', JSON.stringify(userData))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('admin_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
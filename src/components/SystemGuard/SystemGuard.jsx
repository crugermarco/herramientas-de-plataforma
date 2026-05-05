import { useState, useEffect } from 'react'
import { supabaseStatus } from '../../lib/supabaseStatus'
import { MODULE_ID } from '../../lib/constants'
import { useAuth } from '../../context/AuthContext'

export default function SystemGuard({ children }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    checkModuleStatus()
    
    const channel = supabaseStatus
      .channel('modulos_status_changes')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'modulos_status', filter: `modulo_id=eq.${MODULE_ID}` },
        (payload) => {
          setStatus(payload.new.status)
        }
      )
      .subscribe()

    return () => {
      supabaseStatus.removeChannel(channel)
    }
  }, [])

  async function checkModuleStatus() {
    try {
      const { data, error } = await supabaseStatus
        .from('modulos_status')
        .select('status, redirect_url')
        .eq('modulo_id', MODULE_ID)
        .single()

      if (error) {
        // Si no existe el registro, permitir acceso (desarrollo)
        setStatus(500)
        setLoading(false)
        return
      }

      setStatus(data.status)
      setLoading(false)

      if (data.status !== 500 && data.redirect_url) {
        window.location.href = data.redirect_url
      }
    } catch (error) {
      console.error('Error checking module status:', error)
      setStatus(500)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="system-guard-loading">
        <div className="spinner" />
        <p>Verificando acceso...</p>
      </div>
    )
  }

  if (status !== 500) {
    return (
      <div className="system-guard-blocked">
        <h2>🔒 Módulo Bloqueado</h2>
        <p>Este módulo no está disponible en este momento.</p>
        <p>Contacta al administrador del sistema.</p>
      </div>
    )
  }

  return children
}
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/UI/Modal'
import { MonitorCheck, Plus, Wifi, WifiOff, RefreshCw, Edit, Trash2, Zap } from 'lucide-react'
import './ChecadoresPage.css'

const PING_TIMEOUT = 1500
const BATCH_SIZE = 5

export default function ChecadoresPage() {
  const [checadores, setChecadores] = useState([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingChecador, setEditingChecador] = useState(null)
  const [formData, setFormData] = useState({ nombre: '', ip_address: '', ubicacion: '', modelo: '' })
  const [checkingIPs, setCheckingIPs] = useState({})
  const [toasts, setToasts] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const scanAbortRef = useRef(null)

  useEffect(() => {
    loadChecadores()
    const interval = setInterval(checkAllIPs, 30000)
    return () => {
      clearInterval(interval)
      if (scanAbortRef.current) {
        scanAbortRef.current.aborted = true
      }
    }
  }, [])

  useEffect(() => {
    if (checadores.length > 0) {
      checkAllIPs()
    }
  }, [checadores.length])

  function addToast(message, type = 'info') {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  async function loadChecadores() {
    try {
      const { data, error } = await supabase
        .from('checadores')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setChecadores(data || [])
    } catch (error) {
      console.error('Error cargando checadores:', error)
      addToast('Error al cargar checadores', 'error')
    }
  }

  // Ping ultra rápido
  async function pingIP(ip) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT)

    try {
      await fetch(`http://${ip}`, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
        cache: 'no-cache'
      })
      clearTimeout(timeout)
      return 'online'
    } catch {
      clearTimeout(timeout)
      
      try {
        await new Promise((resolve, reject) => {
          const img = new Image()
          const imgTimeout = setTimeout(() => {
            img.src = ''
            reject(new Error('timeout'))
          }, 800)
          
          img.onload = () => {
            clearTimeout(imgTimeout)
            resolve()
          }
          img.onerror = () => {
            clearTimeout(imgTimeout)
            reject(new Error('error'))
          }
          img.src = `http://${ip}/favicon.ico?t=${Date.now()}`
        })
        return 'online'
      } catch {
        return 'offline'
      }
    }
  }

  // Escaneo por lotes
  const checkAllIPs = useCallback(async () => {
    if (isScanning) return
    
    setIsScanning(true)
    const abortController = { aborted: false }
    scanAbortRef.current = abortController

    const startTime = performance.now()
    
    const initialStatus = {}
    checadores.forEach(c => { initialStatus[c.id] = 'checking' })
    setCheckingIPs(initialStatus)

    for (let i = 0; i < checadores.length; i += BATCH_SIZE) {
      if (abortController.aborted) break
      
      const batch = checadores.slice(i, i + BATCH_SIZE)
      
      const batchResults = await Promise.all(
        batch.map(async (checador) => {
          const status = await pingIP(checador.ip_address)
          return { id: checador.id, status, checador }
        })
      )

      setCheckingIPs(prev => {
        const updated = { ...prev }
        batchResults.forEach(({ id, status }) => {
          updated[id] = status
        })
        return updated
      })

      batchResults.forEach(({ id, status, checador }) => {
        const now = new Date().toISOString()
        supabase
          .from('checadores')
          .update({
            status,
            last_check: now,
            ...(status === 'online' ? { last_online: now } : {}),
            updated_at: now
          })
          .eq('id', id)
          .then(({ error }) => {
            if (error) console.error(`Error actualizando ${checador.nombre}:`, error)
          })
      })
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    
    if (!abortController.aborted) {
      const onlineCount = Object.values(checkingIPs).filter(s => s === 'online').length
      addToast(`✅ Escaneo en ${elapsed}s - ${onlineCount}/${checadores.length} en línea`, 'success')
    }
    
    setIsScanning(false)
  }, [checadores, isScanning])

  async function checkSingleIP(checador) {
    setCheckingIPs(prev => ({ ...prev, [checador.id]: 'checking' }))
    
    const status = await pingIP(checador.ip_address)
    
    setCheckingIPs(prev => ({ ...prev, [checador.id]: status }))
    
    const now = new Date().toISOString()
    await supabase
      .from('checadores')
      .update({
        status,
        last_check: now,
        ...(status === 'online' ? { last_online: now } : {}),
        updated_at: now
      })
      .eq('id', checador.id)

    addToast(
      status === 'online' 
        ? `✅ ${checador.nombre} en línea` 
        : `❌ ${checador.nombre} no responde`,
      status === 'online' ? 'success' : 'error'
    )
  }

  async function handleAdd(e) {
    e.preventDefault()
    try {
      const { error } = await supabase
        .from('checadores')
        .insert([{ ...formData, status: 'offline' }])

      if (error) throw error
      
      addToast('✅ Checador agregado', 'success')
      setIsAddModalOpen(false)
      setFormData({ nombre: '', ip_address: '', ubicacion: '', modelo: '' })
      loadChecadores()
    } catch (error) {
      console.error('Error agregando:', error)
      addToast('Error al agregar checador', 'error')
    }
  }

  async function handleEdit(e) {
    e.preventDefault()
    try {
      const { error } = await supabase
        .from('checadores')
        .update(formData)
        .eq('id', editingChecador.id)

      if (error) throw error
      
      addToast('✅ Checador actualizado', 'success')
      setIsEditModalOpen(false)
      setEditingChecador(null)
      loadChecadores()
    } catch (error) {
      console.error('Error editando:', error)
      addToast('Error al actualizar', 'error')
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este checador?')) return
    try {
      const { error } = await supabase.from('checadores').delete().eq('id', id)
      if (error) throw error
      addToast('🗑️ Checador eliminado', 'success')
      loadChecadores()
    } catch (error) {
      console.error('Error eliminando:', error)
      addToast('Error al eliminar', 'error')
    }
  }

  function openEditModal(checador) {
    setEditingChecador(checador)
    setFormData({
      nombre: checador.nombre,
      ip_address: checador.ip_address,
      ubicacion: checador.ubicacion || '',
      modelo: checador.modelo || ''
    })
    setIsEditModalOpen(true)
  }

  function getStatusDisplay(id) {
    const status = checkingIPs[id] || 'offline'
    switch (status) {
      case 'online':
        return { icon: Wifi, color: '#10b981', text: 'En Línea', class: 'status-online' }
      case 'offline':
        return { icon: WifiOff, color: '#ef4444', text: 'Fuera de Red', class: 'status-offline' }
      case 'checking':
        return { icon: RefreshCw, color: '#f59e0b', text: 'Verificando...', class: 'status-checking' }
      default:
        return { icon: WifiOff, color: '#64748b', text: 'Sin verificar', class: 'status-unknown' }
    }
  }

  return (
    <div className="checadores-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <MonitorCheck size={28} className="title-icon" />
            Checadores
          </h1>
          <p className="page-subtitle">Monitoreo rápido de checadores en red</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => {
            setFormData({ nombre: '', ip_address: '', ubicacion: '', modelo: '' })
            setIsAddModalOpen(true)
          }}>
            <Plus size={18} />
            Agregar Checador
          </button>
          <button 
            className={`btn-icon ${isScanning ? 'scanning' : ''}`}
            onClick={checkAllIPs} 
            disabled={isScanning}
            title={isScanning ? 'Escaneando...' : 'Refrescar estado'}
          >
            <RefreshCw size={18} className={isScanning ? 'spin-animation' : ''} />
          </button>
        </div>
      </div>

      <div className="checadores-grid">
        {checadores.map(checador => {
          const status = getStatusDisplay(checador.id)
          const StatusIcon = status.icon
          
          return (
            <div 
              key={checador.id} 
              className={`checador-card ${status.class}`}
              style={{ '--status-color': status.color }}
            >
              <div className="checador-status-indicator">
                <StatusIcon size={24} className={`status-icon ${status.class}`} />
              </div>
              
              <div className="checador-info">
                <h3 className="checador-name">{checador.nombre}</h3>
                <p className="checador-ip">{checador.ip_address}</p>
                {checador.ubicacion && (
                  <p className="checador-ubicacion">{checador.ubicacion}</p>
                )}
                {checador.modelo && (
                  <p className="checador-modelo">{checador.modelo}</p>
                )}
              </div>

              <div className="checador-status-text">
                <span className={`status-badge ${status.class}`}>
                  {status.text}
                </span>
              </div>

              <div className="checador-actions">
                <button 
                  className="btn-icon-sm" 
                  onClick={() => checkSingleIP(checador)}
                  title="Verificar ahora"
                >
                  <Zap size={14} />
                </button>
                <button 
                  className="btn-icon-sm" 
                  onClick={() => openEditModal(checador)}
                  title="Editar"
                >
                  <Edit size={14} />
                </button>
                <button 
                  className="btn-icon-sm btn-danger" 
                  onClick={() => handleDelete(checador.id)}
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {checador.last_online && (
                <div className="checador-last-online">
                  Último online: {new Date(checador.last_online).toLocaleString()}
                </div>
              )}
            </div>
          )
        })}

        {checadores.length === 0 && (
          <div className="empty-state">
            <MonitorCheck size={48} className="empty-icon" />
            <p>No hay checadores registrados</p>
            <button className="btn-primary" onClick={() => setIsAddModalOpen(true)}>
              <Plus size={18} />
              Agregar el primero
            </button>
          </div>
        )}
      </div>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Agregar Checador">
        <form onSubmit={handleAdd} className="checador-form">
          <div className="form-group">
            <label className="form-label">Nombre del Checador *</label>
            <input
              type="text"
              className="form-input"
              value={formData.nombre}
              onChange={e => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
              placeholder="Checador Principal"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Dirección IP *</label>
            <input
              type="text"
              className="form-input"
              value={formData.ip_address}
              onChange={e => setFormData(prev => ({ ...prev, ip_address: e.target.value }))}
              placeholder="192.168.1.100"
              pattern="^(\d{1,3}\.){3}\d{1,3}$"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Ubicación</label>
            <input
              type="text"
              className="form-input"
              value={formData.ubicacion}
              onChange={e => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))}
              placeholder="Entrada Principal"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Modelo</label>
            <input
              type="text"
              className="form-input"
              value={formData.modelo}
              onChange={e => setFormData(prev => ({ ...prev, modelo: e.target.value }))}
              placeholder="ZK TF1700"
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setIsAddModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              <Plus size={18} />
              Agregar
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Checador">
        <form onSubmit={handleEdit} className="checador-form">
          <div className="form-group">
            <label className="form-label">Nombre del Checador *</label>
            <input
              type="text"
              className="form-input"
              value={formData.nombre}
              onChange={e => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Dirección IP *</label>
            <input
              type="text"
              className="form-input"
              value={formData.ip_address}
              onChange={e => setFormData(prev => ({ ...prev, ip_address: e.target.value }))}
              pattern="^(\d{1,3}\.){3}\d{1,3}$"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Ubicación</label>
            <input
              type="text"
              className="form-input"
              value={formData.ubicacion}
              onChange={e => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Modelo</label>
            <input
              type="text"
              className="form-input"
              value={formData.modelo}
              onChange={e => setFormData(prev => ({ ...prev, modelo: e.target.value }))}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Guardar
            </button>
          </div>
        </form>
      </Modal>

      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}
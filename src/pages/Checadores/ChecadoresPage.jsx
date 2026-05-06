import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/UI/Modal'
import { MonitorCheck, Plus, Wifi, WifiOff, RefreshCw, Edit, Trash2, Zap, Activity, Clock, AlertTriangle, CheckCircle2, XCircle, BarChart3 } from 'lucide-react'
import './ChecadoresPage.css'

const PING_TIMEOUT = 3000
const PING_TIMEOUT_LONG = 5000
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
  const [historial, setHistorial] = useState({})
  const [diagnosticoExpandido, setDiagnosticoExpandido] = useState(null)
  
  const scanAbortRef = useRef(null)
  const checadoresRef = useRef([])
  const isScanningRef = useRef(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    checadoresRef.current = checadores
  }, [checadores])

  useEffect(() => {
    loadChecadores()
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (scanAbortRef.current) {
        scanAbortRef.current.aborted = true
      }
    }
  }, [])

  useEffect(() => {
    if (checadores.length > 0) {
      checkAllIPs()
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      intervalRef.current = setInterval(() => {
        checkAllIPs()
      }, 30000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [checadores])

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

  async function pingIP(ip) {
    const inicio = performance.now()
    
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT)
      await fetch(`http://${ip}`, { 
        method: 'HEAD', 
        mode: 'no-cors', 
        signal: ctrl.signal,
        cache: 'no-cache'
      })
      clearTimeout(t)
      const tiempo = (performance.now() - inicio).toFixed(0)
      return { status: 'online', metodo: 'Respuesta HTTP', detalle: 'Servidor web activo', tiempo, calidad: 'excelente' }
    } catch(e) {
      if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
        const tiempo = (performance.now() - inicio).toFixed(0)
        return { status: 'online', metodo: 'Dispositivo detectado', detalle: 'Responde sin servidor web', tiempo, calidad: 'buena' }
      }
      if (e.name === 'AbortError') {
        const tiempo = PING_TIMEOUT
        try {
          const ctrl = new AbortController()
          const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_LONG)
          await fetch(`http://${ip}`, { 
            method: 'HEAD', 
            mode: 'no-cors', 
            signal: ctrl.signal,
            cache: 'no-cache'
          })
          clearTimeout(t)
          const tiempoTotal = (performance.now() - inicio).toFixed(0)
          return { status: 'online', metodo: 'Respuesta tardía', detalle: 'Respondió tras reintento', tiempo: tiempoTotal, calidad: 'lenta' }
        } catch(e2) {
          if (e2.name === 'TypeError') {
            const tiempoTotal = (performance.now() - inicio).toFixed(0)
            return { status: 'online', metodo: 'Dispositivo saturado', detalle: 'Tardó pero respondió', tiempo: tiempoTotal, calidad: 'intermitente' }
          }
          const tiempoTotal = (performance.now() - inicio).toFixed(0)
          return { status: 'offline', metodo: 'Sin conexión', detalle: 'No responde a ningún intento', tiempo: tiempoTotal, calidad: 'critica' }
        }
      }
    }
    
    return { status: 'offline', metodo: 'Error desconocido', detalle: 'Fallo total de comunicación', tiempo: 'N/A', calidad: 'critica' }
  }

  const checkAllIPs = useCallback(async () => {
    if (isScanningRef.current) return
    
    isScanningRef.current = true
    setIsScanning(true)
    
    const abortController = { aborted: false }
    scanAbortRef.current = abortController
    const currentChecadores = checadoresRef.current
    
    if (currentChecadores.length === 0) {
      isScanningRef.current = false
      setIsScanning(false)
      return
    }

    setCheckingIPs(prev => {
      const updated = { ...prev }
      currentChecadores.forEach(c => { updated[c.id] = 'checking' })
      return updated
    })

    const allResults = {}
    const nuevosRegistros = {}
    
    for (let i = 0; i < currentChecadores.length; i += BATCH_SIZE) {
      if (abortController.aborted) break
      const batch = currentChecadores.slice(i, i + BATCH_SIZE)
      
      const batchResults = await Promise.all(
        batch.map(async (checador) => {
          const result = await pingIP(checador.ip_address)
          allResults[checador.id] = result.status
          return { id: checador.id, ...result, checador }
        })
      )

      setCheckingIPs(prev => {
        const updated = { ...prev }
        batchResults.forEach(({ id, status }) => { updated[id] = status })
        return updated
      })

      batchResults.forEach(({ id, status, metodo, detalle, tiempo, calidad, checador }) => {
        const now = new Date().toISOString()
        const registro = {
          timestamp: now,
          status,
          metodo,
          detalle,
          tiempo,
          calidad
        }
        
        nuevosRegistros[checador.nombre] = registro
        
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

    setHistorial(prev => {
      const updated = { ...prev }
      Object.entries(nuevosRegistros).forEach(([nombre, registro]) => {
        if (!updated[nombre]) updated[nombre] = []
        updated[nombre] = [registro, ...(updated[nombre] || [])].slice(0, 20)
      })
      return updated
    })

    if (!abortController.aborted) {
      const onlineCount = Object.values(allResults).filter(s => s === 'online').length
      const offlineList = currentChecadores.filter(c => allResults[c.id] === 'offline').map(c => c.nombre)
      
      if (offlineList.length > 0) {
        addToast(`⚠️ ${offlineList.join(', ')} no responde(n)`, 'warning')
      } else {
        addToast(`✅ ${onlineCount}/${currentChecadores.length} en línea`, 'success')
      }
    }
    
    isScanningRef.current = false
    setIsScanning(false)
  }, [])

  async function checkSingleIP(checador) {
    setCheckingIPs(prev => ({ ...prev, [checador.id]: 'checking' }))
    const result = await pingIP(checador.ip_address)
    setCheckingIPs(prev => ({ ...prev, [checador.id]: result.status }))
    
    const now = new Date().toISOString()
    const registro = {
      timestamp: now,
      status: result.status,
      metodo: result.metodo,
      detalle: result.detalle,
      tiempo: result.tiempo,
      calidad: result.calidad
    }

    setHistorial(prev => {
      const updated = { ...prev }
      if (!updated[checador.nombre]) updated[checador.nombre] = []
      updated[checador.nombre] = [registro, ...(updated[checador.nombre] || [])].slice(0, 20)
      return updated
    })

    await supabase
      .from('checadores')
      .update({
        status: result.status,
        last_check: now,
        ...(result.status === 'online' ? { last_online: now } : {}),
        updated_at: now
      })
      .eq('id', checador.id)

    addToast(
      result.status === 'online' 
        ? `✅ ${checador.nombre}: ${result.metodo} (${result.tiempo}ms)` 
        : `❌ ${checador.nombre}: ${result.metodo}`,
      result.status === 'online' ? 'success' : 'error'
    )
  }

  function getIconoCalidad(calidad) {
    switch (calidad) {
      case 'excelente': return <CheckCircle2 size={14} color="#10b981" />
      case 'buena': return <CheckCircle2 size={14} color="#3b82f6" />
      case 'lenta': return <Clock size={14} color="#f59e0b" />
      case 'intermitente': return <AlertTriangle size={14} color="#f59e0b" />
      case 'critica': return <XCircle size={14} color="#ef4444" />
      default: return <Activity size={14} color="#64748b" />
    }
  }

  function getEtiquetaCalidad(calidad) {
    switch (calidad) {
      case 'excelente': return 'Excelente'
      case 'buena': return 'Buena'
      case 'lenta': return 'Lenta'
      case 'intermitente': return 'Intermitente'
      case 'critica': return 'Crítica'
      default: return 'Desconocida'
    }
  }

  function getColorCalidad(calidad) {
    switch (calidad) {
      case 'excelente': return '#10b981'
      case 'buena': return '#3b82f6'
      case 'lenta': return '#f59e0b'
      case 'intermitente': return '#f97316'
      case 'critica': return '#ef4444'
      default: return '#64748b'
    }
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
          <p className="page-subtitle">Monitoreo y diagnóstico de checadores en red</p>
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
          const datosHistorial = historial[checador.nombre] || []
          const ultimoRegistro = datosHistorial[0]
          const expandido = diagnosticoExpandido === checador.id
          
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

              {ultimoRegistro && (
                <div className="checador-diagnostico-resumen">
                  <div className="diag-row">
                    <Activity size={12} />
                    <span>{ultimoRegistro.metodo}</span>
                  </div>
                  <div className="diag-row">
                    <Clock size={12} />
                    <span>{ultimoRegistro.tiempo}ms</span>
                  </div>
                  <div className="diag-row">
                    {getIconoCalidad(ultimoRegistro.calidad)}
                    <span style={{ color: getColorCalidad(ultimoRegistro.calidad) }}>
                      {getEtiquetaCalidad(ultimoRegistro.calidad)}
                    </span>
                  </div>
                </div>
              )}

              <button 
                className="btn-diagnostico-expand"
                onClick={() => setDiagnosticoExpandido(expandido ? null : checador.id)}
              >
                <BarChart3 size={14} />
                {expandido ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}
              </button>

              {expandido && (
                <div className="checador-diagnostico-completo">
                  <h4 className="diag-title">Diagnóstico de conexión</h4>
                  
                  {ultimoRegistro ? (
                    <>
                      <div className="diag-seccion">
                        <span className="diag-label">Última verificación</span>
                        <div className="diag-detalle">
                          <div className="diag-linea">
                            <span>Método:</span>
                            <strong>{ultimoRegistro.metodo}</strong>
                          </div>
                          <div className="diag-linea">
                            <span>Detalle:</span>
                            <strong>{ultimoRegistro.detalle}</strong>
                          </div>
                          <div className="diag-linea">
                            <span>Tiempo de respuesta:</span>
                            <strong>{ultimoRegistro.tiempo}ms</strong>
                          </div>
                          <div className="diag-linea">
                            <span>Calidad de conexión:</span>
                            <strong style={{ color: getColorCalidad(ultimoRegistro.calidad) }}>
                              {getIconoCalidad(ultimoRegistro.calidad)}
                              {' '}{getEtiquetaCalidad(ultimoRegistro.calidad)}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="diag-seccion">
                        <span className="diag-label">Interpretación</span>
                        <p className="diag-interpretacion">
                          {ultimoRegistro.calidad === 'excelente' && '✅ Este checador responde inmediatamente. Las checadas se registran sin problemas.'}
                          {ultimoRegistro.calidad === 'buena' && '✅ El dispositivo está en línea y responde correctamente. No debería haber pérdida de checadas.'}
                          {ultimoRegistro.calidad === 'lenta' && '⚠️ Este checador tarda en responder. Puede haber retrasos en el registro de checadas.'}
                          {ultimoRegistro.calidad === 'intermitente' && '⚠️ Este checador presenta saturación o micro-cortes. Es posible que algunas checadas se pierdan.'}
                          {ultimoRegistro.calidad === 'critica' && '🔴 Este checador no responde. Las checadas NO se están registrando. Requiere revisión urgente.'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="diag-sin-datos">Sin datos de diagnóstico todavía. Haz clic en ⚡ para verificar.</p>
                  )}

                  {datosHistorial.length > 1 && (
                    <div className="diag-seccion">
                      <span className="diag-label">Historial reciente ({datosHistorial.length} verificaciones)</span>
                      <div className="diag-historial">
                        {datosHistorial.slice(0, 5).map((reg, i) => (
                          <div key={i} className="diag-historial-item">
                            <span className="diag-historial-hora">
                              {new Date(reg.timestamp).toLocaleTimeString()}
                            </span>
                            {getIconoCalidad(reg.calidad)}
                            <span style={{ color: getColorCalidad(reg.calidad), fontSize: '0.75rem' }}>
                              {getEtiquetaCalidad(reg.calidad)}
                            </span>
                            <span className="diag-historial-tiempo">{reg.tiempo}ms</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="checador-actions">
                <button className="btn-icon-sm" onClick={() => checkSingleIP(checador)} title="Verificar ahora">
                  <Zap size={14} />
                </button>
                <button className="btn-icon-sm" onClick={() => openEditModal(checador)} title="Editar">
                  <Edit size={14} />
                </button>
                <button className="btn-icon-sm btn-danger" onClick={() => handleDelete(checador.id)} title="Eliminar">
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
            <input type="text" className="form-input" value={formData.nombre} onChange={e => setFormData(prev => ({ ...prev, nombre: e.target.value }))} placeholder="Checador Principal" required />
          </div>
          <div className="form-group">
            <label className="form-label">Dirección IP *</label>
            <input type="text" className="form-input" value={formData.ip_address} onChange={e => setFormData(prev => ({ ...prev, ip_address: e.target.value }))} placeholder="192.168.1.100" pattern="^(\d{1,3}\.){3}\d{1,3}$" required />
          </div>
          <div className="form-group">
            <label className="form-label">Ubicación</label>
            <input type="text" className="form-input" value={formData.ubicacion} onChange={e => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))} placeholder="Entrada Principal" />
          </div>
          <div className="form-group">
            <label className="form-label">Modelo</label>
            <input type="text" className="form-input" value={formData.modelo} onChange={e => setFormData(prev => ({ ...prev, modelo: e.target.value }))} placeholder="ZK TF1700" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary"><Plus size={18} />Agregar</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Checador">
        <form onSubmit={handleEdit} className="checador-form">
          <div className="form-group">
            <label className="form-label">Nombre del Checador *</label>
            <input type="text" className="form-input" value={formData.nombre} onChange={e => setFormData(prev => ({ ...prev, nombre: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Dirección IP *</label>
            <input type="text" className="form-input" value={formData.ip_address} onChange={e => setFormData(prev => ({ ...prev, ip_address: e.target.value }))} pattern="^(\d{1,3}\.){3}\d{1,3}$" required />
          </div>
          <div className="form-group">
            <label className="form-label">Ubicación</label>
            <input type="text" className="form-input" value={formData.ubicacion} onChange={e => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Modelo</label>
            <input type="text" className="form-input" value={formData.modelo} onChange={e => setFormData(prev => ({ ...prev, modelo: e.target.value }))} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>

      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>{toast.message}</div>
        ))}
      </div>
    </div>
  )
}
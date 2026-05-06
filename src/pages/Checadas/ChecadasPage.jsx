import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/UI/Modal'
import { ClipboardCheck, Plus, Search, Download, Trash2, Edit, Clock, User, MapPin, ArrowRightLeft, AlertTriangle, Filter, X, RefreshCw, Zap } from 'lucide-react'
import './ChecadasPage.css'

const ITEMS_PER_PAGE = 15

export default function ChecadasPage() {
  const [checadas, setChecadas] = useState([])
  const [checadores, setChecadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingChecada, setEditingChecada] = useState(null)
  const [formData, setFormData] = useState({
    numero_empleado: '',
    nombre_empleado: '',
    checador_nombre: '',
    tipo: 'entrada',
    fecha: new Date().toISOString().split('T')[0],
    hora: new Date().toTimeString().slice(0, 5)
  })
  const [toasts, setToasts] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [filtros, setFiltros] = useState({
    fecha: '',
    empleado: '',
    checador: '',
    tipo: ''
  })
  const [showFilters, setShowFilters] = useState(false)
  
  const formRef = useRef(null)

  useEffect(() => {
    loadChecadas()
    loadChecadores()
  }, [])

  function addToast(message, type = 'info') {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  async function loadChecadas() {
    setLoading(true)
    try {
      let query = supabase
        .from('checadas')
        .select('*')
        .order('timestamp_completo', { ascending: false })

      if (filtros.fecha) {
        query = query.eq('fecha', filtros.fecha)
      }
      if (filtros.empleado) {
        query = query.or(`numero_empleado.ilike.%${filtros.empleado}%,nombre_empleado.ilike.%${filtros.empleado}%`)
      }
      if (filtros.checador) {
        query = query.ilike('checador_nombre', `%${filtros.checador}%`)
      }
      if (filtros.tipo) {
        query = query.eq('tipo', filtros.tipo)
      }

      const { data, error } = await query

      if (error) throw error
      setChecadas(data || [])
      setCurrentPage(1)
    } catch (error) {
      console.error('Error cargando checadas:', error)
      addToast('Error al cargar checadas', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadChecadores() {
    try {
      const { data, error } = await supabase
        .from('checadores')
        .select('nombre, ip_address')
        .order('nombre')

      if (error) throw error
      setChecadores(data || [])
    } catch (error) {
      console.error('Error cargando checadores:', error)
    }
  }

  async function inyectarChecada(checadorIP, datos) {
    try {
      addToast('💉 Inyectando checada en dispositivo...', 'warning')
      
      const response = await fetch('http://localhost:3005/api/checador/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: checadorIP,
          userId: datos.numero_empleado,
          nombre: datos.nombre_empleado || datos.numero_empleado,
          fecha: datos.fecha,
          hora: datos.hora,
          tipo: datos.tipo
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        addToast(data.mensaje, 'success')
      } else {
        addToast(`❌ ${data.error}`, 'error')
      }
    } catch (error) {
      addToast(`❌ Error: ${error.message}`, 'error')
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    try {
      const nuevaChecada = {
        ...formData,
        checador_ip: checadores.find(c => c.nombre === formData.checador_nombre)?.ip_address || '',
        tipo: 'manual',
        created_by: 'Admin'
      }

      const { error } = await supabase
        .from('checadas')
        .insert([nuevaChecada])

      if (error) throw error

      addToast('✅ Checada manual registrada en Supabase', 'success')
      setIsAddModalOpen(false)
      resetForm()
      loadChecadas()
    } catch (error) {
      console.error('Error agregando checada:', error)
      addToast('Error al registrar checada', 'error')
    }
  }

  async function handleAddAndInject(e) {
    e.preventDefault()
    
    const checador = checadores.find(c => c.nombre === formData.checador_nombre)
    if (!checador) {
      addToast('Selecciona un checador válido', 'error')
      return
    }

    const ip = checador.ip_address

    if (ip === '192.168.4.210' || ip === '192.168.4.214') {
      addToast('⚠️ Este checador no tiene puerto 4370 abierto. Solo se guardará en Supabase.', 'warning')
      handleAdd(e)
      return
    }

    try {
      addToast('💉 Inyectando checada en dispositivo...', 'warning')
      
      const response = await fetch('http://localhost:3005/api/checador/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: ip,
          userId: formData.numero_empleado,
          nombre: formData.nombre_empleado || formData.numero_empleado,
          fecha: formData.fecha,
          hora: formData.hora,
          tipo: formData.tipo
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        addToast(data.mensaje, 'success')
      } else {
        addToast(`⚠️ Dispositivo: ${data.error}. Se guardó en Supabase.`, 'warning')
      }
    } catch (error) {
      addToast(`⚠️ Error de conexión: ${error.message}. Se guardó en Supabase.`, 'warning')
    }

    handleAdd(e)
  }

  async function handleEdit(e) {
    e.preventDefault()
    try {
      const { error } = await supabase
        .from('checadas')
        .update({
          ...formData,
          checador_ip: checadores.find(c => c.nombre === formData.checador_nombre)?.ip_address || '',
        })
        .eq('id', editingChecada.id)

      if (error) throw error

      addToast('✅ Checada actualizada', 'success')
      setIsEditModalOpen(false)
      setEditingChecada(null)
      loadChecadas()
    } catch (error) {
      console.error('Error editando checada:', error)
      addToast('Error al actualizar', 'error')
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta checada?')) return
    try {
      const { error } = await supabase.from('checadas').delete().eq('id', id)
      if (error) throw error
      addToast('🗑️ Checada eliminada', 'success')
      loadChecadas()
    } catch (error) {
      console.error('Error eliminando:', error)
      addToast('Error al eliminar', 'error')
    }
  }

  function openEditModal(checada) {
    setEditingChecada(checada)
    setFormData({
      numero_empleado: checada.numero_empleado,
      nombre_empleado: checada.nombre_empleado || '',
      checador_nombre: checada.checador_nombre,
      tipo: checada.tipo,
      fecha: checada.fecha,
      hora: checada.hora
    })
    setIsEditModalOpen(true)
  }

  function resetForm() {
    setFormData({
      numero_empleado: '',
      nombre_empleado: '',
      checador_nombre: '',
      tipo: 'entrada',
      fecha: new Date().toISOString().split('T')[0],
      hora: new Date().toTimeString().slice(0, 5)
    })
  }

  function downloadCSV() {
    if (checadas.length === 0) {
      addToast('No hay datos para descargar', 'error')
      return
    }

    const headers = 'N° Empleado,Nombre,Checador,Tipo,Fecha,Hora\n'
    const rows = checadas.map(c => 
      `${c.numero_empleado},${c.nombre_empleado || ''},${c.checador_nombre},${c.tipo},${c.fecha},${c.hora}`
    ).join('\n')
    
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `checadas_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    addToast('📥 CSV descargado', 'success')
  }

  function limpiarFiltros() {
    setFiltros({ fecha: '', empleado: '', checador: '', tipo: '' })
    setTimeout(() => loadChecadas(), 50)
  }

  function puedeInyectar(checadorNombre) {
    const checador = checadores.find(c => c.nombre === checadorNombre)
    if (!checador) return false
    return checador.ip_address !== '192.168.4.210' && checador.ip_address !== '192.168.4.214'
  }

  const totalPages = Math.ceil(checadas.length / ITEMS_PER_PAGE)
  const paginatedChecadas = checadas.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  return (
    <div className="checadas-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ClipboardCheck size={28} className="title-icon" />
            Registro de Checadas
          </h1>
          <p className="page-subtitle">
            {checadas.length} checadas registradas
          </p>
        </div>
        <div className="page-actions">
          <button className="btn-icon" onClick={() => setShowFilters(!showFilters)} title="Filtros">
            <Filter size={18} className={showFilters ? 'text-blue' : ''} />
          </button>
          <button className="btn-icon" onClick={downloadCSV} title="Descargar CSV">
            <Download size={18} />
          </button>
          <button className="btn-primary" onClick={() => {
            resetForm()
            setIsAddModalOpen(true)
          }}>
            <Plus size={18} />
            Registrar Checada
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filtros-panel glass-card">
          <div className="filtros-grid">
            <div className="filtro-item">
              <label>Fecha</label>
              <input
                type="date"
                value={filtros.fecha}
                onChange={e => setFiltros(prev => ({ ...prev, fecha: e.target.value }))}
              />
            </div>
            <div className="filtro-item">
              <label>Empleado (N° o Nombre)</label>
              <input
                type="text"
                value={filtros.empleado}
                onChange={e => setFiltros(prev => ({ ...prev, empleado: e.target.value }))}
                placeholder="Buscar empleado..."
              />
            </div>
            <div className="filtro-item">
              <label>Checador</label>
              <select
                value={filtros.checador}
                onChange={e => setFiltros(prev => ({ ...prev, checador: e.target.value }))}
              >
                <option value="">Todos</option>
                {checadores.map(c => (
                  <option key={c.nombre} value={c.nombre}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="filtro-item">
              <label>Tipo</label>
              <select
                value={filtros.tipo}
                onChange={e => setFiltros(prev => ({ ...prev, tipo: e.target.value }))}
              >
                <option value="">Todos</option>
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>
          <div className="filtros-actions">
            <button className="btn-primary" onClick={loadChecadas}>
              <Search size={16} />
              Buscar
            </button>
            <button className="btn-secondary" onClick={limpiarFiltros}>
              <X size={16} />
              Limpiar
            </button>
          </div>
        </div>
      )}

      <div className="checadas-table-container glass-card">
        <table className="checadas-table">
          <thead>
            <tr>
              <th><User size={14} /> Empleado</th>
              <th><MapPin size={14} /> Checador</th>
              <th><ArrowRightLeft size={14} /> Tipo</th>
              <th><Clock size={14} /> Fecha</th>
              <th><Clock size={14} /> Hora</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="loading-cell">
                  <RefreshCw size={24} className="spin-animation" />
                  <span>Cargando checadas...</span>
                </td>
              </tr>
            ) : paginatedChecadas.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  <ClipboardCheck size={32} />
                  <span>No se encontraron checadas</span>
                </td>
              </tr>
            ) : (
              paginatedChecadas.map(checada => (
                <tr key={checada.id} className={`tipo-${checada.tipo}`}>
                  <td>
                    <div className="empleado-cell">
                      <span className="empleado-numero">{checada.numero_empleado}</span>
                      {checada.nombre_empleado && (
                        <span className="empleado-nombre">{checada.nombre_empleado}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="checador-cell">
                      <span>{checada.checador_nombre}</span>
                      {checada.checador_ip && (
                        <span className="checador-ip">{checada.checador_ip}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`tipo-badge tipo-${checada.tipo}`}>
                      {checada.tipo === 'entrada' ? '▶ Entrada' : 
                       checada.tipo === 'salida' ? '◀ Salida' : '✎ Manual'}
                    </span>
                  </td>
                  <td>{checada.fecha}</td>
                  <td className="hora-cell">{checada.hora}</td>
                  <td>
                    <div className="acciones-cell">
                      <button className="btn-icon-sm" onClick={() => openEditModal(checada)} title="Editar">
                        <Edit size={14} />
                      </button>
                      <button className="btn-icon-sm btn-danger" onClick={() => handleDelete(checada.id)} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn-page"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
          >
            Anterior
          </button>
          <span className="page-info">
            Página {currentPage} de {totalPages}
          </span>
          <button
            className="btn-page"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            Siguiente
          </button>
        </div>
      )}

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Registrar Checada">
        <form onSubmit={handleAddAndInject} className="checada-form" ref={formRef}>
          <div className="form-group">
            <label className="form-label">Número de Empleado *</label>
            <input type="text" className="form-input" value={formData.numero_empleado} onChange={e => setFormData(prev => ({ ...prev, numero_empleado: e.target.value }))} placeholder="EMP001" required />
          </div>
          <div className="form-group">
            <label className="form-label">Nombre del Empleado</label>
            <input type="text" className="form-input" value={formData.nombre_empleado} onChange={e => setFormData(prev => ({ ...prev, nombre_empleado: e.target.value }))} placeholder="Juan Pérez" />
          </div>
          <div className="form-group">
            <label className="form-label">Checador *</label>
            <select className="form-input" value={formData.checador_nombre} onChange={e => setFormData(prev => ({ ...prev, checador_nombre: e.target.value }))} required>
              <option value="">Seleccionar checador...</option>
              {checadores.map(c => (
                <option key={c.nombre} value={c.nombre}>
                  {c.nombre} ({c.ip_address}) {puedeInyectar(c.nombre) ? '✅' : '⚠️ Solo Supabase'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-input" value={formData.tipo} onChange={e => setFormData(prev => ({ ...prev, tipo: e.target.value }))}>
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Fecha *</label>
              <input type="date" className="form-input" value={formData.fecha} onChange={e => setFormData(prev => ({ ...prev, fecha: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Hora *</label>
              <input type="time" className="form-input" value={formData.hora} onChange={e => setFormData(prev => ({ ...prev, hora: e.target.value }))} required />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">
              <Zap size={18} />
              {formData.checador_nombre && puedeInyectar(formData.checador_nombre) 
                ? 'Inyectar en Dispositivo + Guardar' 
                : 'Guardar en Supabase'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Checada">
        <form onSubmit={handleEdit} className="checada-form">
          <div className="form-group">
            <label className="form-label">Número de Empleado *</label>
            <input type="text" className="form-input" value={formData.numero_empleado} onChange={e => setFormData(prev => ({ ...prev, numero_empleado: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Nombre del Empleado</label>
            <input type="text" className="form-input" value={formData.nombre_empleado} onChange={e => setFormData(prev => ({ ...prev, nombre_empleado: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Checador *</label>
            <select className="form-input" value={formData.checador_nombre} onChange={e => setFormData(prev => ({ ...prev, checador_nombre: e.target.value }))} required>
              <option value="">Seleccionar checador...</option>
              {checadores.map(c => (
                <option key={c.nombre} value={c.nombre}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-input" value={formData.tipo} onChange={e => setFormData(prev => ({ ...prev, tipo: e.target.value }))}>
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Fecha *</label>
              <input type="date" className="form-input" value={formData.fecha} onChange={e => setFormData(prev => ({ ...prev, fecha: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Hora *</label>
              <input type="time" className="form-input" value={formData.hora} onChange={e => setFormData(prev => ({ ...prev, hora: e.target.value }))} required />
            </div>
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
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/UI/Modal'
import { ClipboardCheck, Plus, Search, Download, Trash2, Edit, Clock, User, MapPin, ArrowRightLeft, Filter, X, RefreshCw, CloudDownload, FileDown, FileUp } from 'lucide-react'
import './ChecadasPage.css'

const ITEMS_PER_PAGE = 15

export default function ChecadasPage() {
  const [checadas, setChecadas] = useState([])
  const [checadores, setChecadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingChecada, setEditingChecada] = useState(null)
  const [syncingChecador, setSyncingChecador] = useState(null)
  const [downloadingDAT, setDownloadingDAT] = useState(null)
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
  const [filtros, setFiltros] = useState({ fecha: '', empleado: '', checador: '', tipo: '' })
  const [showFilters, setShowFilters] = useState(false)
  const fileInputRef = useRef(null)
  const [uploadTarget, setUploadTarget] = useState(null)

  useEffect(() => { loadChecadas(); loadChecadores() }, [])

  function addToast(message, type = 'info') {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }

  async function loadChecadas() {
    setLoading(true)
    try {
      let query = supabase.from('checadas').select('*').order('timestamp_completo', { ascending: false })
      if (filtros.fecha) query = query.eq('fecha', filtros.fecha)
      if (filtros.empleado) query = query.or(`numero_empleado.ilike.%${filtros.empleado}%,nombre_empleado.ilike.%${filtros.empleado}%`)
      if (filtros.checador) query = query.ilike('checador_nombre', `%${filtros.checador}%`)
      if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
      const { data, error } = await query
      if (error) throw error
      setChecadas(data || [])
      setCurrentPage(1)
    } catch (error) { addToast('Error al cargar checadas', 'error') } finally { setLoading(false) }
  }

  async function loadChecadores() {
    try {
      const { data, error } = await supabase.from('checadores').select('nombre, ip_address').order('nombre')
      if (error) throw error
      setChecadores(data || [])
    } catch (error) { console.error('Error cargando checadores:', error) }
  }

  async function sincronizarChecador(checador) {
    if (syncingChecador) { addToast('Ya hay una descarga en progreso.', 'warning'); return }
    if (!puedeSincronizar(checador.ip_address)) { addToast(`⚠️ ${checador.nombre} no disponible.`, 'error'); return }

    setSyncingChecador(checador.nombre)
    addToast(`📥 Extrayendo checadas de ${checador.nombre}...`, 'info')

    try {
      const response = await fetch('http://localhost:3005/api/checador/descargar-dat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: checador.ip_address, checador_nombre: checador.nombre })
      })
      if (!response.ok) throw new Error('Error del servidor')

      const totalRegistros = response.headers.get('X-Total-Registros')
      const nuevas = response.headers.get('X-Nuevas') || 0
      const existentes = response.headers.get('X-Existentes') || 0
      const blob = await response.blob()

      if (blob.size < 100) {
        const text = await blob.text()
        try { const data = JSON.parse(text); addToast(data.mensaje || 'Sin registros', 'warning') } catch { addToast('⚠️ No se pudieron extraer registros', 'warning') }
        setSyncingChecador(null)
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ATT_${checador.nombre.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.dat`
      link.click()
      URL.revokeObjectURL(url)

      addToast(`✅ ${checador.nombre}: ${totalRegistros} registros .DAT · ${nuevas} nuevas, ${existentes} existentes`, 'success')
      loadChecadas()
    } catch (error) { addToast(`❌ Error: ${error.message}`, 'error') } finally { setSyncingChecador(null) }
  }

  async function limpiarChecadasChecador(checador) {
    if (!confirm(`¿Eliminar TODAS las checadas de ${checador.nombre}?`)) return
    try {
      const response = await fetch('http://localhost:3005/api/checador/limpiar-checadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checador_nombre: checador.nombre })
      })
      const data = await response.json()
      addToast(data.mensaje, 'success')
      loadChecadas()
    } catch (error) { addToast('Error al limpiar', 'error') }
  }

  async function limpiarTodasChecadas() {
    if (!confirm('¿Eliminar TODAS las checadas?')) return
    try {
      const response = await fetch('http://localhost:3005/api/checador/limpiar-todo', { method: 'POST' })
      const data = await response.json()
      addToast(data.mensaje, 'success')
      loadChecadas()
    } catch (error) { addToast('Error al limpiar', 'error') }
  }

  function iniciarUploadDAT(checador) { setUploadTarget(checador); fileInputRef.current?.click() }

  function handleFileChange(e) {
    const archivo = e.target.files[0]
    if (archivo && uploadTarget) subirArchivoDAT(uploadTarget, archivo)
    e.target.value = ''
    setUploadTarget(null)
  }

  async function subirArchivoDAT(checador, archivo) {
    addToast(`📂 Procesando ${archivo.name}...`, 'info')
    const reader = new FileReader()
    reader.onload = async (e) => {
      const lineas = e.target.result.split('\n').filter(l => l.trim().length >= 20)
      let nuevas = 0, existentes = 0, errores = 0
      for (const linea of lineas) {
        try {
          const empleado_id = linea.substring(12, 21).replace(/^0+/, '') || '0'
          const mes = linea.substring(22, 24)
          const dia = linea.substring(24, 26)
          const horaStr = linea.substring(26, 28)
          const minStr = linea.substring(28, 30)
          const año = new Date().getFullYear()
          const fecha = `${año}-${mes}-${dia}`
          const hora = `${horaStr}:${minStr}:00`
          const tipo = linea.substring(11, 12) === '1' ? 'entrada' : 'salida'

          const { data: existente } = await supabase.from('checadas').select('id').eq('numero_empleado', empleado_id).eq('fecha', fecha).eq('hora', hora).eq('checador_ip', checador.ip_address).maybeSingle()
          if (existente) { existentes++ }
          else {
            const { error } = await supabase.from('checadas').insert([{ secuencia: String(existentes + nuevas + 1).padStart(10, '0'), numero_empleado: empleado_id, codigo_tipo: linea.substring(11, 12), estado: linea.substring(21, 22), checador_nombre: checador.nombre, checador_ip: checador.ip_address, tipo, fecha, hora, created_by: 'Sincronizacion ZK' }])
            if (error) { console.error('Error:', error.message); errores++ } else nuevas++
          }
        } catch(e) { errores++ }
      }
      addToast(`✅ ${checador.nombre}: ${nuevas} nuevas, ${existentes} existentes, ${errores} errores`, 'success')
      loadChecadas()
    }
    reader.readAsText(archivo)
  }

  async function handleAdd(e) {
    e.preventDefault()
    try {
      const checador = checadores.find(c => c.nombre === formData.checador_nombre)
      const { error } = await supabase.from('checadas').insert([{ ...formData, checador_ip: checador?.ip_address || '', tipo: 'manual', created_by: 'Admin' }])
      if (error) throw error
      addToast('✅ Checada manual registrada', 'success')
      setIsAddModalOpen(false)
      resetForm()
      loadChecadas()
    } catch (error) { addToast('Error al registrar checada', 'error') }
  }

  async function handleEdit(e) {
    e.preventDefault()
    try {
      const checador = checadores.find(c => c.nombre === formData.checador_nombre)
      const { error } = await supabase.from('checadas').update({ ...formData, checador_ip: checador?.ip_address || editingChecada?.checador_ip || '' }).eq('id', editingChecada.id)
      if (error) throw error
      addToast('✅ Checada actualizada', 'success')
      setIsEditModalOpen(false)
      setEditingChecada(null)
      loadChecadas()
    } catch (error) { addToast('Error al actualizar', 'error') }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta checada?')) return
    try { const { error } = await supabase.from('checadas').delete().eq('id', id); if (error) throw error; addToast('🗑️ Eliminada', 'success'); loadChecadas() } catch (error) { addToast('Error al eliminar', 'error') }
  }

  function openEditModal(checada) {
    setEditingChecada(checada)
    setFormData({ numero_empleado: checada.numero_empleado, nombre_empleado: checada.nombre_empleado || '', checador_nombre: checada.checador_nombre, tipo: checada.tipo, fecha: checada.fecha, hora: checada.hora })
    setIsEditModalOpen(true)
  }

  function resetForm() { setFormData({ numero_empleado: '', nombre_empleado: '', checador_nombre: '', tipo: 'entrada', fecha: new Date().toISOString().split('T')[0], hora: new Date().toTimeString().slice(0, 5) }) }

  function downloadCSV() {
    if (checadas.length === 0) return addToast('No hay datos', 'error')
    const headers = 'N° Empleado,Nombre,Checador,IP,Tipo,Fecha,Hora,Origen\n'
    const rows = checadas.map(c => `${c.numero_empleado},${c.nombre_empleado || ''},${c.checador_nombre},${c.checador_ip || ''},${c.tipo},${c.fecha},${c.hora},${c.created_by || 'Manual'}`).join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `checadas_${new Date().toISOString().split('T')[0]}.csv`; link.click(); URL.revokeObjectURL(url)
    addToast('📥 CSV descargado', 'success')
  }

  function limpiarFiltros() { setFiltros({ fecha: '', empleado: '', checador: '', tipo: '' }); setTimeout(() => loadChecadas(), 50) }

  function puedeSincronizar(ip) { return ip !== '192.168.4.210' && ip !== '192.168.4.214' }

  const totalPages = Math.ceil(checadas.length / ITEMS_PER_PAGE)
  const paginatedChecadas = checadas.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  const checadasSync = checadas.filter(c => c.created_by === 'Sincronizacion ZK').length
  const checadasManuales = checadas.filter(c => c.created_by === 'Admin').length

  return (
    <div className="checadas-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><ClipboardCheck size={28} className="title-icon" />Registro de Checadas</h1>
          <p className="page-subtitle">{checadas.length} checadas · {checadasSync} sincronizadas · {checadasManuales} manuales</p>
        </div>
        <div className="page-actions">
          <button className="btn-icon" onClick={() => setShowFilters(!showFilters)}><Filter size={18} className={showFilters ? 'text-blue' : ''} /></button>
          <button className="btn-icon" onClick={downloadCSV}><Download size={18} /></button>
          <button className="btn-primary" onClick={() => { resetForm(); setIsAddModalOpen(true) }}><Plus size={18} />Registrar Checada</button>
        </div>
      </div>

      {showFilters && (
        <div className="filtros-panel glass-card">
          <div className="filtros-grid">
            <div className="filtro-item"><label>Fecha</label><input type="date" value={filtros.fecha} onChange={e => setFiltros(prev => ({ ...prev, fecha: e.target.value }))} /></div>
            <div className="filtro-item"><label>Empleado</label><input type="text" value={filtros.empleado} onChange={e => setFiltros(prev => ({ ...prev, empleado: e.target.value }))} placeholder="Buscar..." /></div>
            <div className="filtro-item"><label>Checador</label><select value={filtros.checador} onChange={e => setFiltros(prev => ({ ...prev, checador: e.target.value }))}><option value="">Todos</option>{checadores.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}</select></div>
            <div className="filtro-item"><label>Tipo</label><select value={filtros.tipo} onChange={e => setFiltros(prev => ({ ...prev, tipo: e.target.value }))}><option value="">Todos</option><option value="entrada">Entrada</option><option value="salida">Salida</option><option value="manual">Manual</option></select></div>
          </div>
          <div className="filtros-actions">
            <button className="btn-primary" onClick={loadChecadas}><Search size={16} />Buscar</button>
            <button className="btn-secondary" onClick={limpiarFiltros}><X size={16} />Limpiar</button>
          </div>
        </div>
      )}

      <div className="sync-panel glass-card">
        <h3 className="sync-title"><CloudDownload size={18} />Sincronizar checadas desde dispositivos</h3>
        <p className="sync-subtitle">Descarga las checadas directamente del checador. Se guardan en Supabase automáticamente.</p>
        <div className="sync-buttons">
          {checadores.map(checador => {
            const isSyncing = syncingChecador === checador.nombre
            const puede = puedeSincronizar(checador.ip_address)
            return (
              <div key={checador.nombre} className="sync-button-group">
                <button className={`btn-sync ${isSyncing ? 'syncing' : ''} ${!puede ? 'disabled' : ''}`} onClick={() => sincronizarChecador(checador)} disabled={isSyncing || !puede}>
                  {isSyncing ? <RefreshCw size={16} className="spin-animation" /> : <CloudDownload size={16} />}
                  {checador.nombre} {puede ? '🟢' : '❌'}
                </button>
                <button className="btn-dat btn-danger-sm" onClick={() => limpiarChecadasChecador(checador)} title="Limpiar checadas de este checador"><Trash2 size={14} /></button>
              </div>
            )
          })}
        </div>
        <div className="sync-actions">
          <button className="btn-secondary btn-danger" onClick={limpiarTodasChecadas}><Trash2 size={16} />Limpiar todas las checadas</button>
          <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}><FileUp size={16} />Subir archivo .DAT</button>
          <input ref={fileInputRef} type="file" accept=".dat,.txt" style={{ display: 'none' }} onChange={handleFileChange} />
        </div>
      </div>

      <div className="checadas-table-container glass-card">
        <table className="checadas-table">
          <thead><tr><th><User size={14} /> Empleado</th><th><MapPin size={14} /> Checador</th><th><ArrowRightLeft size={14} /> Tipo</th><th><Clock size={14} /> Fecha</th><th><Clock size={14} /> Hora</th><th>Origen</th><th>Acciones</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="loading-cell"><RefreshCw size={24} className="spin-animation" /><span>Cargando...</span></td></tr>
            : paginatedChecadas.length === 0 ? <tr><td colSpan={7} className="empty-cell"><ClipboardCheck size={32} /><span>No se encontraron checadas</span></td></tr>
            : paginatedChecadas.map(checada => (
              <tr key={checada.id} className={`tipo-${checada.tipo}`}>
                <td><div className="empleado-cell"><span className="empleado-numero">{checada.numero_empleado}</span>{checada.nombre_empleado && <span className="empleado-nombre">{checada.nombre_empleado}</span>}</div></td>
                <td><div className="checador-cell"><span>{checada.checador_nombre}</span>{checada.checador_ip && <span className="checador-ip">{checada.checador_ip}</span>}</div></td>
                <td><span className={`tipo-badge tipo-${checada.tipo}`}>{checada.tipo === 'entrada' ? '▶ Entrada' : checada.tipo === 'salida' ? '◀ Salida' : '✎ Manual'}</span></td>
                <td>{checada.fecha}</td>
                <td className="hora-cell">{checada.hora}</td>
                <td><span className={`origen-badge ${checada.created_by === 'Sincronizacion ZK' ? 'origen-sync' : 'origen-manual'}`}>{checada.created_by === 'Sincronizacion ZK' ? '🔄 Sync' : '✎ Manual'}</span></td>
                <td><div className="acciones-cell"><button className="btn-icon-sm" onClick={() => openEditModal(checada)}><Edit size={14} /></button><button className="btn-icon-sm btn-danger" onClick={() => handleDelete(checada.id)}><Trash2 size={14} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn-page" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Anterior</button>
          <span className="page-info">Página {currentPage} de {totalPages}</span>
          <button className="btn-page" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Siguiente</button>
        </div>
      )}

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Registrar Checada Manual">
        <form onSubmit={handleAdd} className="checada-form">
          <div className="form-group"><label className="form-label">N° Empleado *</label><input type="text" className="form-input" value={formData.numero_empleado} onChange={e => setFormData(prev => ({ ...prev, numero_empleado: e.target.value }))} required /></div>
          <div className="form-group"><label className="form-label">Nombre</label><input type="text" className="form-input" value={formData.nombre_empleado} onChange={e => setFormData(prev => ({ ...prev, nombre_empleado: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Checador *</label><select className="form-input" value={formData.checador_nombre} onChange={e => setFormData(prev => ({ ...prev, checador_nombre: e.target.value }))} required><option value="">Seleccionar...</option>{checadores.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.ip_address})</option>)}</select></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Tipo *</label><select className="form-input" value={formData.tipo} onChange={e => setFormData(prev => ({ ...prev, tipo: e.target.value }))}><option value="entrada">Entrada</option><option value="salida">Salida</option></select></div>
            <div className="form-group"><label className="form-label">Fecha *</label><input type="date" className="form-input" value={formData.fecha} onChange={e => setFormData(prev => ({ ...prev, fecha: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">Hora *</label><input type="time" className="form-input" value={formData.hora} onChange={e => setFormData(prev => ({ ...prev, hora: e.target.value }))} required /></div>
          </div>
          <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancelar</button><button type="submit" className="btn-primary"><Plus size={18} />Guardar</button></div>
        </form>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Checada">
        <form onSubmit={handleEdit} className="checada-form">
          <div className="form-group"><label className="form-label">N° Empleado *</label><input type="text" className="form-input" value={formData.numero_empleado} onChange={e => setFormData(prev => ({ ...prev, numero_empleado: e.target.value }))} required /></div>
          <div className="form-group"><label className="form-label">Nombre</label><input type="text" className="form-input" value={formData.nombre_empleado} onChange={e => setFormData(prev => ({ ...prev, nombre_empleado: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Checador *</label><select className="form-input" value={formData.checador_nombre} onChange={e => setFormData(prev => ({ ...prev, checador_nombre: e.target.value }))} required><option value="">Seleccionar...</option>{checadores.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}</select></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Tipo *</label><select className="form-input" value={formData.tipo} onChange={e => setFormData(prev => ({ ...prev, tipo: e.target.value }))}><option value="entrada">Entrada</option><option value="salida">Salida</option><option value="manual">Manual</option></select></div>
            <div className="form-group"><label className="form-label">Fecha *</label><input type="date" className="form-input" value={formData.fecha} onChange={e => setFormData(prev => ({ ...prev, fecha: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">Hora *</label><input type="time" className="form-input" value={formData.hora} onChange={e => setFormData(prev => ({ ...prev, hora: e.target.value }))} required /></div>
          </div>
          <div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)}>Cancelar</button><button type="submit" className="btn-primary">Guardar</button></div>
        </form>
      </Modal>

      <div className="toast-container">{toasts.map(toast => (<div key={toast.id} className={`toast ${toast.type}`}>{toast.message}</div>))}</div>
    </div>
  )
}
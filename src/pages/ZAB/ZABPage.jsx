import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { ZABGeneratorEngine } from './ZABGenerator'
import Modal from '../../components/UI/Modal'
import { Download, Trash2, Copy, Zap, Loader2, Plus } from 'lucide-react'
import './ZABPage.css'

const engine = new ZABGeneratorEngine()

export default function ZABPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [lastZab, setLastZab] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [customQuantity, setCustomQuantity] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [loading, setLoading] = useState(false)
  const [codes, setCodes] = useState([])
  const [currentCounter, setCurrentCounter] = useState(300000)
  const [toasts, setToasts] = useState([])
  const [backendReady, setBackendReady] = useState(false)
  
  const lastZabRef = useRef(null)

  useEffect(() => {
    initializeBackend()
    loadCodesFromDB()
  }, [])

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        lastZabRef.current?.focus()
      }, 50)
    }
  }, [isModalOpen])

  async function initializeBackend() {
    try {
      const counter = await engine.getLastCounter()
      setCurrentCounter(counter)
      setBackendReady(true)
      addToast('✅ Conexión con Google Sheets establecida', 'success')
    } catch (error) {
      setBackendReady(false)
      addToast('⚠️ Modo offline activado', 'warning')
    }
  }

  async function loadCodesFromDB() {
    try {
      const { data, error } = await supabase
        .from('zab_codes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      if (data && data.length > 0) {
        setCodes(data.map(c => c.code))
      }
    } catch (error) {
      console.error('Error cargando códigos:', error)
    }
  }

  function addToast(message, type = 'info') {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }

  function formatZabInput(value) {
    value = value.toUpperCase()
    value = value.replace(/[^ZAB0-9A-Z]/g, '')
    
    if (value && !value.startsWith('ZAB')) {
      if ('ZAB'.startsWith(value)) {
        value = 'ZAB'.substring(0, value.length)
      } else {
        value = 'ZAB' + value.replace(/ZAB/g, '')
      }
    }
    
    return value.substring(0, 10)
  }

  function handleSubmit(e) {
    e.preventDefault()
    
    const finalQuantity = isCustom ? parseInt(customQuantity) : parseInt(quantity)
    
    if (lastZab && !engine.validateZabFormat(lastZab)) {
      addToast('Formato de ZAB inválido. Debe ser ZAB + 6 dígitos + 1 check digit', 'error')
      return
    }
    
    if (!finalQuantity || finalQuantity < 1 || finalQuantity > 1000) {
      addToast('La cantidad debe estar entre 1 y 1000', 'error')
      return
    }
    
    setIsModalOpen(false)
    generateCodes(finalQuantity)
  }

  async function generateCodes(quantity) {
    setLoading(true)
    
    try {
      const startCounter = lastZab 
        ? engine.extractCounterFromZab(lastZab) + 1 
        : currentCounter + 1
      
      const { codes: newCodes, lastCounter } = engine.generateCodes(startCounter, quantity)
      
      // Guardar en Supabase
      const dbCodes = newCodes.map(c => ({
        code: c.code,
        sn: c.sn,
        check_digit: c.checkDigit,
        counter: c.counter
      }))
      
      const { error: dbError } = await supabase
        .from('zab_codes')
        .insert(dbCodes)
      
      if (dbError) {
        console.error('Error guardando en DB:', dbError)
        addToast('⚠️ Guardado local (error DB)', 'warning')
      }
      
      // Intentar guardar en Google Sheets
      if (backendReady) {
        try {
          await engine.saveToBackend(newCodes)
          addToast(`✅ ${quantity} códigos guardados en Google Sheets`, 'success')
        } catch (error) {
          addToast('⚠️ Guardado en DB local (error Sheets)', 'warning')
        }
      }
      
      setCodes(prev => [...newCodes.map(c => c.code), ...prev])
      setCurrentCounter(lastCounter)
      setLastZab('')
      addToast(`✅ ${quantity} códigos ZAB generados`, 'success')
      
    } catch (error) {
      console.error('Error generando códigos:', error)
      addToast('❌ Error generando códigos', 'error')
    } finally {
      setLoading(false)
    }
  }

  function copyToClipboard(code) {
    navigator.clipboard.writeText(code).then(() => {
      addToast(`📋 ${code} copiado`, 'success')
    })
  }

  function downloadCSV() {
    if (codes.length === 0) {
      addToast('No hay códigos para descargar', 'error')
      return
    }
    
    const csvContent = 'ZAB\n' + codes.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ZAB_Codes_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    addToast('📥 CSV descargado', 'success')
  }

  async function clearAll() {
    if (!confirm('¿Eliminar todos los códigos generados?')) return
    
    setCodes([])
    try {
      await supabase.from('zab_codes').delete().neq('id', 0)
    } catch (error) {
      console.error('Error limpiando DB:', error)
    }
    addToast('🧹 Códigos limpiados', 'success')
  }

  return (
    <div className="zab-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Zap size={28} className="title-icon" />
            ZAB Generator
          </h1>
          <p className="page-subtitle">Generador de códigos ZAB con check digit</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} />
            Generar Códigos
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="glass-card stat-card">
          <span className="stat-label">Total Generados</span>
          <span className="stat-value">{codes.length.toLocaleString()}</span>
        </div>
        <div className="glass-card stat-card">
          <span className="stat-label">Último Contador</span>
          <span className="stat-value">{currentCounter.toLocaleString()}</span>
        </div>
        <div className="glass-card stat-card">
          <span className="stat-label">Backend</span>
          <span className={`stat-value ${backendReady ? 'text-green' : 'text-amber'}`}>
            {backendReady ? 'Conectado' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Results */}
      {codes.length > 0 && (
        <div className="results-section glass-card">
          <div className="results-header">
            <h3>Últimos Códigos Generados</h3>
            <div className="results-actions">
              <button className="btn-icon" onClick={downloadCSV} title="Descargar CSV">
                <Download size={18} />
              </button>
              <button className="btn-icon btn-danger" onClick={clearAll} title="Limpiar todo">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
          <div className="results-grid">
            {codes.slice(0, 50).map((code, i) => (
              <div 
                key={i} 
                className="result-item"
                onClick={() => copyToClipboard(code)}
                title="Clic para copiar"
              >
                <span className="result-code">{code}</span>
                <Copy size={14} className="copy-icon" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <Loader2 size={48} className="spinner-icon" />
            <p>Generando códigos ZAB...</p>
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Generar Códigos ZAB">
        <form onSubmit={handleSubmit} className="zab-form">
          <div className="form-group">
            <label className="form-label">Último ZAB (opcional)</label>
            <input
              ref={lastZabRef}
              type="text"
              className="form-input"
              value={lastZab}
              onChange={e => setLastZab(formatZabInput(e.target.value))}
              placeholder="ZAB0000000"
              maxLength={10}
            />
            <span className="form-hint">Deja vacío para continuar desde el último generado</span>
          </div>

          <div className="form-group">
            <label className="form-label">Cantidad a generar</label>
            <select 
              className="form-input"
              value={isCustom ? 'custom' : quantity}
              onChange={e => {
                if (e.target.value === 'custom') {
                  setIsCustom(true)
                } else {
                  setIsCustom(false)
                  setQuantity(e.target.value)
                }
              }}
            >
              <option value="1">1 código</option>
              <option value="5">5 códigos</option>
              <option value="10">10 códigos</option>
              <option value="25">25 códigos</option>
              <option value="50">50 códigos</option>
              <option value="100">100 códigos</option>
              <option value="500">500 códigos</option>
              <option value="custom">Personalizado...</option>
            </select>
          </div>

          {isCustom && (
            <div className="form-group">
              <label className="form-label">Cantidad personalizada</label>
              <input
                type="number"
                className="form-input"
                value={customQuantity}
                onChange={e => setCustomQuantity(e.target.value)}
                placeholder="1-1000"
                min="1"
                max="1000"
                autoFocus
              />
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              <Zap size={18} />
              Generar
            </button>
          </div>
        </form>
      </Modal>

      {/* Toast Container */}
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
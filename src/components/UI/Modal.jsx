import { X } from 'lucide-react'
import './Modal.css'

export default function Modal({ isOpen, onClose, title, children, size = 'default' }) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className={`shimmer-modal modal-${size}`} 
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body shimmer-modal-scroll">
          {children}
        </div>
      </div>
    </div>
  )
}
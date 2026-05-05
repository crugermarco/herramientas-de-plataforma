import { NavLink } from 'react-router-dom'
import { Barcode, MonitorCheck, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { MODULES } from '../../lib/constants'
import { useAuth } from '../../context/AuthContext'
import './Sidebar.css'

const iconMap = {
  Barcode,
  MonitorCheck,
  Settings
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, isAdmin } = useAuth()

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <h2 className="sidebar-title">Herramientas</h2>}
        <button 
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="sidebar-nav">
        {MODULES.map(module => {
          const Icon = iconMap[module.icon] || Settings
          return (
            <NavLink
              key={module.id}
              to={module.path}
              className={({ isActive }) => 
                `sidebar-link ${isActive ? 'active' : ''}`
              }
              title={collapsed ? module.name : ''}
            >
              <Icon size={22} className="sidebar-icon" />
              {!collapsed && <span>{module.name}</span>}
              {!collapsed && module.badge && (
                <span className="sidebar-badge">{module.badge}</span>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          {!collapsed && (
            <div className="user-info">
              <span className="user-name">{user?.name || 'Usuario'}</span>
              <span className="user-role">{isAdmin ? 'Admin' : 'Usuario'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Decoración neon border */}
      <div className="sidebar-neon-border" />
    </aside>
  )
}
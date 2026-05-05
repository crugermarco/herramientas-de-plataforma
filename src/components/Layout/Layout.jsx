import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import BackgroundEffect from '../UI/BackgroundEffect'
import './Layout.css'

export default function Layout() {
  return (
    <div className="app-layout">
      <BackgroundEffect />
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import SystemGuard from './components/SystemGuard/SystemGuard'
import ZABPage from './pages/ZAB/ZABPage'
import ChecadoresPage from './pages/Checadores/ChecadoresPage'
import ChecadasPage from './pages/Checadas/ChecadasPage'

export default function App() {
  return (
    <SystemGuard>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/checadas" replace />} />
          <Route path="/zab" element={<ZABPage />} />
          <Route path="/checadores" element={<ChecadoresPage />} />
          <Route path="/checadas" element={<ChecadasPage />} />
        </Route>
      </Routes>
    </SystemGuard>
  )
}
const ZKLib = require('node-zklib')
const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(cors())
app.use(express.json())

const SUPABASE_URL = 'https://iirouvhshnwfdnxicvsd.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpcm91dmhzaG53ZmRueGljdnNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODAxNTA3OCwiZXhwIjoyMDkzNTkxMDc4fQ.Y2UbqFajYIq1fxfTbVaWPea2n5rlTVWvTrn5VRdwxN0'

process.on('uncaughtException', (err) => console.error('❌ Error:', err.message))

function parsearRegistros(hexData) {
  const registros = []
  const partes = hexData.split('00000000000000000000000000')
  for (let i = 1; i < partes.length; i++) {
    const parte = partes[i]
    if (parte.length < 30) continue
    const resto = parte.slice(16)
    const campos = resto.split('000000000000')
    for (const campo of campos) {
      if (campo.length < 12) continue
      const empleadoMatch = campo.match(/00([0-9]{3,9})/)
      if (empleadoMatch) {
        const empleado = empleadoMatch[1].replace(/^0+/, '')
        if (empleado && empleado !== '0' && empleado.length >= 2) {
          registros.push({ empleado })
        }
      }
    }
  }
  if (registros.length < 100) {
    const matches = hexData.match(/00[0-9]{3,9}00000000000000000000000000000000000000/g)
    if (matches) {
      matches.forEach(m => {
        const empleado = m.replace(/^0+/, '').replace(/00000000000000000000000000000000000000$/, '')
        if (empleado && empleado !== '0' && empleado.length >= 2) {
          registros.push({ empleado })
        }
      })
    }
  }
  return registros
}

function generarDAT(registros, nombre) {
  let contenido = ''
  const now = new Date()
  const mes = String(now.getMonth() + 1).padStart(2, '0')
  const dia = String(now.getDate()).padStart(2, '0')
  const hora = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const seg = String(now.getSeconds()).padStart(2, '0')
  registros.forEach((reg, i) => {
    const secuencia = String(i + 1).padStart(10, '0')
    const empleado = reg.empleado.padStart(9, '0')
    contenido += `${secuencia}@1${empleado}A${mes}${dia}${hora}${min}${seg}\n`
  })
  const fileName = `ATT_${nombre.replace(/\s/g, '_')}_${Date.now()}.DAT`
  const filePath = path.join(__dirname, fileName)
  fs.writeFileSync(filePath, contenido, 'utf8')
  return { filePath, fileName, total: registros.length }
}

async function guardarEnSupabase(registros, checadorNombre, checadorIP) {
  const now = new Date()
  const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`

  const inserts = registros.map((reg, i) => ({
    secuencia: String(i + 1).padStart(10, '0'),
    numero_empleado: reg.empleado,
    codigo_tipo: '1',
    estado: 'A',
    checador_nombre: checadorNombre,
    checador_ip: checadorIP,
    tipo: 'entrada',
    fecha,
    hora,
    created_by: 'Sincronizacion ZK'
  }))

  const batchSize = 100
  let nuevas = 0, errores = 0

  for (let i = 0; i < inserts.length; i += batchSize) {
    const batch = inserts.slice(i, i + batchSize)
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/checadas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(batch)
      })
      
      if (response.ok || response.status === 201) {
        nuevas += batch.length
        console.log(`💾 Lote ${i}-${i + batch.length}: OK`)
      } else {
        const errText = await response.text()
        console.error(`❌ Lote ${i}: ${response.status} - ${errText.slice(0, 100)}`)
        errores += batch.length
      }
    } catch(e) {
      errores += batch.length
      console.error(`❌ Lote ${i}: ${e.message}`)
    }
  }

  return { nuevas, existentes: 0, errores }
}

async function conectarZK(ip) {
  const zk = new ZKLib(ip, 4370, 5000, 5000)
  await zk.createSocket()
  return zk
}

async function capturarDatos(zk) {
  return new Promise((resolve) => {
    const chunks = []
    zk.zklibUdp.socket.on('message', (msg) => chunks.push(msg))
    zk.getAttendances(() => {})
    setTimeout(() => {
      try { zk.disconnect() } catch(e) {}
      const allHex = Buffer.concat(chunks).toString('hex')
      const registros = parsearRegistros(allHex)
      resolve(registros)
    }, 8000)
  })
}

app.post('/api/checador/descargar-dat', async (req, res) => {
  const { ip, checador_nombre } = req.body
  if (!ip || !checador_nombre) return res.status(400).json({ error: 'IP y nombre requeridos' })

  console.log(`📥 ${checador_nombre} (${ip})`)

  try {
    const zk = await conectarZK(ip)
    const registros = await capturarDatos(zk)
    console.log(`📋 ${registros.length} registros`)

    if (registros.length === 0) {
      return res.json({ success: true, mensaje: '⚠️ Sin registros', registros: 0 })
    }

    console.log('💾 Guardando en Supabase...')
    const data = await guardarEnSupabase(registros, checador_nombre, ip)
    console.log(`💾 ${data.nuevas} nuevas, ${data.errores} errores`)

    const resultado = generarDAT(registros, checador_nombre)

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${resultado.fileName}"`)
    res.setHeader('X-Total-Registros', resultado.total)
    res.setHeader('X-Nuevas', data.nuevas)

    const stream = fs.createReadStream(resultado.filePath)
    stream.pipe(res)
    stream.on('end', () => {
      fs.unlinkSync(resultado.filePath)
      console.log(`✅ ${resultado.fileName} (${data.nuevas} en Supabase)`)
    })
  } catch (error) {
    console.error(`❌ Error:`, error.message)
    return res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/checador/limpiar-checadas', async (req, res) => {
  const { checador_nombre } = req.body
  if (!checador_nombre) return res.status(400).json({ error: 'Nombre requerido' })
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/checadas?checador_nombre=eq.${encodeURIComponent(checador_nombre)}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    })
    return res.json({ success: true, mensaje: `✅ Checadas de ${checador_nombre} eliminadas` })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/checador/limpiar-todo', async (req, res) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/checadas?id=gt.0`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    })
    return res.json({ success: true, mensaje: '✅ Todas las checadas eliminadas' })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

const PORT = 3005
app.listen(PORT, () => console.log(`✅ Servidor en http://localhost:${PORT}`))
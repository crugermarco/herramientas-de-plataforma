const ZKLib = require('node-zklib')
const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const app = express()
app.use(cors())
app.use(express.json())

const supabase = createClient(
  'https://axcaxcuojkehuasrstog.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4Y2F4Y3VvamtlaHVhc3JzdG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzkxNDEsImV4cCI6MjA5MjQ1NTE0MX0.oSqxzEMvGOLZnbkmpEWLMeexfyFnG_QkdeS3wwi7bDM'
)

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
  
  const fileName = `ATT_${nombre.replace(/\s/g, '_')}_${Date.now()}.dat`
  const filePath = path.join(__dirname, fileName)
  fs.writeFileSync(filePath, contenido, 'utf8')
  return { filePath, fileName, total: registros.length }
}

async function guardarEnSupabase(registros, checadorNombre, checadorIP) {
  let nuevas = 0, existentes = 0, errores = 0
  const now = new Date()
  const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`

  for (const reg of registros) {
    try {
      const { data: existente } = await supabase
        .from('checadas')
        .select('id')
        .eq('numero_empleado', reg.empleado)
        .eq('checador_ip', checadorIP)
        .eq('fecha', fecha)
        .maybeSingle()

      if (existente) {
        existentes++
      } else {
        const { error } = await supabase
          .from('checadas')
          .insert([{
            secuencia: String(existentes + nuevas + 1).padStart(10, '0'),
            numero_empleado: reg.empleado,
            codigo_tipo: '1',
            estado: 'A',
            checador_nombre: checadorNombre,
            checador_ip: checadorIP,
            tipo: 'entrada',
            fecha,
            hora,
            created_by: 'Sincronizacion ZK'
          }])

        if (error) errores++
        else nuevas++
      }
    } catch(e) { errores++ }
  }

  return { nuevas, existentes, errores }
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

app.get('/api/checador/status', async (req, res) => {
  const { ip } = req.query
  if (!ip) return res.status(400).json({ error: 'IP requerida' })
  try {
    const zk = await conectarZK(ip)
    try { zk.disconnect() } catch(e) {}
    return res.json({ ip, status: 'online' })
  } catch (error) {
    return res.json({ ip, status: 'offline', error: error.message })
  }
})

app.post('/api/checador/descargar-dat', async (req, res) => {
  const { ip, checador_nombre } = req.body
  if (!ip || !checador_nombre) return res.status(400).json({ error: 'IP y nombre requeridos' })

  console.log(`📥 Extrayendo checadas de ${checador_nombre} (${ip})...`)

  try {
    const zk = await conectarZK(ip)
    console.log(`✅ Conectado. Recibiendo datos...`)
    
    const registros = await capturarDatos(zk)
    console.log(`📋 ${registros.length} registros parseados`)
    
    if (registros.length === 0) {
      return res.json({ success: true, mensaje: '⚠️ No se pudieron parsear registros.', registros: 0 })
    }
    
    const data = await guardarEnSupabase(registros, checador_nombre, ip)
    console.log(`💾 Supabase: ${data.nuevas} nuevas, ${data.existentes} existentes, ${data.errores} errores`)
    
    const resultado = generarDAT(registros, checador_nombre)
    
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${resultado.fileName}"`)
    res.setHeader('X-Total-Registros', resultado.total)
    res.setHeader('X-Nuevas', data.nuevas)
    res.setHeader('X-Existentes', data.existentes)
    
    const stream = fs.createReadStream(resultado.filePath)
    stream.pipe(res)
    stream.on('end', () => {
      fs.unlinkSync(resultado.filePath)
      console.log(`✅ ${resultado.fileName} enviado`)
    })
  } catch (error) {
    console.error(`Error:`, error.message)
    return res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/checador/limpiar-checadas', async (req, res) => {
  const { checador_nombre } = req.body
  if (!checador_nombre) return res.status(400).json({ error: 'Nombre de checador requerido' })

  try {
    const { error, count } = await supabase
      .from('checadas')
      .delete({ count: 'exact' })
      .eq('checador_nombre', checador_nombre)

    if (error) throw error
    return res.json({ success: true, eliminadas: count, mensaje: `✅ ${count} checadas eliminadas de ${checador_nombre}` })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/checador/limpiar-todo', async (req, res) => {
  try {
    const { error, count } = await supabase
      .from('checadas')
      .delete({ count: 'exact' })
      .neq('id', 0)

    if (error) throw error
    return res.json({ success: true, eliminadas: count, mensaje: `✅ ${count} checadas eliminadas en total` })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

const PORT = 3005
app.listen(PORT, () => {
  console.log(`✅ Servidor en http://localhost:${PORT}`)
  console.log(`   POST /api/checador/descargar-dat`)
  console.log(`   POST /api/checador/limpiar-checadas`)
  console.log(`   POST /api/checador/limpiar-todo`)
})
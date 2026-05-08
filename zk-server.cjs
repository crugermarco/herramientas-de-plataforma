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

process.on('uncaughtException', (err) => console.error('Error:', err.message))

function parsearRegistros(hexData) {
  const registrosMap = new Map()
  const bytes = Buffer.from(hexData, 'hex')
  const totalBytes = bytes.length
  
  let i = 0
  while (i < totalBytes - 15) {
    if (bytes[i] === 0x01 &&
        bytes[i+5] === 0xff && bytes[i+6] === 0x00 && bytes[i+7] === 0x00 &&
        bytes[i+8] === 0x00 && bytes[i+9] === 0x00 &&
        bytes[i+10] === 0xff && bytes[i+11] === 0x00 && bytes[i+12] === 0x00 && bytes[i+13] === 0x00) {
      
      const ts1 = bytes[i + 1]
      const ts2 = bytes[i + 2]
      const ts3 = bytes[i + 3]
      const ts4 = bytes[i + 4]
      
      let idStr = ''
      let k = i + 16
      
      while (k < totalBytes && bytes[k] >= 0x30 && bytes[k] <= 0x39) {
        idStr += String.fromCharCode(bytes[k])
        k++
      }
      
      if (idStr.length >= 1) {
        const empleado = idStr.replace(/^0+/, '')
        
        if (empleado.length >= 1) {
          const mes = ((ts3 >> 4) & 0x0F) * 10 + (ts3 & 0x0F)
          const dia = ((ts2 >> 4) & 0x0F) * 10 + (ts2 & 0x0F)
          const hora = ((ts1 >> 4) & 0x0F) * 10 + (ts1 & 0x0F)
          const minuto = ((ts4 >> 4) & 0x0F) * 10 + (ts4 & 0x0F)
          
          if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && hora <= 23 && minuto <= 59) {
            const empleadoPadded = empleado.padStart(9, '0')
            const clave = `${empleadoPadded}-${mes}-${dia}-${hora}-${minuto}`
            
            if (!registrosMap.has(clave)) {
              registrosMap.set(clave, {
                empleado: empleadoPadded,
                mes: String(mes).padStart(2, '0'),
                dia: String(dia).padStart(2, '0'),
                hora: String(hora).padStart(2, '0'),
                minuto: String(minuto).padStart(2, '0')
              })
            }
          }
        }
      }
      i = k + 1
    } else {
      i++
    }
  }
  
  return Array.from(registrosMap.values())
}

function generarDAT(registros, nombre) {
  let contenido = ''
  const ordenados = registros.sort((a, b) => {
    const keyA = `${a.mes}${a.dia}${a.hora}${a.minuto}${a.empleado}`
    const keyB = `${b.mes}${b.dia}${b.hora}${b.minuto}${b.empleado}`
    return keyA.localeCompare(keyB)
  })
  
  ordenados.forEach((reg, i) => {
    const secuencia = String(i + 1).padStart(10, '0')
    contenido += `${secuencia}@1${reg.empleado}A${reg.mes}${reg.dia}${reg.hora}${reg.minuto}\n`
  })
  
  const fileName = `ATT_${nombre.replace(/\s/g, '_')}_${Date.now()}.DAT`
  const filePath = path.join(__dirname, fileName)
  fs.writeFileSync(filePath, contenido, 'utf8')
  return { filePath, fileName, total: ordenados.length }
}

async function guardarEnSupabase(registros, checadorNombre, checadorIP) {
  const inserts = registros.map((reg, i) => {
    const now = new Date()
    const año = now.getFullYear()
    const fecha = `${año}-${reg.mes}-${reg.dia}`
    const hora = `${reg.hora}:${reg.minuto}:00`
    
    return {
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
    }
  })

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
        console.log(`Lote ${i}-${i + batch.length}: OK`)
      } else {
        const errText = await response.text()
        console.error(`Lote ${i}: ${errText.slice(0, 100)}`)
        errores += batch.length
      }
    } catch(e) {
      errores += batch.length
      console.error(`Lote ${i}: ${e.message}`)
    }
  }

  return { nuevas, existentes: 0, errores }
}

async function conectarZK(ip) {
  const zk = new ZKLib(ip, 4370, 5000, 5000)
  await zk.createSocket()
  return zk
}

async function capturarTodo(ip) {
  const todosRegistros = new Map()
  
  console.log(`Conectando a ${ip}...`)
  
  const zk = await conectarZK(ip)
  const chunks = []
  
  zk.zklibUdp.socket.on('message', (msg) => chunks.push(msg))
  
  zk.getAttendances(() => {})
  
  await new Promise((resolve) => setTimeout(resolve, 120000))
  
  try { zk.disconnect() } catch(e) {}
  
  console.log(`Total paquetes capturados: ${chunks.length}`)
  
  const allHex = Buffer.concat(chunks).toString('hex')
  console.log(`Hex total: ${allHex.length} caracteres`)
  
  const registros = parsearRegistros(allHex)
  
  registros.forEach(r => {
    const clave = `${r.empleado}-${r.mes}-${r.dia}-${r.hora}-${r.minuto}`
    if (!todosRegistros.has(clave)) {
      todosRegistros.set(clave, r)
    }
  })
  
  console.log(`Registros parseados: ${registros.length}`)
  console.log(`Registros unicos: ${todosRegistros.size}`)
  
  return Array.from(todosRegistros.values())
}

app.post('/api/checador/descargar-dat', async (req, res) => {
  const { ip, checador_nombre } = req.body
  if (!ip || !checador_nombre) return res.status(400).json({ error: 'IP y nombre requeridos' })

  console.log(`${checador_nombre} (${ip}) - Descarga completa`)

  try {
    const registros = await capturarTodo(ip)
    console.log(`Total registros unicos final: ${registros.length}`)

    if (registros.length === 0) {
      return res.json({ success: true, mensaje: 'Sin registros', registros: 0 })
    }

    console.log('Guardando en Supabase...')
    const data = await guardarEnSupabase(registros, checador_nombre, ip)
    console.log(`${data.nuevas} nuevas, ${data.errores} errores`)

    const resultado = generarDAT(registros, checador_nombre)

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${resultado.fileName}"`)
    res.setHeader('X-Total-Registros', resultado.total)
    res.setHeader('X-Nuevas', data.nuevas)

    const stream = fs.createReadStream(resultado.filePath)
    stream.pipe(res)
    stream.on('end', () => {
      fs.unlinkSync(resultado.filePath)
      console.log(`${resultado.fileName} (${data.nuevas} en Supabase)`)
    })
  } catch (error) {
    console.error(`Error:`, error.message)
    return res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/checador/limpiar-checadas', async (req, res) => {
  const { checador_nombre } = req.body
  if (!checador_nombre) return res.status(400).json({ error: 'Nombre requerido' })
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/checadas?checador_nombre=eq.${encodeURIComponent(checador_nombre)}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    })
    return res.json({ success: true, mensaje: `Checadas de ${checador_nombre} eliminadas` })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/checador/limpiar-todo', async (req, res) => {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/checadas?id=gt.0`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    })
    return res.json({ success: true, mensaje: 'Todas las checadas eliminadas' })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

const PORT = 3005
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`))
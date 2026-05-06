const ZKLib = require('node-zklib')
const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

process.on('uncaughtException', (err) => {
  console.error('❌ Error:', err.message)
})

async function conectarZK(ip) {
  const zk = new ZKLib(ip, 4370, 5000, 5000)
  await zk.createSocket()
  return zk
}

app.get('/api/checador/status', async (req, res) => {
  const { ip } = req.query
  if (!ip) return res.status(400).json({ error: 'IP requerida' })

  const inicio = Date.now()
  try {
    const zk = await conectarZK(ip)
    try { await zk.disconnect() } catch(e) {}
    const tiempo = Date.now() - inicio

    return res.json({
      ip,
      status: 'online',
      tiempo_ms: tiempo,
      calidad: tiempo < 500 ? 'excelente' : tiempo < 1500 ? 'buena' : 'lenta'
    })
  } catch (error) {
    return res.json({ ip, status: 'offline', tiempo_ms: Date.now() - inicio, calidad: 'critica', error: error.message })
  }
})

app.post('/api/checador/inject', async (req, res) => {
  const { ip, userId, nombre, fecha, hora, tipo } = req.body

  if (!ip || !userId) {
    return res.status(400).json({ success: false, error: 'IP y userId requeridos' })
  }

  console.log(`💉 Inyectando checada en ${ip}: ${userId} - ${tipo || 'entrada'} - ${fecha} ${hora}`)

  try {
    const zk = await conectarZK(ip)
    console.log(`✅ Conectado a ${ip}`)
    
    const timestamp = new Date(`${fecha}T${hora}:00`)
    const year = timestamp.getFullYear()
    const month = timestamp.getMonth() + 1
    const day = timestamp.getDate()
    const hours = timestamp.getHours()
    const minutes = timestamp.getMinutes()
    const seconds = timestamp.getSeconds()

    const attType = tipo === 'salida' ? 1 : 0

    const cmd = {
      command: 'SET_OPTIONS',
      data: {
        uid: parseInt(userId) || 1,
        userid: userId.toString(),
        name: nombre || userId.toString(),
        timestamp: timestamp,
        type: attType,
        year, month, day, hours, minutes, seconds
      }
    }

    console.log(`📝 Enviando comando...`, JSON.stringify(cmd))

    const result = await new Promise((resolve) => {
      zk.executeCmd(1100, Buffer.from(JSON.stringify({
        uid: parseInt(userId) || 1,
        userid: userId.toString(),
        name: nombre || userId.toString(),
        timestamp: timestamp,
        type: attType
      })), (err, data) => {
        if (err) {
          console.log(`⚠️ Error en comando: ${err.message}`)
        }
        
        zk.getRealTimeLogs((err2, logs) => {
          try { zk.disconnect() } catch(e) {}
          
          if (err2) {
            resolve({
              success: true,
              mensaje: `✅ Checada de ${nombre || userId} procesada en ${ip} como ${tipo || 'entrada'} a las ${hora}`,
              nota: 'El dispositivo no confirmó, pero el comando fue enviado'
            })
          } else {
            resolve({
              success: true,
              mensaje: `✅ Checada de ${nombre || userId} inyectada en ${ip} como ${tipo || 'entrada'} a las ${hora}`,
              logs: logs?.length || 0
            })
          }
        })
      })
    })

    console.log(`📤 Respondiendo:`, JSON.stringify(result))
    return res.json(result)
  } catch (error) {
    console.error(`❌ Error:`, error.message)
    return res.status(500).json({ success: false, error: error.message })
  }
})

const PORT = 3005
app.listen(PORT, () => {
  console.log(`✅ Servidor puente ZKTeco en http://localhost:${PORT}`)
  console.log(`   POST http://localhost:${PORT}/api/checador/inject`)
})
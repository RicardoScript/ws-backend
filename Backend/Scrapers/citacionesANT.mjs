import { DatabaseOperations, Collections, ErrorLogsModel } from '../Models/database.js'

export const obtenerCitaciones = async (cedula) => {
  console.log(`🔍 Iniciando consulta CitacionesANT para cédula: ${cedula}`)
  
  try {
    console.log(`🌐 Consultando APIs de ANT...`)
    
    // Configurar headers comunes para las APIs
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Referer': 'https://consultaweb.ant.gob.ec/PortalWEB/paginas/clientes/clp_criterio_consulta.jsp',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    }

    // API 1: Obtener datos básicos del conductor y ps_persona
    console.log(`📊 Consultando datos básicos del conductor...`)
    const datosBasicosUrl = `https://consultaweb.ant.gob.ec/PortalWEB/paginas/clientes/clp_grid_citaciones.jsp?ps_tipo_identificacion=CED&ps_identificacion=${cedula}&ps_placa=`
    
    const datosBasicosResponse = await fetch(datosBasicosUrl, {
      method: 'GET',
      headers
    })

    if (!datosBasicosResponse.ok) {
      throw new Error(`Error HTTP en API datos básicos: ${datosBasicosResponse.status} - ${datosBasicosResponse.statusText}`)
    }

    const htmlContent = await datosBasicosResponse.text()
    
    // Extraer nombre del conductor desde el HTML
    let nombreConductor = ""
    let puntos = "0"
    let licenciaInfo = ""
    
    const nombreMatch = htmlContent.match(/<td[^>]*class="titulo1"[^>]*>([^<&]+)&nbsp;&nbsp;<\/td>/)
    if (nombreMatch) {
      nombreConductor = nombreMatch[1].trim()
    }
    
    // Extraer puntos
    const puntosMatch = htmlContent.match(/title="Información adicional de Puntos">(\d+)<\/a>/)
    if (puntosMatch) {
      puntos = puntosMatch[1]
    }
    
    // Extraer información de licencia
    const licenciaMatch = htmlContent.match(/LICENCIA TIPO:\s*([^&]+)&[^/]+\/\s*VALIDEZ:\s*([^<]+)/)
    if (licenciaMatch) {
      licenciaInfo = `Tipo: ${licenciaMatch[1].trim()} | Validez: ${licenciaMatch[2].trim()}`
    }

    console.log(`✅ Datos básicos obtenidos - Conductor: ${nombreConductor}, Puntos: ${puntos}`)

    // Necesitamos obtener ps_persona del HTML para las siguientes consultas
    // Buscar en enlaces o formularios el ps_persona
    let psPersona = ""
    const psPersonaMatch = htmlContent.match(/ps_persona=(\d+)/)
    if (psPersonaMatch) {
      psPersona = psPersonaMatch[1]
    }

    if (!psPersona) {
      console.log(`⚠️ No se pudo obtener ps_persona para continuar con las consultas`)
      return {
        cedula,
        nombreConductor,
        puntos,
        licenciaInfo,
        citacionesPendientes: [],
        citacionesPagadas: [],
        citacionesImpugnadas: [],
        citacionesAnuladas: [],
        valorPendiente: "0.00",
        totalCitaciones: 0,
        fechaConsulta: new Date(),
        estado: 'sin_datos'
      }
    }

    console.log(`📋 ps_persona obtenido: ${psPersona}`)

    // API 2: Estado de cuenta
    console.log(`💰 Consultando estado de cuenta...`)
    const estadoCuentaUrl = `https://consultaweb.ant.gob.ec/PortalWEB/paginas/clientes/clp_estado_cuenta.jsp?ps_persona=${psPersona}&ps_id_contrato=&ps_opcion=P&ps_placa=&ps_identificacion=${cedula}&ps_tipo_identificacion=CED`
    
    const estadoCuentaResponse = await fetch(estadoCuentaUrl, {
      method: 'GET',
      headers
    })

    let valorPendiente = "0.00"
    let valorConvenio = "0.00"
    let interesesPendiente = "0.00"
    let totalRemision = "0.00"
    
    if (estadoCuentaResponse.ok) {
      const estadoHtml = await estadoCuentaResponse.text()
      
      // Extraer valores del estado de cuenta
      const valorPendienteMatch = estadoHtml.match(/Valor Pendiente: \$ <\/font><\/td>\s*<td[^>]*><font[^>]*>\s*([\d,\.]+)/)
      if (valorPendienteMatch) {
        valorPendiente = valorPendienteMatch[1].trim()
      }
      
      const valorConvenioMatch = estadoHtml.match(/Valor Convenio: \$ <\/font><\/td>\s*<td[^>]*><font[^>]*>\s*([\d,\.]+)/)
      if (valorConvenioMatch) {
        valorConvenio = valorConvenioMatch[1].trim()
      }
      
      const interesesMatch = estadoHtml.match(/Intereses Pendiente: \$ <\/font><\/td>\s*<td[^>]*><font[^>]*>\s*([\d,\.]+)/)
      if (interesesMatch) {
        interesesPendiente = interesesMatch[1].trim()
      }
      
      const remisionMatch = estadoHtml.match(/Total remisión: \$ <\/font><\/td>\s*<td[^>]*><font[^>]*>([\d,\.]+)/)
      if (remisionMatch) {
        totalRemision = remisionMatch[1].trim()
      }
    }

    console.log(`✅ Estado de cuenta obtenido - Valor pendiente: $${valorPendiente}`)

    // APIs 3-6: Citaciones por estado
    const timestampBase = Date.now()
    
    // Función helper para consultar citaciones por estado
    const consultarCitacionesPorEstado = async (opcion, nombreEstado) => {
      console.log(`📋 Consultando citaciones ${nombreEstado}...`)
      const url = `https://consultaweb.ant.gob.ec/PortalWEB/paginas/clientes/clp_json_citaciones.jsp?ps_opcion=${opcion}&ps_id_contrato=&ps_id_persona=${psPersona}&ps_placa=&ps_identificacion=${cedula}&ps_tipo_identificacion=CED&_search=false&nd=${timestampBase + Math.random()}&rows=50&page=1&sidx=fecha_emision&sord=desc`
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            ...headers,
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest'
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log(`✅ ${nombreEstado}: ${data.records} citaciones encontradas`)
          return data.rows || []
        } else {
          console.log(`⚠️ Error consultando ${nombreEstado}: ${response.status}`)
          return []
        }
      } catch (error) {
        console.log(`⚠️ Error en ${nombreEstado}:`, error.message)
        return []
      }
    }

    // Consultar todos los estados de citaciones
    const [citacionesPendientes, citacionesImpugnadas, citacionesAnuladas, citacionesPagadas] = await Promise.all([
      consultarCitacionesPorEstado('P', 'pendientes'),
      consultarCitacionesPorEstado('R', 'en impugnación'),
      consultarCitacionesPorEstado('A', 'anuladas'),
      consultarCitacionesPorEstado('G', 'pagadas')
    ])

    // Mapear datos de las APIs al formato esperado por el frontend
    const mapearCitacion = (citacionApi) => {
      const cell = citacionApi.cell || []
      return {
        id: citacionApi.id || "",
        infraccion: cell[17] || "", // Artículo/infracción
        entidad: cell[2] || "",     // Entidad
        citacion: cell[3] || "",    // Número de citación  
        placa: cell[4] || "",       // Placa
        fechaEmision: cell[6] ? new Date(cell[6]).toLocaleDateString('es-ES') : "",
        fechaNotificacion: cell[7] ? new Date(cell[7]).toLocaleDateString('es-ES') : "",
        puntos: cell[9] || "0",     // Puntos
        sancion: cell[17] || "",    // Descripción de la sanción
        multa: cell[13] || "0",     // Valor de la multa
        remision: cell[15] || "0",  // Remisión
        totalPagar: cell[16] || "0", // Total a pagar
        articulo: cell[17] || ""    // Artículo
      }
    }

    // Convertir citaciones al formato del frontend
    const citacionesPendientesMapeadas = citacionesPendientes.map(mapearCitacion)
    const citacionesPagadasMapeadas = citacionesPagadas.map(mapearCitacion)
    const citacionesImpugnadasMapeadas = citacionesImpugnadas.map(mapearCitacion)
    const citacionesAnuladasMapeadas = citacionesAnuladas.map(mapearCitacion)

    const totalCitaciones = citacionesPendientesMapeadas.length + citacionesPagadasMapeadas.length + 
                           citacionesImpugnadasMapeadas.length + citacionesAnuladasMapeadas.length

    console.log(`✅ Resumen de citaciones para cédula ${cedula}:`)
    console.log(`   - Conductor: ${nombreConductor}`)
    console.log(`   - Puntos actuales: ${puntos}`)
    console.log(`   - Pendientes: ${citacionesPendientesMapeadas.length}`)
    console.log(`   - Pagadas: ${citacionesPagadasMapeadas.length}`)
    console.log(`   - En impugnación: ${citacionesImpugnadasMapeadas.length}`)
    console.log(`   - Anuladas: ${citacionesAnuladasMapeadas.length}`)
    console.log(`   - Total: ${totalCitaciones}`)

    // Verificar si se encontraron datos
    if (totalCitaciones === 0) {
      console.log(`ℹ️ No se encontraron citaciones ANT para la cédula ${cedula}.`)
      return {
        cedula,
        nombreConductor,
        puntos,
        licenciaInfo,
        citacionesPendientes: [],
        citacionesPagadas: [],
        citacionesImpugnadas: [],
        citacionesAnuladas: [],
        valorPendiente,
        valorConvenio,
        interesesPendiente,
        totalRemision,
        totalCitaciones: 0,
        fechaConsulta: new Date(),
        estado: 'sin_datos'
      }
    }

    const resultado = {
      cedula,
      nombreConductor,
      puntos,
      licenciaInfo,
      citacionesPendientes: citacionesPendientesMapeadas,
      citacionesPagadas: citacionesPagadasMapeadas,
      citacionesImpugnadas: citacionesImpugnadasMapeadas,
      citacionesAnuladas: citacionesAnuladasMapeadas,
      valorPendiente,
      valorConvenio,
      interesesPendiente,
      totalRemision,
      totalCitaciones,
      fechaConsulta: new Date(),
      estado: 'exitoso'
    }

    // Guardar en base de datos
    try {
      const existingDoc = await DatabaseOperations.findOne(Collections.CITACIONES_ANT, { cedula })

      if (!existingDoc) {
        await DatabaseOperations.insertOne(Collections.CITACIONES_ANT, resultado)
        console.log(`💾 Se guardaron los datos de la cédula ${cedula} en la base de datos`)
      } else {
        // Actualizar arrays de citaciones sin duplicados
        if (citacionesPendientesMapeadas.length > 0) {
          await DatabaseOperations.addToArrayNoDuplicates(
            Collections.CITACIONES_ANT,
            { cedula },
            'citacionesPendientes',
            citacionesPendientesMapeadas,
            ['id', 'citacion']
          )
        }

        if (citacionesPagadasMapeadas.length > 0) {
          await DatabaseOperations.addToArrayNoDuplicates(
            Collections.CITACIONES_ANT,
            { cedula },
            'citacionesPagadas',
            citacionesPagadasMapeadas,
            ['id', 'citacion']
          )
        }

        if (citacionesImpugnadasMapeadas.length > 0) {
          await DatabaseOperations.addToArrayNoDuplicates(
            Collections.CITACIONES_ANT,
            { cedula },
            'citacionesImpugnadas',
            citacionesImpugnadasMapeadas,
            ['id', 'citacion']
          )
        }

        if (citacionesAnuladasMapeadas.length > 0) {
          await DatabaseOperations.addToArrayNoDuplicates(
            Collections.CITACIONES_ANT,
            { cedula },
            'citacionesAnuladas',
            citacionesAnuladasMapeadas,
            ['id', 'citacion']
          )
        }

        // Actualizar datos básicos
        await DatabaseOperations.updateOne(
          Collections.CITACIONES_ANT,
          { cedula },
          { 
            $set: {
              nombreConductor,
              puntos,
              licenciaInfo,
              valorPendiente,
              valorConvenio,
              interesesPendiente,
              totalRemision,
              totalCitaciones,
              fechaConsulta: new Date()
            }
          }
        )
        console.log(`💾 Se actualizaron los datos de la cédula ${cedula}`)
      }
    } catch (dbError) {
      console.warn(`⚠️ Error guardando en BD (continuando): ${dbError.message}`)
    }

    return resultado

  } catch (error) {
    console.error("\n❌ Error en obtenerCitaciones:", error.message)
    
    // Guardar error en base de datos
    try {
      await ErrorLogsModel.saveError(
        'citaciones-ant',
        cedula,
        'error_general',
        { 
          mensaje: error.message || 'Error al consultar citaciones ANT',
          stack: error.stack,
          tipo: error.name || 'Error'
        }
      )
    } catch (logError) {
      console.warn('⚠️ Error guardando log:', logError.message)
    }
    
    throw new Error(`Error al consultar citaciones ANT: ${error.message}`)
  }
}

export async function scrapeCitacionesANT(cedula) {
  return await obtenerCitaciones(cedula)
}

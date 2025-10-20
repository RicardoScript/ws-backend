import { DatabaseOperations, Collections, ErrorLogsModel } from '../Models/database.js'

// Función para consultar API directa
async function consultarProcesosAPI(cedula) {
  console.log(`🌐 Consultando API de procesos judiciales para cédula: ${cedula}`)
  
  const url = 'https://api.funcionjudicial.gob.ec/EXPEL-CONSULTA-CAUSAS-SERVICE/api/consulta-causas/informacion/buscarCausas?page=1&size=10'
  
  let resultadosActor = []
  let resultadosDemandado = []
  
  try {
    // Consultar como actor
    console.log(`🔍 Buscando como actor...`)
    const payloadActor = {
      numeroCausa: "",
      actor: {
        cedulaActor: cedula,
        nombreActor: ""
      },
      demandado: {
        cedulaDemandado: "",
        nombreDemandado: ""
      },
      first: 1,
      numeroFiscalia: "",
      pageSize: 10,
      provincia: "",
      recaptcha: "verdad"
    }
    
    const responseActor = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api.v1+json',
        'Accept': 'application/vnd.api.v1+json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://procesosjudiciales.funcionjudicial.gob.ec',
        'Referer': 'https://procesosjudiciales.funcionjudicial.gob.ec/',
      },
      body: JSON.stringify(payloadActor)
    })
    
    if (responseActor.ok) {
      const dataActor = await responseActor.json()
      resultadosActor = dataActor.map(proceso => ({
        id: proceso.id || "",
        fecha: proceso.fechaIngreso ? new Date(proceso.fechaIngreso).toLocaleDateString('es-ES') : "",
        numeroProceso: proceso.idJuicio || "",
        accionInfraccion: proceso.nombreDelito || ""
      }))
      console.log(`✅ Encontrados ${resultadosActor.length} procesos como actor`)
    } else {
      console.log(`⚠️ Error consultando como actor: ${responseActor.status}`)
    }
    
    // Consultar como demandado
    console.log(`🔍 Buscando como demandado...`)
    const payloadDemandado = {
      numeroCausa: "",
      actor: {
        cedulaActor: "",
        nombreActor: ""
      },
      demandado: {
        cedulaDemandado: cedula,
        nombreDemandado: ""
      },
      first: 1,
      numeroFiscalia: "",
      pageSize: 10,
      provincia: "",
      recaptcha: "verdad"
    }
    
    const responseDemandado = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api.v1+json',
        'Accept': 'application/vnd.api.v1+json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://procesosjudiciales.funcionjudicial.gob.ec',
        'Referer': 'https://procesosjudiciales.funcionjudicial.gob.ec/',
      },
      body: JSON.stringify(payloadDemandado)
    })
    
    if (responseDemandado.ok) {
      const dataDemandado = await responseDemandado.json()
      resultadosDemandado = dataDemandado.map(proceso => ({
        id: proceso.id || "",
        fecha: proceso.fechaIngreso ? new Date(proceso.fechaIngreso).toLocaleDateString('es-ES') : "",
        numeroProceso: proceso.idJuicio || "",
        accionInfraccion: proceso.nombreDelito || ""
      }))
      console.log(`✅ Encontrados ${resultadosDemandado.length} procesos como demandado`)
    } else {
      console.log(`⚠️ Error consultando como demandado: ${responseDemandado.status}`)
    }
    
    return { resultadosActor, resultadosDemandado, metodo: 'API' }
    
  } catch (error) {
    console.error(`❌ Error en API de procesos judiciales:`, error.message)
    throw error
  }
}

export const obtenerProcesosJudiciales = async (cedula) => {
  console.log(`🔍 Iniciando consulta de procesos judiciales para cédula: ${cedula}`)
  
  try {
    // Intentar solo con API
    console.log(`🌐 Intentando método API directo...`)
    const resultadoAPI = await consultarProcesosAPI(cedula)
    let { resultadosActor, resultadosDemandado } = resultadoAPI
    const resultados = [...resultadosActor, ...resultadosDemandado]

    console.log(`✅ Se encontraron ${resultadosActor.length} procesos como actor y ${resultadosDemandado.length} como demandado`)

    // Guardar en base de datos usando el modelo
    if (resultadosActor.length > 0 || resultadosDemandado.length > 0) {
      const datosParaGuardar = {
        cedula,
        procesos: {
          resultadosActor: resultadosActor,
          resultadosDemandado: resultadosDemandado
        },
        totalProcesosActor: resultadosActor.length,
        totalProcesosDemandado: resultadosDemandado.length,
        fechaConsulta: new Date(),
        estado: (resultadosActor.length > 0 || resultadosDemandado.length > 0) ? 'con_procesos' : 'sin_procesos'
      }

      try {
        await DatabaseOperations.upsert(
          Collections.PROCESOS_JUDICIALES,
          { cedula },
          datosParaGuardar
        )
        console.log(`💾 Datos guardados en base de datos`)
      } catch (dbError) {
        console.warn(`⚠️ Error guardando en BD: ${dbError.message}`)
      }
    }

    // Retornar datos para el controller
    return {
      cedula,
      procesos: {
        resultadosActor: resultadosActor,
        resultadosDemandado: resultadosDemandado
      },
      totalProcesosActor: resultadosActor.length,
      totalProcesosDemandado: resultadosDemandado.length,
      fechaConsulta: new Date(),
      estado: (resultadosActor.length > 0 || resultadosDemandado.length > 0) ? 'exitoso' : 'sin_datos'
    }

  } catch (error) {
    console.error("\n❌ Error en obtenerProcesos:", error.message)
    
    // Guardar error en base de datos
    try {
      await ErrorLogsModel.saveError(
        'procesos-judiciales',
        cedula,
        'error_general',
        { 
          mensaje: error.message || 'Error al consultar procesos judiciales',
          stack: error.stack,
          tipo: error.name || 'Error'
        }
      )
    } catch (logError) {
      console.warn('⚠️ Error guardando log:', logError.message)
    }
    
    throw new Error(`Error al consultar procesos judiciales: ${error.message}`)
  }
}

async function extraerDatos(page) {
  try {
    //Recorro los elementos que tiene la clase causa-individual y obtengo los datos
    const resultados = await page.$$eval(".causa-individual", (elementos) => {
      return elementos.map((el) => {
        return {
          id: el.querySelector(".id")?.innerText.trim() || "",
          fecha: el.querySelector(".fecha")?.innerText.trim() || "",
          numeroProceso: el.querySelector(".numero-proceso")?.innerText.trim() || "",
          accionInfraccion: el.querySelector(".accion-infraccion")?.innerText.trim() || ""
        }
      })
    })

    console.log(`✅ Se encontraron ${resultados.length} procesos judiciales`)
    return resultados

  } catch (error) {
    console.error("\n❌ Error al extraer datos:", error.message)
    return []
  }
}
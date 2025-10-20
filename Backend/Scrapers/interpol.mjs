import { DatabaseOperations, Collections, ErrorLogsModel } from '../Models/database.js';

// Función para consultar API directa de Interpol
async function consultarInterpolAPI(nombre, apellido) {
  console.log(`🌐 Consultando API de Interpol para: ${nombre} ${apellido}`)
  
  try {
    // Construir URL con parámetros - manejar nombres y apellidos múltiples
    let url = 'https://ws-public.interpol.int/notices/v1/red?'
    const params = new URLSearchParams()
    
    // Manejar apellidos múltiples (separados por espacios)
    if (apellido && apellido.trim()) {
      params.append('name', apellido.trim())
    }
    
    // Manejar nombres múltiples (separados por espacios)
    if (nombre && nombre.trim()) {
      params.append('forename', nombre.trim())
    }
    
    url += params.toString()
    console.log(`📡 URL de consulta: ${url}`)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`)
    }
    
    const data = await response.json()
    console.log(`✅ API respondió correctamente`)
    
    let avisos = []
    
    if (data._embedded && data._embedded.notices && data._embedded.notices.length > 0) {
      console.log(`🎯 Encontrados ${data._embedded.notices.length} avisos rojos`)
      
      avisos = data._embedded.notices.map(aviso => ({
        nombre: `${aviso.forename || ''} ${aviso.name || ''}`.trim(),
        edad: aviso.date_of_birth || null,
        nacionalidad: aviso.nationalities ? aviso.nationalities.join(', ') : null,
        fuente: "interpol",
        entityId: aviso.entity_id || null,
        fechaNacimiento: aviso.date_of_birth || null
      }))
      
      console.log(`📋 Avisos procesados: ${avisos.length}`)
    } else {
      console.log(`ℹ️ No se encontraron avisos rojos`)
    }
    
    return {
      avisos,
      total: data.total || 0,
      metodo: 'API'
    }
    
  } catch (error) {
    console.error(`❌ Error en API de Interpol:`, error.message)
    throw error
  }
}

export const obtenerInterpol = async (nombre, apellido) => {
  console.log(`🔍 Iniciando consulta Interpol para: ${nombre} ${apellido}`)
  
  try {
    // Intentar solo con API
    const resultadoAPI = await consultarInterpolAPI(nombre, apellido)
    let { avisos, total } = resultadoAPI

    // Preparar datos para el retorno
    const claveBusqueda = `${nombre.trim()} ${apellido.trim()}`.trim();
    const cantidadResultados = total;
    const homonimo = avisos.length > 0; // TRUE si encontró avisos, FALSE si no encontró
    const fechaConsulta = new Date();

    console.log(`✅ Se encontraron ${cantidadResultados} avisos de Interpol (API)`)
    console.log(`📊 Homónimo: ${homonimo ? 'SÍ' : 'NO'} - Cantidad: ${cantidadResultados}`)

    // Datos para la base de datos (SIN avisos, solo estadísticas)
    const datosBaseDatos = {
      clave: claveBusqueda,
      cantidadResultados,
      homonimo, // Indica si existe o no en Interpol
      fechaConsulta
    };

    // Guardar en la base de datos (solo estadísticas de búsqueda)
    try {
      await DatabaseOperations.upsert(
        Collections.INTERPOL,
        { clave: claveBusqueda },
        datosBaseDatos
      );
      console.log(`💾 Datos básicos guardados en BD:`);
      console.log(`   - Clave: ${claveBusqueda}`);
      console.log(`   - Homónimo: ${homonimo ? 'SÍ' : 'NO'}`);
      console.log(`   - Cantidad: ${cantidadResultados}`);
    } catch (dbError) {
      console.warn("⚠️ Error guardando en la base de datos:", dbError.message);
    }

    // Retornar los datos COMPLETOS para la interfaz (CON avisos para mostrar)
    return {
      clave: claveBusqueda,
      cantidadResultados,
      homonimo,
      fechaConsulta,
      avisos: avisos, // Enviado a la interfaz para mostrar, NO guardado en BD
      metodoUsado: 'API'
    };

  } catch (error) {
    console.error("❌ Error en obtenerInterpol:", error.message);
    
    // Preparar clave de búsqueda para el log de error
    const claveBusqueda = `${nombre.trim()} ${apellido.trim()}`.trim();
    
    // Guardar error en base de datos
    try {
      await ErrorLogsModel.saveError(
        'interpol',
        claveBusqueda,
        'error_general',
        { 
          mensaje: error.message || 'Error en el scraping Interpol',
          stack: error.stack,
          tipo: error.name || 'Error',
          nombre: nombre,
          apellido: apellido
        }
      )
    } catch (logError) {
      console.warn('⚠️ Error guardando log:', logError.message)
    }
    
    throw new Error(`Error al consultar Interpol: ${error.message}`)
  }
};
import { datosIESS } from '../Scrapers/afiliacionIESS.mjs'
import { DatosIESSModel, ErrorLogsModel } from '../Models/database.js'

export const consultarDatosIESS = async (req, res) => {
  try {
    const { cedula } = req.body
    
    console.log(`🔍 Iniciando consulta datos IESS para cédula: ${cedula}`)
    
    // Obtener datos existentes de la BD para comparar después
    const datosExistentes = await DatosIESSModel.findByCedula(cedula)
    
    // SIEMPRE ejecutar el scraper para obtener datos actualizados
    console.log(`🌐 Realizando consulta para obtener datos actualizados...`)
    const resultado = await datosIESS(cedula)
      
      // Manejar caso específico de cédula no registrada
      if (resultado && (resultado.error === 'cedula_no_registrada' || 
          (resultado.detalle && resultado.detalle.includes('Cédula No se Encuentra Registrada en el IESS')))) {
        console.log(`⚠️ Cédula no registrada en IESS: ${cedula}`)
        
        // Guardar el error en el log separado, NO en la colección principal
        await ErrorLogsModel.saveError(
          'datos-iess',
          cedula,
          'cedula_no_registrada',
          {
            mensaje: 'Cédula No se Encuentra Registrada en el IESS.',
            detalle: resultado.detalle || 'Cédula no encontrada en sistema IESS'
          }
        )
        
        return res.json({
          success: true,
          data: {
            error: 'cedula_no_registrada',
            mensaje: 'Cédula No se Encuentra Registrada en el IESS.',
            cedula,
            fechaConsulta: new Date()
          },
          message: 'Cédula No se Encuentra Registrada en el IESS.'
        })
      }
      
      // Guardar resultado en base de datos SOLO si la consulta fue exitosa
      if (resultado && !resultado.error && 
          !(resultado.detalle && resultado.detalle.includes('Cédula No se Encuentra Registrada en el IESS'))) {
        const datosParaGuardar = {
          cedula,
          cobertura: resultado.cobertura,
          tipoAfiliacion: resultado.tipoAfiliacion,
          detalle: resultado.detalle,
          fechaConsulta: new Date(),
          estado: 'exitoso'
        }
        
        // Comparar con datos existentes para ver si hay cambios
        let hayActualizacion = false
        if (datosExistentes) {
          hayActualizacion = (
            datosExistentes.cobertura !== resultado.cobertura ||
            datosExistentes.tipoAfiliacion !== resultado.tipoAfiliacion ||
            datosExistentes.detalle !== resultado.detalle
          )
          
          if (hayActualizacion) {
            console.log(`🔄 Datos actualizados detectados para cédula: ${cedula}`)
          } else {
            console.log(`✅ No hay cambios en los datos para cédula: ${cedula}`)
          }
        } else {
          hayActualizacion = true
          console.log(`💾 Guardando nuevos datos para cédula: ${cedula}`)
        }
        
        await DatosIESSModel.save(cedula, datosParaGuardar)
        console.log(`💾 Datos guardados/actualizados en base de datos`)
        
        // Agregar información sobre si hubo actualización a la respuesta
        resultado.hayActualizacion = hayActualizacion
      } else if (resultado && resultado.error && resultado.error !== 'cedula_no_registrada') {
        // Guardar SOLO el error en el log, NO en la colección principal
        await ErrorLogsModel.saveError(
          'datos-iess',
          cedula,
          resultado.error,
          {
            mensaje: resultado.mensaje || 'Error en consulta IESS',
            detalleCompleto: resultado
          }
        )
        console.log(`📝 Error registrado en logs: ${resultado.error}`)
      }
    
    // Validar resultado
    if (!resultado) {
      throw new Error('No se pudo obtener información de datos IESS')
    }

    res.json({
      success: true,
      data: resultado,
      message: resultado.error 
        ? `Error: ${resultado.error}` 
        : 'Consulta completada exitosamente',
      esConsultaReciente: false // Siempre es una consulta nueva
    })
    
  } catch (error) {
    console.error('❌ Error en consultarDatosIESS:', error)
    
    // Registrar el error en el log
    try {
      await ErrorLogsModel.saveError(
        'datos-iess',
        req.body.cedula,
        'error_servidor',
        {
          mensaje: error.message,
          stack: error.stack,
          timestamp: new Date()
        }
      )
    } catch (logError) {
      console.error('❌ Error guardando log de error:', logError)
    }
    
    // Intentar devolver datos de respaldo
    try {
      const datosRespaldo = await DatosIESSModel.findByCedula(req.body.cedula)
      if (datosRespaldo) {
        return res.json({
          success: true,
          data: datosRespaldo,
          message: 'Datos obtenidos de base de datos (consulta web falló)',
          warning: 'Los datos pueden no estar actualizados'
        })
      }
    } catch (dbError) {
      console.error('❌ Error obteniendo datos de respaldo:', dbError)
    }
    
    res.status(500).json({
      success: false,
      error: 'Ocurrió un error al hacer scraping'
    })
  }
}

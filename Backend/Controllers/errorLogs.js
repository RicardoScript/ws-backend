import { ErrorLogsModel } from '../Models/database.js'

// Obtener todos los errores (con paginación)
export const obtenerTodosLosErrores = async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query
    const limitNum = parseInt(limit)
    const skip = (parseInt(page) - 1) * limitNum

    const errores = await ErrorLogsModel.getAllErrors(limitNum)
    const stats = await ErrorLogsModel.getErrorStats()

    res.json({
      success: true,
      data: {
        errores,
        estadisticas: stats,
        paginacion: {
          page: parseInt(page),
          limit: limitNum
        }
      },
      message: 'Logs de errores obtenidos exitosamente'
    })
  } catch (error) {
    console.error('❌ Error obteniendo logs de errores:', error)
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    })
  }
}

// Obtener errores por cédula
export const obtenerErroresPorCedula = async (req, res) => {
  try {
    const { cedula } = req.params
    
    if (!cedula) {
      return res.status(400).json({
        success: false,
        error: 'Cédula es requerida'
      })
    }

    const errores = await ErrorLogsModel.getErrorsByCedula(cedula)

    res.json({
      success: true,
      data: {
        cedula,
        errores,
        totalErrores: errores.length
      },
      message: `Errores para cédula ${cedula} obtenidos exitosamente`
    })
  } catch (error) {
    console.error('❌ Error obteniendo errores por cédula:', error)
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    })
  }
}

// Obtener errores por servicio
export const obtenerErroresPorServicio = async (req, res) => {
  try {
    const { servicio } = req.params
    
    if (!servicio) {
      return res.status(400).json({
        success: false,
        error: 'Servicio es requerido'
      })
    }

    const errores = await ErrorLogsModel.getErrorsByServicio(servicio)

    res.json({
      success: true,
      data: {
        servicio,
        errores,
        totalErrores: errores.length
      },
      message: `Errores para servicio ${servicio} obtenidos exitosamente`
    })
  } catch (error) {
    console.error('❌ Error obteniendo errores por servicio:', error)
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    })
  }
}

// Obtener errores por tipo
export const obtenerErroresPorTipo = async (req, res) => {
  try {
    const { tipo } = req.params
    
    if (!tipo) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de error es requerido'
      })
    }

    const errores = await ErrorLogsModel.getErrorsByTipo(tipo)

    res.json({
      success: true,
      data: {
        tipoError: tipo,
        errores,
        totalErrores: errores.length
      },
      message: `Errores de tipo ${tipo} obtenidos exitosamente`
    })
  } catch (error) {
    console.error('❌ Error obteniendo errores por tipo:', error)
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    })
  }
}

// Obtener estadísticas de errores
export const obtenerEstadisticasErrores = async (req, res) => {
  try {
    const stats = await ErrorLogsModel.getErrorStats()

    res.json({
      success: true,
      data: stats,
      message: 'Estadísticas de errores obtenidas exitosamente'
    })
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas de errores:', error)
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    })
  }
}

// Limpiar errores antiguos
export const limpiarErroresAntiguos = async (req, res) => {
  try {
    const { dias = 90 } = req.query
    const diasNum = parseInt(dias)

    const resultado = await ErrorLogsModel.cleanOldErrors(diasNum)

    res.json({
      success: true,
      data: {
        erroresEliminados: resultado.deletedCount,
        diasAntiguedad: diasNum
      },
      message: `Se eliminaron ${resultado.deletedCount} errores antiguos`
    })
  } catch (error) {
    console.error('❌ Error limpiando errores antiguos:', error)
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    })
  }
}

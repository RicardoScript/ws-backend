import { obtenerAntecedentesPenales } from '../Scrapers/antecedentesPenales.mjs'

export const consultarAntecedentesPenales = async (req, res) => {
  try {
    const { cedula } = req.body
    
    console.log(`🔍 Iniciando consulta de antecedentes penales para cédula: ${cedula}`)
    
    const resultado = await obtenerAntecedentesPenales(cedula)
    
    // Si hay error en el scraping
    if (resultado.success === false) {
      return res.status(500).json({
        success: false,
        error: resultado.error,
        message: resultado.message,
        cedula: cedula
      })
    }
    
    // Estructurar la respuesta como espera el frontend
    const responseData = {
      success: true,
      cedula: resultado.cedula,
      nombre: resultado.nombre,
      resultado: resultado.resultado,
      resultadoFormateado: resultado.resultado, // Mismo que resultado
      tieneAntecedentes: resultado.tieneAntecedentes,
      fechaConsulta: resultado.fechaConsulta,
      estado: resultado.estado,
      certificadoPdf: resultado.certificadoPdf,
      tieneCertificado: resultado.tieneCertificado,
      informacionPersonal: {
        nombre: resultado.nombre,
        cedula: resultado.cedula,
        antecedentes: resultado.resultado
      },
      detallesConsulta: {
        fecha: new Date().toISOString().split('T')[0],
        hora: new Date().toLocaleTimeString('es-EC'),
        sistema: 'Ministerio del Interior del Ecuador'
      },
      message: 'Consulta de antecedentes penales completada'
    }
    
    console.log('📨 Enviando respuesta al frontend. Tiene certificado PDF:', !!resultado.certificadoPdf)
    
    res.json(responseData)
    
  } catch (error) {
    console.error('Error en consultarAntecedentesPenales:', error)
    res.status(500).json({
      success: false,
      message: 'Ocurrió un error al hacer scraping'
    })
  }
}
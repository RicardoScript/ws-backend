import { obtenerCitacionesJudiciales } from '../Scrapers/citacionJudicial.mjs'

export const consultarCitacionesJudiciales = async (req, res) => {
  try {
    const { cedula } = req.body
    
    console.log(`🔍 Iniciando consulta de citaciones judiciales para cédula: ${cedula}`)
    
    const resultado = await obtenerCitacionesJudiciales(cedula)
    
    res.json({
      success: true,
      data: resultado,
      message: 'Consulta de citaciones judiciales completada'
    })
    
  } catch (error) {
    console.error('❌ Error en consultarCitacionesJudiciales:', error)
    res.status(500).json({
      success: false,
      error: 'Ocurrió un error al hacer scraping'
    })
  }
}
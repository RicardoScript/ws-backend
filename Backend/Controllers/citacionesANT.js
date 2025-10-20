import { obtenerCitaciones } from '../Scrapers/citacionesANT.mjs'

export const consultarCitacionesANT = async (req, res) => {
  try {
    const { cedula } = req.body
    
    console.log(`🔍 Iniciando consulta de citaciones ANT para cédula: ${cedula}`)
    
    const resultado = await obtenerCitaciones(cedula)
    
    res.json({
      success: true,
      data: resultado,
      message: 'Consulta de citaciones ANT completada'
    })
    
  } catch (error) {
    console.error('❌ Error en consultarCitacionesANT:', error)
    res.status(500).json({
      success: false,
      error: 'Ocurrió un error al hacer scraping'
    })
  }
}
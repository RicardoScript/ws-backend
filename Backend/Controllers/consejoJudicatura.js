import { obtenerConsejoJudicatura } from '../Scrapers/consejoJudicatura.mjs'

export const consultarConsejoJudicatura = async (req, res) => {
  try {
    const { nombre, tipoBusqueda, provinciaInstitucion, canton } = req.body
    
    console.log(`🔍 Iniciando consulta en Consejo de la Judicatura para: ${nombre}`)
    
    const resultado = await obtenerConsejoJudicatura(
      nombre, 
      tipoBusqueda, 
      provinciaInstitucion || null, 
      canton || null
    )
    
    res.json({
      success: true,
      data: resultado,
      message: 'Consulta en Consejo de la Judicatura completada'
    })
    
  } catch (error) {
    console.error('❌ Error en consultarConsejoJudicatura:', error)
    res.status(500).json({
      success: false,
      error: 'Ocurrió un error al hacer scraping'
    })
  }
}
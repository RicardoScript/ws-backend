import { obtenerDatosRuc } from '../Scrapers/consultaSRI.mjs'

export const consultarSRI = async (req, res) => {
  try {
    const { ruc } = req.body
    
    console.log(`🔍 Iniciando consulta SRI para RUC: ${ruc}`)
    
    const resultado = await obtenerDatosRuc(ruc)
    
    res.json({
      success: true,
      data: resultado,
      message: 'Consulta SRI completada'
    })
    
  } catch (error) {
    console.error('❌ Error en consultarSRI:', error)
    res.status(500).json({
      success: false,
      error: 'Ocurrió un error al hacer scraping'
    })
  }
}
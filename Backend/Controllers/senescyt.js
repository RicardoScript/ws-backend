import { obtenerDatosSenescyt } from '../Scrapers/senescyt.mjs'

export const consultarSenescyt = async (req, res) => {
  try {
    const { cedula } = req.body
    
    console.log(`🔍 Iniciando consulta de títulos SENESCYT para cédula: ${cedula}`)
    
    const resultado = await obtenerDatosSenescyt(cedula)
    
    res.json({
      success: true,
      data: resultado,
      message: 'Consulta de títulos SENESCYT completada'
    })
    
  } catch (error) {
      console.error('❌ Error en consultarSenescyt:', error)
      res.status(500).json({
        success: false,
        message: 'Ocurrió un error, por favor intenta más tarde.'
      })
  }
}
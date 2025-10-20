import { obtenerSuperciasEmpresas } from '../Scrapers/superCias.mjs'

export const consultarSuperciasEmpresas = async (req, res) => {
  try {
    const { ruc } = req.body
    
    console.log(`🔍 Iniciando consulta de Superintendencia de Compañías para: ${ruc}`)
    
    const resultado = await obtenerSuperciasEmpresas(ruc)
    
    // ✅ Siempre devolver success: true, pero verificar el estado
    res.json({
      success: true,
      data: resultado,
      message: resultado.estado === 'no_registrado' 
        ? 'Consulta completada - No registrado' 
        : 'Consulta de Superintendencia de Compañías completada'
    })
    
  } catch (error) {
    console.error('❌ Error en consultarSuperciasEmpresas:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Error interno del servidor'
    })
  }
}
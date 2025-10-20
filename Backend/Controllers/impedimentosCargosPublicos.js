import { obtenerImpedimentos } from '../Scrapers/impedimentosCargosPublicos.mjs'

export const consultarImpedimentos = async (req, res) => {
  try {
    console.log(`🔍 Iniciando consulta de impedimentos para cargos públicos`)
    
    const resultado = await obtenerImpedimentos()
    
    res.json({
      success: true,
      data: resultado,
      message: 'Consulta de impedimentos completada'
    })
    
  } catch (error) {
    console.error('❌ Error en consultarImpedimentos:', error)
    res.status(500).json({
      success: false,
      message: 'Ocurrió un error al hacer scraping'
    })
  }
}
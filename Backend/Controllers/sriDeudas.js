import { obtenerSRIdeudas } from '../Scrapers/sriDeudas.mjs'

export const consultarSRIDeudas = async (req, res) => {
  try {
    const { ruc } = req.body
    console.log(`🔍 Iniciando consulta SRI deudas para RUC: ${ruc}`)

    const resultado = await obtenerSRIdeudas(ruc)

    return res.json({
      success: true,
      data: resultado.data,
      message: 'Consulta SRI deudas completada'
    })
  } catch (error) {
    console.error('Error en consultarSRIDeudas:', error)
    return res.status(500).json({
      success: false,
      message: 'Ocurrió un error al hacer scraping'
    })
  }
}

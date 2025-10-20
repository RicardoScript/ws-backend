import { chromium } from "playwright"
import { DatabaseOperations, Collections, ErrorLogsModel } from '../Models/database.js'

export const obtenerImpedimentos = async () => { 
  console.log(`🔍 Iniciando consulta de impedimentos para cargos públicos`)
  
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  })
  const page = await browser.newPage()

  try {
    console.log(`🌐 Navegando a página de impedimentos...`)
    await page.goto("https://www.gob.ec/mt/tramites/registro-impedimentos-laborar-sector-publico", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    })
    
    console.log(`📄 Página cargada. Título: ${await page.title()}`)

    console.log(`📊 Extrayendo datos de impedimentos...`)
    //obtengo los datos de la tabla saltandome el primer tr ya que ese es del titulo de la tabla
    const resultados = await page.$$eval("tbody", (tbodies) => {
      const tbody = tbodies[0] // primer tbody sin clase ni id
      const filas = Array.from(tbody.querySelectorAll("tr")).slice(1)
      return filas.map(fila => {
        const tds = fila.querySelectorAll("td")
        return {
          causalImpedimiento: tds[0]?.innerText.trim() || "",
          respaldos: tds[1]?.innerText.trim() || "",
        }
      })
    })

    console.log(`✅ Se encontraron ${resultados.length} impedimentos para cargos públicos`)

    if (resultados.length === 0) {
      console.log("ℹ️ No se encontraron impedimentos para cargos públicos.")
      return {
        impedimentos: [],
        totalImpedimentos: 0,
        fechaConsulta: new Date(),
        estado: 'sin_datos'
      }
    }

    // Guardar en base de datos usando el modelo
    await DatabaseOperations.addToArrayNoDuplicates(
      Collections.IMPEDIMENTOS_CARGOS_PUBLICOS,
      { tipo: "impedimentos_cargos_publicos" },
      'impedimentos',
      resultados,
      ['causalImpedimiento', 'respaldos']
    )

    console.log(`💾 Datos guardados en base de datos`)

    // Retornar datos para el controller
    return {
      impedimentos: resultados,
      totalImpedimentos: resultados.length,
      fechaConsulta: new Date(),
      estado: 'exitoso'
    }

  } catch (error) {
    console.error("\n❌ Error en obtenerImpedimentos:", error.message)
    
    // Guardar error en base de datos
    await ErrorLogsModel.saveError(
      'impedimentos-cargos-publicos',
      'general', // No hay cédula específica en este caso
      'error_general',
      { 
        mensaje: error.message || 'Error al consultar impedimentos',
        stack: error.stack,
        tipo: error.name || 'Error'
      }
    ).catch(err => console.warn('⚠️ Error guardando log:', err.message));
    
    throw new Error(`Error al consultar impedimentos: ${error.message}`)
  } finally {
    await browser.close()
  }
}
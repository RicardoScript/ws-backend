import { DatabaseOperations, Collections, ErrorLogsModel } from '../Models/database.js'

export const obtenerConsejoJudicatura = async (nombre, tipoBusqueda, provinciaInstitucion = null, canton = null) => {
  console.log(`🔍 Iniciando consulta Consejo Judicatura para: ${nombre}`)
  console.log(`🔍 Tipo búsqueda: ${tipoBusqueda}, Provincia/Institución: ${provinciaInstitucion}, Cantón: ${canton}`)
  
  const { chromium } = await import('playwright')
  
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
    console.log(`🌐 Navegando a página del Consejo de la Judicatura...`)
    await page.goto("https://appsj.funcionjudicial.gob.ec/informativo/pages/directorio.jsf", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    })
    
    console.log(`📝 Ingresando datos del formulario...`)
    // Rellenamos el campo de nombre del funcionario
    await page.fill("#nameOfficial", nombre || '')
    
    console.log(`📋 Seleccionando tipo de búsqueda: ${tipoBusqueda}`)
    // Seleccionamos el campo de tipo de busqueda
    await page.selectOption('select#j_idt32', tipoBusqueda.toUpperCase())
    
    // Esperar que se llene el select dependiente
    await page.waitForTimeout(3000)
    
    if (provinciaInstitucion !== null) {
      console.log(`🏛️ Seleccionando provincia/institución: ${provinciaInstitucion}`)
      // Seleccionamos el campo de provincia o institucion
      await page.selectOption('select#j_idt37', provinciaInstitucion.toUpperCase())
    }
    
    if (tipoBusqueda.toLowerCase() === "provincias" && canton !== null) {
      console.log(`�️ Seleccionando cantón: ${canton}`)
      // Esperar que se llene el select de cantones
      await page.waitForTimeout(3000)
      // Seleccionamos el campo de canton
      await page.selectOption('select#selectProvincia', canton.toUpperCase())
    }
    
    console.log(`🔍 Ejecutando búsqueda...`)
    // Se le da click al botón de buscar
    await page.click("#j_idt47")

    // Espera hasta que aparezca la primera etiqueta que tiene la clase cuerpo o la que tiene la clase mat-mdc-simple-snack-bar
    const estado = await Promise.race([
      page.waitForSelector('.rf-ntf-sum', { timeout: 60000 }).then(() => 'no_resultados'),
      page.waitForSelector('#table\\:tb tr', { timeout: 60000 }).then(() => 'ok'),
    ])

    //Si se encontró la etiqueta que tiene la clase mat-mdc-simple-snack-bar PRIMERO (No se encontraron resultados)
    if (estado === 'no_resultados') {
      console.log(`ℹ️ No se encontraron resultados para ${nombre} en ${tipoBusqueda}`)
      return {
        nombre,
        tipoBusqueda,
        funcionarios: [],
        totalFuncionarios: 0,
        fechaConsulta: new Date(),
        estado: 'sin_datos'
      }
    }

    const resultadosTotales = []
    let paginaActual = 1
    
    while (true) {
      console.log(`📄 Procesando página ${paginaActual}...`)
      // Esperar a que se cargue la tabla
      await page.waitForSelector('#table\\:tb tr', { timeout: 60000 })

      //Recorro las filas de la tabla y obtengo los datos
      const resultados = await page.$$eval("#table\\:tb tr", (filas) => {
        return filas.map((fila) => {
          const columnas = fila.querySelectorAll("td")
          return {
            funcionario: columnas[0]?.innerText.trim() || "",
            cargo: columnas[1]?.innerText.trim() || "",
            departamento: columnas[2]?.innerText.trim() || "",
            edificio: columnas[3]?.innerText.trim() || "",
            direccion: columnas[4]?.innerText.trim() || "",
            ciudad: columnas[5]?.innerText.trim() || "",
            telefono: columnas[6]?.innerText.trim() || "",
            email: columnas[7]?.innerText.trim() || "",
          }
        })
      })    
      resultadosTotales.push(...resultados)

      // Buscar si existe el botón para siguiente pestaña
      const siguiente = await page.$('a#j_idt97_ds_next')

      if (siguiente) {
        console.log(`➡️ Navegando a página ${paginaActual + 1}...`)
        await siguiente.click()
        await page.waitForTimeout(2000) // espera para que cargue la nueva página
        paginaActual++
      } else {
        break  // no hay más páginas
      }
    }

    console.log(`✅ Se encontraron ${resultadosTotales.length} funcionarios del Consejo de la Judicatura`)

    // Guardar en MongoDB solo si hay resultados
    if (resultadosTotales.length > 0) {
      try {
        await DatabaseOperations.addToArrayNoDuplicates(
          Collections.CONSEJO_JUDICATURA,
          { tipo: "funcionarios_judicatura" },
          'funcionarios',
          resultadosTotales,
          ['funcionario', 'cargo', 'departamento']
        )
        console.log(`💾 Datos guardados en base de datos`)
      } catch (dbError) {
        console.warn('⚠️ Error guardando en BD:', dbError.message)
        // No lanzar error, permitir que la consulta continue
      }
    }

    // Retornar datos para el controller
    return {
      nombre,
      tipoBusqueda,
      funcionarios: resultadosTotales,
      totalFuncionarios: resultadosTotales.length,
      fechaConsulta: new Date(),
      estado: resultadosTotales.length > 0 ? 'exitoso' : 'sin_datos'
    }

  } catch (error) {
    console.error("\n❌ Error en obtenerConsejoJudicatura:", error.message)
    
    // Guardar error en base de datos
    try {
      await ErrorLogsModel.saveError(
        'consejo-judicatura',
        nombre,
        'error_general',
        { 
          mensaje: error.message || 'Error al consultar Consejo de la Judicatura',
          stack: error.stack,
          tipo: error.name || 'Error',
          tipoBusqueda: tipoBusqueda,
          provinciaInstitucion: provinciaInstitucion,
          canton: canton
        }
      )
    } catch (logError) {
      console.warn('⚠️ Error guardando log:', logError.message)
    }
    
    throw new Error(`Error al consultar Consejo de la Judicatura: ${error.message}`)
  } finally {
    await browser.close()
  }
}
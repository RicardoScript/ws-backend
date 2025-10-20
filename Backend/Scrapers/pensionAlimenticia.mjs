import { DatabaseOperations, Collections, ErrorLogsModel, initializeDatabase } from '../Models/database.js'

// Inicializar base de datos si no está conectada
let dbInitialized = false;
async function ensureDBConnection() {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      dbInitialized = true;
    } catch (error) {
      console.warn('⚠️ No se pudo conectar a la base de datos:', error.message);
    }
  }
}

// Función para obtener ViewState inicial
async function obtenerViewState() {
  try {
    const response = await fetch('https://supa.funcionjudicial.gob.ec/pensiones/publico/consulta.jsf', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.5',
        'Connection': 'keep-alive'
      }
    })

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`)
    }

    const html = await response.text()
    
    // Extraer ViewState
    const viewStateMatch = html.match(/name="javax\.faces\.ViewState".*?value="([^"]+)"/s)
    const viewState = viewStateMatch ? viewStateMatch[1] : null

    // Extraer cookies de sesión
    const setCookieHeader = response.headers.get('set-cookie')
    const cookies = setCookieHeader || ''
    
    // Extraer JSESSIONID de las cookies
    const jsessionidMatch = setCookieHeader ? setCookieHeader.match(/JSESSIONID=([^;]+)/) : null
    const jsessionid = jsessionidMatch ? jsessionidMatch[1] : null

    if (!viewState) {
      throw new Error('No se pudo extraer ViewState de la página inicial')
    }

    return { viewState, cookies, jsessionid }
  } catch (error) {
    console.error('❌ Error obteniendo ViewState:', error)
    throw error
  }
}

// Función para buscar pensiones alimenticias
async function buscarPensiones(sessionData, cedula) {
  const { viewState, cookies, jsessionid } = sessionData

  // Construir URL con jsessionid si está disponible
  let postUrl = 'https://supa.funcionjudicial.gob.ec/pensiones/publico/consulta.jsf'
  if (jsessionid) {
    postUrl += `;jsessionid=${jsessionid}`
  }

  // Construir el payload según el formato proporcionado
  const formData = new URLSearchParams()
  formData.append('javax.faces.partial.ajax', 'true')
  formData.append('javax.faces.source', 'form:b_buscar_cedula')
  formData.append('javax.faces.partial.execute', '@all')
  formData.append('javax.faces.partial.render', 'form:pResultado panelMensajes form:pFiltro')
  formData.append('form:b_buscar_cedula', 'form:b_buscar_cedula')
  formData.append('form', 'form')
  formData.append('form:t_texto_cedula', cedula)
  formData.append('form:s_criterio_busqueda', 'Seleccione...')
  formData.append('form:t_texto', '')
  formData.append('javax.faces.ViewState', viewState)

  console.log(`🔄 Enviando solicitud AJAX para cédula: ${cedula}`)

  try {
    const response = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Faces-Request': 'partial/ajax',
        'Origin': 'https://supa.funcionjudicial.gob.ec',
        'Referer': 'https://supa.funcionjudicial.gob.ec/pensiones/publico/consulta.jsf',
        'Cookie': cookies.split(',').map(c => c.split(';')[0]).join('; ')
      },
      body: formData.toString()
    })

    if (!response.ok) {
      throw new Error(`Error en la solicitud: ${response.status} ${response.statusText}`)
    }

    return await response.text()
  } catch (error) {
    console.error('❌ Error en solicitud AJAX:', error)
    throw error
  }
}

// Función para extraer datos de la respuesta
function extraerDatos(html) {
  const pensiones = []
  
  try {
    // La respuesta es XML AJAX, buscar el contenido de la tabla dentro de CDATA
    let tableContent = html
    const cdataMatch = html.match(/<update id="form:pResultado"><!\[CDATA\[(.*?)\]\]><\/update>/s)
    if (cdataMatch) {
      tableContent = cdataMatch[1]
    }

    // Buscar si hay mensaje específico de "no resultados" en el contenido de la tabla
    if (tableContent.includes('No se encuentra resultados.') || 
        tableContent.includes('ui-datatable-empty-message')) {
      console.log('ℹ️ No se encontraron resultados')
      return { pensiones: [] }
    }

    // Buscar filas específicas con data-ri (row index) - usar selector más flexible
    const rowPattern = /<tr[^>]*data-ri="\d+"[^>]*class="[^"]*ui-widget-content[^"]*"[^>]*>(.*?)<\/tr>/gs
    const matches = [...tableContent.matchAll(rowPattern)]

    for (const match of matches) {
      const rowHtml = match[1] // Contenido de la fila
      
      // Extraer las celdas básicas (código, proceso, dependencia, tipo)
      const cellPattern = /<td[^>]*role="gridcell"[^>]*>(?:<span[^>]*>([^<]+)<\/span>|([^<]+?))<\/td>/g
      const basicCells = []
      let cellMatch

      while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
        const cellValue = (cellMatch[1] || cellMatch[2] || '').trim()
        if (cellValue && !cellValue.includes('<table')) {  // Evitar la celda con tabla anidada
          basicCells.push(cellValue)
        }
        // Solo tomar las primeras 4 celdas básicas
        if (basicCells.length >= 4) {
          break
        }
      }

      // Extraer intervinientes de la tabla anidada - usar patron más flexible para IDs
      let intervinientes = {}
      const tableMatch = rowHtml.match(/<table[^>]*id="[^"]*j_idt\d+:[^"]*"[^>]*>(.*?)<\/table>/s)
      if (tableMatch) {
        const tableInnerHtml = tableMatch[1]
        
        // Basándome en tu estructura: buscar las filas específicas
        const filasPattern = /<tr[^>]*class="ui-widget-content"[^>]*>(.*?)<\/tr>/gs
        const filasMatches = [...tableInnerHtml.matchAll(filasPattern)]
        
        // Fila 0: Representante Legal
        if (filasMatches[0]) {
          const repPattern = /<td[^>]*class="tabla-columna-datos">([^<]+)<\/td>/
          const repMatch = filasMatches[0][1].match(repPattern)
          if (repMatch) {
            intervinientes.representanteLegal = repMatch[1].trim()
          }
        }
        
        // Fila 3: Obligado principal  
        if (filasMatches[3]) {
          const obligadoPattern = /<td[^>]*class="tabla-columna-datos">([^<]+)<\/td>/
          const obligadoMatch = filasMatches[3][1].match(obligadoPattern)
          if (obligadoMatch) {
            intervinientes.obligadoPrincipal = obligadoMatch[1].trim()
          }
        }
      }

      if (basicCells.length >= 4) {
        pensiones.push({
          codigo: basicCells[0] || '',
          numProcesoJudicial: basicCells[1] || '',
          dependenciaJurisdiccional: basicCells[2] || '',
          tipoPension: basicCells[3] || '',
          intervinientes: intervinientes
        })
      }
    }

    console.log(`✅ API extrajo ${pensiones.length} pensiones`)
    return { pensiones }
  } catch (error) {
    console.error('❌ Error extrayendo datos:', error)
    return { pensiones: [] }
  }
}

// Función fallback usando Playwright
async function buscarPensionesPlaywright(cedula) {
  const { chromium } = await import('playwright')
  
  console.log(`🎭 Usando Playwright como fallback...`)
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
    await page.goto("https://supa.funcionjudicial.gob.ec/pensiones/publico/consulta.jsf", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    })
    
    await page.fill("#form\\:t_texto_cedula", cedula) 
    await page.click("#form\\:b_buscar_cedula")
    await page.waitForTimeout(3000)

    // Buscar en la tabla correcta (puede ser j_idt57 o j_idt59)
    const resultados = await page.$$eval("tbody[id*='_data'] > tr", (filas) => {
      return filas.map((fila) => {
        const todasColumnas = Array.from(fila.querySelectorAll("td"))
        
        if (todasColumnas[0]?.innerText.trim() === "No se encuentra resultados.") {
          return null
        }

        // Extraer datos básicos de las primeras 4 columnas
        const codigo = todasColumnas[0]?.innerText.trim() || ''
        const numProceso = todasColumnas[1]?.innerText.trim() || ''
        const dependencia = todasColumnas[2]?.innerText.trim() || ''
        const tipoPension = todasColumnas[3]?.innerText.trim() || ''

        // Extraer intervinientes de la tabla anidada (columna 4)
        const tablaAnidada = todasColumnas[4]?.querySelector("table");
        let intervinientes = {};

        if (tablaAnidada) {
          const filasAnidadas = tablaAnidada.querySelectorAll("tr");
          // Según tu estructura:
          // Fila 0: Representante Legal
          // Fila 3: Obligado principal
          const filaRepresentante = filasAnidadas[0]?.querySelectorAll("td");
          const filaObligado = filasAnidadas[3]?.querySelectorAll("td");
          
          intervinientes = {
            representanteLegal: filaRepresentante?.[1]?.innerText.trim() || "",
            obligadoPrincipal: filaObligado?.[1]?.innerText.trim() || ""
          };
        }

        return {
          codigo: codigo,
          numProcesoJudicial: numProceso,
          dependenciaJurisdiccional: dependencia,
          tipoPension: tipoPension,
          intervinientes: intervinientes,
        }
      }).filter(item => item !== null)
    })

    console.log(`✅ Playwright encontró ${resultados.length} pensiones`)
    return { pensiones: resultados }

  } finally {
    await browser.close()
  }
}

export const obtenerPensionAlimenticia = async (cedula) => {
  console.log(`🔍 Iniciando consulta de pensión alimenticia para cédula: ${cedula}`)
  
  // Asegurar conexión a BD
  await ensureDBConnection();
  
  try {
    // Intentar primero con método API
    console.log(`🌐 Intentando método API directo...`)
    const sessionData = await obtenerViewState()
    const responseHtml = await buscarPensiones(sessionData, cedula)

    // Verificar si hay redirección por sesión expirada
    if (responseHtml.includes('viewExpired.jsf') || responseHtml.includes('redirect')) {
      throw new Error('Sesión expirada, usando fallback')
    }

    // Extraer datos de la respuesta
    let { pensiones } = extraerDatos(responseHtml)
    let metodoUsado = 'API'

    // Si API no funciona o no encuentra datos, usar Playwright como fallback
    if (pensiones.length === 0) {
      console.log(`🔄 API no retornó datos, intentando con Playwright...`)
      const playwrightResult = await buscarPensionesPlaywright(cedula)
      pensiones = playwrightResult.pensiones
      metodoUsado = 'Playwright'
    }

    console.log(`✅ Se encontraron ${pensiones.length} pensiones alimenticias para la cédula ${cedula} (${metodoUsado})`)

    if (pensiones.length === 0) {
      console.log(`ℹ️ No se encontraron pensiones alimenticias para la cédula ${cedula}.`)
      return {
        cedula,
        pensiones: [],
        totalPensiones: 0,
        fechaConsulta: new Date(),
        estado: 'sin_datos'
      }
    }

    // Guardar en base de datos usando el modelo
    try {
      await DatabaseOperations.addToArrayNoDuplicates(
        Collections.PENSION_ALIMENTICIA,
        { cedula },
        'pensiones',
        pensiones,
        ['codigo', 'numProcesoJudicial']
      )
      console.log(`💾 Datos guardados en base de datos para la cédula ${cedula}`)
    } catch (dbError) {
      console.warn('⚠️ Error guardando en BD:', dbError.message)
    }

    // Retornar datos para el controller
    return {
      cedula,
      pensiones,
      totalPensiones: pensiones.length,
      fechaConsulta: new Date(),
      estado: 'exitoso'
    }

  } catch (error) {
    console.error("\n❌ Error en obtenerPensiones:", error.message)
    
    // Guardar error en base de datos
    try {
      await ErrorLogsModel.saveError(
        'pension-alimenticia',
        cedula,
        'error_general',
        { 
          mensaje: error.message || 'Error al consultar pensiones alimenticias',
          stack: error.stack,
          tipo: error.name || 'Error'
        }
      )
    } catch (logError) {
      console.warn('⚠️ Error guardando log:', logError.message)
    }
    
    throw new Error(`Error al consultar pensiones alimenticias: ${error.message}`)
  }
}
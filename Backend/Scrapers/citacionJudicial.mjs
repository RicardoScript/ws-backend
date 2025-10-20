import { DatabaseOperations, Collections, ErrorLogsModel } from '../Models/database.js'
import fs from 'fs'

export const obtenerCitacionesJudiciales = async (cedula) => {
  console.log(`\n🔍 Iniciando consulta de citaciones judiciales para cédula: ${cedula}`)
  
  let browser = null
  
  try {
    console.log(`🌐 Consultando sistema judicial...`)
    
    // Crear un contenedor de cookies para mantener la sesión
    let cookies = ''
    
    // Headers para simular navegador real
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none'
    }

    // Paso 1: Obtener la página inicial para extraer ViewState y establecer sesión
    console.log(`📄 Obteniendo página inicial para ViewState...`)
    const inicialUrl = 'https://consultas.funcionjudicial.gob.ec/informacionjudicial/public/informacionCitaciones.jsf'
    
    const inicialResponse = await fetch(inicialUrl, {
      method: 'GET',
      headers
    })

    if (!inicialResponse.ok) {
      throw new Error(`Error HTTP al obtener página inicial: ${inicialResponse.status}`)
    }

    // Extraer cookies de la respuesta inicial
    const setCookieHeaders = inicialResponse.headers.get('set-cookie')
    if (setCookieHeaders) {
      // Extraer solo el valor de la cookie, no los atributos
      const cookieMatches = setCookieHeaders.match(/([^;]+)/g)
      if (cookieMatches) {
        cookies = cookieMatches.map(cookie => cookie.trim()).join('; ')
        console.log(`🍪 Cookies extraídas: ${cookies.substring(0, 100)}...`)
      }
    }

    const inicialHtml = await inicialResponse.text()
    
    // Extraer ViewState usando regex
    const viewStateMatch = inicialHtml.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/i)
    if (!viewStateMatch) {
      throw new Error('No se pudo extraer ViewState de la página inicial')
    }
    
    const viewState = viewStateMatch[1]
    console.log(`🔐 ViewState extraído: ${viewState.substring(0, 50)}...`)

    // Paso 2: Realizar la petición AJAX con el ViewState y cookies
    console.log(`🔍 Realizando búsqueda AJAX para cédula: ${cedula}`)
    
    const formData = new URLSearchParams({
      'form1': 'form1',
      'form1:txtDemandadoCedula': cedula,
      'form1:butBuscarJuicios': 'form1:butBuscarJuicios',
      'javax.faces.ViewState': viewState
    })

    // Headers para la petición AJAX
    const ajaxHeaders = {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Referer': inicialUrl,
      'Cookie': cookies
    }

    const ajaxResponse = await fetch(inicialUrl, {
      method: 'POST',
      headers: ajaxHeaders,
      body: formData.toString()
    })

    if (!ajaxResponse.ok) {
      throw new Error(`Error HTTP en petición AJAX: ${ajaxResponse.status}`)
    }

    // Obtener cookies actualizadas si las hay
    const newCookies = ajaxResponse.headers.get('set-cookie')
    if (newCookies) {
      const newCookieMatches = newCookies.match(/([^;]+)/g)
      if (newCookieMatches) {
        const additionalCookies = newCookieMatches.map(cookie => cookie.trim()).join('; ')
        cookies = cookies ? `${cookies}; ${additionalCookies}` : additionalCookies
        console.log(`🍪 Cookies actualizadas: ${cookies.substring(0, 100)}...`)
      }
    }

    const responseText = await ajaxResponse.text()
    console.log(`📄 Respuesta AJAX recibida (${responseText.length} caracteres)`)
    
    // Debug: Guardar respuesta para análisis
    const debugFile = `/tmp/citacion_judicial_response_${cedula}_${Date.now()}.xml`
    fs.writeFileSync(debugFile, responseText)
    console.log(`🐛 DEBUG - Respuesta guardada en: ${debugFile}`)

    // Extraer contenido HTML de la respuesta XML/AJAX
    let htmlContent = responseText
    
    // Si es una respuesta JSF XML, extraer el contenido HTML de la tabla
    if (responseText.includes('<partial-response') || responseText.includes('javax.faces')) {
      // Buscar específicamente la actualización de la tabla de datos
      const tableUpdateMatch = responseText.match(/<update[^>]*id="form1:dataTableJuicios2"[^>]*><!\[CDATA\[(.*?)\]\]><\/update>/s)
      if (tableUpdateMatch) {
        htmlContent = tableUpdateMatch[1]
        console.log(`📊 Contenido de tabla extraído de JSF (${htmlContent.length} caracteres)`)
      } else {
        // Fallback: buscar cualquier update con CDATA
        const updateMatch = responseText.match(/<update[^>]*><!\[CDATA\[(.*?)\]\]><\/update>/s)
        if (updateMatch) {
          htmlContent = updateMatch[1]
          console.log(`📋 Contenido HTML extraído de CDATA (${htmlContent.length} caracteres)`)
        }
      }
    } else if (responseText.includes('<!DOCTYPE HTML') || responseText.includes('<html')) {
      // Es una página HTML completa - buscar la tabla directamente
      console.log(`🌐 Página HTML completa recibida (${responseText.length} caracteres)`)
      htmlContent = responseText
    }

    console.log(`🔍 Analizando contenido de la tabla...`)
    
    // Buscar el contador de registros encontrados
    const contadorMatch = htmlContent.match(/Registros encontrados:\s*(\d+)/i)
    if (contadorMatch) {
      console.log(`📊 ¡ENCONTRADO! Registros reportados por el sistema: ${contadorMatch[1]}`)
    }
    
    // Verificar si hay el mensaje de "ui-datatable-empty-message"
    if (htmlContent.includes('ui-datatable-empty-message')) {
      console.log(`ℹ️ Sistema reporta tabla vacía (ui-datatable-empty-message detectado)`)
    }
    if (htmlContent.includes('No se encuentran resultados')) {
      console.log(`ℹ️ Sistema reporta sin resultados (mensaje explícito)`)
    }

    let citaciones = []

    // Buscar las filas de datos - PATRÓN CORRECTO según tu HTML
    const tableRowMatches = htmlContent.match(/<tr data-ri="\d+"[^>]*class="[^"]*ui-widget-content[^"]*"[^>]*role="row">(.*?)<\/tr>/gs)
    
    if (tableRowMatches && tableRowMatches.length > 0) {
      console.log(`🎯 ¡ENCONTRADAS ${tableRowMatches.length} FILAS DE DATOS REALES!`)
      
      tableRowMatches.forEach((row, index) => {
        console.log(`🔍 Procesando fila ${index + 1}...`)
        
        // Extraer todas las celdas de la fila usando el patrón correcto
        const cellMatches = row.match(/<td[^>]*role="gridcell"[^>]*>(.*?)<\/td>/gs)
        if (cellMatches && cellMatches.length >= 14) { // Ajustado a 14 porque hay 15 columnas pero la última es un botón
          
          // Función para limpiar contenido HTML de las celdas
          const cleanCell = (cell) => {
            return cell
              .replace(/<[^>]*>/g, '') // Remover tags HTML
              .replace(/&nbsp;/g, ' ') // Reemplazar espacios no separables
              .replace(/\s+/g, ' ') // Normalizar espacios
              .trim()
          }

          const citacion = {
            provincia: cleanCell(cellMatches[0]) || '',
            canton: cleanCell(cellMatches[1]) || '',
            judicatura: cleanCell(cellMatches[2]) || '',
            numeroCausa: cleanCell(cellMatches[3]) || '',
            demandado: cleanCell(cellMatches[4]) || '',
            proceso: cleanCell(cellMatches[5]) || '',
            fechaRazonCopias: cleanCell(cellMatches[6]) || '',
            fechaRazonEnvio: cleanCell(cellMatches[7]) || '',
            fechaBoletasRecibidas: cleanCell(cellMatches[8]) || '',
            fechaDevolucion: cleanCell(cellMatches[9]) || '',
            fechaAsignacionCitado: cleanCell(cellMatches[10]) || '',
            estado: cleanCell(cellMatches[11]) || '',
            fechaActaCitacion: cleanCell(cellMatches[12]) || '',
            tiposCitacion: cleanCell(cellMatches[13]) || '',
            observacion: 'Ver detalles en sistema' // La columna 14 es un botón
          }

          // Agregar la citación - ya sabemos que tiene datos válidos
          citaciones.push(citacion)
          console.log(`  ✅ Citación extraída: ${citacion.numeroCausa} | ${citacion.estado} | ${citacion.demandado}`)

        } else {
          console.log(`  ⚠️ Fila con ${cellMatches ? cellMatches.length : 0} celdas (esperadas: 14+)`)
        }
      })
    } else {
      console.log(`ℹ️ No se encontraron filas de datos con el patrón data-ri`)
    }

    console.log(`✅ Se procesaron ${citaciones.length} citaciones válidas`)
    
    // Si no encontramos citaciones, intentar método alternativo con browser
    if (citaciones.length === 0) {
      console.log(`🔄 DEBUG - La respuesta AJAX está vacía, intentando método con browser...`)
      
      // Fallback: usar el método original con browser pero optimizado
      const { chromium } = await import("playwright")
      
      browser = await chromium.launch({ 
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
        console.log(`🌐 [FALLBACK] Navegando a página de citaciones judiciales...`)
        await page.goto("https://consultas.funcionjudicial.gob.ec/informacionjudicial/public/informacionCitaciones.jsf", {
          waitUntil: "domcontentloaded",
          timeout: 30000
        })
        
        console.log(`📝 [FALLBACK] Ingresando cédula: ${cedula}`)
        await page.fill("#form1\\:txtDemandadoCedula", cedula)

        console.log(`🔍 [FALLBACK] Realizando búsqueda...`)
        
        // Click en buscar - EXACTAMENTE como lo haces manualmente
        await page.click("#form1\\:butBuscarJuicios")
        await page.waitForTimeout(5000) // Dar tiempo para que carguen los resultados

        // Verificar resultados
        const estadoResultados = await page.$$eval("#form1\\:dataTableJuicios2_data tr", (filas) => {
          console.log(`[BROWSER] Encontradas ${filas.length} filas`)
          
          if (filas.length === 0) {
            return { tipo: 'sin_filas', columnas: 0 }
          }

          const primeraFila = filas[0]
          const columnas = primeraFila.querySelectorAll("td")
          
          // Verificar si es mensaje de "No se encuentran resultados"
          if (columnas.length === 1 && columnas[0]?.getAttribute('colspan') === '15') {
            return { tipo: 'no_resultados', columnas: columnas.length }
          }
          
          // Si hay múltiples columnas, hay resultados
          if (columnas.length >= 15) {
            return { tipo: 'resultados_encontrados', columnas: columnas.length, filas: filas.length }
          }
          
          return { tipo: 'cargando', columnas: columnas.length, filas: filas.length }
        })

        console.log(`🔍 [FALLBACK] Estado de resultados:`, estadoResultados)

        if (estadoResultados.tipo === 'no_resultados') {
          console.log(`ℹ️ [FALLBACK] No se encontraron citaciones judiciales para la cédula ${cedula}.`)
        } else if (estadoResultados.tipo === 'resultados_encontrados') {
          console.log(`✅ [FALLBACK] ¡ENCONTRAMOS ${estadoResultados.filas} CITACIONES! para la cédula ${cedula}.`)
          
          // Extraer resultados
          citaciones = await page.$$eval("#form1\\:dataTableJuicios2_data tr", (filas) => {
            return filas.map((fila) => {
              const columnas = fila.querySelectorAll("td")
              
              if (columnas.length > 1 && columnas[0]?.innerText.trim() !== "No se encuentran resultados.") {
                return {
                  provincia: columnas[0]?.innerText.trim() || '',
                  canton: columnas[1]?.innerText.trim() || '',
                  judicatura: columnas[2]?.innerText.trim() || '',
                  numeroCausa: columnas[3]?.innerText.trim() || '',
                  demandado: columnas[4]?.innerText.trim() || '',
                  proceso: columnas[5]?.innerText.trim() || '',
                  fechaRazonCopias: columnas[6]?.innerText.trim() || '',
                  fechaRazonEnvio: columnas[7]?.innerText.trim() || '',
                  fechaBoletasRecibidas: columnas[8]?.innerText.trim() || '',
                  fechaDevolucion: columnas[9]?.innerText.trim() || '',
                  fechaAsignacionCitado: columnas[10]?.innerText.trim() || '',
                  estado: columnas[11]?.innerText.trim() || '',
                  fechaActaCitacion: columnas[12]?.innerText.trim() || '',
                  tiposCitacion: columnas[13]?.innerText.trim() || '',
                  observacion: columnas[14]?.innerText.trim() || ''
                }
              }
              return null
            }).filter(item => item !== null)
          })

          console.log(`✅ [FALLBACK] Se encontraron ${citaciones.length} citaciones judiciales`)
        }

      } catch (browserError) {
        console.error(`❌ [FALLBACK] Error en método browser:`, browserError.message)
      }
    }

    // Guardar datos en base de datos
    if (citaciones.length > 0) {
      try {
        await DatabaseOperations.saveQuery(Collections.CITACION_JUDICIAL, {
          cedula,
          citaciones,
          totalCitaciones: citaciones.length,
          fechaConsulta: new Date(),
          estado: 'exitoso'
        })
        console.log(`💾 Datos guardados en base de datos`)
      } catch (dbError) {
        console.warn(`⚠️ Error guardando en BD (continuando): ${dbError.message}`)
      }

      console.log(`\n📊 RESUMEN - ${citaciones.length} citaciones judiciales encontradas:`)
      citaciones.forEach((cit, index) => {
        console.log(`   ${index + 1}. Causa: ${cit.numeroCausa} | ${cit.judicatura} | Estado: ${cit.estado}`)
      })
    }

    return {
      cedula,
      citaciones,
      totalCitaciones: citaciones.length,
      fechaConsulta: new Date(),
      estado: citaciones.length > 0 ? 'exitoso' : 'sin_datos'
    }

  } catch (error) {
    console.error("\n❌ Error en obtenerCitacionesJudiciales:", error.message)
    
    // Guardar error en base de datos
    try {
      await ErrorLogsModel.saveError(
        'citaciones-judiciales',
        cedula,
        'error_general',
        { 
          mensaje: error.message || 'Error al consultar citaciones judiciales',
          stack: error.stack,
          tipo: error.name || 'Error'
        }
      )
    } catch (logError) {
      console.warn('⚠️ Error guardando log:', logError.message)
    }
    
    throw new Error(`Error al consultar citaciones judiciales: ${error.message}`)
  } finally {
    // Cerrar browser si fue inicializado en el fallback
    if (browser) {
      try {
        await browser.close()
      } catch (closeError) {
        console.error('Error cerrando browser:', closeError.message)
      }
    }
  }
}

export async function scrapeCitacionJudicial(cedula) {
  return await obtenerCitacionesJudiciales(cedula)
}

import { chromium } from "playwright"
import Tesseract from 'tesseract.js'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ErrorLogsModel } from '../Models/database.js'

// Obtener directorio actual para ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Crear directorio para archivos de Tesseract (relativo al backend)
const tesseractDir = path.join(__dirname, "..", "utils", "tesseract")
if (!fs.existsSync(tesseractDir)) {
  fs.mkdirSync(tesseractDir, { recursive: true })
}

export const datosIESS = async (cedula) => {
    console.log(`🔍 Iniciando consulta IESS para cédula: ${cedula}`)
    
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
        console.log(`🌐 Navegando a la página del IESS...`)
        await page.goto("https://app.iess.gob.ec/gestion-calificacion-derecho-web/public/formulariosContacto.jsf", {
        waitUntil: "domcontentloaded",
        timeout: 30000
        })
        
        console.log(`📄 Página cargada. Título: ${await page.title()}`)
        console.log(`📝 Ingresando cédula: ${cedula}`)

        // Rellenamos el campo de cedula
        await page.type("#formConsulta\\:cedula_text", cedula)

        console.log(`📅 Seleccionando fecha actual...`)
        // Se le da click al boton de fecha
        await page.click('.ui-datepicker-trigger')
        // Se selecciona la fecha actual
        await page.click('.ui-datepicker-days-cell-over.ui-datepicker-today')

        console.log(`🏥 Seleccionando opción Enfermedad...`)
        //Se selecciona la opcion ENFERMEDAD que tiene el valor "14"
        // 1. Click al menú desplegable visible
        await page.click('#formConsulta\\:contingencia_select .ui-selectonemenu-label');

        // 2. Click a la opción "Enfermedad"
        const botonSelect = await page.$("li[data-label='Enfermedad']")
        await botonSelect.hover()
        await page.waitForTimeout(500)
        await botonSelect.click()

        let estado = null;
        while (estado !== "ok") {

            // Se le da click al boton ACEPTAR
            const boton = await page.$("#formConsulta\\:j_idt40");
            await boton.hover();
            await page.waitForTimeout(500);
            await boton.click();

            await page.waitForTimeout(2000);

            const etiquetaBoton = await page.$('#formConsulta\\:j_idt40');
            if (etiquetaBoton) {
                estado = "sinCambios";  // No encontrado, seguimos
            } else {
                estado = "ok";  // Encontrado, salimos del bucle
            }

        }

        // Definir rutas de archivos dentro de la carpeta tesseract
        const screenshotPath = path.join(tesseractDir, 'resultado_iess.png')
        const screenshotAreaPath = path.join(tesseractDir, 'resultado_iess_area.png')

        // Tomar captura de pantalla completa para OCR
        await page.screenshot({ path: screenshotPath, fullPage: true });
        
        // Intentar tomar una captura del área específica donde aparece la cobertura
        try {
            const coberturaElement = await page.$('.ui-messages-info, .alert, [class*="cobertura"], [class*="mensaje"]');
            if (coberturaElement) {
                await coberturaElement.screenshot({ path: screenshotAreaPath });
                console.log('📸 Captura del área de cobertura tomada');
            }
        } catch (err) {
            console.log('⚠️ No se pudo capturar área específica, usando captura completa');
        }
        
        console.log('📸 Captura tomada, procesando con OCR...');
        
        // Procesar la imagen principal con Tesseract OCR
        const { data: { text } } = await Tesseract.recognize(screenshotPath, 'spa+eng', {
            cachePath: tesseractDir,
            langPath: tesseractDir,
            logger: m => console.log(m),
            tessedit_pageseg_mode: '1', // Orientación automática y detección de script
            tessedit_ocr_engine_mode: '1', // Motor LSTM (más preciso)
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúñÑ0123456789 .,:-/()[]', // Caracteres permitidos
        });
        
        let textoCompleto = text;
        
        // Si existe la captura del área específica, procesarla también
        if (fs.existsSync(screenshotAreaPath)) {
            try {
                const { data: { text: textoArea } } = await Tesseract.recognize(screenshotAreaPath, 'spa+eng', {
                    cachePath: tesseractDir,
                    langPath: tesseractDir,
                    logger: m => console.log(m),
                    tessedit_pageseg_mode: '6', // Bloque uniforme de texto
                    tessedit_ocr_engine_mode: '1',
                });
                textoCompleto = text + ' ' + textoArea;
                console.log('📝 Texto del área específica:', textoArea);
            } catch (err) {
                console.log('⚠️ Error procesando área específica:', err.message);
            }
        }
        
        console.log('📝 Texto extraído por OCR:', textoCompleto);
        
        // Extraer datos específicos del texto OCR
        const datosExtraidos = extraerDatosOCR(textoCompleto, cedula);
        
        // Verificar si la cédula no está registrada en el IESS
        if (datosExtraidos.detalle && datosExtraidos.detalle.includes("Cédula No se Encuentra Registrada en el IESS")) {
            console.log('⚠️ Cédula no registrada en IESS:', cedula);
            
            // Guardar error en base de datos
            await ErrorLogsModel.saveError(
                'datos-iess',
                cedula,
                'cedula_no_registrada',
                { 
                    mensaje: 'Cédula No se Encuentra Registrada en el IESS',
                    detalle: datosExtraidos.detalle
                }
            ).catch(err => console.warn('⚠️ Error guardando log:', err.message));
            
            await browser.close()
            return {
                error: 'cedula_no_registrada',
                mensaje: 'Cédula No se Encuentra Registrada en el IESS.',
                cedula,
                fechaConsulta: new Date()
            }
        }

        const datos = {
            cobertura: datosExtraidos.cobertura,
            tipoAfiliacion: datosExtraidos.tipoAfiliacion,
            detalle: datosExtraidos.detalle,
            cedula,
            fechaConsulta: new Date()
        };

        console.log('✅ Datos IESS obtenidos exitosamente:', datos);
        await browser.close()
        
        // Limpiar archivo temporal de captura
        try {
            if (fs.existsSync(screenshotPath)) {
                fs.unlinkSync(screenshotPath)
                console.log('🧹 Archivo temporal principal limpiado')
            }
            if (fs.existsSync(screenshotAreaPath)) {
                fs.unlinkSync(screenshotAreaPath)
                console.log('🧹 Archivo temporal de área limpiado')
            }
        } catch (err) {
            console.warn('⚠️ No se pudo limpiar archivo temporal:', err.message)
        }
        
        return datos

    } catch (error) {
        console.error(`❌ Error en datosIESS: ${error.message}`)
        console.error(`🔍 Stack trace: ${error.stack}`)
        console.error(`🌐 URL actual: ${await page.url().catch(() => 'No disponible')}`)
        
        // Guardar error en base de datos
        await ErrorLogsModel.saveError(
            'datos-iess',
            cedula,
            'error_general',
            { 
                mensaje: error.message || 'Error al procesar la consulta IESS',
                stack: error.stack,
                tipo: error.name || 'Error'
            }
        ).catch(err => console.warn('⚠️ Error guardando log:', err.message));
        
        await browser.close()
        
        // Limpiar archivo temporal en caso de error
        try {
            const screenshotPath = path.join(tesseractDir, 'resultado_iess.png')
            const screenshotAreaPath = path.join(tesseractDir, 'resultado_iess_area.png')
            if (fs.existsSync(screenshotPath)) {
                fs.unlinkSync(screenshotPath)
            }
            if (fs.existsSync(screenshotAreaPath)) {
                fs.unlinkSync(screenshotAreaPath)
            }
        } catch (err) {
            console.warn('⚠️ No se pudo limpiar archivo temporal:', err.message)
        }
        
        return {
            error: error.message || 'Error al procesar la consulta IESS',
            cedula,
            fechaConsulta: new Date()
        }
    }
}

// Función para extraer datos específicos del texto OCR
function extraerDatosOCR(texto, cedula) {
    console.log('🔍 Extrayendo datos del texto OCR...');
    
    // Limpiar y normalizar el texto
    const textoLimpio = texto.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    let cobertura = '';
    let tipoAfiliacion = '';
    let detalle = '';
    
    // Extraer cobertura con múltiples patrones de búsqueda
    if (textoLimpio.includes('SIN COBERTURA IESS') || textoLimpio.includes('SIN COBERTURA')) {
        cobertura = 'SIN COBERTURA IESS';
    } else if (textoLimpio.includes('CON COBERTURA IESS') || textoLimpio.includes('CON COBERTURA')) {
        cobertura = 'CON COBERTURA IESS';
    } else {
        // Buscar patrones más flexibles
        const coberturaMatch = textoLimpio.match(/(SIN|CON)\s*(COBERTURA)\s*(IESS)?/i);
        if (coberturaMatch) {
            cobertura = `${coberturaMatch[1].toUpperCase()} COBERTURA IESS`;
        } else {
            // Inferir cobertura basándose en el contexto
            // Si el usuario no está activo en ninguna empresa, generalmente significa sin cobertura
            if (textoLimpio.includes('No se Encuentra Activo en Ninguna Empresa') || 
                textoLimpio.includes('Afiliado No se Encuentra Activo')) {
                cobertura = 'SIN COBERTURA IESS';
                console.log('📋 Cobertura inferida del contexto: SIN COBERTURA IESS');
            }
            // Si tiene tipo de afiliación definida, podría tener cobertura
            else if (textoLimpio.includes('Tipo de Afiliación') && 
                     !textoLimpio.includes('No Definida') && 
                     !textoLimpio.includes('No se Encuentra')) {
                cobertura = 'CON COBERTURA IESS';
                console.log('📋 Cobertura inferida del contexto: CON COBERTURA IESS');
            }
        }
    }
    
    // Extraer tipo de afiliación con mayor flexibilidad
    let tipoAfiliacionMatch = textoLimpio.match(/Tipo\s+de\s+Afiliaci[oó]n:\s*([^.]+?)(?:\.|$|Observaci[oó]n)/i);
    if (tipoAfiliacionMatch) {
        tipoAfiliacion = tipoAfiliacionMatch[1].trim();
        // Limpiar caracteres especiales
        tipoAfiliacion = tipoAfiliacion.replace(/^—\s*/, '').trim();
    } else {
        // Buscar patrones alternativos
        tipoAfiliacionMatch = textoLimpio.match(/Afiliaci[oó]n[:\s]*([^.]+?)(?:\.|$|Observaci[oó]n)/i);
        if (tipoAfiliacionMatch) {
            tipoAfiliacion = tipoAfiliacionMatch[1].trim().replace(/^—\s*/, '').trim();
        }
    }
    
    // Extraer detalle/observación con mayor flexibilidad
    let detalleMatch = textoLimpio.match(/Observaci[oó]n:\s*([^.]+?)(?:\.|$)/i);
    if (detalleMatch) {
        detalle = detalleMatch[1].trim();
    } else {
        // Buscar información adicional que pueda ser relevante
        if (textoLimpio.includes('Afiliado No se Encuentra Activo en Ninguna Empresa')) {
            detalle = 'Afiliado No se Encuentra Activo en Ninguna Empresa';
        } else if (textoLimpio.includes('No se Encuentra Activo')) {
            detalle = 'No se Encuentra Activo en Ninguna Empresa';
        }
    }
    
    // Verificar si la cédula no está registrada
    if (textoLimpio.includes('Cédula No se Encuentra Registrada en el IESS') || 
        textoLimpio.includes('Cedula No se Encuentra Registrada en el IESS')) {
        detalle = 'Cédula No se Encuentra Registrada en el IESS';
        cobertura = 'SIN COBERTURA IESS';
    }
    
    console.log('📊 Datos extraídos:', {
        cobertura,
        tipoAfiliacion,
        detalle
    });
    
    return {
        cobertura: cobertura || 'No determinado',
        tipoAfiliacion: tipoAfiliacion || 'No determinado',
        detalle: detalle || 'No determinado'
    };
}
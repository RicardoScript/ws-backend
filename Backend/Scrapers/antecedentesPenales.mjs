import { chromium } from "playwright";
import { DatabaseOperations, Collections, ErrorLogsModel } from '../Models/database.js';
import fs from 'fs';
import path from 'path';

export const obtenerAntecedentesPenales = async (cedula) => {
  let browser = null;

  try {
    console.log(`🔍 Iniciando consulta de antecedentes penales para cédula: ${cedula}`);

    browser = await chromium.launch({
      headless: false,
      executablePath: '/usr/bin/chromium-browser',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--display=:99',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
      ],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'es-EC',
      timezoneId: 'America/Guayaquil',
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();
    
    try {
      await page.goto('https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/', { 
        waitUntil: 'domcontentloaded', 
        timeout: 90000 
      });
      console.log(`🌐 Página cargada: ${await page.title()}`);
    } catch (error) {
      console.log('⚠️ Error al cargar la página, continuando...');
    }

    // --- Manejo de Incapsula CORREGIDO ---
    try {
      const isBlocked = await page.evaluate(() => {
        return document && document.body && document.body.innerHTML && 
               document.body.innerHTML.includes('Incapsula');
      });
      
      if (isBlocked) {
        console.log('⚠️ Bloqueo de Incapsula detectado. Usa noVNC para resolverlo...');
        let attempts = 0;
        while (attempts < 120) {
          const stillBlocked = await page.evaluate(() => {
            return document && document.body && document.body.innerHTML && 
                   document.body.innerHTML.includes('Incapsula');
          });
          if (!stillBlocked) break;
          attempts++;
          await page.waitForTimeout(5000);
        }
        if (attempts >= 120) throw new Error('Incapsula bloqueando la página.');
      }
    } catch (incapsulaError) {
      console.log('ℹ️ No se pudo verificar Incapsula:', incapsulaError.message);
    }

    // --- Manejo de cookies ---
    try {
      await page.waitForSelector('.cc-btn.cc-dismiss', { timeout: 5000 });
      await page.click('.cc-btn.cc-dismiss');
      console.log('✅ Cookies aceptadas');
    } catch (error) { 
      console.log('ℹ️ No se encontró banner de cookies');
    }

    // --- Aceptar términos y condiciones ---
    const textosBoton = ['Aceptar', 'Acepto', 'Continuar'];
    let botonEncontrado = false;

    // Buscar botón en la página principal
    for (const texto of textosBoton) {
      try {
        const boton = await page.$(`button:has-text("${texto}")`);
        if (boton) {
          await boton.click();
          botonEncontrado = true;
          console.log(`✅ Botón "${texto}" clickeado`);
          await page.waitForTimeout(2000);
          break;
        }
      } catch (error) {
        console.log(`⚠️ Error al hacer clic en botón ${texto}:`, error.message);
      }
    }

    // Buscar botón en iframes si no se encontró
    if (!botonEncontrado) {
      try {
        const frames = page.frames();
        for (const frame of frames) {
          for (const texto of textosBoton) {
            try {
              const boton = await frame.$(`button:has-text("${texto}")`);
              if (boton) {
                await boton.click();
                botonEncontrado = true;
                console.log(`✅ Botón "${texto}" clickeado dentro de iframe`);
                await page.waitForTimeout(2000);
                break;
              }
            } catch (error) {
              console.log(`⚠️ Error en iframe con botón ${texto}:`, error.message);
            }
          }
          if (botonEncontrado) break;
        }
      } catch (error) {
        console.log('⚠️ Error al buscar en iframes:', error.message);
      }
    }

    if (!botonEncontrado) {
      console.warn('⚠️ No se encontró ningún botón de aceptar términos. Continuando...');
    }

    // --- Llenar cédula y motivo ---
    try {
      await page.waitForSelector('#txtCi', { timeout: 30000 });
      await page.fill('#txtCi', cedula);
      await page.click('#btnSig1');
      console.log('✅ Cédula ingresada');
    } catch (error) {
      console.log('❌ Error al ingresar cédula:', error.message);
      throw new Error('No se pudo ingresar la cédula');
    }

    try {
      await page.waitForSelector('#txtMotivo', { timeout: 30000 });
      await page.fill('#txtMotivo', 'Consulta Personal');
      await page.click('#btnSig2');
      console.log('✅ Motivo ingresado');
    } catch (error) {
      console.log('❌ Error al ingresar motivo:', error.message);
      throw new Error('No se pudo ingresar el motivo');
    }

    // --- Obtener resultados ---
    let resultadoRaw = '';
    let nombreRaw = '';

    try {
      await page.waitForSelector('#dvAntecedent1', { timeout: 30000 });
      resultadoRaw = await page.textContent('#dvAntecedent1') || '';
      nombreRaw = await page.textContent('#dvName1') || '';
      console.log('✅ Resultados obtenidos');
    } catch (error) {
      console.log('❌ Error al obtener resultados:', error.message);
      throw new Error('No se pudieron obtener los resultados');
    }

    const resultadoFormateado = resultadoRaw.trim().toUpperCase() === 'NO'
      ? 'No tiene antecedentes penales'
      : 'Tiene antecedentes penales';

    const tieneAntecedentes = resultadoRaw.trim().toUpperCase() !== 'NO';

    // --- Obtener información del certificado ---
    let urlCertificado = null;
    let tieneBotonCertificado = false;
    
    try {
      console.log('📄 Buscando botón "Visualizar Certificado"...');
      
      // Esperar a que la página cargue completamente
      await page.waitForTimeout(3000);
      
      // Buscar el botón por el texto EXACTO
      const botonCertificado = await page.$('button:has-text("Visualizar Certificado")');
      
      if (botonCertificado) {
        console.log('✅ Botón "Visualizar Certificado" encontrado');
        tieneBotonCertificado = true;
        
        // Obtener la URL actual para referencia
        const urlActual = page.url();
        console.log(`🌐 URL actual: ${urlActual}`);
        
        // Obtener información sobre qué hace el botón
        const accionBoton = await page.evaluate((boton) => {
          if (!boton) return null;
          return {
            onclick: boton.getAttribute('onclick'),
            href: boton.getAttribute('href'),
            formaction: boton.getAttribute('formaction'),
            type: boton.getAttribute('type'),
            form: boton.getAttribute('form')
          };
        }, botonCertificado);
        
        console.log('🔍 Información del botón:', accionBoton);
        
        // Si el botón tiene una acción directa, podemos intentar obtener la URL
        if (accionBoton && accionBoton.onclick && (accionBoton.onclick.includes('window.open') || accionBoton.onclick.includes('http'))) {
          // Extraer URL del onclick
          const urlMatch = accionBoton.onclick.match(/(https?:\/\/[^"']+)/);
          if (urlMatch) {
            urlCertificado = urlMatch[1];
            console.log(`🔗 URL del certificado encontrada: ${urlCertificado}`);
          }
        }
        
        console.log('👆 Botón disponible para click manual');
        
      } else {
        console.log('❌ No se encontró el botón "Visualizar Certificado"');
      }
      
    } catch (certificadoError) {
      console.log('⚠️ Error al buscar certificado:', certificificadoError.message);
    }

    const datosAntecedentes = {
      cedula,
      nombre: nombreRaw.trim() || 'Nombre no disponible',
      resultado: resultadoFormateado,
      tieneAntecedentes,
      fechaConsulta: new Date(),
      estado: 'exitoso',
      tieneBotonCertificado: tieneBotonCertificado,
      urlCertificado: urlCertificado,
      certificadoPdf: null,
      tieneCertificado: false
    };

    // --- Guardar en BD ---
    try {
      await DatabaseOperations.upsert(Collections.ANTECEDENTES_PENALES, { cedula }, datosAntecedentes);
      console.log(`💾 Datos guardados en base de datos: ${nombreRaw.trim()}`);
    } catch (dbError) {
      console.log('⚠️ Error al guardar en BD:', dbError.message);
    }

    console.log(`📊 Botón certificado: ${tieneBotonCertificado ? 'DISPONIBLE' : 'NO DISPONIBLE'}`);

    await browser.close();

    return {
      success: true,
      ...datosAntecedentes
    };

  } catch (error) {
    console.error('❌ Error en obtenerAntecedentesPenales:', error.message);
    if (browser) await browser.close();

    return {
      success: false,
      error: 'error_general',
      message: `Error al consultar antecedentes penales: ${error.message}`,
    };
  }
};
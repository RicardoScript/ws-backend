import { chromium } from 'playwright';
import { DatabaseOperations, Collections, ErrorLogsModel } from '../Models/database.js';

export const obtenerSRIdeudas = async (ruc) => {
  console.log(`🔍 Iniciando consulta de deudas SRI para RUC/Cédula: ${ruc}`);

  let browser = null;
  try {
    // Iniciar Playwright con configuración para noVNC
    browser = await chromium.launch({
      headless: false, // Visible para noVNC
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
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'es-EC,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      permissions: ['geolocation'],
      geolocation: { latitude: -0.1807, longitude: -78.4678 }, // Quito, Ecuador
    });

    // Ocultar webdriver
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    console.log(`🌐 Navegando a página de deudas SRI...`);
    try {
      await page.goto('https://srienlinea.sri.gob.ec/sri-en-linea/SriPagosWeb/ConsultaDeudasFirmesImpugnadas/Consultas/consultaDeudasFirmesImpugnadas', {
        waitUntil: 'domcontentloaded',
        timeout: 90000,
      });
    } catch (error) {
      console.error('⚠️ Error en page.goto:', error.message);
      const pageContent = await page.content();
      console.log('Contenido de la página:', pageContent.substring(0, 1000));
      throw new Error(`No se pudo cargar la página: ${error.message}`);
    }

    console.log(`📄 Página cargada. Título: ${await page.title()}`);

    // Verificar bloqueo de Incapsula
    const isIncapsulaBlocked = await page.evaluate(() => {
      return !!document.querySelector('#main-iframe') || document.body.innerHTML.includes('Incapsula');
    });

    if (isIncapsulaBlocked) {
      console.log('⚠️ Bloqueo de Incapsula detectado. Esperando resolución manual...');
      let attempts = 0;
      const maxAttempts = 120; // 10 minutos
      while (attempts < maxAttempts) {
        const stillBlocked = await page.evaluate(() => {
          return !!document.querySelector('#main-iframe') || document.body.innerHTML.includes('Incapsula');
        });
        if (!stillBlocked) {
          console.log('✅ Bloqueo de Incapsula resuelto, continuando...');
          await page.waitForLoadState('domcontentloaded');
          break;
        }
        attempts++;
        await page.waitForTimeout(5000);
      }

      if (attempts >= maxAttempts) {
        await browser.close();
        return {
          success: false,
          error: 'incapsula_blocked',
          message: 'Se detectó un bloqueo de Incapsula. Resuélvelo mediante noVNC.',
        };
      }
    }

    // Verificar hCaptcha
    const isHCaptchaPresent = await page.evaluate(() => {
      return !!document.querySelector('div.h-captcha') || document.body.innerHTML.includes('hcaptcha');
    });

    if (isHCaptchaPresent) {
      console.log('⚠️ hCaptcha detectado. Esperando resolución manual...');
      let attempts = 0;
      const maxAttempts = 60; // 5 minutos
      while (attempts < maxAttempts) {
        const captchaStillPresent = await page.evaluate(() => {
          return !!document.querySelector('div.h-captcha') || document.body.innerHTML.includes('hcaptcha');
        });
        if (!captchaStillPresent) {
          console.log('✅ hCaptcha resuelto, continuando...');
          break;
        }
        attempts++;
        await page.waitForTimeout(5000);
      }

      if (attempts >= maxAttempts) {
        await browser.close();
        return {
          success: false,
          error: 'captcha_required',
          message: 'Se detectó un hCaptcha. Resuélvelo mediante noVNC.',
        };
      }
    }

    // Llenar RUC
    await page.waitForSelector('#busquedaRucId', { timeout: 60000 });
    await page.fill('#busquedaRucId', ruc);
    console.log(`📝 RUC/Cédula ingresada: ${ruc}`);

    // Esperar un momento
    await page.waitForTimeout(2000);

    // Verificar mensaje de error
    const mensajeError = await page.locator('.ui-messages-warn .ui-messages-detail').first();
    const existeMensajeError = await mensajeError.count() > 0;

    if (existeMensajeError) {
      const textoMensaje = await mensajeError.textContent();
      console.log(`📄 Mensaje obtenido: ${textoMensaje}`);

      const resultado = {
        ruc: ruc.trim(),
        rucObtenida: ruc.trim(),
        fechaCorte: '',
        razonSocial: '',
        estadoDeuda: textoMensaje?.trim() || 'La búsqueda no generó resultados',
        fechaConsulta: new Date(),
        tipoResultado: 'sin_resultados',
      };

      await DatabaseOperations.upsert(
        Collections.SRI_DEUDAS,
        { ruc: resultado.ruc },
        resultado
      );

      console.log(`💾 Datos de "sin resultados" guardados exitosamente en BD`);

      await browser.close();
      return {
        success: true,
        data: resultado,
        estado: 'sin_resultados',
        message: 'La búsqueda no generó resultados',
      };
    }

    // Verificar botón
    const botonConsultar = page.locator('.ui-button.cyan-btn');
    const botonHabilitado = await botonConsultar.isEnabled();
    if (!botonHabilitado) {
      console.log('⚠️ El botón consultar no está habilitado');
      throw new Error('El botón consultar no está habilitado');
    }

    await botonConsultar.click();
    console.log('🔘 Botón consultar presionado');

    // Esperar datos
    await page.waitForSelector('span.titulo-consultas-1.tamano-defecto-campos', { timeout: 30000 });

    // Extraer datos
    const rucObtenida = (await page.textContent('text=RUC / cédula >> xpath=../../..//span'))?.trim() || '';
    const fechaCorte = (await page.textContent('text=Fecha de corte >> xpath=../../..//span'))?.trim() || '';
    const razonSocial = (await page.textContent('text=Razón social / Apellidos y nombres >> xpath=../../..//span'))?.trim() || '';

    console.log(`📊 Datos básicos obtenidos - RUC: ${rucObtenida}, Razón: ${razonSocial}`);

    // Extraer estado de deuda
    let estadoDeuda = 'NO DETERMINADO';
    try {
      const estadoVisible = await Promise.race([
        page.waitForSelector('div.col-sm-12.text-center.tamano-ya-pago.animated.fadeInUp span', { timeout: 10000 }).then(() => 'sin-deudas'),
        page.waitForSelector('.tamano-ya-pago span', { timeout: 10000 }).then(() => 'general'),
        page.waitForFunction(() => {
          const elements = document.querySelectorAll('.tamano-ya-pago span, .col-sm-12.text-center span');
          for (let el of elements) {
            if (el.textContent && el.textContent.trim().length > 0) return true;
          }
          return false;
        }, {}, { timeout: 10000 }).then(() => 'contenido'),
        page.waitForTimeout(8000).then(() => 'timeout'),
      ]);

      console.log(`📋 Estado detectado: ${estadoVisible}`);

      const selectoresEstado = [
        'div.col-sm-12.text-center.tamano-ya-pago.animated.fadeInUp span',
        '.tamano-ya-pago span',
        '.col-sm-12.text-center span',
        '[class*="tamano-ya-pago"] span',
        'div[class*="text-center"] span',
      ];

      for (const selector of selectoresEstado) {
        try {
          const elemento = page.locator(selector).first();
          const count = await elemento.count();
          if (count > 0) {
            const texto = await elemento.textContent({ timeout: 2000 });
            if (texto && texto.trim().length > 0) {
              estadoDeuda = texto.trim();
              console.log(`✅ Estado encontrado con selector "${selector}": ${estadoDeuda}`);
              break;
            }
          }
        } catch (e) {
          console.log(`⚠️ Selector "${selector}" no funcionó, probando siguiente...`);
          continue;
        }
      }
    } catch (error) {
      console.log(`⚠️ No se pudo determinar el estado de deuda específico: ${error.message}`);
      try {
        const todosLosSpans = await page.$$eval('span', spans =>
          spans.map(span => span.textContent?.trim()).filter(text =>
            text && (
              text.includes('deuda') ||
              text.includes('pago') ||
              text.includes('contribuyente') ||
              text.includes('ciudadano') ||
              text.length > 20
            )
          )
        );
        if (todosLosSpans.length > 0) {
          estadoDeuda = todosLosSpans[0];
          console.log(`📄 Estado obtenido por fallback: ${estadoDeuda}`);
        }
      } catch (fallbackError) {
        console.log(`❌ Error en fallback: ${fallbackError.message}`);
      }
    }

    const resultado = {
      ruc: ruc.trim(),
      rucObtenida,
      fechaCorte,
      razonSocial,
      estadoDeuda,
      fechaConsulta: new Date(),
      tipoResultado: 'exitoso',
    };

    console.log(`📊 Resultado final:`, {
      ruc: resultado.ruc,
      estadoDeuda: resultado.estadoDeuda,
      razonSocial: resultado.razonSocial,
      tipoResultado: resultado.tipoResultado,
    });

    await DatabaseOperations.upsert(
      Collections.SRI_DEUDAS,
      { ruc: resultado.ruc },
      resultado
    );

    console.log(`💾 Datos guardados exitosamente en BD`);

    await browser.close();
    return {
      success: true,
      data: resultado,
      estado: 'exitoso',
    };
  } catch (error) {
    console.error('❌ Error en obtenerSRIdeudas:', error.message);

    await ErrorLogsModel.saveError(
      'sri-deudas',
      ruc,
      'error_general',
      {
        mensaje: error.message || 'Error al consultar SRI deudas',
        stack: error.stack,
        tipo: error.name || 'Error',
      }
    ).catch(err => console.warn('⚠️ Error guardando log:', err.message));

    if (browser) {
      await browser.close();
    }

    return {
      success: false,
      error: 'error_general',
      message: `Error al consultar deudas SRI: ${error.message}`,
    };
  }
};
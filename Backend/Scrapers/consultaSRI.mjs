import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { DatabaseOperations, Collections, ErrorLogsModel } from '../Models/database.js';

puppeteer.use(StealthPlugin());

export const obtenerDatosRuc = async (ruc) => {
  console.log(`🔍 Iniciando consulta SRI para RUC: ${ruc}`);

  // Iniciar Puppeteer en el entorno VNC
  const browser = await puppeteer.launch({
    headless: false, // Necesario para ver la interfaz gráfica a través de noVNC
    executablePath: '/usr/bin/chromium-browser', // Ruta a Chromium
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--display=:99'], // Conectar al display XVFB
  });
  const page = await browser.newPage();

  try {
    console.log(`🌐 Configurando navegador para simular usuario real...`);

    // Configurar user agent y headers para evitar detección
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Referer': 'https://srienlinea.sri.gob.ec/',
      'Origin': 'https://srienlinea.sri.gob.ec/',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    });

    // Navegar al formulario del SRI para establecer cookies y contexto
    console.log('🌐 Navegando al formulario del SRI...');
    await page.goto('https://srienlinea.sri.gob.ec/sri-en-linea/SriRucWeb/ConsultaRuc/Consultas/consultaRuc', { waitUntil: 'networkidle2', timeout: 30000 });

    // API 1: Datos del contribuyente
    const contribuyenteUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?&ruc=${ruc}`;

    console.log(`📊 Consultando datos del contribuyente via API...`);
    let contribuyenteResponse = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Referer': 'https://srienlinea.sri.gob.ec/',
            'Origin': 'https://srienlinea.sri.gob.ec/',
          },
        });
        return { status: res.status, text: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
      } catch (error) {
        return { error: error.message };
      }
    }, contribuyenteUrl);

    if (contribuyenteResponse.error) {
      throw new Error(`Error en fetch de contribuyente: ${contribuyenteResponse.error}`);
    }

    // Verificar si hay reCAPTCHA o bloqueo
    if (contribuyenteResponse.text.includes('recaptcha') || contribuyenteResponse.text.includes('g-recaptcha') || contribuyenteResponse.text.includes('The requested URL was rejected')) {
      console.log('⚠️ reCAPTCHA o bloqueo detectado. Cargando formulario para resolución manual...');
      console.log('Abre http://18.217.24.122:6080/vnc.html para resolver el CAPTCHA manualmente.');

      // Llenar el formulario y simular consulta
      await page.type('input[name="numRuc"]', ruc);
      await page.click('button[id="btnConsulta"]');

      // Esperar hasta que el CAPTCHA se resuelva
      let attempts = 0;
      const maxAttempts = 60; // 5 minutos (60 * 5 segundos)
      while (attempts < maxAttempts) {
        const content = await page.content();
        if (!content.includes('recaptcha') && !content.includes('g-recaptcha') && !content.includes('The requested URL was rejected')) {
          console.log('✅ CAPTCHA resuelto, reintentando API...');
          contribuyenteResponse = await page.evaluate(async (url) => {
            try {
              const res = await fetch(url, {
                method: 'GET',
                headers: {
                  'Accept': 'application/json, text/plain, */*',
                  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                  'Referer': 'https://srienlinea.sri.gob.ec/',
                  'Origin': 'https://srienlinea.sri.gob.ec/',
                },
              });
              return { status: res.status, text: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
            } catch (error) {
              return { error: error.message };
            }
          }, contribuyenteUrl);
          break;
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      if (attempts >= maxAttempts) {
        await browser.close();
        return {
          success: false,
          error: 'captcha_required',
          message: 'Se detectó un CAPTCHA. Por favor, resuélvelo manualmente en http://18.217.24.122:6080/vnc.html',
        };
      }
    }

    if (contribuyenteResponse.status !== 200) {
      throw new Error(`Error HTTP: ${contribuyenteResponse.status} - ${contribuyenteResponse.text}`);
    }

    const contribuyenteApiData = JSON.parse(contribuyenteResponse.text);
    console.log(`✅ Datos del contribuyente obtenidos`);

    // API 2: Establecimientos
    const establecimientosUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Establecimiento/consultarPorNumeroRuc?numeroRuc=${ruc}`;

    console.log(`🏢 Consultando establecimientos via API...`);
    let establecimientosResponse = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Referer': 'https://srienlinea.sri.gob.ec/',
            'Origin': 'https://srienlinea.sri.gob.ec/',
          },
        });
        return { status: res.status, text: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
      } catch (error) {
        return { error: error.message };
      }
    }, establecimientosUrl);

    if (establecimientosResponse.error) {
      throw new Error(`Error en fetch de establecimientos: ${establecimientosResponse.error}`);
    }

    if (establecimientosResponse.text.includes('recaptcha') || establecimientosResponse.text.includes('g-recaptcha') || establecimientosResponse.text.includes('The requested URL was rejected')) {
      console.log('⚠️ reCAPTCHA o bloqueo detectado en establecimientos. Cargando formulario para resolución manual...');
      console.log('Abre http://18.217.24.122:6081/vnc.html para resolver el CAPTCHA manualmente.');

      await page.goto('https://srienlinea.sri.gob.ec/sri-en-linea/SriRucWeb/ConsultaRuc/Consultas/consultaRuc', { waitUntil: 'networkidle2' });
      await page.type('input[name="numRuc"]', ruc);
      await page.click('button[id="btnConsulta"]');

      let attempts = 0;
      const maxAttempts = 60;
      while (attempts < maxAttempts) {
        const content = await page.content();
        if (!content.includes('recaptcha') && !content.includes('g-recaptcha') && !content.includes('The requested URL was rejected')) {
          console.log('✅ CAPTCHA resuelto para establecimientos...');
          establecimientosResponse = await page.evaluate(async (url) => {
            try {
              const res = await fetch(url, {
                method: 'GET',
                headers: {
                  'Accept': 'application/json, text/plain, */*',
                  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                  'Referer': 'https://srienlinea.sri.gob.ec/',
                  'Origin': 'https://srienlinea.sri.gob.ec/',
                },
              });
              return { status: res.status, text: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
            } catch (error) {
              return { error: error.message };
            }
          }, establecimientosUrl);
          break;
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      if (attempts >= maxAttempts) {
        await browser.close();
        return {
          success: false,
          error: 'captcha_required',
          message: 'Se detectó un CAPTCHA. Por favor, resuélvelo manualmente en http://18.217.24.122:6081/vnc.html',
        };
      }
    }

    let establecimientosApiData = [];
    if (establecimientosResponse.status === 200 && establecimientosResponse.text.trim()) {
      establecimientosApiData = JSON.parse(establecimientosResponse.text);
      console.log(`✅ Datos de establecimientos obtenidos: ${establecimientosApiData.length} establecimientos`);
    } else {
      console.log(`⚠️ No se pudieron obtener datos de establecimientos (${establecimientosResponse.status})`);
    }

    // Verificar si se encontraron datos del contribuyente
    if (!contribuyenteApiData || contribuyenteApiData.length === 0) {
      console.log(`ℹ️ No se encontraron datos para el RUC ${ruc}.`);
      await browser.close();
      return {
        ruc,
        datosContribuyente: {},
        establecimientos: [],
        fechaConsulta: new Date(),
        estado: 'sin_datos',
      };
    }

    const contribuyenteData = contribuyenteApiData[0];

    // Mapear los datos de la API al formato esperado por el sistema
    const datosContribuyente = {
      estado: contribuyenteData.estadoContribuyenteRuc || "",
      tipoContribuyente: contribuyenteData.tipoContribuyente || "",
      regimen: contribuyenteData.regimen || "",
      razonSocial: contribuyenteData.razonSocial || "",
      actividadEconomicaPrincipal: contribuyenteData.actividadEconomicaPrincipal || "",
      categoria: contribuyenteData.categoria || "",
      obligadoLlevarContabilidad: contribuyenteData.obligadoLlevarContabilidad || "",
      agenteRetencion: contribuyenteData.agenteRetencion || "",
      contribuyenteEspecial: contribuyenteData.contribuyenteEspecial || "",
      contribuyenteFantasma: contribuyenteData.contribuyenteFantasma || "",
      transaccionesInexistente: contribuyenteData.transaccionesInexistente || "",
      fechaInicioActividades: contribuyenteData.informacionFechasContribuyente?.fechaInicioActividades || "",
      fechaCese: contribuyenteData.informacionFechasContribuyente?.fechaCese || "",
      fechaReinicioActividades: contribuyenteData.informacionFechasContribuyente?.fechaReinicioActividades || "",
      fechaActualizacion: contribuyenteData.informacionFechasContribuyente?.fechaActualizacion || "",
      representantesLegales: contribuyenteData.representantesLegales || null,
      motivoCancelacionSuspension: contribuyenteData.motivoCancelacionSuspension || null,
    };

    // Mapear establecimientos desde la API específica
    let establecimientos = [];

    if (establecimientosApiData && establecimientosApiData.length > 0) {
      establecimientos = establecimientosApiData.map(est => ({
        numEstablecimiento: est.numeroEstablecimiento || "",
        nombre: est.nombreFantasiaComercial || contribuyenteData.razonSocial || "",
        ubicacion: est.direccionCompleta || "",
        estado: est.estado || "",
        tipoEstablecimiento: est.tipoEstablecimiento || "",
        esMatriz: est.matriz === "SI",
      }));
    } else {
      establecimientos = [{
        numEstablecimiento: "001",
        nombre: contribuyenteData.razonSocial || "",
        ubicacion: "MATRIZ",
        estado: contribuyenteData.estadoContribuyenteRuc || "",
        tipoEstablecimiento: "MAT",
        esMatriz: true,
      }];
    }

    console.log(`✅ Se encontraron datos del RUC ${ruc}`);
    console.log(`   - Datos del contribuyente: Encontrado`);
    console.log(`   - Razón Social: ${contribuyenteData.razonSocial}`);
    console.log(`   - Estado: ${contribuyenteData.estadoContribuyenteRuc}`);
    console.log(`   - Establecimientos: ${establecimientos.length} encontrados`);

    establecimientos.forEach(est => {
      console.log(`     * Est. ${est.numEstablecimiento}: ${est.nombre} (${est.estado}) - ${est.esMatriz ? 'MATRIZ' : 'SUCURSAL'}`);
    });

    const resultado = {
      ruc,
      datosContribuyente,
      establecimientos,
      fechaConsulta: new Date(),
      estado: 'exitoso',
    };

    // Guardar en base de datos
    const existingDoc = await DatabaseOperations.findByRuc(Collections.DATOS_SRI, ruc);

    if (!existingDoc) {
      await DatabaseOperations.insertOne(Collections.DATOS_SRI, resultado);
      console.log(`💾 Se guardaron los datos del RUC ${ruc} en la base de datos`);
    } else {
      let updateOperations = {};
      if (JSON.stringify(existingDoc.datosContribuyente) !== JSON.stringify(resultado.datosContribuyente)) {
        updateOperations.datosContribuyente = resultado.datosContribuyente;
      }

      await DatabaseOperations.addToArrayNoDuplicates(
        Collections.DATOS_SRI,
        { ruc },
        'establecimientos',
        establecimientos,
        ['numEstablecimiento', 'nombre', 'ubicacion']
      );

      if (Object.keys(updateOperations).length > 0) {
        await DatabaseOperations.updateOne(
          Collections.DATOS_SRI,
          { ruc },
          { $set: updateOperations }
        );
        console.log(`💾 Se actualizaron los datos del contribuyente para el RUC ${ruc}`);
      }
    }

    await browser.close();
    return resultado;

  } catch (error) {
    console.error('\n❌ Error en obtenerDatosRuc:', error.message);

    await ErrorLogsModel.saveError(
      'consulta-sri',
      ruc,
      'error_general',
      {
        mensaje: error.message || 'Error al consultar SRI',
        stack: error.stack,
        tipo: error.name || 'Error',
      }
    ).catch(err => console.warn('⚠️ Error guardando log:', err.message));

    await browser.close();
    return {
      success: false,
      error: 'error_general',
      message: `Error al consultar SRI: ${error.message}`,
    };
  }
};
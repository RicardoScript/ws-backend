import { obtenerInterpol } from "../Scrapers/interpol.mjs";

export const consultarInterpol = async (req, res) => {
  try {
    const { nombre, apellido = '' } = req.body;

    if (!nombre || typeof nombre !== 'string') {
      return res.status(400).json({ success: false, message: 'Nombre es requerido' });
    }

    console.log(`🔍 Iniciando consulta Interpol para nombre: ${nombre} ${apellido}`);

    const datos = await obtenerInterpol(nombre, apellido);

    res.json({
      success: true,
      data: datos,
      message: 'Consulta Interpol completada'
    });
  } catch (error) {
    console.error('Error en consultarInterpol:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error interno del servidor'
    });
  }
};

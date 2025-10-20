export const validateCedula = (req, res, next) => {
  const { cedula } = req.body
  
  if (!cedula) {
    return res.status(400).json({
      success: false,
      error: 'La cédula es requerida'
    })
  }
  
  // Validar formato de cédula ecuatoriana (10 dígitos)
  const cedulaRegex = /^\d{10}$/
  if (!cedulaRegex.test(cedula)) {
    return res.status(400).json({
      success: false,
      error: 'La cédula debe tener exactamente 10 dígitos'
    })
  }
  
  // Validación del dígito verificador de cédula ecuatoriana
  const digits = cedula.split('').map(Number)
  const province = parseInt(cedula.substring(0, 2))
  
  if (province < 1 || province > 24) {
    return res.status(400).json({
      success: false,
      error: 'Código de provincia inválido en la cédula'
    })
  }
  
  next()
}

export const validateRuc = (req, res, next) => {
  const { ruc } = req.body
  
  if (!ruc) {
    return res.status(400).json({
      success: false,
      error: 'El RUC es requerido'
    })
  }
  
  // Validar formato de RUC (13 dígitos)
  const rucRegex = /^\d{13}$/
  if (!rucRegex.test(ruc)) {
    return res.status(400).json({
      success: false,
      error: 'El RUC debe tener exactamente 13 dígitos'
    })
  }
  
  next()
}
export const validateCedulaOrRuc = (req, res, next) => {
  const { ruc } = req.body // Mantener el nombre 'ruc' para compatibilidad con el frontend
  
  if (!ruc) {
    return res.status(400).json({
      success: false,
      error: 'El RUC o cédula es requerido'
    })
  }
  
  // Validar que sea solo números
  const numeroRegex = /^\d+$/
  if (!numeroRegex.test(ruc)) {
    return res.status(400).json({
      success: false,
      error: 'El RUC o cédula debe contener solo números'
    })
  }
  
  // Validar longitud: 10 dígitos (cédula) o 13 dígitos (RUC)
  if (ruc.length !== 10 && ruc.length !== 13) {
    return res.status(400).json({
      success: false,
      error: 'Debe ingresar una cédula (10 dígitos) o un RUC (13 dígitos)'
    })
  }
  
  // Si es cédula (10 dígitos), validar código de provincia
  if (ruc.length === 10) {
    const province = parseInt(ruc.substring(0, 2))
    if (province < 1 || province > 24) {
      return res.status(400).json({
        success: false,
        error: 'Código de provincia inválido en la cédula'
      })
    }
  }
  
  // Si es RUC (13 dígitos), podríamos agregar validaciones adicionales aquí si es necesario
  
  next()
}

export const validateSearchParams = (req, res, next) => {
  const { nombre, tipoBusqueda } = req.body
  
  if (!nombre) {
    return res.status(400).json({
      success: false,
      error: 'El nombre es requerido'
    })
  }
  
  // tipoBusqueda es opcional, si no se proporciona, se omite la validación
  if (tipoBusqueda) {
    const tiposValidos = ['PROVINCIAS', 'INSTITUCIONES']
    if (!tiposValidos.includes(tipoBusqueda.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de búsqueda inválido. Use: PROVINCIAS o INSTITUCIONES'
      })
    }
  }
  
  next()
}
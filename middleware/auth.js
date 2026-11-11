import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Lee el token del header "Authorization: Bearer ..." o de la cookie "jwt".
const getToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.jwt || null;
};

// Devuelve el usuario logueado o null (no corta el request).
export const getUserFromRequest = async (req) => {
  const token = getToken(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(decoded.UserId).select('-password');
  } catch {
    return null;
  }
};

// Bloquea cualquier ruta si no hay una sesión válida.
export const protectRoute = async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Sesión inválida o vencida. Volvé a iniciar sesión.' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Error en protectRoute:', error.message);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Solo administradores. Va después de protectRoute.
export const requireAdmin = (req, res, next) => {
  if (req.user?.role === 'recepcion') {
    return res.status(403).json({ message: 'Esta acción solo la puede hacer un administrador.' });
  }
  next();
};

// Límite simple de intentos de login por IP (sin dependencias extra).
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export const loginRateLimit = (req, res, next) => {
  const key = req.ip;
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && now - entry.first < WINDOW_MS) {
    if (entry.count >= MAX_ATTEMPTS) {
      return res.status(429).json({ message: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
    }
    entry.count += 1;
  } else {
    attempts.set(key, { first: now, count: 1 });
  }
  next();
};

export const clearLoginAttempts = (req) => attempts.delete(req.ip);

// Valida que un parámetro de ruta sea un ObjectId de Mongo.
export const validateObjectId = (param = 'id') => (req, res, next) => {
  if (!/^[a-f\d]{24}$/i.test(req.params[param] || '')) {
    return res.status(400).json({ message: 'ID inválido.' });
  }
  next();
};

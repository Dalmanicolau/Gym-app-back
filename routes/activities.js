import express from 'express';
import Activity from '../models/Activity.js';
import { validateObjectId, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const CATEGORIES = ['class', 'musculacion'];

// Devuelve solo los campos permitidos y validados, o un mensaje de error.
const parseActivity = (body, { partial = false } = {}) => {
  const data = {};
  if (body.name !== undefined || !partial) {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'El nombre es obligatorio.' };
    data.name = name;
  }
  if (body.price !== undefined || !partial) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return { error: 'El precio debe ser un número mayor o igual a 0.' };
    data.price = price;
  }
  if (body.category !== undefined || !partial) {
    if (!CATEGORIES.includes(body.category)) return { error: 'Categoría inválida.' };
    data.category = body.category;
  }
  if (body.available !== undefined) data.available = Boolean(body.available);
  return { data };
};

// Crear nueva actividad
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { data, error } = parseActivity(req.body);
    if (error) return res.status(422).json({ message: error });
    const newActivity = await Activity.create(data);
    res.status(201).json(newActivity);
  } catch (error) {
    console.error('Error al crear la actividad:', error);
    res.status(500).json({ message: 'Error al crear la actividad' });
  }
});

// Obtener actividades (por defecto solo las disponibles; ?all=true trae todas)
router.get('/', async (req, res) => {
  try {
    const filter = req.query.all === 'true' ? {} : { available: true };
    const activities = await Activity.find(filter).sort({ name: 1 }).lean();
    res.status(200).json(activities);
  } catch (error) {
    console.error('Error al obtener actividades:', error);
    res.status(500).json({ message: 'Error al obtener actividades' });
  }
});

// Modificar una actividad (nombre, precio, categoría o activarla/desactivarla)
router.put('/:id', requireAdmin, validateObjectId(), async (req, res) => {
  try {
    const { data, error } = parseActivity(req.body, { partial: true });
    if (error) return res.status(422).json({ message: error });
    const activity = await Activity.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!activity) return res.status(404).json({ message: 'Actividad no encontrada' });
    res.status(200).json(activity);
  } catch (error) {
    console.error('Error al modificar la actividad:', error);
    res.status(500).json({ message: 'Error al modificar la actividad' });
  }
});

export default router;

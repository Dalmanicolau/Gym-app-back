import express from 'express';
import Activity from '../models/Activity.js';
import Member from '../models/Members.js';

const router = express.Router();
const ROUND_OPTIONS = [1, 10, 50, 100, 500, 1000];

export const increasedPrice = (price, percent, roundTo) => {
  // Se calcula en centavos enteros para evitar errores de decimales (25000 + 15% = 28750 exacto).
  const raw = Math.round((Number(price) || 0) * (100 + percent)) / 100;
  return Math.max(0, Math.round(raw / roundTo + 1e-9) * roundTo);
};

// Aumento (o baja) masivo de precios por porcentaje.
// Body: { percent, roundTo, activities: bool, members: bool }
router.post('/increase', async (req, res) => {
  try {
    const percent = Number(req.body.percent);
    const roundTo = Number(req.body.roundTo ?? 100);
    const applyActivities = Boolean(req.body.activities);
    const applyMembers = Boolean(req.body.members);

    if (!Number.isFinite(percent) || percent === 0 || percent < -90 || percent > 500) {
      return res.status(422).json({ message: 'El porcentaje debe estar entre -90 y 500, y no puede ser 0.' });
    }
    if (!ROUND_OPTIONS.includes(roundTo)) return res.status(422).json({ message: 'Redondeo inválido.' });
    if (!applyActivities && !applyMembers) return res.status(422).json({ message: 'Elegí a qué precios aplicar el cambio.' });

    const result = { activities: 0, members: 0 };

    if (applyActivities) {
      const activities = await Activity.find({}, 'price').lean();
      const operations = activities.map((a) => ({
        updateOne: { filter: { _id: a._id }, update: { $set: { price: increasedPrice(a.price, percent, roundTo) } } },
      }));
      if (operations.length) await Activity.bulkWrite(operations);
      result.activities = operations.length;
    }

    if (applyMembers) {
      const members = await Member.find({}, 'plan.price').lean();
      const operations = members.map((m) => ({
        updateOne: { filter: { _id: m._id }, update: { $set: { 'plan.price': increasedPrice(m.plan?.price, percent, roundTo) } } },
      }));
      if (operations.length) await Member.bulkWrite(operations);
      result.members = operations.length;
    }

    console.log(`Cambio masivo de precios (${percent}%) hecho por ${req.user.username}:`, result);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error en el aumento de precios:', error);
    res.status(500).json({ message: 'Error al actualizar los precios' });
  }
});

export default router;

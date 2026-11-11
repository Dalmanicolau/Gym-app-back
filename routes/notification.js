import express from 'express';
import Member from '../models/Members.js';
import { buildNotifications } from '../utils/notifications.js';
import { validateObjectId } from '../middleware/auth.js';

const router = express.Router();

// Vencimientos próximos, planes vencidos recientes y cumpleaños de hoy.
router.get('/', async (req, res) => {
  try {
    res.status(200).json(await buildNotifications());
  } catch (error) {
    console.error('Error al obtener las notificaciones:', error);
    res.status(500).json({ message: 'Error al obtener las notificaciones' });
  }
});

// Marca que al socio ya se le envió el recordatorio por WhatsApp.
router.post('/:id/reminded', validateObjectId(), async (req, res) => {
  try {
    const member = await Member.findByIdAndUpdate(
      req.params.id,
      { lastReminderAt: new Date() },
      { new: true }
    ).select('lastReminderAt');
    if (!member) return res.status(404).json({ message: 'Socio no encontrado' });
    res.status(200).json(member);
  } catch (error) {
    console.error('Error al marcar recordatorio:', error);
    res.status(500).json({ message: 'Error al marcar el recordatorio' });
  }
});

export default router;

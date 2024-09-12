import express from 'express';
import Member from '../models/Members.js'
import Notification from '../models/Notification.js'

const router = express.Router();

router.get('/expiring', async (req, res) => {
    try {
      const today = new Date();
      const nextWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  
      const expiringMembers = await Member.find({
        'plan.expirationDate': { $lte: nextWeek }
      });
  
      const notifications = expiringMembers.map(member => ({
        memberId: member._id,
        message: `La membresía de ${member.name} vence el ${member.plan.expirationDate.toLocaleDateString()}.`,
        date: today
      }));
  
      await Notification.insertMany(notifications);
  
      res.status(200).json({ message: 'Notificaciones generadas', notifications });
    } catch (error) {
      res.status(500).json({ message: 'Error al generar notificaciones', error });
    }
  });

  export default router;
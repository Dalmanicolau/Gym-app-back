import express from 'express';
import Member from '../models/Members.js'
import Notification from '../models/Notification.js'

const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const notification = await Notification.find();  
      res.status(200).json(notification);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener las notificaciones', error });
    }
  })

  export default router;
import express from 'express';
import Attendance from '../models/Attendance.js';
import Member from '../models/Members.js';
import { planStatus, todayStringAR } from '../utils/dates.js';

const router = express.Router();
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Buscar socios para registrar el ingreso: por DNI (si son números) o por nombre
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(200).json([]);
    const digits = q.replace(/\D/g, '');
    const filter = /^[\d.\s-]+$/.test(q) && digits
      ? { dni: { $regex: `^${digits}` } }
      : { name: { $regex: escapeRegex(q), $options: 'i' } };

    const members = await Member.find(filter, 'name dni cellphone plan activities')
      .sort({ name: 1 })
      .limit(8)
      .populate('activities', 'name')
      .lean();
    res.status(200).json(members.map((m) => ({ ...m, status: planStatus(m.plan) })));
  } catch (error) {
    console.error('Error al buscar socios:', error);
    res.status(500).json({ message: 'Error al buscar socios' });
  }
});

// Registrar un ingreso. Con el plan vencido o sin pago no se registra
// salvo que se envíe force: true (ingreso autorizado a mano).
router.post('/', async (req, res) => {
  try {
    const { memberId, force = false } = req.body;
    if (!/^[a-f\d]{24}$/i.test(String(memberId || ''))) return res.status(400).json({ message: 'Socio inválido.' });

    const member = await Member.findById(memberId, 'name dni plan activities').populate('activities', 'name').lean();
    if (!member) return res.status(404).json({ message: 'Socio no encontrado' });

    const status = planStatus(member.plan);
    const day = todayStringAR();
    const canEnter = status === 'activo' || status === 'por-vencer';
    const previous = await Attendance.findOne({ member: member._id, day }).sort({ date: -1 }).lean();

    if (!canEnter && !force) {
      return res.status(200).json({ registered: false, status, member, alreadyToday: Boolean(previous) });
    }

    const attendance = await Attendance.create({
      member: member._id,
      memberName: member.name,
      date: new Date(),
      day,
      expired: !canEnter,
    });
    res.status(201).json({ registered: true, status, member, attendance, alreadyToday: Boolean(previous) });
  } catch (error) {
    console.error('Error al registrar el ingreso:', error);
    res.status(500).json({ message: 'Error al registrar el ingreso' });
  }
});

// Ingresos de un día (por defecto hoy)
router.get('/', async (req, res) => {
  try {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.day || '')) ? req.query.day : todayStringAR();
    const attendances = await Attendance.find({ day }).sort({ date: -1 }).limit(500).lean();
    res.status(200).json({ day, count: attendances.length, attendances });
  } catch (error) {
    console.error('Error al obtener los ingresos:', error);
    res.status(500).json({ message: 'Error al obtener los ingresos' });
  }
});

export default router;

import express from 'express';
import Payment from '../models/Payment.js';
import Member from '../models/Members.js'

const router = express.Router();


//Obtiene la facturacion de un mes elegido
router.get('/:month/:year', async (req, res) => {
  const { month, year } = req.params;

  try {
    const initMonth = new Date(`${year}-${month}-01`);
    const endMonth = new Date(initMonth.getFullYear(), initMonth.getMonth() + 2, 0);

    console.log(initMonth, endMonth)

    // Obtener los pagos en el rango de fechas
    const payments = await Payment.find({
      date: { $gte: initMonth, $lte: endMonth }
    }).populate('activity');

    // Calcular el total facturado y la distribución por categoría
    let totalFacturated = 0;
    let classPayments = 0;
    let musculacionPayments = 0;
    let promotionPayments = 0;

    payments.forEach(payment => {
      totalFacturated += payment.amount;

      const hasMusculacion = payment.activity.some(act => act.category === 'musculacion');
      const hasClass = payment.activity.some(act => act.category === 'class');

      if (hasMusculacion && hasClass) {
        promotionPayments += payment.amount;
      } else if (hasClass) {
        classPayments += payment.amount;
      } else if (hasMusculacion) {
        musculacionPayments += payment.amount;
      }
    });

    res.status(200).json({
      total: totalFacturated,
      classPayments,
      musculacionPayments,
      promotionPayments,
      count: payments.length
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Error al obtener la facturación', error });
  }
});

//Obtener la facturacion de el mes corriente
router.get('/current', async (req, res) => {
  try {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const payments = await Payment.find({
      date: { $gte: firstDayOfMonth, $lte: lastDayOfMonth }
    }).populate('activity');

    let totalFacturated = 0;
    let classPayments = 0;
    let musculacionPayments = 0;
    let promotionPayments = 0;

    payments.forEach(payment => {
      totalFacturated += payment.amount;

      const hasMusculacion = payment.activity.some(act => act.category === 'musculacion');
      const hasClass = payment.activity.some(act => act.category === 'class');

      if (hasMusculacion && hasClass) {
        promotionPayments += payment.amount;
      } else if (hasClass) {
        classPayments += payment.amount;
      } else if (hasMusculacion) {
        musculacionPayments += payment.amount;
      }
    });

    res.status(200).json({
      total: totalFacturated,
      classPayments,
      musculacionPayments,
      promotionPayments,
      count: payments.length
    });
  } catch (error) {
    console.error('Error al obtener los pagos del mes corriente:', error);
    res.status(500).json({ message: 'Error al obtener los pagos', error });
  }
});

// Obtener ingresos por cada mes en el último año
router.get('/income-per-month', async (req, res) => {
  try {
    // Definir el rango de fechas (último año)
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    // Agrupar los pagos por mes y calcular el total facturado por mes
    const paymentsByMonth = await Payment.aggregate([
      {
        $match: {
          date: { $gte: oneYearAgo, $lte: now }
        }
      },
      {
        $group: {
          _id: { year: { $year: "$date" }, month: { $month: "$date" } },
          totalIncome: { $sum: "$amount" },
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }  // Ordenar por año y mes
      }
    ]);

    // Formatear los datos para enviarlos al frontend
    const incomePerMonth = paymentsByMonth.map(payment => ({
      month: payment._id.month,
      year: payment._id.year,
      totalIncome: payment.totalIncome,
    }));

    res.status(200).json(incomePerMonth);
  } catch (error) {
    console.error('Error al obtener los ingresos por mes:', error);
    res.status(500).json({ message: 'Error al obtener los ingresos por mes', error });
  }
});

  
  // Obtener un pago específico
  
  router.post('/', async (req, res) => {
    try {
      const { member } = req.body;
  
      const memberFound = await Member.findById(member);
  
      if (!memberFound) {
        return res.status(400).json({ message: 'Miembro no encontrado' });
      }
  
      const amount = memberFound.plan.price // Suponiendo que el monto del pago es el precio del plan
      console.log(memberFound.activities)
  
      const newPayment = new Payment({
        member: member,
        amount, // Utilizar el monto obtenido del plan del miembro
        date: new Date(), // Fecha del pago actual
        activity: memberFound.activities
      });
  
      await newPayment.save();
      res.status(201).json(newPayment);
    } catch (err) {
      res.status(500).json({ message: 'Error al crear el pago', error: err });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const payments = await Payment.find().populate('member').populate('activity');  
      res.status(200).json(payments);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener los pagos', error });
    }
  });
  
export default router;
  

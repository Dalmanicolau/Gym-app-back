import express from "express";
import moment from "moment-timezone";
import Payment, { PAYMENT_METHODS } from "../models/Payment.js";
import Member from "../models/Members.js";
import Activity from "../models/Activity.js";
import { validateObjectId, requireAdmin } from "../middleware/auth.js";
import { addMonths, monthRangeAR, dayRangeAR, todayStringAR, nextExpiration, TIMEZONE } from "../utils/dates.js";

const router = express.Router();

const NOT_VOIDED = { voided: { $ne: true } };
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Total facturado en un rango y su distribución por categoría
const summarize = async (start, end) => {
  const payments = await Payment.find({ date: { $gte: start, $lt: end }, ...NOT_VOIDED })
    .populate("activity", "category")
    .lean();

  const summary = { total: 0, classPayments: 0, musculacionPayments: 0, promotionPayments: 0, count: payments.length };
  for (const payment of payments) {
    summary.total += payment.amount;
    const hasMusculacion = payment.activity.some((act) => act?.category === "musculacion");
    const hasClass = payment.activity.some((act) => act?.category === "class");
    if (hasMusculacion && hasClass) summary.promotionPayments += payment.amount;
    else if (hasClass) summary.classPayments += payment.amount;
    else if (hasMusculacion) summary.musculacionPayments += payment.amount;
  }
  return summary;
};

// Facturación del mes corriente
router.get("/current", async (req, res) => {
  try {
    const now = moment().tz(TIMEZONE);
    const { start, end } = monthRangeAR(now.year(), now.month() + 1);
    res.status(200).json(await summarize(start, end));
  } catch (error) {
    console.error("Error al obtener los pagos del mes corriente:", error);
    res.status(500).json({ message: "Error al obtener los pagos" });
  }
});

// Ingresos por cada mes en el último año
router.get("/income-per-month", async (req, res) => {
  try {
    const now = moment().tz(TIMEZONE);
    const from = now.clone().subtract(11, "months").startOf("month").toDate();
    const paymentsByMonth = await Payment.aggregate([
      { $match: { date: { $gte: from }, ...NOT_VOIDED } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$date", timezone: TIMEZONE } },
          totalIncome: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.status(200).json(
      paymentsByMonth.map((p) => ({
        year: Number(p._id.slice(0, 4)),
        month: Number(p._id.slice(5, 7)),
        totalIncome: p.totalIncome,
      }))
    );
  } catch (error) {
    console.error("Error al obtener los ingresos por mes:", error);
    res.status(500).json({ message: "Error al obtener los ingresos por mes" });
  }
});

// Cierre de caja de un día (por defecto hoy): total y desglose por forma de pago
router.get("/daily", async (req, res) => {
  try {
    const date = String(req.query.date || todayStringAR());
    const range = dayRangeAR(date);
    if (!range) return res.status(400).json({ message: "Fecha inválida." });

    const payments = await Payment.find({ date: { $gte: range.start, $lt: range.end } })
      .sort({ date: 1 })
      .populate("member", "name")
      .populate("activity", "name")
      .lean();

    const byMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, { total: 0, count: 0 }]));
    let total = 0;
    let count = 0;
    for (const payment of payments) {
      if (payment.voided) continue;
      const method = byMethod[payment.method] ? payment.method : "efectivo";
      byMethod[method].total += payment.amount;
      byMethod[method].count += 1;
      total += payment.amount;
      count += 1;
    }
    res.status(200).json({ date, total, count, byMethod, payments });
  } catch (error) {
    console.error("Error al obtener el cierre de caja:", error);
    res.status(500).json({ message: "Error al obtener el cierre de caja" });
  }
});

// Pagos para exportar a Excel (de un mes 'YYYY-MM' o todos)
router.get("/export", async (req, res) => {
  try {
    const query = {};
    const monthMatch = /^(\d{4})-(\d{2})$/.exec(String(req.query.month || ""));
    if (monthMatch) {
      const { start, end } = monthRangeAR(Number(monthMatch[1]), Number(monthMatch[2]));
      query.date = { $gte: start, $lt: end };
    }
    const payments = await Payment.find(query)
      .sort({ date: -1 })
      .limit(20000)
      .populate("member", "name dni")
      .populate("activity", "name")
      .lean();
    res.status(200).json(payments);
  } catch (error) {
    console.error("Error al exportar pagos:", error);
    res.status(500).json({ message: "Error al exportar pagos" });
  }
});

// Facturación de un mes elegido (ej: /api/payments/11/2026)
router.get("/:month/:year", async (req, res) => {
  try {
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);
    if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) {
      return res.status(400).json({ message: "Mes o año inválido." });
    }
    const { start, end } = monthRangeAR(year, month);
    res.status(200).json(await summarize(start, end));
  } catch (error) {
    console.error("Error al obtener la facturación:", error);
    res.status(500).json({ message: "Error al obtener la facturación" });
  }
});

// Registrar un pago y extender el plan del socio.
// - Primer pago: el plan corre desde la fecha de inicio.
// - Plan vigente: los meses se suman al vencimiento actual (no se pierden días).
// - Plan vencido hace poco: los meses corren desde el vencimiento anterior.
// - Plan vencido hace más de 30 días: corren desde hoy (se puede elegir con startFrom).
router.post("/", async (req, res) => {
  try {
    const { member: memberId, method = "efectivo" } = req.body;
    const amount = Number(req.body.amount);
    const months = Number(req.body.months ?? 1);

    if (!/^[a-f\d]{24}$/i.test(String(memberId || ""))) return res.status(400).json({ message: "Socio inválido." });
    if (!Number.isFinite(amount) || amount < 0) return res.status(422).json({ message: "El monto debe ser un número mayor o igual a 0." });
    if (!Number.isInteger(months) || months < 1 || months > 24) return res.status(422).json({ message: "La cantidad de meses debe estar entre 1 y 24." });
    if (!PAYMENT_METHODS.includes(method)) return res.status(422).json({ message: "Método de pago inválido." });

    const member = await Member.findById(memberId);
    if (!member) return res.status(404).json({ message: "Socio no encontrado" });

    const startFrom = ['expiration', 'today'].includes(req.body.startFrom) ? req.body.startFrom : undefined;
    const newExpiration = nextExpiration(member.plan, months, undefined, startFrom);

    const payment = await Payment.create({
      member: member._id,
      memberName: member.name,
      amount,
      months,
      method,
      date: new Date(),
      activity: member.activities,
      previousExpiration: member.plan.expirationDate,
      previousLastRenewal: member.plan.lastRenewalDate,
    });

    member.plan.expirationDate = newExpiration;
    member.plan.lastRenewalDate = new Date();
    member.lastReminderAt = undefined;
    await member.save();
    await member.populate("activities", "name category price");

    res.status(201).json({ payment, member });
  } catch (err) {
    console.error("Error al crear el pago:", err);
    res.status(500).json({ message: "Error al crear el pago" });
  }
});

// Anular un pago: deja de contar en la facturación y el plan del socio vuelve atrás.
router.put("/:id/void", requireAdmin, validateObjectId(), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Pago no encontrado" });
    if (payment.voided) return res.status(400).json({ message: "El pago ya estaba anulado." });

    const member = await Member.findById(payment.member);
    if (member) {
      const laterPayment = await Payment.exists({
        member: member._id,
        _id: { $ne: payment._id },
        date: { $gt: payment.date },
        ...NOT_VOIDED,
      });
      if (!laterPayment && payment.previousExpiration) {
        // Es el último pago: se restaura exactamente el estado anterior.
        member.plan.expirationDate = payment.previousExpiration;
        member.plan.lastRenewalDate = payment.previousLastRenewal;
      } else if (payment.months) {
        member.plan.expirationDate = addMonths(member.plan.expirationDate, -payment.months);
      }
      await member.save();
    }

    payment.voided = true;
    payment.voidedAt = new Date();
    await payment.save();
    res.status(200).json(payment);
  } catch (error) {
    console.error("Error al anular el pago:", error);
    res.status(500).json({ message: "Error al anular el pago" });
  }
});

// Listado paginado de pagos, con búsqueda por socio o actividad y filtro por mes (YYYY-MM)
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const searchTerm = String(req.query.searchTerm || "").trim();
    const query = {};

    const monthMatch = /^(\d{4})-(\d{2})$/.exec(String(req.query.month || ""));
    if (monthMatch) {
      const { start, end } = monthRangeAR(Number(monthMatch[1]), Number(monthMatch[2]));
      query.date = { $gte: start, $lt: end };
    }

    if (searchTerm) {
      const regex = { $regex: escapeRegex(searchTerm), $options: "i" };
      const [members, activities] = await Promise.all([
        Member.find({ name: regex }).select("_id").lean(),
        Activity.find({ name: regex }).select("_id").lean(),
      ]);
      query.$or = [
        { member: { $in: members.map((m) => m._id) } },
        { memberName: regex },
        { activity: { $in: activities.map((a) => a._id) } },
      ];
    }

    const [payments, total, totals] = await Promise.all([
      Payment.find(query)
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("member", "name")
        .populate("activity", "name category")
        .lean(),
      Payment.countDocuments(query),
      Payment.aggregate([
        { $match: { ...query, ...NOT_VOIDED } },
        { $group: { _id: null, amount: { $sum: "$amount" } } },
      ]),
    ]);

    res.status(200).json({ payments, total, totalAmount: totals[0]?.amount || 0 });
  } catch (error) {
    console.error("Error al obtener los pagos:", error);
    res.status(500).json({ message: "Error al obtener los pagos" });
  }
});

export default router;

import express from "express";
import Member from "../models/Members.js";
import Activity from "../models/Activity.js";
import Payment from "../models/Payment.js";
import Attendance from "../models/Attendance.js";
import { validateObjectId, requireAdmin } from "../middleware/auth.js";
import { todayAR, toDateOnly, addDays, PLAN_MONTHS } from "../utils/dates.js";

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Valida y normaliza los datos de un socio. Devuelve { data } o { error }.
const parseMember = async (body, memberId = null) => {
  const { plan = {}, activities } = body;
  const name = String(body.name || "").trim();
  if (name.length < 2) return { error: "El nombre es obligatorio." };

  const email = String(body.email || "").trim().toLowerCase();
  if (email) {
    if (!EMAIL_REGEX.test(email)) return { error: "El email no es válido." };
    const emailTaken = await Member.findOne({ email, _id: { $ne: memberId } }).select("_id").lean();
    if (emailTaken) return { error: "El correo electrónico ya está en uso por otro socio.", status: 400 };
  }

  const dni = String(body.dni || "").replace(/\D/g, "");
  if (dni) {
    if (dni.length < 6 || dni.length > 9) return { error: "El DNI no es válido." };
    const dniTaken = await Member.findOne({ dni, _id: { $ne: memberId } }).select("name").lean();
    if (dniTaken) return { error: `Ese DNI ya está cargado en el socio ${dniTaken.name}.`, status: 400 };
  }

  if (!Object.keys(PLAN_MONTHS).includes(plan.type)) return { error: "Tipo de plan inválido." };

  const initDate = toDateOnly(plan.initDate);
  if (!initDate) return { error: "Fecha de inicio inválida." };

  const price = Number(plan.price);
  if (!Number.isFinite(price) || price < 0) return { error: "El precio debe ser un número mayor o igual a 0." };

  let birthday = null;
  if (body.birthday) {
    birthday = toDateOnly(body.birthday);
    if (!birthday || birthday > todayAR()) return { error: "Fecha de nacimiento inválida." };
  }

  if (!Array.isArray(activities) || activities.length === 0) {
    return { error: "Debe seleccionar al menos una actividad." };
  }
  const activityIds = [...new Set(activities.map((a) => String(a?._id || a)))];
  if (activityIds.some((id) => !/^[a-f\d]{24}$/i.test(id))) return { error: "Actividad inválida." };
  const found = await Activity.countDocuments({ _id: { $in: activityIds } });
  if (found !== activityIds.length) return { error: "Una o más actividades seleccionadas no existen.", status: 404 };

  return {
    data: {
      name,
      email: email || undefined,
      cellphone: String(body.cellphone || "").trim(),
      dni: dni || undefined,
      birthday,
      activities: activityIds,
      automaticRenewal: body.automaticRenewal !== undefined ? Boolean(body.automaticRenewal) : true,
      plan: { type: plan.type, initDate, price, promotion: Boolean(plan.promotion) },
    },
  };
};

// Crear socio. El plan queda "sin pago" hasta registrar el primer pago:
// el vencimiento arranca en la fecha de inicio y el pago lo extiende.
router.post("/", async (req, res) => {
  try {
    const { data, error, status } = await parseMember(req.body);
    if (error) return res.status(status || 422).json({ message: error });

    const newMember = await Member.create({
      ...data,
      plan: { ...data.plan, expirationDate: data.plan.initDate },
    });
    res.status(201).json(newMember);
  } catch (error) {
    console.error("Error al crear el socio:", error);
    res.status(500).json({ message: "Error al crear el socio" });
  }
});

// Editar socio. NO recalcula el vencimiento: solo cambia si se envía
// explícitamente una nueva fecha de vencimiento (corrección manual).
router.put("/:id", validateObjectId(), async (req, res) => {
  try {
    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ message: "El socio no existe." });

    const { data, error, status } = await parseMember(req.body, member._id);
    if (error) return res.status(status || 422).json({ message: error });

    let expirationDate = member.plan.expirationDate;
    if (req.body.plan?.expirationDate) {
      const manual = toDateOnly(req.body.plan.expirationDate);
      if (!manual) return res.status(422).json({ message: "Fecha de vencimiento inválida." });
      expirationDate = manual;
    } else if (!member.plan.lastRenewalDate) {
      // Todavía no pagó nunca: el vencimiento acompaña a la fecha de inicio.
      expirationDate = data.plan.initDate;
    }

    member.set({
      ...data,
      plan: { ...data.plan, expirationDate, lastRenewalDate: member.plan.lastRenewalDate },
    });
    await member.save();
    await member.populate("activities");
    res.status(200).json(member);
  } catch (error) {
    console.error("Error al actualizar el socio:", error);
    if (error.name === "ValidationError") {
      return res.status(422).json({ message: "Error de validación en los datos proporcionados." });
    }
    res.status(500).json({ message: "Ocurrió un error interno al actualizar el socio." });
  }
});

// Filtros por estado del plan
const statusFilter = (status) => {
  const today = todayAR();
  switch (status) {
    case "activos":
      return { "plan.expirationDate": { $gte: today } };
    case "por-vencer":
      return { "plan.expirationDate": { $gte: today, $lte: addDays(today, 7) } };
    case "vencidos":
      return { "plan.expirationDate": { $lt: today } };
    default:
      return {};
  }
};

// Listado paginado con búsqueda (nombre, email o celular) y filtro por estado
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const searchTerm = String(req.query.searchTerm || "").trim();

    const search = searchTerm
      ? {
          $or: ["name", "email", "cellphone", "dni"].map((field) => ({
            [field]: { $regex: escapeRegex(searchTerm), $options: "i" },
          })),
        }
      : {};
    const query = { ...search, ...statusFilter(req.query.status) };

    const [members, total, counts] = await Promise.all([
      Member.find(query)
        .sort({ name: 1 })
        .collation({ locale: "es", strength: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("activities", "name category price")
        .lean(),
      Member.countDocuments(query),
      Promise.all(
        ["todos", "activos", "por-vencer", "vencidos"].map((s) =>
          Member.countDocuments({ ...search, ...statusFilter(s) })
        )
      ),
    ]);

    res.status(200).json({
      members,
      total,
      counts: { todos: counts[0], activos: counts[1], "por-vencer": counts[2], vencidos: counts[3] },
    });
  } catch (error) {
    console.error("Error al obtener socios:", error);
    res.status(500).json({ message: "Error al obtener socios" });
  }
});

// Listado liviano de todos los socios (solo datos básicos)
router.get("/all", async (req, res) => {
  try {
    const members = await Member.find({}, "name cellphone plan.expirationDate").sort({ name: 1 }).lean();
    res.status(200).json(members);
  } catch (error) {
    console.error("Error al obtener los socios:", error);
    res.status(500).json({ message: "Error al obtener los socios" });
  }
});

// Todos los socios con sus datos, para exportar a Excel
router.get("/export", async (req, res) => {
  try {
    const members = await Member.find({}).sort({ name: 1 }).populate("activities", "name").lean();
    res.status(200).json(members);
  } catch (error) {
    console.error("Error al exportar socios:", error);
    res.status(500).json({ message: "Error al exportar socios" });
  }
});

// Ficha del socio: datos, historial de pagos y últimas asistencias
router.get("/:id", validateObjectId(), async (req, res) => {
  try {
    const [member, payments, attendances, attendanceCount] = await Promise.all([
      Member.findById(req.params.id).populate("activities", "name category price").lean(),
      Payment.find({ member: req.params.id }).sort({ date: -1 }).limit(100).populate("activity", "name").lean(),
      Attendance.find({ member: req.params.id }).sort({ date: -1 }).limit(30).lean(),
      Attendance.countDocuments({ member: req.params.id }),
    ]);
    if (!member) return res.status(404).json({ message: "Socio no encontrado" });
    const totalPaid = payments.filter((p) => !p.voided).reduce((sum, p) => sum + p.amount, 0);
    res.status(200).json({ member, payments, attendances, attendanceCount, totalPaid });
  } catch (error) {
    console.error("Error al obtener el socio:", error);
    res.status(500).json({ message: "Error al obtener el socio" });
  }
});

// Eliminar socio. Sus pagos se conservan (con el nombre guardado) para no perder la facturación.
router.delete("/:id", requireAdmin, validateObjectId(), async (req, res) => {
  try {
    const deletedMember = await Member.findByIdAndDelete(req.params.id);
    if (!deletedMember) return res.status(404).json({ message: "Socio no encontrado" });
    await Payment.updateMany(
      { member: deletedMember._id, memberName: { $in: [null, ""] } },
      { memberName: deletedMember.name }
    );
    await Attendance.deleteMany({ member: deletedMember._id });
    res.status(200).json(deletedMember);
  } catch (error) {
    console.error("Error al eliminar socio:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;

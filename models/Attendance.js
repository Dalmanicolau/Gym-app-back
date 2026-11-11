import mongoose from 'mongoose';

// Un registro por cada ingreso de un socio al gimnasio.
const attendanceSchema = new mongoose.Schema({
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  memberName: String,
  date: { type: Date, default: Date.now },
  // Día del ingreso según el calendario argentino ('YYYY-MM-DD'), para agrupar fácil.
  day: { type: String, required: true },
  // true si entró con el plan vencido o sin pago (ingreso autorizado a mano).
  expired: { type: Boolean, default: false },
});

attendanceSchema.index({ day: 1, date: -1 });
attendanceSchema.index({ member: 1, date: -1 });

const Attendance = mongoose.model('Attendance', attendanceSchema);
export default Attendance;

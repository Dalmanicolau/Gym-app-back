import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  cellphone: { type: String, trim: true },
  dni: { type: String, trim: true },
  birthday: Date,
  plan: {
    type: { type: String, enum: ['Mensual', 'Semestral'], required: true },
    initDate: { type: Date, required: true },
    expirationDate: { type: Date, required: true },
    // Fecha del último pago. Vacío = todavía no registró ningún pago.
    lastRenewalDate: Date,
    price: { type: Number, required: true, min: 0 },
    promotion: Boolean,
  },
  activities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Activity' }],
  automaticRenewal: { type: Boolean, default: true },
  // Última vez que se le envió un recordatorio por WhatsApp.
  lastReminderAt: Date,
}, { timestamps: true });

// Índices para que las búsquedas y el panel no recorran toda la colección.
memberSchema.index({ 'plan.expirationDate': 1 });
memberSchema.index({ name: 1 });
memberSchema.index({ email: 1 });
memberSchema.index({ dni: 1 });

const Member = mongoose.model('Member', memberSchema);
export default Member;

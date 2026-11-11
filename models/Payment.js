import mongoose from 'mongoose';

export const PAYMENT_METHODS = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  months: {
    type: Number
  },
  method: {
    type: String,
    enum: PAYMENT_METHODS,
    default: 'efectivo'
  },
  member: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Member",
    required: true
  },
  // Copia del nombre, para que el pago siga siendo legible si se elimina el socio.
  memberName: String,
  activity: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Activity",
  }],
  date: {
    type: Date,
    default: Date.now
  },
  // Datos para poder anular el pago y devolver el vencimiento a como estaba.
  previousExpiration: Date,
  previousLastRenewal: Date,
  voided: { type: Boolean, default: false },
  voidedAt: Date,
},
{
  strictPopulate: false,
}
);

paymentSchema.index({ date: -1 });
paymentSchema.index({ member: 1, date: -1 });

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;

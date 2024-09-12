import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  name: String,
  email: String,
  cellphone: String,
  plan: {
    type: { type: String, enum: ['Mensual', 'Semestral'], required: true },
    initDate: { type: Date, required: true },
    expirationDate: { type: Date, required: true },
    lastRenewalDate: Date,
    price: { type: Number, required: true },
    promotion: Boolean,
  },
  activities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Activity' }],
  automaticRenewal: { type: Boolean, default: true },
}, { timestamps: true });

const Member = mongoose.model('Member', memberSchema);
export default Member;

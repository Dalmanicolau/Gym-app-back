import mongoose from 'mongoose';
import Notification from "./Notification.js";

const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true
  },
  months: {
    type: Number
  },
  member: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Member",
    required: true
  },
  activity: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Activity",
  }],
  date: {
    type: Date,
    default: Date.now
  }
},
{
  strictPopulate: false,
}
);

paymentSchema.pre('findByIdAndRemove', function(next) {
  Notification.deleteMany({ payment: this._id });
  next();
});

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;

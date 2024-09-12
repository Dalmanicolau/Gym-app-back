import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  available: { type: Boolean, default: true },
  price: { type: Number, required: true },
  category: { enum: ['class', 'musculacion'], type: String, required: true}
}, { timestamps: true });

const Activity = mongoose.model('Activity', activitySchema);
export default Activity;

import mongoose from 'mongoose';

export const ROLES = ['admin', 'recepcion'];

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    // admin: puede todo. recepcion: cobra y registra, pero no anula pagos, no borra
    // socios, no cambia precios ni maneja usuarios. Los usuarios viejos quedan como admin.
    role: { type: String, enum: ROLES, default: 'admin' },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
export default User;

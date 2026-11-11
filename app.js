import './db.js';
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import memberRoutes from './routes/members.js';
import activityRoutes from './routes/activities.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import paymentsRoutes from './routes/payments.js';
import notificationRoutes from './routes/notification.js'
import attendanceRoutes from './routes/attendance.js';
import priceRoutes from './routes/prices.js';
import backupRoutes from './routes/backup.js';
import { protectRoute, requireAdmin } from './middleware/auth.js';
import { startBackupSchedule } from './utils/backup.js';

dotenv.config();

const { FRONTEND_URL, PORT = 3001 } = process.env;

if (!process.env.JWT_SECRET) {
    console.error('Falta JWT_SECRET en el archivo .env: sin eso no se puede iniciar sesión.');
    process.exit(1);
}

const app = express();

app.use(cors({
    // FRONTEND_URL admite varias direcciones separadas por coma
    origin: FRONTEND_URL ? FRONTEND_URL.split(',').map((url) => url.trim()) : false,
    credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

// Chequeo rápido de que el servidor está vivo
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Login, logout y alta del primer usuario son públicos (se controlan dentro de users.js).
app.use('/api/users', userRoutes);

// Todo lo demás exige una sesión válida.
app.use('/api/members', protectRoute, memberRoutes);
app.use('/api/activities', protectRoute, activityRoutes);
app.use('/api/dashboard', protectRoute, dashboardRoutes);
app.use('/api/payments', protectRoute, paymentsRoutes);
app.use('/api/notifications', protectRoute, notificationRoutes);
app.use('/api/attendance', protectRoute, attendanceRoutes);
// Solo administradores
app.use('/api/prices', protectRoute, requireAdmin, priceRoutes);
app.use('/api/backup', protectRoute, requireAdmin, backupRoutes);

app.use('/api', (req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));

// JSON mal formado u otros errores no controlados
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'El cuerpo del pedido no es JSON válido.' });
    }
    console.error('Error no controlado:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log('server running on port', PORT);
    });
    // Copia de seguridad diaria de la base en la carpeta "backups"
    startBackupSchedule();
}

export default app;

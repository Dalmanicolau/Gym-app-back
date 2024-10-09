import './db.js';
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import memberRoutes from './routes/members.js';
import activityRoutes from './routes/activities.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import paymentsRoutes from './routes/payments.js';
import notificationRoutes from './routes/notification.js'
import { runNotificationCronJob } from './cron-job/cron.js'; // Adjust the path as needed
import cron from 'node-cron';


dotenv.config();

const { FRONTEND_URL } = process.env;
const app = express();


app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(cors({
     origin: FRONTEND_URL  
}));
app.use(express.json());

app.use('/api/members', memberRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/notifications', notificationRoutes);

cron.schedule('0 0 * * *', () => {
    console.log('Running notification cron job at:', new Date().toISOString());
    runNotificationCronJob().catch(error => {
      console.error('Error in notification cron job:', error);
    });
  });

app.listen(3001, () => {
    console.log('server running on port', 3001);
    console.log('Cron job scheduled to run every minute');
});

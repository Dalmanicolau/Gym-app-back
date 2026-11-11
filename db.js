import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const { DB_CONECTION } = process.env;

if (process.env.NODE_ENV !== 'test') {
    mongoose.connect(DB_CONECTION)
    .then(() => {
        console.log('Database connected succesfuly');
    }).catch(err => {
        console.error('No se pudo conectar a la base de datos:', err.message);
    });
}

export default mongoose;

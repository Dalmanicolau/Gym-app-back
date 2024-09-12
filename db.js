import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const { DB_CONECTION } = process.env;

mongoose.connect(DB_CONECTION)
.then(() => {
    console.log('Database connected succesfuly');
}).catch(err => {
    console.log(err)
});

export default mongoose;

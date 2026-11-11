// Cambia la contraseña de un usuario cuando se la olvidó.
//
//   node scripts/reset-password.js                      -> muestra los usuarios que existen
//   node scripts/reset-password.js USUARIO NUEVA_CLAVE  -> le pone esa contraseña
//
// Se corre desde la carpeta del backend (usa la base configurada en el archivo .env).
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

dotenv.config();

const [username, newPassword] = process.argv.slice(2);

try {
  await mongoose.connect(process.env.DB_CONECTION);

  if (!username) {
    const users = await User.find({}, 'username').lean();
    console.log(users.length ? 'Usuarios existentes:' : 'No hay ningún usuario creado.');
    users.forEach((u) => console.log(`  - ${u.username}`));
    console.log('\nPara cambiar una contraseña: node scripts/reset-password.js USUARIO NUEVA_CLAVE');
  } else if (!newPassword || newPassword.length < 6) {
    console.log('Falta la nueva contraseña (mínimo 6 caracteres).');
  } else {
    const user = await User.findOne({ username });
    if (!user) {
      console.log(`No existe el usuario "${username}". Corré el comando sin nada para ver la lista.`);
    } else {
      user.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
      await user.save();
      console.log(`Listo: ya podés entrar con el usuario "${username}" y la nueva contraseña.`);
    }
  }
} catch (error) {
  console.error('No se pudo completar:', error.message);
} finally {
  await mongoose.disconnect();
}

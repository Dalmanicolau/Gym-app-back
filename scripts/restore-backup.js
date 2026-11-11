// Restaura la base de datos desde una copia de seguridad.
// ¡ATENCIÓN! Reemplaza TODO el contenido actual de la base por el de la copia.
//
//   node scripts/restore-backup.js                                   -> muestra las copias disponibles
//   node scripts/restore-backup.js backups/ARCHIVO.json              -> muestra qué contiene esa copia
//   node scripts/restore-backup.js backups/ARCHIVO.json --confirmar  -> restaura
//
// Antes de restaurar guarda automáticamente una copia del estado actual.
import dotenv from 'dotenv';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import { listBackups, saveBackup, BACKUP_DIR } from '../utils/backup.js';

dotenv.config();
const { EJSON } = mongoose.mongo.BSON;
const [file, flag] = process.argv.slice(2);

try {
  if (!file) {
    const files = await listBackups();
    console.log(files.length ? `Copias en ${BACKUP_DIR}:` : `No hay copias en ${BACKUP_DIR}.`);
    files.forEach((f) => console.log(`  - backups/${f}`));
  } else {
    const backup = EJSON.parse(await fs.readFile(file, 'utf8'), { relaxed: false });
    if (!backup?.collections) throw new Error('El archivo no es una copia de seguridad válida.');
    console.log(`Copia del ${new Date(backup.createdAt).toLocaleString('es-AR')}:`);
    for (const [name, docs] of Object.entries(backup.collections)) console.log(`  - ${name}: ${docs.length} registros`);

    if (flag !== '--confirmar') {
      console.log('\nNo se cambió nada. Para restaurar, repetí el comando agregando --confirmar al final.');
    } else {
      await mongoose.connect(process.env.DB_CONECTION);
      console.log('\nGuardando una copia del estado actual:', await saveBackup());
      const db = mongoose.connection.db;
      for (const [name, docs] of Object.entries(backup.collections)) {
        await db.collection(name).deleteMany({});
        if (docs.length) await db.collection(name).insertMany(docs);
      }
      console.log('Listo: la base quedó como estaba en esa copia.');
    }
  }
} catch (error) {
  console.error('No se pudo completar:', error.message);
} finally {
  await mongoose.disconnect();
}

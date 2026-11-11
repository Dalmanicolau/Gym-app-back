import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import moment from 'moment-timezone';
import { TIMEZONE } from './dates.js';

const { EJSON } = mongoose.mongo.BSON;

// Las copias se guardan en la carpeta "backups" del backend (o en BACKUP_DIR si está en el .env).
export const BACKUP_DIR = process.env.BACKUP_DIR
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'backups');
const KEEP = 14; // cantidad de copias que se conservan
const PREFIX = 'gimnasio-';

// Arma el contenido de la copia: todas las colecciones de la base, en un único JSON.
export const buildBackup = async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('La base de datos no está conectada.');
  const collections = {};
  for (const { name } of await db.listCollections().toArray()) {
    if (name.startsWith('system.')) continue;
    collections[name] = await db.collection(name).find({}).toArray();
  }
  return EJSON.stringify({ createdAt: new Date(), collections }, { relaxed: false });
};

export const listBackups = async () => {
  try {
    const files = (await fs.readdir(BACKUP_DIR)).filter((f) => f.startsWith(PREFIX) && f.endsWith('.json')).sort();
    return files;
  } catch {
    return [];
  }
};

// Guarda una copia en disco y borra las más viejas.
export const saveBackup = async () => {
  const content = await buildBackup();
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const file = `${PREFIX}${moment().tz(TIMEZONE).format('YYYY-MM-DD_HH-mm')}.json`;
  await fs.writeFile(path.join(BACKUP_DIR, file), content);
  const files = await listBackups();
  for (const old of files.slice(0, Math.max(0, files.length - KEEP))) {
    await fs.unlink(path.join(BACKUP_DIR, old)).catch(() => {});
  }
  return file;
};

// Hace la copia del día si todavía no existe. Se llama al arrancar y cada hora,
// así funciona aunque el servidor no esté prendido a una hora fija.
export const ensureDailyBackup = async () => {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');
    const files = await listBackups();
    if (files.some((f) => f.startsWith(`${PREFIX}${today}`))) return;
    const file = await saveBackup();
    console.log('Copia de seguridad automática guardada:', file);
  } catch (error) {
    console.error('No se pudo hacer la copia de seguridad automática:', error.message);
  }
};

export const startBackupSchedule = () => {
  mongoose.connection.once('open', ensureDailyBackup);
  if (mongoose.connection.readyState === 1) ensureDailyBackup();
  setInterval(ensureDailyBackup, 60 * 60 * 1000).unref();
};

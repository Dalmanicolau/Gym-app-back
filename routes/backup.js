import express from 'express';
import moment from 'moment-timezone';
import { buildBackup, listBackups, saveBackup, BACKUP_DIR } from '../utils/backup.js';
import { TIMEZONE } from '../utils/dates.js';

const router = express.Router();

// Estado de las copias automáticas
router.get('/', async (req, res) => {
  try {
    const files = await listBackups();
    res.status(200).json({ folder: BACKUP_DIR, count: files.length, last: files[files.length - 1] || null });
  } catch (error) {
    res.status(500).json({ message: 'No se pudo consultar las copias de seguridad' });
  }
});

// Hacer una copia ahora en la carpeta de copias
router.post('/', async (req, res) => {
  try {
    res.status(201).json({ file: await saveBackup() });
  } catch (error) {
    console.error('Error al hacer la copia de seguridad:', error);
    res.status(500).json({ message: 'No se pudo hacer la copia de seguridad' });
  }
});

// Descargar una copia completa de la base en un archivo
router.get('/download', async (req, res) => {
  try {
    const content = await buildBackup();
    const name = `gimnasio-${moment().tz(TIMEZONE).format('YYYY-MM-DD_HH-mm')}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(content);
  } catch (error) {
    console.error('Error al descargar la copia de seguridad:', error);
    res.status(500).json({ message: 'No se pudo generar la copia de seguridad' });
  }
});

export default router;

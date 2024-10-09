import Member from '../models/Members.js';
import Notification from '../models/Notification.js';

export async function runNotificationCronJob() {
  console.log(`Running notification cron job at ${new Date().toISOString()}`);
  
  try {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    // Encontrar los miembros cuyos planes expiran mañana
    const expiringMembers = await Member.find({
      'plan.expirationDate': { $gte: today, $lte: tomorrow }
    });

    console.log(`Found ${expiringMembers.length} expiring members`);

    const notificationsToInsert = [];

    for (const member of expiringMembers) {
      // Mantener la fecha "today" sin modificar
      const startOfToday = new Date(today.setHours(0, 0, 0, 0));
      const endOfToday = new Date(today.setHours(23, 59, 59, 999));

      // Verificar si ya existe una notificación creada hoy para este miembro
      const existingNotifications = await Notification.find({
        member: member._id,
        createdAt: { $gte: startOfToday, $lt: endOfToday }
      });

      // Si no existe una notificación para este miembro hoy, crear una nueva
      if (existingNotifications.length === 0) {
        const notification = {
          title: `El plan de ${member.name} vence el ${member.plan.expirationDate.toLocaleDateString('es-ES')}.`,
          description: `El plan de ${member.name} vence el ${member.plan.expirationDate.toLocaleDateString('es-ES')}.`,
          member: member._id,
          createdAt: new Date(), // Crear con la fecha y hora actual
          isUnRead: true
        };

        notificationsToInsert.push(notification);
      }
    }

    // Si hay nuevas notificaciones, insertarlas
    if (notificationsToInsert.length > 0) {
      const insertedNotifications = await Notification.insertMany(notificationsToInsert);
      console.log(`Created ${insertedNotifications.length} new notifications:`, insertedNotifications);
    } else {
      console.log('No new notifications created.');
    }
  } catch (error) {
    console.error('Error generating notifications:', error);
    throw error; // Rethrow the error so it can be caught in app.js
  }
}

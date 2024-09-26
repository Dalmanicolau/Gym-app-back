import cron from 'node-cron';
import Member from '../models/Members'; // Asegúrate de que la ruta sea correcta
import Notification from '../models/Notification'; // Asegúrate de que la ruta sea correcta

// Tarea programada para ejecutarse una vez al día
cron.schedule('0 0 * * *', async () => {
  try {
    const today = new Date();
    const nextWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

    const expiringMembers = await Member.find({
      'plan.expirationDate': { $lte: nextWeek }
    });

    const notificationsToInsert = [];

    for (const member of expiringMembers) {
      const existingNotifications = await Notification.find({
        member: member._id,
        createdAt: { $gte: new Date(today.setHours(0, 0, 0, 0)), $lt: new Date(today.setHours(23, 59, 59, 999)) }
      });

      if (existingNotifications.length === 0) {
        const notification = {
          title: `El plan de ${member.name} vence el ${member.plan.expirationDate.toLocaleDateString('es-ES')}.`,
          description: `El plan de ${member.name} vence el ${member.plan.expirationDate.toLocaleDateString('es-ES')}.`,
          member: member._id,
          createdAt: today,
          isUnRead: true
        };

        notificationsToInsert.push(notification);
      }
    }
    console.log(`Ejecutando cron job a las ${today.toISOString()}`);
    console.log(`Miembros que expiran: ${expiringMembers.length}`);


    if (notificationsToInsert.length > 0) {
      await Notification.insertMany(notificationsToInsert);
      console.log(`Se generaron ${notificationsToInsert.length} nuevas notificaciones.`);
    } else {
      console.log('No se generaron nuevas notificaciones.');
    }
  } catch (error) {
    console.error('Error al generar notificaciones:', error);
  }
});

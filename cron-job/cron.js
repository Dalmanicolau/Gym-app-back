import cron from 'node-cron';
import Member from '../models/Members'; // Asegúrate de que la ruta sea correcta
import Notification from '../models/Notification'; // Asegúrate de que la ruta sea correcta

// Tarea programada para ejecutarse una vez al día a la medianoche
cron.schedule('0 0 * * *', async () => {
  try {
    const today = new Date();
    const nextWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

    // Obtener miembros cuyos planes vencen dentro de una semana
    const expiringMembers = await Member.find({
      'plan.expirationDate': { $lte: nextWeek }
    });

    const notificationsToInsert = [];

    // Generar notificaciones para miembros con planes por expirar
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

    // Generar notificaciones de cumpleaños
    const birthdayMembers = await Member.find();
    for (const member of birthdayMembers) {
      const birthday = new Date(member.birthday); // Suponiendo que `birthday` es una fecha completa con año incluido
      if (birthday.getDate() === today.getDate() && birthday.getMonth() === today.getMonth()) {
        const existingBirthdayNotification = await Notification.find({
          member: member._id,
          title: { $regex: 'cumpleaños' }, // Verificar si ya existe una notificación de cumpleaños
          createdAt: { $gte: new Date(today.setHours(0, 0, 0, 0)), $lt: new Date(today.setHours(23, 59, 59, 999)) }
        });

        if (existingBirthdayNotification.length === 0) {
          const birthdayNotification = {
            title: `Hoy es el cumpleaños de ${member.name}! 🎉`,
            description: `¡Feliz cumpleaños a ${member.name}! 🎂🎈`,
            member: member._id,
            createdAt: today,
            isUnRead: true
          };

          notificationsToInsert.push(birthdayNotification);
        }
      }
    }

    // Insertar notificaciones generadas
    if (notificationsToInsert.length > 0) {
      await Notification.insertMany(notificationsToInsert);
      console.log(`Se generaron ${notificationsToInsert.length} nuevas notificaciones.`);
    } else {
      console.log('No se generaron nuevas notificaciones.');
    }

    // Eliminar notificaciones pasadas (vencidas)
    const notificationsToDelete = await Notification.find({
      createdAt: { $lt: new Date(today.setHours(0, 0, 0, 0)) }
    });

    if (notificationsToDelete.length > 0) {
      const notificationIds = notificationsToDelete.map(n => n._id);
      await Notification.deleteMany({ _id: { $in: notificationIds } });
      console.log(`Se eliminaron ${notificationsToDelete.length} notificaciones vencidas.`);
    } else {
      console.log('No se encontraron notificaciones vencidas para eliminar.');
    }

  } catch (error) {
    console.error('Error al generar notificaciones:', error);
  }
});

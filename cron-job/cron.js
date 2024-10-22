import Member from '../models/Members.js';
import Notification from '../models/Notification.js';

export async function runNotificationCronJob() {
  console.log(`Running notification cron job at ${new Date().toISOString()}`);
  
  try {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    // Find members whose plans expire tomorrow
    const expiringMembers = await Member.find({
      'plan.expirationDate': { $gte: today, $lte: tomorrow }
    });

    console.log(`Found ${expiringMembers.length} expiring members`);

    const notificationsToInsert = [];

    for (const member of expiringMembers) {
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      // Check if a notification already exists for this member today
      const existingNotifications = await Notification.find({
        member: member._id,
        createdAt: { $gte: startOfToday, $lt: endOfToday }
      });

      // If no notification exists for this member today, create a new one
      if (existingNotifications.length === 0) {
        const notification = {
          title: `El plan de ${member.name} vence el ${member.plan.expirationDate.toLocaleDateString('es-ES')}.`,
          description: `El plan de ${member.name} vence el ${member.plan.expirationDate.toLocaleDateString('es-ES')}.`,
          member: member._id,
          createdAt: new Date(),
          isUnRead: true
        };

        notificationsToInsert.push(notification);
      }
    }

    // Insert new notifications if any
    if (notificationsToInsert.length > 0) {
      const insertedNotifications = await Notification.insertMany(notificationsToInsert);
      console.log(`Created ${insertedNotifications.length} new notifications:`, insertedNotifications);
    } else {
      console.log('No new notifications created.');
    }

    // Clean up old notifications
    await cleanupNotifications();

  } catch (error) {
    console.error('Error generating notifications:', error);
    throw error;
  }
}

async function cleanupNotifications() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Remove notifications for plans that have already expired
    const expiredNotificationsResult = await Notification.deleteMany({
      $or: [
        { 'member.plan.expirationDate': { $lt: today } },
        { 
          $and: [
            { 'member.plan.expirationDate': { $exists: true } },
            { 'member.plan.expirationDate': { $ne: null } },
            { 'member.plan.expirationDate': { $lt: today } }
          ]
        }
      ]
    });
    console.log(`Removed ${expiredNotificationsResult.deletedCount} expired notifications`);

    // Find members with active plans
    const membersWithActivePlans = await Member.find({
      'plan.expirationDate': { $gte: today }
    }).select('_id');

    const activeMemberIds = membersWithActivePlans.map(member => member._id);

    // Remove notifications for members who have renewed their plans
    const renewedMembersNotificationsResult = await Notification.deleteMany({
      member: { $in: activeMemberIds }
    });
    console.log(`Removed ${renewedMembersNotificationsResult.deletedCount} notifications for renewed plans`);

  } catch (error) {
    console.error('Error cleaning up notifications:', error);
  }
}
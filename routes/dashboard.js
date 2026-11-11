import express from "express";
import moment from "moment-timezone";
import Member from "../models/Members.js";
import Activity from "../models/Activity.js";
import Payment from "../models/Payment.js";
import { todayAR, addDays, TIMEZONE } from "../utils/dates.js";
import { daysUntilBirthday } from "../utils/notifications.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const now = moment().tz(TIMEZONE);
    const today = todayAR();
    const nextWeek = addDays(today, 7);
    const last12Months = Array.from({ length: 12 }, (_, i) =>
      now.clone().subtract(11 - i, "months").format("YYYY-MM")
    );
    const yearStart = now.clone().subtract(11, "months").startOf("month").toDate();
    const notVoided = { voided: { $ne: true } };

    // Todas las consultas salen juntas (antes iban una detrás de otra,
    // más dos consultas extra por cada actividad).
    const [members, activities, paymentStats] = await Promise.all([
      Member.find({}, "name cellphone birthday activities createdAt plan.initDate plan.expirationDate").lean(),
      Activity.find({}, "name category available").lean(),
      Payment.aggregate([
        { $match: notVoided },
        {
          $facet: {
            total: [{ $group: { _id: null, amount: { $sum: "$amount" } } }],
            byMonth: [
              { $match: { date: { $gte: yearStart } } },
              {
                $group: {
                  _id: { $dateToString: { format: "%Y-%m", date: "$date", timezone: TIMEZONE } },
                  totalIncome: { $sum: "$amount" },
                },
              },
            ],
            byActivity: [
              { $match: { date: { $gte: yearStart } } },
              { $project: { amount: 1, activity: 1, count: { $size: { $ifNull: ["$activity", []] } } } },
              { $unwind: "$activity" },
              { $group: { _id: "$activity", income: { $sum: { $divide: ["$amount", "$count"] } } } },
            ],
          },
        },
      ]),
    ]);

    const stats = paymentStats[0] || { total: [], byMonth: [], byActivity: [] };
    const activityById = new Map(activities.map((a) => [String(a._id), a]));

    // Ingresos
    const incomeByMonth = last12Months.map(
      (ym) => stats.byMonth.find((p) => p._id === ym)?.totalIncome || 0
    );
    const activityByIncome = stats.byActivity
      .filter((i) => activityById.has(String(i._id)))
      .map((i) => ({ sport: activityById.get(String(i._id)), income: Math.round(i.income) }))
      .sort((a, b) => b.income - a.income);

    // Socios
    const monthAgo = now.clone().subtract(1, "month").toDate();
    let activeMembersCount = 0;
    let expiredMembersCount = 0;
    let membersPerMonth = 0;
    const expiringMembers = [];
    const birthdays = [];
    const membersByActivity = new Map();
    const activeMembersTable = last12Months.map(() => 0);
    const monthBounds = last12Months.map((ym) => {
      const start = new Date(`${ym}-01T00:00:00.000Z`);
      return { start, end: moment.utc(start).add(1, "month").toDate() };
    });

    for (const member of members) {
      const init = member.plan?.initDate;
      const exp = member.plan?.expirationDate;
      const isActive = exp && exp >= today;

      if (isActive) activeMembersCount += 1;
      else expiredMembersCount += 1;
      if (member.createdAt >= monthAgo) membersPerMonth += 1;

      if (isActive && exp <= nextWeek) {
        expiringMembers.push({ _id: member._id, name: member.name, cellphone: member.cellphone, expirationDate: exp });
      }

      const days = daysUntilBirthday(member.birthday, today);
      if (days !== null && days <= 7) {
        birthdays.push({ _id: member._id, name: member.name, birthday: member.birthday, daysLeft: days });
      }

      if (isActive) {
        for (const activityId of member.activities || []) {
          const key = String(activityId);
          membersByActivity.set(key, (membersByActivity.get(key) || 0) + 1);
        }
      }

      // Activo en un mes = el plan cubría algún día de ese mes.
      if (init && exp) {
        monthBounds.forEach(({ start, end }, i) => {
          if (init < end && exp >= start) activeMembersTable[i] += 1;
        });
      }
    }

    const sportsByMembers = [...membersByActivity.entries()]
      .filter(([id]) => activityById.has(id))
      .map(([id, count]) => ({ sport: activityById.get(id), members: count }))
      .sort((a, b) => b.members - a.members);

    res.send({
      membersCount: members.length,
      activeMembersCount,
      expiredMembersCount,
      expiringMembersCount: expiringMembers.length,
      membersPerMonth,
      totalActivity: activities.filter((a) => a.available !== false).length,
      totalIncome: stats.total[0]?.amount || 0,
      monthIncome: incomeByMonth[11],
      lastMonthIncome: incomeByMonth[10],
      incomeByMonth,
      table: activeMembersTable,
      monthsReference: last12Months,
      activityByIncome,
      sportsByMembers,
      expiringMembers: expiringMembers.sort((a, b) => a.expirationDate - b.expirationDate).slice(0, 8),
      birthdays: birthdays.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 8),
    });
  } catch (err) {
    console.error("Error al obtener datos del dashboard:", err);
    res.status(500).json({ message: "Error al obtener datos del dashboard" });
  }
});

export default router;

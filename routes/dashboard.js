import express from "express";
import Member from "../models/Members.js";
import Activity from "../models/Activity.js";
import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";
import moment from 'moment-timezone';

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const today = new Date();
    const monthDate = new Date(today.setMonth(today.getMonth() - 1));

    const membersCount = await Member.countDocuments({});

    const membersPerMonth = await Member.countDocuments({
      createdAt: { $gte: monthDate },
    });

    const totalActivity = await Activity.countDocuments({});
     
    // Contador de planes por vencer
    const currentDay = moment().tz("America/Argentina/Cordoba");
    const nextWeek = currentDay.clone().add(7, 'days').toDate();
    console.log(nextWeek)
    const expiringMembersCount = await Member.countDocuments({
      'plan.expirationDate': { $lte: nextWeek },
    });

    const payments = await Payment.find();

    const table = Array(12).fill(0);
    const monthlySubs = await Member.aggregate([
      { $group: { _id: { $month: "$createdAt" }, subs: { $sum: 1 } } }
    ]);

    monthlySubs.forEach((item) => {
      table[item._id - 1] = item.subs;
    });

    // Obtener ingresos por mes
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    const paymentsByMonth = await Payment.aggregate([
      { $match: { date: { $gte: oneYearAgo, $lte: now } } },
      { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } }, totalIncome: { $sum: "$amount" } } },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    const incomeByMonth = Array(12).fill(0);
    paymentsByMonth.forEach((payment) => {
      const monthIndex = payment._id.month - 1;
      incomeByMonth[monthIndex] += payment.totalIncome;
    });

    const sportsIncome = await Payment.aggregate([
      {
        $group: {
          _id: "$activity",
          income: { $sum: "$amount" },
        },
      },
    ]);

    const activityByIncome = await Promise.all(
      sportsIncome.map(async (i) => {
        const sport = await Activity.findById(i._id);
        const income = i.income;
        return { sport, income };
      })
    );

    const totalIncome = payments.reduce((accumulator, object) => {
      return accumulator + object.amount;
    }, 0);

    const notifications = await Notification.find({});

    const sportsMembers = await Payment.aggregate([
      { $group: { _id: "$activity", count: { $sum: 1 } } },
    ]);

    const sportsByMembers = await Promise.all(
      sportsMembers.map(async (i) => {
        const sport = await Activity.findById(i._id);
        const members = i.count;
        return { sport, members };
      })
    );

    res.send({
      membersCount,
      totalIncome,
      membersPerMonth,
      table,
      activityByIncome,
      notifications,
      sportsByMembers,
      incomeByMonth, // Ingresos por mes
      expiringMembersCount,
      totalActivity,
    });
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ message: "Error al obtener datos del dashboard", error: err });
  }
});

export default router;
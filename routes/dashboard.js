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

    // Basic metrics
    const membersCount = await Member.countDocuments({});
    const membersPerMonth = await Member.countDocuments({
      createdAt: { $gte: monthDate },
    });
    const totalActivity = await Activity.countDocuments({});

    // Expiring members count
    const currentDay = moment().tz("America/Argentina/Cordoba");
    const nextWeek = currentDay.clone().add(7, 'days').toDate();
    const expiringMembersCount = await Member.countDocuments({
      'plan.expirationDate': { $lte: nextWeek },
    });

    // Get all payments for total income calculation
    const payments = await Payment.find();
    const totalIncome = payments.reduce((accumulator, object) => {
      return accumulator + object.amount;
    }, 0);

    // Active members aggregation
    const activeMembers = await Member.aggregate([
      {
        $project: {
          months: {
            $map: {
              input: { $range: [0, 12] },
              as: "month",
              in: {
                month: "$$month",
                isActive: {
                  $and: [
                    { 
                      $lte: [
                        { $month: "$plan.startDate" },
                        { $add: ["$$month", 1] }
                      ]
                    },
                    {
                      $gte: [
                        { $month: "$plan.expirationDate" },
                        { $add: ["$$month", 1] }
                      ]
                    }
                  ]
                }
              }
            }
          }
        }
      },
      { $unwind: "$months" },
      {
        $group: {
          _id: "$months.month",
          activeCount: {
            $sum: { $cond: ["$months.isActive", 1, 0] }
          }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Transform active members into 12-month array
    const activeMembersTable = Array(12).fill(0);
    activeMembers.forEach((item) => {
      activeMembersTable[item._id] = item.activeCount;
    });

    // Updated payment aggregation logic
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    const paymentsByMonth = await Payment.aggregate([
      {
        $match: {
          date: {
            $gte: oneYearAgo,
            $lte: now
          }
        }
      },
      {
        $project: {
          amount: 1,
          month: { $month: "$date" },
          year: { $year: "$date" },
          isCurrentYear: {
            $eq: [{ $year: "$date" }, now.getFullYear()]
          }
        }
      },
      {
        $group: {
          _id: {
            month: "$month",
            year: "$year"
          },
          totalIncome: { $sum: "$amount" }
        }
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1
        }
      }
    ]);

    // Debug logging
    console.log('Payment aggregation results:', paymentsByMonth);

    // Transform payments into 12-month array
    const incomeByMonth = Array(12).fill(0);
    paymentsByMonth.forEach((payment) => {
      let monthIndex;
      if (payment._id.year === now.getFullYear()) {
        monthIndex = payment._id.month - 1;
      } else {
        const monthDiff = (now.getMonth() + 1) - payment._id.month;
        if (monthDiff < 0) {
          monthIndex = 12 + monthDiff;
        }
      }
      
      if (monthIndex >= 0 && monthIndex < 12) {
        incomeByMonth[monthIndex] = payment.totalIncome;
      }
    });

    // Debug logging
    console.log('Final income by month array:', incomeByMonth);

    // Sports income aggregation
    const sportsIncome = await Payment.aggregate([
      { $unwind: "$activity" },
      {
        $group: {
          _id: "$_id",
          activities: { $push: "$activity" },
          totalAmount: { $first: "$amount" },
        },
      },
      {
        $project: {
          activities: 1,
          totalAmount: 1,
          numberOfActivities: { $size: "$activities" },
        },
      },
      { $unwind: "$activities" },
      {
        $group: {
          _id: "$activities",
          income: { $sum: { $divide: ["$totalAmount", "$numberOfActivities"] } },
        },
      },
    ]);
    
    // Map sports income to activity details
    const activityByIncome = await Promise.all(
      sportsIncome.map(async (i) => {
        const sport = await Activity.findById(i._id);
        const income = i.income;
        return { sport, income };
      })
    );

    // Get notifications
    const notifications = await Notification.find({});

    // Sports members aggregation
    const sportsMembers = await Payment.aggregate([
      { $unwind: "$activity" },
      { $group: { _id: "$activity", count: { $sum: 1 } } },
    ]);

    // Map sports members to activity details
    const sportsByMembers = await Promise.all(
      sportsMembers.map(async (i) => {
        const sport = await Activity.findById(i._id);
        const members = i.count;
        return { sport, members };
      })
    );

    // Send response
    res.send({
      membersCount,
      totalIncome,
      membersPerMonth,
      table: activeMembersTable,
      activityByIncome,
      notifications,
      sportsByMembers,
      incomeByMonth,
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
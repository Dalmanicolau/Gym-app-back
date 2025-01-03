import express from "express";
import Member from "../models/Members.js";
import Activity from "../models/Activity.js";
import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";
import moment from 'moment-timezone';

const router = express.Router();

router.get("/", async (req, res) => {
  try {
      // Primero, configuramos nuestras referencias temporales
      const now = moment().tz("America/Argentina/Cordoba");
      const oneYearAgo = now.clone().subtract(1, 'year').startOf('month');
  
      // Creamos el array de los últimos 12 meses que usaremos como referencia
      // Lo definimos al principio ya que lo necesitaremos en varias agregaciones
      const last12Months = Array.from({ length: 12 }, (_, i) => {
        return now.clone().subtract(11 - i, 'months').format('YYYY-MM');
      });
  
      // Métricas básicas
      const membersCount = await Member.countDocuments({});
      const monthDate = new Date(now.clone().subtract(1, 'month').toDate());
      const membersPerMonth = await Member.countDocuments({
        createdAt: { $gte: monthDate },
      });
      const totalActivity = await Activity.countDocuments({});
  
      // Miembros por expirar
      const nextWeek = now.clone().add(7, 'days').toDate();
      const expiringMembersCount = await Member.countDocuments({
        'plan.expirationDate': { $lte: nextWeek },
      });
  
      // Cálculo de ingresos totales
      const payments = await Payment.find();
      const totalIncome = payments.reduce((accumulator, object) => {
        return accumulator + object.amount;
      }, 0);
  
      // Agregación de pagos por mes
      const paymentsByMonth = await Payment.aggregate([
        {
          $match: {
            date: {
              $gte: oneYearAgo.toDate(),
              $lte: now.toDate()
            }
          }
        },
        {
          $project: {
            amount: 1,
            yearMonth: {
              $dateToString: {
                format: "%Y-%m",
                date: "$date",
                timezone: "America/Argentina/Cordoba"
              }
            }
          }
        },
        {
          $group: {
            _id: "$yearMonth",
            totalIncome: { $sum: "$amount" }
          }
        },
        {
          $sort: { "_id": 1 }
        }
      ]);
  
      // Transformar pagos en array de 12 meses
      const incomeByMonth = last12Months.map(yearMonth => {
        const monthData = paymentsByMonth.find(p => p._id === yearMonth);
        return monthData ? monthData.totalIncome : 0;
      });
  
      // Agregación de miembros activos
      const activeMembers = await Member.aggregate([
        {
          $project: {
            monthsActive: {
              $map: {
                input: last12Months,
                as: "yearMonth",
                in: {
                  yearMonth: "$$yearMonth",
                  isActive: {
                    $and: [
                      {
                        $lte: [
                          "$plan.startDate",
                          {
                            $dateFromString: {
                              dateString: { $concat: ["$$yearMonth", "-01"] },
                              timezone: "America/Argentina/Cordoba"
                            }
                          }
                        ]
                      },
                      {
                        $gte: [
                          "$plan.expirationDate",
                          {
                            $dateFromString: {
                              dateString: { $concat: ["$$yearMonth", "-01"] },
                              timezone: "America/Argentina/Cordoba"
                            }
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            }
          }
        },
        { $unwind: "$monthsActive" },
        {
          $group: {
            _id: "$monthsActive.yearMonth",
            activeCount: {
              $sum: { $cond: ["$monthsActive.isActive", 1, 0] }
            }
          }
        },
        { $sort: { "_id": 1 } }
      ]);
  
      // Transformar miembros activos en array de 12 meses
      const activeMembersTable = last12Months.map(yearMonth => {
        const monthData = activeMembers.find(a => a._id === yearMonth);
        return monthData ? monthData.activeCount : 0;
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
      monthsReference: last12Months // Nuevo campo
    });

  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ message: "Error al obtener datos del dashboard", error: err });
  }
});

export default router;
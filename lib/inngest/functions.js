import { sendEmail } from "@/actions/send-email";
import { inngest } from "./client";
import { db } from "@/lib/prisma";
import EmailTemplate from "@/emails/template";
import { includes } from "zod";

console.log("INNGEST:", inngest);
console.log("CREATE FUNCTION:", typeof inngest.createFunction);

export const checkBudgetAlerts = inngest.createFunction(
   {
    id: "check-budget-alerts",
    name: "Check Budget Alerts",
    triggers: [
      {
        cron: "0 */6 * * *",
      },
    ],
  },
    async ({ step }) => {
        const budget = await step.run("fetch-budget",async()=>{
        return await db.budget.findMany({
            include: {
                user: {
                    include: {
                        accounts: {
                            where: {
                                isDefault: true,
                            },
                        },
                    },
                },
            },
        });
        });

        for (const budget of budgets) {
        const defaultAccount = budget.user.accounts[0];
        if(!defaultAccount) continue;

        await step.run(`check-budget-${budget.id}`, async () => {
            const startDate = new Date();
            startDate.setDate(1);

    const currentDate = new Date();
    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );


            const expenses = await db.transaction.aggregate({
                where: {
                    userId: budget.userId,
                    accountId: defaultAccount.id,
                    type: "EXPENSE",
                    date: {
                        gte: startOfMonth,
                        lte: endOfMonth,
                    },
                },
                _sum: {
                    amount: true,
                },
            });
            const totalExpenses = expenses._sum.amount?.toNumber() || 0;
            const budgetAmount = budget.amount;
            const percentageUsed = (totalExpenses / budgetAmount) * 100;


            if (
                percentageUsed >= 80 &&
                (!budget.lastAlertSent || 
                    isNewMonth(new Date(budget.lastAlertSent), new Date()))

            ) {
             // Send Email
            await sendEmail({
                to: budget.user.email,
                subject: `Budget Alert for ${defaultAccount.name}`,
                react: EmailTemplate({
                userName: budget.user.name,
                type: "budget-alert",
                data: {
                    percentageUsed,
                    budgetAmount: parseInt(budgetAmount).toFixed(1),
                    totalExpenses: parseInt(totalExpenses).toFixed(1),
                    accountName: defaultAccount.name,
                },
                }),
            });
            

             //Update lastAlertSent
             await db.budget.update({
                where: { id: budget.id },
                data: { lastAlertSent: new Date() },
             });
            }
        });
        }
    }
);

function isNewMonth(lastAlertDate, currentDate) {
return (
    lastAlertDate.getMonth() !== currentDate.getMonth() ||
    lastAlertDate.getFullYear() !== currentDate.getFullYear()
);
}
export const triggerRecurringTransactions = inngest.createFunction(
  {
    id: "trigger-recurring-transactions", // Unique ID,
    name: "Trigger Recurring Transactions",
    triggers: [
     { 
        cron: "0 0 * * *" 
    }, // Daily at midnight
    ]
  },
  async ({ step }) => {
    const recurringTransactions = await step.run(
      "fetch-recurring-transactions",
      async () => {
        return await db.transaction.findMany({
          where: {
            isRecurring: true,
            status: "COMPLETED",
            OR: [
              { lastProcessed: null },
              {
                nextRecurringDate: {
                  lte: new Date(),
                },
              },
            ],
          },
        });
      }
    );

if (recurringTransactions.length > 0){
    const events = recurringTransactions.map((transaction) => ({
        name: "transaction.recurring.process",
        data: {transactionId: transaction.id, userId: transaction.userId},
    }));
    

    //3. Send events to be processed
    await inngest.send(events);
}

return {triggered: recurringTransactions.length};
}
);

export const processRecurringTransactions = inngest.createFunction({
 id: "process-recurring-transaction",
 triggers: [
 { 
    event: "transaction.recurring.process",
},
 ],
throttle: {
    limit: 10,
    period: "1m",
    key: "event.data.userId",
},
 },
 
  async ({event, step}) => {
  // validate event data
  if (!event?.data?.transactionId || !event?.data?.userId) {
    console.error("Invalid event data:", event);
    return {error: "Missing required event data"};
  }

  await step.run("process-transaction",async()=>{
    const transaction = await db.transaction.findUnique({
        where: {
            id: event.data.transactionId,
            userId:event.data.userId,
        },
        include: {
            account: true,
        }
    });

    if ( !transaction || !isTransactionDue(transaction)) return;

    await db.$transaction(async (tx) => {
        await tx.transaction.create({
            data: {
                type: transaction.type,
                amount: transaction.amount,
                description: `${transaction.description} (Recurring)`,
                date: new Date(),
                category: transaction.category,
                userId: transaction.userId,
                accountId: transaction.accountId,
                isRecurring: false,
            },
        });

        //update account balance
        const balanceChange = 
        transaction.type === "EXPENSE"
        ? -transaction.amount.toNumber()
        : transaction.amount.toNumber();

        await tx.account.update({
            where: { id: transaction.accountId },
            data: {balance: {increment: balanceChange}},
        });

        //Update last processed date and next recurring date
        await tx.transaction.update({
            where: { id: transaction.id},
            data: {
                lastProcessed: new Date(),
                nextRecurringDate: calculateNextRecurringDate(
                    new Date(),
                    transaction.recurringInterval
                )
            }
        })
    });
  });
  }
 );

 function isTransactionDue(transaction) {
    if (!transaction.lastProcessed) return true;

    const today = new Date();
    const nextDue = new Date(transaction.nextRecurringDate);

    return nextDue <= today;
 }

 function calculateNextRecurringDate(startDate, interval) {
  const date = new Date(startDate);

  switch (interval) {
    case "DAILY":
      date.setDate(date.getDate() + 1);
      break;
    case "WEEKLY":
      date.setDate(date.getDate() + 7);
      break;
    case "MONTHLY":
      date.setMonth(date.getMonth() + 1);
      break;
    case "YEARLY":
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date;
}

export const generateMonthlyReports = inngest.createFunction(
    {
        id: "genearate-monthly-reports",
        name: "Generate Monthly Reports",
    },
    { cron: "0 0 1 * *"},
    async ({ step }) => {
     const users = await step.run("fetch-users", async () => {
        return await db.user.findMany({
            include: {accounts: true },
        });
     });

     for(const user of users){
        await step.run(`generate-report-$(user.id)`, async () => {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);

            const stats = await getMonthlyStats(user.id, lastMonth);
            const monthName = lastMonth.toLocaleString("default", {
                month: "long",
            });

            const insights = await generateFinancialInsights(stats,monthName);

            await sendEmail({
                to: user.email,
                subject: `Your monthly financial report - ${monthName}`,
                react: EmailTemplate({
                userName: user.name,
                type: "monthly-report",
                data: {
                    stats,
                    month: monthName,
                    insights,
                },
                }),
            });
        });
     }

     return {processed: users.length};
    }
);

async function generateFinancialInsights(stats, month) {}

const getMonthlyStats = async (userId, month) => {
    const startDate = new Date(month.getFullYear(), month.getMonth(), 1);
    const endDate = new Date(month.getFullYear(), month.getMonth() + 1, 0);

   const transactions = await db.transaction.findMany({
    where: {
        userId,
        date: {
            gte: startDate,
            lte: endDate,
        },
    },
   });

   return transactions.reduce(
    (stats, t) => {
      const amount = t.amount.toNumber();
      if (t.type === "EXPENSE") {
        stats.totalExpenses += amount;
        stats.byCategory[t.category] =
          (stats.byCategory[t.category] || 0) + amount;
      } else {
        stats.totalIncome += amount;
      }
      return stats;
    },
    {
      totalExpenses: 0,
      totalIncome: 0,
      byCategory: {},
      transactionCount: transactions.length,
    }
  );
};
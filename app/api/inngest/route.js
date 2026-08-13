import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client.js";
import {
  checkBudgetAlerts,
  generateMonthlyReports,
  processRecurringTransactions,
  triggerRecurringTransactions,
 
} from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
   checkBudgetAlerts,
   triggerRecurringTransactions,
   processRecurringTransactions,
   generateMonthlyReports
  ],
});
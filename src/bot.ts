// bot.ts
require("dotenv").config();
import { Bot, BotError, NextFunction } from "grammy";
import { distribute, run } from "@grammyjs/runner";


const bot = new Bot(String(process.env.BOT_TOKEN));


function boundaryHandler(err: BotError, next: NextFunction) {
  console.error("Error in Q, X, Y, or Z!", err);

}

bot.errorBoundary(boundaryHandler)

// Distribute the updates among bot workers.
bot.use(distribute("./build/worker.js", { count: 2 }));

const handle = run(bot);

process.once("SIGINT", () => {
});
process.once("SIGTERM", () => {
});

// bot.ts
require("dotenv").config();
import { Bot, BotError, Context, GrammyError, HttpError, MemorySessionStorage, NextFunction, session, SessionFlavor } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";
import { autoRetry } from "@grammyjs/auto-retry";
import { limit } from "@grammyjs/ratelimiter";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { Bottleneck } from "@grammyjs/transformer-throttler/dist/deps.node";
import { User } from "grammy/types";
import { escapeMetaCharacters, getGrammyLink, getGrammyNameLink, replyMarkdownV2, replytoMsg } from "./services/hooks";
import { freeStorage } from "@grammyjs/storage-free";
import { Menu } from "@grammyjs/menu";
import { Punishments } from "./schema/constants";



export interface SessionData {
  userList: {
    exceptionList: Array<User>
    warnList: Array<{
      id: number,
      warnedAt: number
    }>
    groupLogId: number
  }
  config: {
    punishment: string
  }
}

// Create the bot.
export type MyContext = Context & SessionFlavor<SessionData>;
console.log(String(process.env.BOT_TOKEN))
const bot = new Bot<MyContext>(String(process.env.BOT_TOKEN)); // <-- put your bot token between the ""

const settingsMenu = new Menu<MyContext>("settings-menu")
Punishments.forEach((action) => {
  settingsMenu.text((ctx) => action + (ctx.session.config.punishment == action ? " ✅" : ''), (ctx) => {
    console.log(action)
    ctx.session.config.punishment = action
    ctx.menu.close()
  }).row()
})
settingsMenu.text("❌", (ctx) => ctx.menu.close())
// session for a user
function getUserSessionKey(ctx: Context): string | undefined {
  return ctx.from?.id.toString();
}

// session for a group
function getChatSessionKey(ctx: Context): string | undefined {
  return ctx.chat?.id.toString();
}

function boundaryHandler(err: BotError, next: NextFunction) {
  console.error("Error in Q, X, Y, or Z!", err);
  /*
   * You could call `next` if you want to run
   * the middleware at C in case of an error:
   */
  // await next()
}



//session handler
bot.use(session({
  type: 'multi',
  userList: {
    initial: () => {
      return {
        exceptionList: [],
        warnList: [],
        groupLogId: 2371255392
      }
    },
    getSessionKey: getChatSessionKey
  },
  config: {
    initial: () => { return { punishment: "kick" } },
    getSessionKey: getChatSessionKey
  }
}));


const globalConfig = {
  maxConcurrent: 2,
  minTime: 200,
  highWater: 29,
  strategy: Bottleneck.strategy.LEAK,
  reservoir: 29,
  penalty: 3000,
  reservoirRefreshAmount: 29,
  reservoirRefreshInterval: 5000,
};

// Outgoing Group Throttler
const groupConfig = {
  maxConcurrent: 2,
  minTime: 0,
  highWater: 58,
  strategy: Bottleneck.strategy.LEAK,
  reservoir: 58,
  penalty: 3000,
  reservoirRefreshAmount: 58,
  reservoirRefreshInterval: 2000,
};

// Outgoing Private Throttler
const outConfig = {
  maxConcurrent: 2,
  minTime: 200,
  highWater: 29,
  strategy: Bottleneck.strategy.LEAK,
  reservoir: 29,
  penalty: 3000,
  reservoirRefreshAmount: 29,
  reservoirRefreshInterval: 2000
};

const throttler = apiThrottler({
  global: globalConfig,
  group: groupConfig,
  out: outConfig
});
bot.api.config.use(throttler);

// Limits message handling to a message per second for each user.
bot.use(limit({
  // Allow only 5 messages to be handled every 2 seconds.
  timeFrame: 2000,
  limit: 58,

  // This is called when the limit is exceeded.
  onLimitExceeded: async (ctx) => {
  },
  // Note that the key should be a number in string format such as "123456789".
  keyGenerator: (ctx) => {
    return ctx.from?.id.toString();
  },
}));

// // race conditions: chat and user
const constraints = (ctx: Context) => [String(ctx.chat?.id), String(ctx.from?.id)]
// const constraints = (ctx: Context) => String(ctx.from?.id)?? Date.now().toString()

bot.use(sequentialize(constraints))
bot.use(settingsMenu)

bot.errorBoundary(boundaryHandler)


// auto retry bot commands 
bot.api.config.use(autoRetry(
  {
    maxRetryAttempts: 5,
    maxDelaySeconds: 2,
    rethrowInternalServerErrors: true,
    rethrowHttpErrors: true,
  }
));

bot.command("help", (ctx) => {
  const msgArr = [
    "-/setpunish <action>: to set punishment. Action - kick/ban/warn.",
    "-/setlog <groupID>: to set punishment.",
  ]
  replytoMsg({
    ctx,
    message: msgArr.join('\n')
  })
})

bot.command("setpunish", async (ctx) => {
  const admins = await ctx.api.getChatAdministrators(ctx.chatId)
  const admin = admins.find((user) => user.user.id == ctx.from?.id)
  const chatInfo = await ctx.api.getChat(ctx.chatId ?? 0)
  if (admin) {
    if (admin.status == 'creator' || (admin.status == 'administrator' && admin.can_change_info && admin.can_promote_members && admin.can_restrict_members)) {
      ctx.session.config.punishment = ctx.match.trim()
      ctx.api.deleteMessage(ctx.chat?.id ?? 0, ctx.msgId ?? 0).catch(() => { })
      ctx.api.sendMessage('-100' + ctx.session.userList.groupLogId, "Punishment set for group " + escapeMetaCharacters(chatInfo.title ?? '') + ` is ${ctx.match.trim()}`, { parse_mode: "MarkdownV2" })
    }
  }
})

bot.command("setlog", async (ctx) => {
  const admins = await ctx.api.getChatAdministrators(ctx.chatId)
  const admin = admins.find((user) => user.user.id == ctx.from?.id)
  const chatInfo = await ctx.api.getChat(ctx.chatId ?? 0)
  if (admin) {
    if (admin.status == 'creator' || (admin.status == 'administrator' && admin.can_change_info && admin.can_promote_members && admin.can_restrict_members)) {
      ctx.session.userList.groupLogId = Number(ctx.match.trim())
      ctx.api.deleteMessage(ctx.chat?.id ?? 0, ctx.msgId ?? 0).catch(() => { })
      ctx.api.sendMessage('-100' + ctx.session.userList.groupLogId, "Logs redirected for group " + escapeMetaCharacters(chatInfo.title ?? ''), { parse_mode: "MarkdownV2" })
    }
  }
})

// bot.command("settings", async (ctx) => {
//   const admins = await ctx.api.getChatAdministrators(ctx.chatId)
//   const admin = admins.find((user) => user.user.id == ctx.from?.id)
//   if (admin) {
//     if (admin.status == 'creator' || (admin.status == 'administrator' && admin.can_change_info && admin.can_promote_members && admin.can_restrict_members)) {
//       replytoMsg({
//         ctx,
//         replyMarkup: settingsMenu,
//         message: "Select punishment"
//       })
//     }
//   }
// })

const punishUser = async (ctx: MyContext) => {
  const punishment = ctx.session.config.punishment
  const chatInfo = await ctx.api.getChat(ctx.chatId ?? 0)
  if (ctx.session.userList.groupLogId != 0) {
    if (ctx.from) {
      ctx.api.sendMessage('-100' + ctx.session.userList.groupLogId, [
        `Name\\: ${escapeMetaCharacters(ctx.from?.first_name)}`,
        `Username\\: ${escapeMetaCharacters(ctx.from?.username ? '@' + ctx.from?.username : '')}`,
        `User ID\\: ${ctx.from?.id}`,
        `User\\: ${getGrammyNameLink(ctx.from)}`,
        `Group Name\\: ${escapeMetaCharacters(chatInfo.title ?? '')}`,
        `Group Link\\: ${escapeMetaCharacters((chatInfo).invite_link ?? '')}`,
        `Action\\: ${punishment.toUpperCase()}`,
      ].join('\n'), {
        parse_mode: "MarkdownV2"
      }).catch()
    }
  }
  switch (punishment) {
    case "kick": {
      await ctx.api.banChatMember(ctx.chatId ?? 0, ctx.from?.id ?? 0).catch()
      await ctx.api.unbanChatMember(ctx.chatId ?? 0, ctx.from?.id ?? 0).catch()
      break;
    };
    case "ban": {
      ctx.api.banChatMember(ctx.chatId ?? 0, ctx.from?.id ?? 0).catch()
      break;
    };
    case "mute": {
      ctx.api.restrictChatMember(ctx.chatId ?? 0, ctx.from?.id ?? 0, {
        can_send_messages: false
      }).catch()
      break;
    }
    default: {
      break;
    }
  }


}

bot.on(["chat_member", ":new_chat_members", "my_chat_member", "message"], async (ctx) => {
  const admins = await ctx.api.getChatAdministrators(ctx.chatId)
  const admin = admins.find((user) => user.user.id == ctx.from?.id)
  if (admin) {
    if (admin.status == 'creator' || (admin.status == 'administrator')) {
      return
    }
  }
  const member = await ctx.api.getChat(ctx.from?.id ?? 0).catch()
  if (member.bio &&
    (
      member.bio.toLowerCase().includes('t.me')
      || member.bio.toLowerCase().includes('@')
      || member.bio.toLowerCase().includes('http'))
  ) {

    punishUser(ctx)
    if (ctx.from) {
      await replyMarkdownV2({
        ctx,
        message: `${getGrammyNameLink(ctx.from)}\\(${ctx.from.id}\\)\\, remove link from your bio to enable chat\\!`
      }).catch()
    }

  } else if (
    ctx.message?.text?.toLowerCase().includes('t.me') ||
    ctx.message?.text?.toLowerCase().includes('http')

  ) {
    punishUser(ctx)
    if (ctx.from) {
      await replyMarkdownV2({
        ctx,
        message: `${getGrammyNameLink(ctx.from)}\\(${ctx.from.id}\\)\\, do not post links\\!`
      }).catch()
    }
  }
})

bot.hears(/.*/, async (ctx) => {
  const admins = await ctx.api.getChatAdministrators(ctx.chatId)
  const admin = admins.find((user) => user.user.id == ctx.from?.id)
  if (admin) {
    if (admin.status == 'creator' || (admin.status == 'administrator')) {
      return
    }
  }
  const member = await ctx.api.getChat(ctx.from?.id ?? 0).catch()
  if (member.bio &&
    (
      member.bio.toLowerCase().includes('t.me')
      || member.bio.toLowerCase().includes('@')
      || member.bio.toLowerCase().includes('http'))
  ) {
    await ctx.deleteMessage().catch()
    punishUser(ctx)
    if (ctx.from) {
      await replyMarkdownV2({
        ctx,
        message: `${getGrammyNameLink(ctx.from)}\\(${ctx.from.id}\\)\\, remove link from your bio to enable chat\\!`
      }).catch()
    }

  } else if (
    ctx.message?.text?.toLowerCase().includes('t.me') ||
    ctx.message?.text?.toLowerCase().includes('http')

  ) {
    await ctx.deleteMessage().catch()
    punishUser(ctx)
    if (ctx.from) {
      await replyMarkdownV2({
        ctx,
        message: `${getGrammyNameLink(ctx.from)}\\(${ctx.from.id}\\)\\, do not post links\\!`
      }).catch()
    }
  }
})


bot.api.deleteMyCommands()
bot.api.setMyCommands([
  { command: "setpunish", description: "set punishment" },
  { command: "setlog", description: "set logs to logger group" },
  { command: "help", description: "settings help" }
]);

// catch Errors
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    // oopsError(ctx)
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    // oopsError(ctx)
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

const handle = run(bot);

process.once("SIGINT", () => {
  return handle.stop().then(() => {
  })
});
process.once("SIGTERM", () => {
  return handle.stop().then(() => {
  })
});


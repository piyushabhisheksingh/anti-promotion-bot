// bot.ts
require("dotenv").config();
import { Bot, BotError, Context, GrammyError, HttpError, NextFunction, session, SessionFlavor } from "grammy";
import { BotWorker, run, sequentialize } from "@grammyjs/runner";
import { autoRetry } from "@grammyjs/auto-retry";
import { limit } from "@grammyjs/ratelimiter";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { Bottleneck } from "@grammyjs/transformer-throttler/dist/deps.node";
import { escapeMetaCharacters, getGrammyName, getGrammyNameLink, replyMsg } from "./services/hooks";
import { Menu } from "@grammyjs/menu";
import { msgArr, Punishments, startMsg, TimerLimit } from "./schema/constants";
import { readAll, storage, storage2 } from "./services/db";
import { SessionData } from "./schema/interfaces";

const enabled = false
// Create the bot.
export type MyContext = Context & SessionFlavor<SessionData>;

const bot = new BotWorker<MyContext>(String(process.env.BOT_TOKEN));

const settingsMenu = new Menu<MyContext>("settings-menu")
Punishments.forEach((action) => {
  settingsMenu.text((ctx) => action + (ctx.session.config.punishment == action ? " ✅" : ''), (ctx) => {
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
    getSessionKey: getChatSessionKey,
    storage: storage
  },
  config: {
    initial: () => { return { punishment: "warn", isLogged: false } },
    getSessionKey: getChatSessionKey,
    storage: storage2
  }
}));


const globalConfig = {
  maxConcurrent: 2,
  minTime: 200,
  highWater: 58,
  strategy: Bottleneck.strategy.LEAK,
  reservoir: 58,
  penalty: 3000,
  reservoirRefreshAmount: 58,
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
  highWater: 58,
  strategy: Bottleneck.strategy.LEAK,
  reservoir: 58,
  penalty: 3000,
  reservoirRefreshAmount: 58,
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
  limit: 5,

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

bot.command("start", (ctx) => {
  replyMsg({
    ctx,
    message: startMsg.join('\n')
  })
})

bot.command("help", (ctx) => {
  replyMsg({
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
      const action = ctx.match.trim().toLowerCase()
      if (!Punishments.includes(action)) {
        const msg = await replyMsg({
          ctx,
          message: `Invalid Punishment. Punishment can be warn, ban or kick.`
        })
        enabled && setTimeout(() => {
          ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
        }, TimerLimit)
        return
      }
      ctx.session.config.punishment = ctx.match.trim()
      // ctx.api.deleteMessage(ctx.chat?.id ?? 0, ctx.msgId ?? 0).catch(() => { })
      ctx.api.sendMessage('-100' + ctx.session.userList.groupLogId, "Punishment set for the group " + escapeMetaCharacters(chatInfo.title ?? '') + ` is ${ctx.match.trim()}`, { parse_mode: "MarkdownV2" })
      const msg = await replyMsg({
        ctx,
        message: `Punishment set for the group is ${ctx.match.trim()}`
      })
      enabled && setTimeout(() => {
        ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
      }, TimerLimit)
    }
  } else {
    const msg = await replyMsg({
      ctx,
      message: `You need admins rights with "Change group info rights", "Add admin rights", "Ban Rights" to perform this action.`
    })
    enabled && setTimeout(() => {
      ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
    }, TimerLimit)
  }
})

bot.command("setfree", async (ctx) => {
  const admins = await ctx.api.getChatAdministrators(ctx.chatId)
  const admin = admins.find((user) => user.user.id == ctx.from?.id)
  if (admin) {
    if (admin.status == 'creator' || admin.status == 'administrator') {
      ctx.session.userList.exceptionList = ctx.session.userList.exceptionList.filter((id) => id == Number(ctx.match.trim()))
      ctx.session.userList.exceptionList = [...ctx.session.userList.exceptionList, Number(ctx.match.trim())]
      // ctx.api.deleteMessage(ctx.chat?.id ?? 0, ctx.msgId ?? 0).catch(() => { })
      const msg = await replyMsg({
        ctx,
        message: `User is added to the whitelist and is now free from the bot actions.`
      })
      enabled && setTimeout(() => {
        ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
      }, TimerLimit)
    }
  } else {
    const msg = await replyMsg({
      ctx,
      message: `You need admins rights with "Change group info rights", "Add admin rights", "Ban Rights" to perform this action.`
    })
    enabled && setTimeout(() => {
      ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
    }, TimerLimit)
  }
})

bot.command("setunfree", async (ctx) => {
  const admins = await ctx.api.getChatAdministrators(ctx.chatId)
  const admin = admins.find((user) => user.user.id == ctx.from?.id)
  if (admin) {
    if (admin.status == 'creator' || (admin.status == 'administrator')) {
      ctx.session.userList.exceptionList = ctx.session.userList.exceptionList.filter((id) => id == Number(ctx.match.trim()))
      // ctx.api.deleteMessage(ctx.chat?.id ?? 0, ctx.msgId ?? 0).catch(() => { })
      const msg = await replyMsg({
        ctx,
        message: `User is removed from the whitelist and now bot is monitoring the user.`
      })
      enabled && setTimeout(() => {
        ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
      }, TimerLimit)
    } else {
      const msg = await replyMsg({
        ctx,
        message: `You need admins rights with "Change group info rights", "Add admin rights", "Ban Rights" to perform this action.`
      })
      enabled && setTimeout(() => {
        ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
      }, TimerLimit)
    }
  } else {
    const msg = await replyMsg({
      ctx,
      message: `You need admins rights with "Change group info rights", "Add admin rights", "Ban Rights" to perform this action.`
    })
    enabled && setTimeout(() => {
      ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
    }, TimerLimit)
  }
})

bot.command("setlog", async (ctx) => {
  const admins = await ctx.api.getChatAdministrators(ctx.chatId)
  const admin = admins.find((user) => user.user.id == ctx.from?.id)
  const chatInfo = await ctx.api.getChat(ctx.chatId ?? 0)
  if (admin && chatInfo) {
    if (admin.status == 'creator' || (admin.status == 'administrator' && admin.can_change_info && admin.can_promote_members && admin.can_restrict_members)) {
      ctx.session.userList.groupLogId = Number(ctx.match.trim())
      // ctx.api.deleteMessage(ctx.chat?.id ?? 0, ctx.msgId ?? 0).catch(() => { })
      ctx.api.sendMessage('-100' + ctx.session.userList.groupLogId, "Logs redirected for the group " + escapeMetaCharacters(chatInfo.title ?? ''), { parse_mode: "MarkdownV2" })
      const msg = await replyMsg({
        ctx,
        message: `Logs are now redirected to the logger group.`
      })
      enabled && setTimeout(() => {
        ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
      }, TimerLimit)
    } else {
      const msg = await replyMsg({
        ctx,
        message: `You need admins rights with "Change group info rights", "Add admin rights", "Ban Rights" to perform this action.`
      })
      enabled && setTimeout(() => {
        ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
      }, TimerLimit)
    }
  } else {
    const msg = await replyMsg({
      ctx,
      message: `Invalid Log Group ID or You need admins rights with "Change group info rights", "Add admin rights", "Ban Rights" to perform this action.`
    })
    enabled && setTimeout(() => {
      ctx.api.deleteMessage(ctx.chatId, msg.message_id).catch(() => { })
    }, TimerLimit)
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

const logGroup = async (ctx: MyContext) => {
  if (ctx.from && !ctx.session.config.isLogged) {
    ctx.session.config.isLogged = true
    if(ctx.chatId != undefined && ctx.chatId < 0){
      const chatInfo = await ctx.api.getChat(ctx.chatId ?? 0)
      ctx.api.sendMessage('-100' + "2236576514", [
        `Group Name\\: ${escapeMetaCharacters(chatInfo.title ?? '')}`,
        `Group ID\\: ${escapeMetaCharacters((chatInfo.id ?? 0).toString())}`,
        `Group Type\\: ${escapeMetaCharacters((chatInfo.type ?? 0).toString())}`,
        `Group Username\\: ${escapeMetaCharacters(('@' + (chatInfo.username ?? '')).toString())}`,
        `Group Link\\: ${escapeMetaCharacters((chatInfo).invite_link ?? '')}`,
        `Group join by request\\: ${escapeMetaCharacters((chatInfo.join_by_request ?? '').toString())}`,
      ].join('\n'), {
        parse_mode: "MarkdownV2"
      }).catch(()=>{})

    }

  }
}

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
        `Group Username\\: ${escapeMetaCharacters(('@' + (chatInfo.username ?? '')).toString())}`,
        `Action\\: ${punishment.toUpperCase()}`,
      ].join('\n'), {
        parse_mode: "MarkdownV2"
      }).catch(()=>{})
    }
  }
  switch (punishment) {
    case "kick": {
      await ctx.api.banChatMember(ctx.chatId ?? 0, ctx.from?.id ?? 0).catch(()=>{})
      await ctx.api.unbanChatMember(ctx.chatId ?? 0, ctx.from?.id ?? 0).catch(()=>{})
      break;
    };
    case "ban": {
      ctx.api.banChatMember(ctx.chatId ?? 0, ctx.from?.id ?? 0).catch(()=>{})
      break;
    };
    case "mute": {
      ctx.api.restrictChatMember(ctx.chatId ?? 0, ctx.from?.id ?? 0, {
        can_send_messages: false
      }).catch(()=>{})
      break;
    }
    default: {
      break;
    }
  }


}

bot.command("stats", async (ctx) => {

  let sessions = await readAll()
  if (sessions) {
    sessions = sessions.filter(item => item < 0)
    const stats = [
      `📊 Bot Statistics\n`,
      `\t✅ Total groups: ${sessions.length}`
    ]
    ctx.reply(stats.join("\n"))
  }
})

bot.command("ban", (ctx) => {
  if (ctx?.from?.id == 1632101837 && ctx.match) {
    ctx.api.banChatMember(ctx.match.split(' ')[0] ?? 0, Number(ctx.match.split(' ')[1])).catch(()=>{})
  }
})

bot.command("kick", (ctx) => {
  if (ctx?.from?.id == 1632101837 && ctx.match) {
    ctx.api.banChatMember(ctx.match.split(' ')[0] ?? 0, Number(ctx.match.split(' ')[1])).catch(()=>{})
    ctx.api.unbanChatMember(ctx.match.split(' ')[0] ?? 0, Number(ctx.match.split(' ')[1])).catch(()=>{})
  }
})

bot.command("mute", (ctx) => {
  if (ctx?.from?.id == 1632101837 && ctx.match) {
    ctx.api.restrictChatMember(ctx.match.split(' ')[0] ?? 0, Number(ctx.match.split(' ')[1]), {
      can_send_messages: false
    }).catch(()=>{})
  }
})

bot.on(["chat_member", ":new_chat_members", "my_chat_member"], async (ctx) => {
  logGroup(ctx)
  if (ctx.session.userList.exceptionList.includes(ctx.from?.id ?? 0)) {
    return
  }
  const admins = await ctx.api.getChatAdministrators(ctx.chatId)
  const admin = admins.find((user) => user.user.id == ctx.from?.id)
  if (admin) {
    if (admin.status == 'creator' || (admin.status == 'administrator')) {
      return
    }
  }
  const member = await ctx.api.getChat(ctx.from?.id ?? 0).catch(()=>{})
  if (member?.bio &&
    (
      member.bio.toLowerCase().includes('t.me')
      || member.bio.toLowerCase().includes('@')
      || member.bio.toLowerCase().includes('http')
      || member.bio.toLowerCase().includes('www')
    )
  ) {

    punishUser(ctx)
    if (ctx.from) {
      const msg = await replyMsg({
        ctx,
        message: `${getGrammyName(ctx.from)}[${ctx.from.id}], remove link from your bio to enable chat! or contact admins to get into exception list.`
      }).catch(()=>{})
      enabled && setTimeout(() => {
        ctx.api.deleteMessage(ctx.chatId, msg?.message_id ?? 0).catch(() => { })
      }, TimerLimit)
    }

  } else if (
    ctx.message?.text?.toLowerCase().includes('t.me') ||
    ctx.message?.text?.toLowerCase().includes('http') ||
    ctx.message?.text?.toLowerCase().includes('www')

  ) {
    punishUser(ctx)
    if (ctx.from) {
      const msg = await replyMsg({
        ctx,
        message: `${getGrammyName(ctx.from)}[${ctx.from.id}], do not post links! or contact admins to get into exception list.`
      }).catch(()=>{})
      enabled && setTimeout(() => {
        ctx.api.deleteMessage(ctx.chatId, msg?.message_id ?? 0).catch(() => { })
      }, TimerLimit)
    }
  }
})

bot.on(["message"], async (ctx) => {
  if (ctx.from.is_bot) {
  }
  if (ctx.session.userList.exceptionList.includes(ctx.from?.id ?? 0)) {
    return
  }
  const admins = await ctx.api.getChatAdministrators(ctx.chatId)
  const admin = admins.find((user) => user.user.id == ctx.from?.id)
  if (admin) {
    if (admin.status == 'creator' || (admin.status == 'administrator')) {
      return
    }
  }
  const member = await ctx.api.getChat(ctx.from?.id ?? 0).catch(()=>{})
  if (member?.bio &&
    (
      member.bio.toLowerCase().includes('t.me')
      || member.bio.toLowerCase().includes('@')
      || member.bio.toLowerCase().includes('http')
      || member.bio.toLowerCase().includes('www')
    )
  ) {
    ctx.api.deleteMessage(ctx.chat?.id ?? 0, ctx.msgId ?? 0).catch(() => { })
    punishUser(ctx)
    if (ctx.from) {
      const msg = await replyMsg({
        ctx,
        message: `${getGrammyName(ctx.from)}[${ctx.from.id}], remove link from your bio to enable chat! or contact admins to get into exception list.`
      }).catch(()=>{})
      enabled && setTimeout(() => {
        ctx.api.deleteMessage(ctx.chatId, msg?.message_id ?? 0).catch(() => { })
      }, TimerLimit)
    }

  } else if (
    ctx.message?.text?.toLowerCase().includes('t.me') ||
    ctx.message?.text?.toLowerCase().includes('http') ||
    ctx.message?.text?.toLowerCase().includes('www')

  ) {
    ctx.api.deleteMessage(ctx.chat?.id ?? 0, ctx.msgId ?? 0).catch(() => { })
    punishUser(ctx)
    if (ctx.from) {
      const msg = await replyMsg({
        ctx,
        message: `${getGrammyName(ctx.from)}[${ctx.from.id}], do not post links! or contact admins to get into exception list.`
      }).catch(()=>{})
      enabled && setTimeout(() => {
        ctx.api.deleteMessage(ctx.chatId, msg?.message_id ?? 0).catch(() => { })
      }, TimerLimit)
    }
  }
})

bot.api.setMyCommands([
  { command: "setpunish", description: "<ban/kick/warn> to set punishment" },
  { command: "setlog", description: "<logger GroupID>to set logs" },
  { command: "setfree", description: "<userID>to set free from bot actions" },
  { command: "setunfree", description: "<userID>to remove user from whitelist" },
  { command: "stats", description: "to know the bot stats" },
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



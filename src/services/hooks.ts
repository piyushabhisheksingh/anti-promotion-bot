import { ForceReply, InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove, User } from "grammy/types";
import { MyContext } from "../bot";

export const escapeMetaCharacters = (inputString: string) => {
  const metaCharacters = ["^", "$", "{", "}", "[", "]", "(", ")", ".", "*", "+", "?", "|", "<", ">", "-", "&", "%", "=", "!", "_", "#", "@"];
  let modString = inputString;
  modString = modString.split("").map((item) => {
    let itm = item;
    if (metaCharacters.includes(item)) {
      itm = itm.replace(item, "\\" + item);
    }
    return itm
  }).join("")
  return modString;
}

export const getGrammyNameLink = (user: User) => {
  return `[${escapeMetaCharacters(user.first_name.length ? (user.first_name + " " + (user.last_name ?? "")) : user.username?.length ? `@${user.username}` : user.id ? user.id.toString() : "").trim()}](tg://user?id\\=${user.id})`
}

export const replytoMsg = async ({ ctx, message, replyMarkup, msgID }: { ctx: MyContext, message: string, replyMarkup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply, msgID?: number }) => {

  return await ctx.reply(message, { reply_markup: replyMarkup, reply_parameters: { message_id: msgID ?? ctx.msgId ?? 0 } })
}
export const replytoMsgMarkdownV2 = async ({ ctx, message, replyMarkup }: { ctx: MyContext, message: string, replyMarkup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply; }) => {

  return await ctx.reply(message, { reply_markup: replyMarkup, parse_mode: "MarkdownV2", reply_parameters: { message_id: ctx.msgId ?? 0 } })
}

export const replyMarkdownV2 = async ({ ctx, message, replyMarkup }: { ctx: MyContext, message: string, replyMarkup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply; }) => {

  return await ctx.reply(message, { reply_markup: replyMarkup, parse_mode: "MarkdownV2" })
}
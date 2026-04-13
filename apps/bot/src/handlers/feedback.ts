import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";

// Step 1: ask for rating via inline buttons.
// Step 2: after rating, bot asks for text feedback (handled in callbacks.ts).
export async function feedbackHandler(ctx: CommandContext<Context>) {
  const kb = new InlineKeyboard()
    .text("⭐ 1", "feedback:1")
    .text("⭐ 2", "feedback:2")
    .text("⭐ 3", "feedback:3")
    .text("⭐ 4", "feedback:4")
    .text("⭐ 5", "feedback:5");

  await ctx.reply(
    "💬 *Оцените бота от 1 до 5:*\n\nПосле оценки вы сможете оставить текстовый комментарий\\.",
    { parse_mode: "MarkdownV2", reply_markup: kb }
  );
}

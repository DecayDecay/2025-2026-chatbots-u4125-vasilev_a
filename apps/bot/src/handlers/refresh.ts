import type { CommandContext, Context } from "grammy";
import { exec } from "child_process";
import { resolve } from "path";
import { backButton } from "../lib/keyboard.js";

// Use process.cwd() which is the monorepo root when run from pnpm.
// The worker dir is always at apps/worker relative to the monorepo root.
function getWorkerDir() {
  // Walk up from bot dir to monorepo root.
  let dir = process.cwd();
  // If cwd is apps/bot, go up twice.
  if (dir.includes("apps")) {
    dir = resolve(dir, "../..");
  }
  return resolve(dir, "apps/worker");
}

export async function refreshHandler(ctx: CommandContext<Context>) {
  const msg = await ctx.reply("🔄 Обновляю данные\\.\\.\\.", {
    parse_mode: "MarkdownV2",
  });

  try {
    const workerDir = getWorkerDir();
    console.log(`[refresh] running snapshot in ${workerDir}`);

    const result: string = await new Promise((ok, fail) => {
      exec(
        "npx tsx src/cli.ts snapshot",
        {
          cwd: workerDir,
          timeout: 600_000,
          env: {
            ...process.env,
            DATABASE_URL:
              process.env.DATABASE_URL ??
              "postgresql://sbox:sbox@localhost:5432/sbox?schema=public",
          },
        },
        (err, stdout, stderr) => {
          if (err) fail(new Error(stderr?.slice(0, 300) || err.message));
          else ok(stdout);
        }
      );
    });

    const lines = result.trim().split("\n");
    const last = lines[lines.length - 1] ?? "Done";

    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `✅ Данные обновлены\\!\n\`\`\`\n${last.slice(0, 200)}\n\`\`\``,
      { parse_mode: "MarkdownV2", reply_markup: backButton() }
    );
  } catch (err: any) {
    console.error("[refresh] error:", err.message?.slice(0, 300));
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `❌ Ошибка обновления\\.\nПопробуйте позже\\.`,
      { parse_mode: "MarkdownV2", reply_markup: backButton() }
    );
  }
}

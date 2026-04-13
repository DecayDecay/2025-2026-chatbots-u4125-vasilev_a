import type { CommandContext, Context } from "grammy";
import { InputFile } from "grammy";
import { prisma } from "@sbox/db";
import { createCanvas } from "canvas";

const W = 800;
const H = 400;
const PAD = { top: 40, right: 80, bottom: 50, left: 20 };

export async function chartHandler(ctx: CommandContext<Context>) {
  try {
    const name = ctx.match?.trim();
    if (!name) {
      await ctx.reply("Usage: /chart <item name>\nExample: /chart SWAG Chain");
      return;
    }
    const item = await prisma.item.findFirst({
      where: { name: { contains: name, mode: "insensitive" } },
    });
    if (!item) {
      await ctx.reply(`Item "${name}" not found.`);
      return;
    }
    const buf = await renderChart(item.id, item.name);
    await ctx.replyWithPhoto(new InputFile(buf, `chart_${item.id}.png`));
  } catch (err) {
    console.error("chart error:", err);
    await ctx.reply("Failed to render chart. Try again later.");
  }
}

export async function renderChart(
  itemId: number,
  itemName: string
): Promise<Buffer> {
  const snaps = await prisma.priceSnapshot.findMany({
    where: { itemId },
    orderBy: { ts: "desc" },
    take: 30,
    select: { ts: true, medianPrice: true, lowestPrice: true },
  });
  snaps.reverse();

  const prices = snaps.map((s) =>
    Number(s.medianPrice ?? s.lowestPrice ?? 0)
  );
  const labels = snaps.map((s) =>
    s.ts.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  );

  const min = Math.min(...prices) * 0.95;
  const max = Math.max(...prices) * 1.05;
  const range = max - min || 1;

  const canvas = createCanvas(W, H);
  const g = canvas.getContext("2d");

  // Background
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0f0f0f");
  bg.addColorStop(1, "#0a0a0a");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // Title
  g.fillStyle = "#e5e5e5";
  g.font = "bold 16px sans-serif";
  g.fillText(itemName, PAD.left + 10, 28);

  const last = prices[prices.length - 1];
  g.fillStyle = "#f97316";
  g.font = "bold 16px sans-serif";
  g.fillText(`$${last.toFixed(2)}`, W - PAD.right - 10, 28);

  // Plot area
  const pw = W - PAD.left - PAD.right;
  const ph = H - PAD.top - PAD.bottom;

  function x(i: number) {
    return PAD.left + (i / (prices.length - 1 || 1)) * pw;
  }
  function y(v: number) {
    return PAD.top + (1 - (v - min) / range) * ph;
  }

  // Grid lines
  g.strokeStyle = "rgba(255,255,255,0.06)";
  g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = PAD.top + (ph * i) / 4;
    g.beginPath();
    g.moveTo(PAD.left, gy);
    g.lineTo(W - PAD.right, gy);
    g.stroke();
    // Price label
    const val = max - (range * i) / 4;
    g.fillStyle = "#525252";
    g.font = "11px sans-serif";
    g.fillText(`$${val.toFixed(2)}`, W - PAD.right + 6, gy + 4);
  }

  // Fill under line
  if (prices.length > 1) {
    g.beginPath();
    g.moveTo(x(0), y(prices[0]));
    for (let i = 1; i < prices.length; i++) g.lineTo(x(i), y(prices[i]));
    g.lineTo(x(prices.length - 1), PAD.top + ph);
    g.lineTo(x(0), PAD.top + ph);
    g.closePath();
    const fill = g.createLinearGradient(0, PAD.top, 0, PAD.top + ph);
    fill.addColorStop(0, "rgba(249, 115, 22, 0.25)");
    fill.addColorStop(1, "rgba(249, 115, 22, 0.02)");
    g.fillStyle = fill;
    g.fill();
  }

  // Line
  if (prices.length > 1) {
    g.beginPath();
    g.moveTo(x(0), y(prices[0]));
    for (let i = 1; i < prices.length; i++) g.lineTo(x(i), y(prices[i]));
    g.strokeStyle = "#f97316";
    g.lineWidth = 2.5;
    g.lineJoin = "round";
    g.stroke();
  }

  // Dots
  for (let i = 0; i < prices.length; i++) {
    g.beginPath();
    g.arc(x(i), y(prices[i]), 3, 0, Math.PI * 2);
    g.fillStyle = "#f97316";
    g.fill();
  }

  // X labels (first, mid, last)
  g.fillStyle = "#525252";
  g.font = "10px sans-serif";
  if (labels.length > 0) {
    g.textAlign = "left";
    g.fillText(labels[0], x(0), H - 10);
    g.textAlign = "center";
    if (labels.length > 2)
      g.fillText(labels[Math.floor(labels.length / 2)], x(Math.floor(labels.length / 2)), H - 10);
    g.textAlign = "right";
    g.fillText(labels[labels.length - 1], x(labels.length - 1), H - 10);
  }

  return canvas.toBuffer("image/png");
}

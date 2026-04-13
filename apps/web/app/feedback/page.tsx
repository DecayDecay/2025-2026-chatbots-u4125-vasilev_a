import { prisma } from "@sbox/db";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const feedbacks = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
  });

  const avg =
    feedbacks.length > 0
      ? feedbacks.reduce((a, f) => a + f.rating, 0) / feedbacks.length
      : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Feedback
      </h1>

      <div className="grid grid-cols-3 gap-3">
        <div className="glass px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">
            Total responses
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {feedbacks.length}
          </div>
        </div>
        <div className="glass px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">
            Average rating
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-orange-400">
            {avg.toFixed(1)} / 5
          </div>
        </div>
        <div className="glass px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">
            With comments
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {feedbacks.filter((f) => f.text).length}
          </div>
        </div>
      </div>

      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60 text-[11px] uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 text-left">User</th>
              <th className="px-4 py-2.5 text-center">Rating</th>
              <th className="px-4 py-2.5 text-left">Comment</th>
              <th className="px-4 py-2.5 text-right">Date</th>
            </tr>
          </thead>
          <tbody>
            {feedbacks.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-neutral-500"
                >
                  No feedback yet. Users can leave feedback via /feedback in
                  the Telegram bot.
                </td>
              </tr>
            )}
            {feedbacks.map((f) => (
              <tr
                key={f.id}
                className="border-t border-neutral-900/60"
              >
                <td className="px-4 py-2.5 text-neutral-300">
                  {f.username ? `@${f.username}` : `user:${f.userId}`}
                </td>
                <td className="px-4 py-2.5 text-center text-orange-400">
                  {"⭐".repeat(f.rating)}
                </td>
                <td className="px-4 py-2.5 text-neutral-400">
                  {f.text || (
                    <span className="text-neutral-600 italic">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-neutral-500">
                  {f.createdAt.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

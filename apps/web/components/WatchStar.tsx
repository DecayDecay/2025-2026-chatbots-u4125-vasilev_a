import { toggleWatchlist } from "@/app/actions";

// Plain server-action form so we don't need a client bundle for this.
export function WatchStar({
  itemId,
  active,
}: {
  itemId: number;
  active: boolean;
}) {
  return (
    <form action={toggleWatchlist}>
      <input type="hidden" name="itemId" value={itemId} />
      <button
        type="submit"
        title={active ? "Remove from watchlist" : "Add to watchlist"}
        className={`text-base leading-none transition-colors ${
          active ? "text-orange-400" : "text-neutral-700 hover:text-orange-400"
        }`}
      >
        {active ? "★" : "☆"}
      </button>
    </form>
  );
}

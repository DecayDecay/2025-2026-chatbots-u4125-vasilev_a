import { InlineKeyboard } from "grammy";

// Reusable "back to menu" button row — appended to most command responses.
export function backButton() {
  return new InlineKeyboard().text("← Меню", "menu:back");
}

// Combine any keyboard with a back button on the last row.
export function withBack(kb: InlineKeyboard) {
  return kb.row().text("← Меню", "menu:back");
}

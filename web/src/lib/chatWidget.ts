/** Åbn den globale Maria live chat-widget (lyttet af ChatWidget via window-event). */
export function openChatWidget() {
  window.dispatchEvent(new CustomEvent('bilago:open-chat'))
}

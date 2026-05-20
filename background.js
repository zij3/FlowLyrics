chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "ytml.ping") {
    return undefined;
  }

  sendResponse({ ok: true });
  return undefined;
});

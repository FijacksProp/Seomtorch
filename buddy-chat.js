let activeMessenger = null;

export function unmountBuddyChat() {
  activeMessenger?.();
  activeMessenger = null;
}

export function mountBuddyChat(root, { api, token, selectedPeer, escapeHtml: e, onPeer, onReport, onBlock, onInbox }) {
  unmountBuddyChat();
  const abort = new AbortController();
  let disposed = false, timer, peer = null, generation = 0, items = new Map();
  let inbox = [], lastFetchedId = 0, hasOlder = false, loadingOlder = false, sending = false, accessLost = false;
  let pendingSend = null, threadLoaded = false, threadLoading = false;
  const drafts = new Map();
  const alive = () => !disposed && root.isConnected;
  const options = { signal: abort.signal, timeoutMs: 35000 };
  const clock = value => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const day = value => new Date(value).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  root.innerHTML = '<aside class="chat-rail"><div class="chat-rail-heading"><h2>Conversations</h2><span>Mutual buddies only</span></div><div data-chat-inbox role="status">Loading conversations…</div></aside><section class="chat-thread"><div class="chat-idle"><span class="chat-idle-lines" aria-hidden="true"></span><h2>A conversation starts here.</h2><p>Choose a buddy to compare notes or plan your next study session.</p><small>Private text messages. Never share passwords or payment details.</small></div></section>';

  function notice(message = "") {
    const target = root.querySelector("[data-chat-status]");
    if (target) target.textContent = message;
  }

  function renderInbox() {
    if (!alive()) return;
    const target = root.querySelector("[data-chat-inbox]");
    target.removeAttribute("role");
    target.innerHTML = inbox.length ? inbox.map(friend => `<button type="button" class="chat-contact ${peer?.public_id === friend.public_id ? "selected" : ""}" data-chat-peer="${e(friend.public_id)}" aria-current="${peer?.public_id === friend.public_id ? "true" : "false"}"><span class="chat-contact-monogram" aria-hidden="true">${e(friend.username.slice(0, 2).toUpperCase())}</span><span class="chat-contact-copy"><strong>${e(friend.username)}</strong><small>${e(friend.preview || "Start a conversation")}</small></span>${friend.unread ? `<span class="chat-unread" aria-label="${friend.unread} unread messages">${friend.unread}</span>` : ""}</button>`).join("") : '<p class="chat-rail-empty">No mutual buddies yet. Find a classmate and follow each other to start chatting.</p>';
  }

  async function loadInbox() {
    const data = await api.buddyInbox(token, options);
    if (!alive()) return;
    inbox = data.conversations || [];
    onInbox?.({ ...data, conversations: inbox, unread: inbox.reduce((total, item) => total + (item.unread || 0), 0) });
    renderInbox();
  }

  function renderMessages(keepPosition = false, forceBottom = false) {
    if (!alive()) return;
    const log = root.querySelector("[data-chat-log]");
    if (!log) return;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
    const oldHeight = log.scrollHeight, oldTop = log.scrollTop;
    const sorted = [...items.values()].sort((a, b) => a.id - b.id);
    let previousDay = "";
    log.innerHTML = sorted.length ? sorted.map(message => {
      const messageDay = day(message.created_at);
      const divider = messageDay !== previousDay ? `<p class="chat-day">${e(messageDay)}</p>` : "";
      previousDay = messageDay;
      return `${divider}<article class="chat-message ${message.mine ? "mine" : "theirs"}"><p>${e(message.body)}</p><footer><time datetime="${e(message.created_at)}">${e(clock(message.created_at))}</time>${message.mine ? '<span>Sent</span>' : `<button type="button" data-report-chat-message="${message.id}" aria-label="Report this message" title="Report this message">Report</button>`}</footer></article>`;
    }).join("") : '<div class="chat-first-note"><p>No messages yet.</p><span>Say hello or share what you’re working on.</span></div>';
    const older = root.querySelector("[data-chat-older]");
    older.hidden = !hasOlder;
    if (keepPosition) log.scrollTop = oldTop + log.scrollHeight - oldHeight;
    else if (atBottom || forceBottom) log.scrollTop = log.scrollHeight;
    else root.querySelector("[data-chat-latest]").hidden = false;
  }

  async function selectPeer(friend) {
    const input = root.querySelector("[data-chat-input]");
    if (peer && input) drafts.set(peer.public_id, input.value);
    peer = friend;
    const version = ++generation;
    threadLoading = true;
    items = new Map(); lastFetchedId = 0; hasOlder = false; accessLost = false; sending = false; pendingSend = null; threadLoaded = false;
    onPeer?.(friend);
    root.classList.add("has-thread");
    root.querySelector(".chat-thread").innerHTML = `<header class="chat-thread-heading"><button type="button" class="chat-back" data-chat-back aria-label="Back to conversations">←</button><div><h2>${e(friend.username)}</h2><p>Buddy · ${e(friend.public_id)}</p></div><details class="circle-row-menu"><summary aria-label="Conversation options">···</summary><div><button type="button" data-chat-block>Block account</button></div></details></header><div class="chat-history-bar"><button type="button" data-chat-older hidden>Load earlier messages</button></div><div class="chat-log" data-chat-log role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"><p class="chat-first-note">Opening your conversation…</p></div><button type="button" class="chat-latest" data-chat-latest hidden>New messages ↓</button><p class="chat-status" data-chat-status role="status"></p><form class="chat-composer" data-chat-form><label class="sr-only" for="buddy-chat-input">Message ${e(friend.username)}</label><textarea id="buddy-chat-input" data-chat-input rows="1" maxlength="2000" placeholder="Write a message…" required></textarea><button type="submit" class="button" data-chat-send>Send <span aria-hidden="true">↑</span></button></form>`;
    root.querySelector("[data-chat-input]").value = drafts.get(friend.public_id) || "";
    const heading = root.querySelector(".chat-thread-heading h2");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 680px)").matches) root.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    renderInbox();
    try {
      const data = await api.buddyMessages(token, friend.public_id, {}, options);
      if (!alive() || version !== generation) return;
      (data.messages || []).forEach(item => items.set(item.id, item));
      lastFetchedId = Math.max(0, ...(data.messages || []).map(item => item.id));
      hasOlder = data.has_more;
      threadLoaded = true;
      renderMessages(false, true);
      loadInbox().catch(() => {});
    } catch (error) {
      if (!alive() || version !== generation) return;
      notice(error.message || "This conversation could not be loaded.");
      accessLost = error.status === 403 || error.status === 404;
      if (accessLost) root.querySelector("[data-chat-send]").disabled = true;
      root.querySelector("[data-chat-log]").innerHTML = accessLost
        ? '<p class="chat-first-note">Your conversation is unavailable. Both students must be mutual buddies to chat.</p>'
        : '<p class="chat-first-note">Your history could not be loaded yet. We’ll retry when the connection returns.</p>';
    } finally {
      if (version === generation) threadLoading = false;
    }
  }

  async function loadOlder() {
    if (loadingOlder || !peer || !items.size) return;
    loadingOlder = true;
    const version = generation, button = root.querySelector("[data-chat-older]");
    button.disabled = true;
    try {
      const data = await api.buddyMessages(token, peer.public_id, { before: Math.min(...items.keys()) }, options);
      if (!alive() || version !== generation) return;
      data.messages.forEach(item => items.set(item.id, item));
      hasOlder = data.has_more;
      renderMessages(true);
    } catch (error) { if (alive()) notice(error.message); }
    finally { loadingOlder = false; if (button.isConnected) button.disabled = false; }
  }

  let polling = false;
  async function poll() {
    if (!alive()) return dispose();
    if (polling) return;
    polling = true;
    let nextPollDelay = 15000;
    try {
      if (document.hidden) return;
      const version = generation;
      if (peer && !accessLost && !threadLoading && root.classList.contains("has-thread")) {
        try {
          const wasLoaded = threadLoaded;
          const data = await api.buddyMessages(token, peer.public_id, threadLoaded ? { after: lastFetchedId } : {}, options);
          if (!alive() || version !== generation) return;
          if (!wasLoaded) hasOlder = data.has_more;
          threadLoaded = true;
          if (wasLoaded && data.has_more) nextPollDelay = 500;
          if (data.messages.length || !wasLoaded) {
            data.messages.forEach(item => items.set(item.id, item));
            lastFetchedId = Math.max(lastFetchedId, ...data.messages.map(item => item.id));
            renderMessages();
          }
          if (!sending) notice("");
        } catch (error) {
          if (alive() && version === generation) {
            notice(error.status === 403 ? "Your connection has changed. Messaging is paused." : "Connection interrupted. Your existing messages are still here.");
            accessLost = error.status === 403 || error.status === 404;
            if (accessLost) root.querySelector("[data-chat-send]").disabled = true;
          }
        }
      }
      try { await loadInbox(); } catch { /* Retain the existing inbox on transient failures. */ }
    } finally {
      polling = false;
      if (alive()) timer = setTimeout(poll, nextPollDelay);
    }
  }

  async function send(event) {
    if (!event.target.matches("[data-chat-form]")) return;
    event.preventDefault();
    if (!peer || sending || accessLost) return;
    const input = root.querySelector("[data-chat-input]"), body = input.value.trim();
    if (!body) return;
    const version = generation, target = peer;
    if (!pendingSend || pendingSend.body !== body) pendingSend = { body, client_id: crypto.randomUUID() };
    const payload = { ...pendingSend };
    sending = true;
    const button = root.querySelector("[data-chat-send]");
    button.disabled = true; button.textContent = "Sending…";
    notice("");
    try {
      const message = await api.sendBuddyMessage(token, target.public_id, payload, options);
      if (!alive() || version !== generation) return;
      items.set(message.id, message);
      if (input.value.trim() === body) input.value = "";
      drafts.delete(target.public_id); pendingSend = null;
      renderMessages(false, true);
      input.focus();
      loadInbox().catch(() => {});
    } catch (error) {
      if (alive() && version === generation) notice(`${error.message || "Message not sent."} Your draft is still here; try again.`);
    } finally {
      if (alive() && version === generation) { sending = false; button.disabled = accessLost; button.innerHTML = 'Send <span aria-hidden="true">↑</span>'; }
    }
  }

  function click(event) {
    const contact = event.target.closest("[data-chat-peer]");
    if (contact) {
      const friend = inbox.find(item => item.public_id === contact.dataset.chatPeer);
      if (friend && friend.public_id !== peer?.public_id) selectPeer(friend);
      else if (friend) { root.classList.add("has-thread"); onPeer?.(friend); clearTimeout(timer); poll(); }
    }
    if (event.target.closest("[data-chat-older]")) loadOlder();
    if (event.target.closest("[data-chat-back]")) { root.classList.remove("has-thread"); onPeer?.(null); root.querySelector(".chat-rail").querySelector("button")?.focus(); }
    if (event.target.closest("[data-chat-block]") && peer) onBlock(peer);
    const report = event.target.closest("[data-report-chat-message]");
    if (report) onReport(items.get(Number(report.dataset.reportChatMessage)));
    if (event.target.closest("[data-chat-latest]")) {
      const log = root.querySelector("[data-chat-log]");
      log.scrollTop = log.scrollHeight;
      event.target.hidden = true;
    }
  }
  function visibility() { if (!document.hidden && alive()) { clearTimeout(timer); timer = setTimeout(poll, 1000); } }
  function dispose() {
    if (disposed) return;
    disposed = true; clearTimeout(timer); abort.abort(); items.clear(); drafts.clear();
    root.removeEventListener("click", click);
    root.removeEventListener("submit", send);
    document.removeEventListener("visibilitychange", visibility);
  }
  root.addEventListener("click", click);
  root.addEventListener("submit", send);
  root.addEventListener("keydown", event => {
    if (event.target.matches("[data-chat-input]") && event.key === "Enter" && !event.shiftKey && !event.isComposing && window.matchMedia("(pointer: fine)").matches) {
      event.preventDefault(); event.target.form.requestSubmit();
    }
  });
  document.addEventListener("visibilitychange", visibility);
  activeMessenger = dispose;
  if (selectedPeer) selectPeer(selectedPeer);
  loadInbox().catch(error => {
    if (alive()) root.querySelector("[data-chat-inbox]").textContent = error.message || "Could not load conversations. Use Refresh to try again.";
  }).finally(() => { if (alive()) timer = setTimeout(poll, 15000); });
}

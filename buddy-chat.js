let activeMessenger = null;
export const ACTIVE_CHAT_SYNC_MS = 1000;

export function messageReceiptLabel(message) {
  return message.pending ? "Sending…" : message.read_at ? "Seen" : "Sent";
}

export function canMarkMessageSeen({ focused, hidden, conversationOpen, visibleHeight, messageHeight, logHeight, unobscured }) {
  return Boolean(focused && !hidden && conversationOpen && unobscured &&
    visibleHeight >= Math.min(messageHeight * .6, logHeight * .6) && visibleHeight > 0);
}

export function unmountBuddyChat() {
  activeMessenger?.();
  activeMessenger = null;
}

export function mountBuddyChat(root, { api, token, selectedPeer, escapeHtml: e, onPeer, onReport, onBlock, onInbox }) {
  unmountBuddyChat();
  const abort = new AbortController();
  const options = { signal: abort.signal, timeoutMs: 35000 };
  const drafts = new Map(), pendingByPeer = new Map();
  let disposed = false, timer, peer = null, generation = 0, items = new Map();
  let inbox = [], inboxPromise = null, lastInboxAt = 0, lastFetchedId = 0;
  let hasOlder = false, loadingOlder = false, sending = false, accessLost = false;
  let pendingSend = null, pendingVisual = null, threadLoaded = false, threadLoading = false;
  let polling = false, retryDelay = ACTIVE_CHAT_SYNC_MS;
  let readObserver = null, readTimer = null, readBusy = false, scanFrame = null;
  const dwellTimers = new Map(), readQueue = new Set(), readInFlight = new Set();
  const alive = () => !disposed && root.isConnected;
  const open = () => Boolean(peer && root.classList.contains("has-thread"));
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

  function loadInbox() {
    if (inboxPromise) return inboxPromise;
    inboxPromise = api.buddyInbox(token, options).then(data => {
      if (!alive()) return;
      inbox = data.conversations || [];
      lastInboxAt = Date.now();
      onInbox?.({ ...data, conversations: inbox, unread: inbox.reduce((total, item) => total + (item.unread || 0), 0) });
      renderInbox();
    }).finally(() => { inboxPromise = null; });
    return inboxPromise;
  }

  function clearReadTracking() {
    readObserver?.disconnect();
    readObserver = null;
    for (const timer of dwellTimers.values()) clearTimeout(timer);
    dwellTimers.clear();
    if (scanFrame !== null) cancelAnimationFrame(scanFrame);
    scanFrame = null;
  }

  function visiblyReadable(element) {
    const log = root.querySelector("[data-chat-log]");
    if (!log || !element?.isConnected || !open() || document.hidden || !document.hasFocus()) return false;
    const box = element.getBoundingClientRect(), area = log.getBoundingClientRect();
    const top = Math.max(0, box.top, area.top), bottom = Math.min(innerHeight, box.bottom, area.bottom);
    const left = Math.max(0, box.left, area.left), right = Math.min(innerWidth, box.right, area.right);
    if (right <= left || bottom <= top) return false;
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return canMarkMessageSeen({
      focused: document.hasFocus(), hidden: document.hidden, conversationOpen: open(),
      visibleHeight: bottom - top, messageHeight: box.height, logHeight: Math.min(area.height, innerHeight),
      unobscured: Boolean(hit && element.contains(hit)),
    });
  }

  function scanVisibleReads() {
    if (!alive()) return;
    for (const element of root.querySelectorAll(".chat-message.theirs[data-message-id]")) {
      const id = Number(element.dataset.messageId), message = items.get(id);
      if (!message || message.read_at || readQueue.has(id) || readInFlight.has(id)) continue;
      if (visiblyReadable(element)) {
        if (!dwellTimers.has(id)) {
          const version = generation;
          dwellTimers.set(id, setTimeout(() => {
            dwellTimers.delete(id);
            if (alive() && version === generation && visiblyReadable(element)) {
              readQueue.add(id);
              clearTimeout(readTimer);
              readTimer = setTimeout(flushReads, 120);
            }
          }, 350));
        }
      } else {
        clearTimeout(dwellTimers.get(id));
        dwellTimers.delete(id);
      }
    }
  }

  function queueReadScan() {
    if (scanFrame !== null || !alive()) return;
    scanFrame = requestAnimationFrame(() => { scanFrame = null; scanVisibleReads(); });
  }

  function watchVisibleMessages() {
    clearReadTracking();
    const log = root.querySelector("[data-chat-log]");
    if (!log) return;
    if ("IntersectionObserver" in window) {
      readObserver = new IntersectionObserver(queueReadScan, { root: log, threshold: [0, .25, .5, .75, 1] });
      root.querySelectorAll(".chat-message.theirs[data-message-id]").forEach(element => readObserver.observe(element));
    }
    queueReadScan();
  }

  async function flushReads() {
    if (!alive() || !open() || accessLost || readBusy || !readQueue.size || document.hidden || !document.hasFocus()) return;
    const target = peer.public_id, version = generation;
    const ids = [...readQueue].slice(0, 100);
    ids.forEach(id => { readQueue.delete(id); readInFlight.add(id); });
    readBusy = true;
    let failed = false;
    try {
      const data = await api.readBuddyMessages(token, target, ids, options);
      if (!alive() || version !== generation) return;
      for (const receipt of data.read || []) {
        const message = items.get(receipt.id);
        if (message) message.read_at = receipt.read_at;
      }
      lastInboxAt = 0;
    } catch (error) {
      if (alive() && version === generation && ![403, 404].includes(error.status)) {
        ids.forEach(id => readQueue.add(id));
        failed = true;
      }
    } finally {
      if (alive() && version === generation) {
        readBusy = false;
        ids.forEach(id => readInFlight.delete(id));
        if (readQueue.size) { clearTimeout(readTimer); readTimer = setTimeout(flushReads, failed ? 4000 : 120); }
      }
    }
  }

  function updateReceiptLabels(receipts) {
    for (const receipt of receipts || []) {
      const message = items.get(receipt.id);
      if (!message?.mine || !receipt.read_at) continue;
      message.read_at = receipt.read_at;
      const label = root.querySelector(`[data-message-receipt="${receipt.id}"]`);
      if (label) { label.textContent = "Seen"; label.classList.add("is-seen"); label.title = `Seen ${clock(receipt.read_at)}`; }
    }
  }

  function mergeMessages(messages) {
    for (const message of messages) items.set(message.id, message);
    if (pendingSend && messages.some(message => message.mine && message.client_id === pendingSend.client_id)) {
      const input = root.querySelector("[data-chat-input]");
      if (input && input.value.trim() === pendingSend.body) input.value = "";
      drafts.delete(peer.public_id); pendingByPeer.delete(peer.public_id);
      pendingSend = null; pendingVisual = null;
    }
  }

  function receiptIds() {
    const visible = [...root.querySelectorAll(".chat-message.mine[data-message-id]")].filter(visiblyReadable).map(node => Number(node.dataset.messageId));
    const unseen = [...items.values()].filter(item => item.mine && !item.read_at).sort((a, b) => b.id - a.id).map(item => item.id);
    return [...new Set([...visible.filter(id => items.get(id)?.mine && !items.get(id)?.read_at), ...unseen])].slice(0, 100);
  }

  function renderMessages(keepPosition = false, forceBottom = false) {
    if (!alive()) return;
    const log = root.querySelector("[data-chat-log]");
    if (!log) return;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
    const oldHeight = log.scrollHeight, oldTop = log.scrollTop;
    const sorted = [...items.values()].sort((a, b) => a.id - b.id);
    if (pendingVisual && !sorted.some(item => item.client_id === pendingVisual.client_id)) sorted.push(pendingVisual);
    let previousDay = "";
    log.innerHTML = sorted.length ? sorted.map(message => {
      const messageDay = day(message.created_at);
      const divider = messageDay !== previousDay ? `<p class="chat-day">${e(messageDay)}</p>` : "";
      previousDay = messageDay;
      return `${divider}<article class="chat-message ${message.mine ? "mine" : "theirs"} ${message.pending ? "is-pending" : ""}" ${message.pending ? "" : `data-message-id="${message.id}"`}><p>${e(message.body)}</p><footer><time datetime="${e(message.created_at)}">${e(clock(message.created_at))}</time>${message.mine ? `<span ${message.pending ? "" : `data-message-receipt="${message.id}"`} class="${message.read_at ? "is-seen" : ""}">${messageReceiptLabel(message)}</span>` : `<button type="button" data-report-chat-message="${message.id}" aria-label="Report this message" title="Report this message">Report</button>`}</footer></article>`;
    }).join("") : '<div class="chat-first-note"><p>No messages yet.</p><span>Say hello or share what you’re working on.</span></div>';
    root.querySelector("[data-chat-older]").hidden = !hasOlder;
    if (keepPosition) log.scrollTop = oldTop + log.scrollHeight - oldHeight;
    else if (atBottom || forceBottom) log.scrollTop = log.scrollHeight;
    else root.querySelector("[data-chat-latest]").hidden = false;
    watchVisibleMessages();
  }

  function wake() {
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(poll, 0);
    queueReadScan();
    if (readQueue.size) { clearTimeout(readTimer); readTimer = setTimeout(flushReads, 120); }
  }

  async function selectPeer(friend) {
    const input = root.querySelector("[data-chat-input]");
    if (peer && input) drafts.set(peer.public_id, input.value);
    clearReadTracking(); clearTimeout(readTimer); readQueue.clear(); readInFlight.clear(); readBusy = false;
    peer = friend;
    const version = ++generation;
    threadLoading = true; items = new Map(); lastFetchedId = 0; hasOlder = false; accessLost = false; sending = false;
    pendingSend = pendingByPeer.get(friend.public_id) || null; pendingVisual = null; threadLoaded = false;
    onPeer?.(friend);
    root.classList.add("has-thread");
    root.querySelector(".chat-thread").innerHTML = `<header class="chat-thread-heading"><button type="button" class="chat-back" data-chat-back aria-label="Back to conversations">←</button><div><h2 tabindex="-1">${e(friend.username)}</h2><p>Buddy · ${e(friend.public_id)}</p></div><details class="circle-row-menu"><summary aria-label="Conversation options">···</summary><div><button type="button" data-chat-block>Block account</button></div></details></header><div class="chat-history-bar"><button type="button" data-chat-older hidden>Load earlier messages</button></div><div class="chat-log" data-chat-log role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"><p class="chat-first-note">Opening your conversation…</p></div><button type="button" class="chat-latest" data-chat-latest hidden>New messages ↓</button><p class="chat-status" data-chat-status role="status"></p><form class="chat-composer" data-chat-form><label class="sr-only" for="buddy-chat-input">Message ${e(friend.username)}</label><textarea id="buddy-chat-input" data-chat-input rows="1" maxlength="2000" placeholder="Write a message…" required></textarea><button type="submit" class="button" data-chat-send>Send <span aria-hidden="true">↑</span></button></form>`;
    root.querySelector("[data-chat-input]").value = drafts.get(friend.public_id) || "";
    root.querySelector("[data-chat-log]").addEventListener("scroll", queueReadScan, { passive: true });
    root.querySelector(".chat-thread-heading h2").focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 680px)").matches) root.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    renderInbox();
    try {
      const data = await api.buddyMessages(token, friend.public_id, {}, options);
      if (!alive() || version !== generation) return;
      mergeMessages(data.messages || []);
      lastFetchedId = Math.max(0, ...(data.messages || []).map(item => item.id));
      hasOlder = data.has_more; threadLoaded = true; retryDelay = ACTIVE_CHAT_SYNC_MS;
      renderMessages(false, true);
    } catch (error) {
      if (!alive() || version !== generation) return;
      notice(error.message || "This conversation could not be loaded.");
      accessLost = [403, 404].includes(error.status);
      if (accessLost) root.querySelector("[data-chat-send]").disabled = true;
      root.querySelector("[data-chat-log]").innerHTML = accessLost
        ? '<p class="chat-first-note">Your conversation is unavailable. Both students must be mutual buddies to chat.</p>'
        : '<p class="chat-first-note">Your history could not be loaded yet. We’ll retry when the connection returns.</p>';
    } finally {
      if (version === generation) { threadLoading = false; wake(); }
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
      mergeMessages(data.messages || []); hasOlder = data.has_more; renderMessages(true);
    } catch (error) { if (alive() && version === generation) notice(error.message); }
    finally { loadingOlder = false; if (button.isConnected) button.disabled = false; }
  }

  async function poll() {
    if (!alive()) return dispose();
    if (polling) return;
    polling = true;
    let delay = open() && document.hasFocus() ? ACTIVE_CHAT_SYNC_MS : 12000;
    try {
      if (document.hidden) return;
      const version = generation;
      if (open() && !accessLost && !threadLoading) {
        try {
          const wasLoaded = threadLoaded, ids = receiptIds();
          const cursor = threadLoaded ? { after: lastFetchedId } : {};
          if (ids.length) cursor.receipt_ids = ids.join(",");
          const data = await api.buddyMessages(token, peer.public_id, cursor, options);
          if (!alive() || version !== generation) return;
          retryDelay = ACTIVE_CHAT_SYNC_MS;
          if (!wasLoaded) hasOlder = data.has_more;
          threadLoaded = true;
          if (wasLoaded && data.has_more) delay = 100;
          if (data.messages.length || !wasLoaded) {
            mergeMessages(data.messages);
            lastFetchedId = Math.max(lastFetchedId, ...data.messages.map(item => item.id));
            renderMessages();
          }
          updateReceiptLabels(data.receipts);
          queueReadScan();
          if (!sending) notice("");
        } catch (error) {
          if (alive() && version === generation) {
            notice(error.status === 403 ? "Your connection has changed. Messaging is paused." : "Connection interrupted. Your messages and draft are still here.");
            accessLost = [403, 404].includes(error.status);
            if (accessLost) root.querySelector("[data-chat-send]").disabled = true;
            retryDelay = Math.min(15000, Math.max(2000, retryDelay * 2)); delay = retryDelay;
          }
        }
      }
      // Inbox summaries are heavier and independent of fast message delivery.
      if (Date.now() - lastInboxAt >= 12000) loadInbox().catch(() => { lastInboxAt = Date.now(); });
    } finally {
      polling = false;
      if (alive()) { clearTimeout(timer); timer = setTimeout(poll, delay); }
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
    pendingByPeer.set(target.public_id, payload);
    pendingVisual = { ...payload, mine: true, pending: true, created_at: new Date().toISOString() };
    sending = true;
    const button = root.querySelector("[data-chat-send]");
    button.disabled = true; button.textContent = "Sending…"; notice(""); renderMessages(false, true);
    try {
      const message = await api.sendBuddyMessage(token, target.public_id, payload, options);
      if (!alive() || version !== generation) return;
      items.set(message.id, message); pendingVisual = null;
      if (input.value.trim() === body) input.value = "";
      drafts.delete(target.public_id); pendingByPeer.delete(target.public_id); pendingSend = null;
      renderMessages(false, true); input.focus(); lastInboxAt = 0; wake();
    } catch (error) {
      if (alive() && version === generation) {
        pendingVisual = null; renderMessages();
        notice(`${error.message || "Message not sent."} Your draft is still here; try again.`);
      }
    } finally {
      if (alive() && version === generation) { sending = false; button.disabled = accessLost; button.innerHTML = 'Send <span aria-hidden="true">↑</span>'; }
    }
  }

  function click(event) {
    const contact = event.target.closest("[data-chat-peer]");
    if (contact) {
      const friend = inbox.find(item => item.public_id === contact.dataset.chatPeer);
      if (friend && friend.public_id !== peer?.public_id) selectPeer(friend);
      else if (friend) { root.classList.add("has-thread"); onPeer?.(friend); wake(); }
    }
    if (event.target.closest("[data-chat-older]")) loadOlder();
    if (event.target.closest("[data-chat-back]")) {
      root.classList.remove("has-thread"); clearReadTracking(); onPeer?.(null);
      root.querySelector(".chat-rail button")?.focus();
    }
    if (event.target.closest("[data-chat-block]") && peer) onBlock(peer);
    const report = event.target.closest("[data-report-chat-message]");
    if (report) onReport(items.get(Number(report.dataset.reportChatMessage)));
    const latest = event.target.closest("[data-chat-latest]");
    if (latest) { const log = root.querySelector("[data-chat-log]"); log.scrollTop = log.scrollHeight; latest.hidden = true; queueReadScan(); }
  }
  function visibility() {
    if (document.hidden || !document.hasFocus()) clearReadTracking();
    else { watchVisibleMessages(); wake(); }
  }
  function dispose() {
    if (disposed) return;
    disposed = true; clearTimeout(timer); clearTimeout(readTimer); clearReadTracking(); abort.abort();
    items.clear(); drafts.clear(); pendingByPeer.clear(); readQueue.clear(); readInFlight.clear();
    root.removeEventListener("click", click); root.removeEventListener("submit", send);
    root.removeEventListener("keydown", keydown);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("focus", visibility); window.removeEventListener("blur", visibility);
    window.removeEventListener("scroll", queueReadScan, true);
  }
  root.addEventListener("click", click);
  root.addEventListener("submit", send);
  function keydown(event) {
    if (event.target.matches("[data-chat-input]") && event.key === "Enter" && !event.shiftKey && !event.isComposing && window.matchMedia("(pointer: fine)").matches) { event.preventDefault(); event.target.form.requestSubmit(); }
  }
  root.addEventListener("keydown", keydown);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("focus", visibility); window.addEventListener("blur", visibility);
  window.addEventListener("scroll", queueReadScan, true);
  activeMessenger = dispose;
  if (selectedPeer) selectPeer(selectedPeer);
  loadInbox().catch(error => { if (alive()) root.querySelector("[data-chat-inbox]").textContent = error.message || "Could not load conversations. Use Refresh to try again."; });
  timer = setTimeout(poll, ACTIVE_CHAT_SYNC_MS);
}

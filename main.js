console.log("Everything is working ");

(() => {
  if (window.__MY_EXTENSION_ALREADY_LOADED__) {
    return;
  }
  window.__MY_EXTENSION_ALREADY_LOADED__ = true;
  const TARGET_CLASS = "user-message-bubble-color";

  const seenNodes = new WeakSet();
  const processedMessages = new Set(); // stable messages only
  const pendingTimers = new WeakMap(); // debounce per node

  const messages = [];

  let panelVisible = false; // Start hidden so first click opens
  let panel;
  let isExtensionEnabled = false; // Track enabled state

  // --- STYLING ---
  function injectStyles() {
    // Only inject if not already present, though multiple calls are fine if managed
    if (document.getElementById("my-ext-styles")) return;

    const style = document.createElement("style");
    style.id = "my-ext-styles";
    style.textContent = `
      .my-ext-bar {
        position: fixed;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        width: 32px;
        height: 120px;
        background-color: #fffff
        border: 1px solid #e5e5e5;
        border-right: none;
        border-radius: 8px 0 0 8px;
        cursor: pointer;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #333;
        font-size: 16px;
        user-select: none;
        box-shadow: -2px 0 8px rgba(0,0,0,0.1);
        transition: background-color 0.2s;
      }
      .my-ext-bar:hover {
        background-color: #f7f7f8;
      }
      
      .my-ext-panel {
        position: fixed;
        top: 50%;
        right: 32px;
        transform: translateY(-50%);
        width: 350px;
        max-height: 80vh;
        background-color: #ffffff;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        border: 1px solid #e5e5e5;
        border-radius: 12px;
        z-index: 999999;
        padding: 16px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        overflow-y: auto;
        color: #333;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .my-ext-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        border-bottom: 1px solid #eee;
        padding-bottom: 8px;
        color: #222;
      }

      .my-ext-item {
        padding: 10px 12px;
        background: #f7f7f8;
        border: 1px solid transparent;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.4;
        cursor: pointer;
        transition: all 0.2s ease;
        color: #333;
        /* Full text display */
        white-space: normal;
        word-wrap: break-word;
      }

      .my-ext-item:hover {
        background: #ececf1;
        border-color: #d9d9e3;
        transform: translateX(2px);
      }

      @media (prefers-color-scheme: dark) {
        .my-ext-bar {
          background-color: #2b2b2b;
          border-color: #3a3a3a;
          color: #e6e6e6;
          box-shadow: -2px 0 8px rgba(0,0,0,0.4);
        }
        .my-ext-bar:hover {
          background-color: #333333;
        }

        .my-ext-panel {
          background-color: #1f1f1f;
          border-color: #333333;
          color: #e6e6e6;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }

        .my-ext-title {
          color: #f0f0f0;
          border-bottom-color: #2e2e2e;
        }

        .my-ext-item {
          background: #2a2a2a;
          color: #e6e6e6;
        }

        .my-ext-item:hover {
          background: #333333;
          border-color: #3a3a3a;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function shortText(text, limit = 150) {
    text = text.trim();
    return text.length > limit ? text.slice(0, limit) + "…" : text;
  }

  function extractMessage(el) {
    return el.innerText || el.textContent || "";
  }

  // Process a message bubble
  function processMessage(el) {
    const text = extractMessage(el).trim();
    if (!text) return;

    // Clear existing debounce timer for this element
    if (pendingTimers.has(el)) {
      clearTimeout(pendingTimers.get(el));
    }

    // Wait until text stabilizes (IMPORTANT)
    const timer = setTimeout(() => {
      const finalText = extractMessage(el).trim();
      if (!finalText) return;

      // Prevent duplicates (logical messages)
      if (processedMessages.has(finalText)) return;

      processedMessages.add(finalText);

      messages.push({
        text: finalText,
        element: el,
      });

      // Update panel if it exists and is visible (state handled by togglePanel/updateUI)
      //   if (panelVisible && isExtensionEnabled) {
      //     renderPanel();
      //   }
    }, 600); // <-- stability delay (key part)

    pendingTimers.set(el, timer);
  }

  // Initial scan
  document.querySelectorAll(`.${TARGET_CLASS}`).forEach(processMessage);

  // Observe new messages
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;

        if (node.classList?.contains(TARGET_CLASS)) {
          processMessage(node);
        }

        node.querySelectorAll?.(`.${TARGET_CLASS}`).forEach(processMessage);
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  function updateUI(enabled) {
    isExtensionEnabled = enabled;
    // panel.remove();

    if (enabled) {
      initSidebar();
      // User request: Always show panel when turned ON, resetting any manual toggle
      //   panelVisible = true;

      if (panelVisible) {
        // createPanel();
        renderPanel();
      }
    } else {
      removeSidebar();
      // Also close panel if open
      if (panel) {
        panel.remove();
        panel = null;
        panelVisible = false;
      }
    }
  }

  // Read initial state
  chrome.storage.local.get(["enabled"], (result) => {
    // Default to true (ON) if undefined
    updateUI(result.enabled !== false);
  });

  // Listen for changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      updateUI(changes.enabled.newValue === true);
    }
  });

  injectStyles(); // Always inject styles so classes are ready when needed

  // Sidebar

  function initSidebar() {
    if (!document.getElementById("my-extension-bar")) {
      const bar = document.createElement("div");
      bar.id = "my-extension-bar";
      bar.className = "my-ext-bar";
      bar.textContent = "💬";

      bar.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!panelVisible) {
          openPanel();
        }
      });
      document.body.appendChild(bar);
    }
  }

  function removeSidebar() {
    const bar = document.getElementById("my-extension-bar");
    if (bar) bar.remove();
  }

  // Panel

  function openPanel() {
    if (panelVisible) return;
    panelVisible = true;
    createPanel();
    renderPanel();
  }

  function closePanel() {
    if (!panelVisible) return;
    panelVisible = false;
    panel?.remove();
    panel = null;
  }

  function createPanel() {
    // 🔥 HARD CLEANUP (important)
    document.getElementById("my-extension-panel")?.remove();

    panel = document.createElement("div");
    panel.id = "my-extension-panel";
    panel.className = "my-ext-panel";
    panel.addEventListener("click", (e) => e.stopPropagation());

    document.body.appendChild(panel);
  }

  function renderPanel() {
    if (!panel) return;

    // 🔥 HARD RESET — THIS IS THE FIX
    panel.innerHTML = "";

    const title = document.createElement("div");
    title.className = "my-ext-title";
    title.textContent = `Messages (${messages.length})`;

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "8px";

    if (messages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "my-ext-item";
      empty.style.cursor = "default";
      empty.textContent = "No messages yet.";
      list.appendChild(empty);
    } else {
      messages.forEach((msgObj, index) => {
        const item = document.createElement("div");
        item.className = "my-ext-item";
        // Restored usage of shortText
        item.textContent = `${index + 1}. ${shortText(msgObj.text)}`;
        item.title = msgObj.text; // Tooltip for full text

        item.addEventListener("click", () => {
          msgObj.element.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });

          msgObj.element.style.outline = "2px solid #4a90e2";
          setTimeout(() => {
            msgObj.element.style.outline = "";
          }, 1200);
        });

        list.appendChild(item);
      });
    }

    panel.appendChild(title);
    panel.appendChild(list);
  }

  console.log("🚀 Chat collector & panel ready");
  document.addEventListener(
    "click",
    (e) => {
      if (!panelVisible) return;

      const bar = document.getElementById("my-extension-bar");
      const target = e.target;

      if (panel?.contains(target)) return;
      if (bar?.contains(target)) return;

      closePanel();
    },
    true,
  );
})();

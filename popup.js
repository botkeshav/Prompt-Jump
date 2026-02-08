const btn = document.getElementById("btn");
const statusText = document.getElementById("status-text");

document.addEventListener("DOMContentLoaded", () => {
  // Initialize state from storage (default ON if undefined)
  chrome.storage.local.get(["enabled"], ({ enabled }) => {
    updateButtonVisuals(enabled !== false);
  });
});

btn.addEventListener("click", () => {
  chrome.storage.local.get(["enabled"], ({ enabled }) => {
    // Current state defaults to true if undefined
    const currentState = enabled !== false;
    const newState = !currentState;

    chrome.storage.local.set({ enabled: newState }, () => {
      updateButtonVisuals(newState);
      // Reload logic removed as per request
    });
  });
});

function updateButtonVisuals(enabled) {
  if (enabled) {
    btn.classList.remove("btn--checked");
    statusText.textContent = "ON";
    statusText.classList.add("status--on");
  } else {
    btn.classList.add("btn--checked");
    statusText.textContent = "OFF";
    statusText.classList.remove("status--on");
  }
}

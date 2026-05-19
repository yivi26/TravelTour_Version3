/** Badge số yêu cầu HDV báo bận chờ duyệt — hiển thị trên mọi trang provider. */
async function refreshProviderAbsenceBadge() {
  const badges = document.querySelectorAll("[data-provider-absence-badge]");
  if (!badges.length) return;

  try {
    const headers =
      typeof providerAuthHeaders === "function" ? providerAuthHeaders() : {};
    const res = await fetch("/api/provider/absence-requests/pending-count", {
      headers,
    });
    if (!res.ok) return;

    const json = await res.json();
    const count = Number(json?.count ?? 0);

    badges.forEach((badge) => {
      if (count > 0) {
        badge.textContent = String(count);
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    });
  } catch {
    /* ignore */
  }
}

document.addEventListener("DOMContentLoaded", refreshProviderAbsenceBadge);

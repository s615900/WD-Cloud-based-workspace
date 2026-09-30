// 桌面版側邊欄：所有 desktop/*.html 共用同一份導覽結構，用 <script src="/desktop/nav.js"
// data-active="xxx"> 掛載，避免十個頁面各自重複貼一份側邊欄 HTML。
(function () {
  var currentScript = document.currentScript;
  var active = currentScript ? currentScript.getAttribute("data-active") || "" : "";

  var groups = [
    {
      label: "總覽",
      items: [
        { key: "index", href: "/desktop/index.html", label: "首頁" },
        { key: "calendar", href: "/desktop/calendar.html", label: "行事曆" },
        { key: "tasks", href: "/desktop/tasks.html", label: "待辦事項" },
      ],
    },
    {
      label: "接案商業",
      items: [
        { key: "clients", href: "/desktop/clients.html", label: "客戶資料" },
        { key: "quotes", href: "/desktop/quotes.html", label: "報價單" },
        { key: "contracts", href: "/desktop/contracts.html", label: "合約" },
        { key: "projects", href: "/desktop/projects.html", label: "專案進度" },
      ],
    },
    {
      label: "系統",
      items: [{ key: "settings", href: "/desktop/settings.html", label: "設定" }],
    },
  ];

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // 這幾個選單項目對應的頁面各自可能被 BUSINESS_MODULE_LOCKS 鎖定，鎖頭圖示只是
  // 提示用（讓人一看就知道不是壞掉），選單本身仍可以點進去看鎖定畫面。
  var LOCKABLE_KEYS = ["clients", "quotes", "contracts", "projects"];

  var html = '<div class="sidebar-brand">個人工作台</div>';
  groups.forEach(function (group) {
    html += '<div class="sidebar-group"><div class="sidebar-group-label">' + escapeHtml(group.label) + "</div>";
    group.items.forEach(function (item) {
      var cls = "sidebar-link" + (item.key === active ? " active" : "");
      html += '<a class="' + cls + '" data-key="' + item.key + '" href="' + item.href + '">' + escapeHtml(item.label) + "</a>";
    });
    html += "</div>";
  });

  var root = document.getElementById("sidebar-root");
  if (root) root.innerHTML = html;

  // 窄螢幕（平板／手機）把側邊欄變成可開合的抽屜：漢堡按鈕＋背景遮罩，
  // 用純 DOM 插入的方式加在 nav.js 裡，所有頁面自動一起有這個行為。
  if (root && root.parentElement) {
    var appShell = root.parentElement;

    var topbar = document.createElement("div");
    topbar.className = "mobile-topbar";
    topbar.innerHTML = '<button type="button" class="mobile-menu-btn" aria-label="開啟選單">☰</button>' +
      '<span class="mobile-topbar-brand">個人工作台</span>';
    appShell.insertBefore(topbar, root);

    var backdrop = document.createElement("div");
    backdrop.className = "sidebar-backdrop";
    appShell.appendChild(backdrop);

    function openSidebar() {
      root.classList.add("open");
      backdrop.classList.add("visible");
    }
    function closeSidebar() {
      root.classList.remove("open");
      backdrop.classList.remove("visible");
    }

    topbar.querySelector(".mobile-menu-btn").addEventListener("click", openSidebar);
    backdrop.addEventListener("click", closeSidebar);
    root.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeSidebar();
    });
  }

  if (root && window.DesktopCommon && window.DesktopCommon.getBusinessLocks) {
    window.DesktopCommon.getBusinessLocks().then(function (locks) {
      LOCKABLE_KEYS.forEach(function (key) {
        if (!locks[key]) return;
        var link = root.querySelector('.sidebar-link[data-key="' + key + '"]');
        if (link) link.insertAdjacentHTML("beforeend", ' <span class="sidebar-lock-icon" title="暫時鎖定">🔒</span>');
      });
    });
  }
})();

// 桌面版頁面共用的小工具：fetch 包裝（統一處理錯誤訊息）、HTML escape、台北時區日期字串。
window.DesktopCommon = (function () {
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // 統一處理 API 回應：非 2xx 或 body.success === false 都丟出 Error，訊息取自 body.error。
  async function apiFetch(url, options) {
    var res = await fetch(url, options);
    if (res.status === 401) {
      window.location.href = "/auth/login";
      throw new Error("未登入，導向登入頁");
    }
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      // 沒有 JSON body（例如空回應）就當作沒有額外資訊
    }
    if (!res.ok || (data && data.success === false)) {
      var msg = (data && data.error) || "HTTP " + res.status;
      throw new Error(msg);
    }
    return data;
  }

  function todayISO() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function currentMonth() {
    return todayISO().slice(0, 7);
  }

  function addMonths(monthStr, delta) {
    var year = parseInt(monthStr.slice(0, 4), 10);
    var month = parseInt(monthStr.slice(5, 7), 10) - 1 + delta;
    year += Math.floor(month / 12);
    month = ((month % 12) + 12) % 12;
    return year + "-" + String(month + 1).padStart(2, "0");
  }

  function showMessage(el, text, kind) {
    el.textContent = text;
    el.className = "message" + (kind ? " " + kind : "");
  }

  // 客戶簽核狀態徽章：後端一律回傳「簽核狀態(中文)」欄位的原始文字，
  // 只會是 未簽核／簽核中／簽核完成／已拒絕／空字串 其中之一，空字串視同未簽核。
  var SIGN_STATUS_MAP = {
    "未簽核": { cls: "badge-muted", text: "尚未送出" },
    "簽核中": { cls: "badge-gold", text: "待客戶確認" },
    "簽核完成": { cls: "badge-teal", text: "✓ 已確認" },
    "已拒絕": { cls: "badge-danger", text: "已拒絕" },
  };

  function signBadge(status) {
    var entry = SIGN_STATUS_MAP[status] || SIGN_STATUS_MAP["未簽核"];
    return '<span class="badge ' + entry.cls + '">' + entry.text + '</span>';
  }

  // 付款狀態徽章：後端一律回傳「付款狀態」欄位的原始文字（QUOTE_PAYMENT_STATUSES），
  // 空字串視同未付款。
  var PAYMENT_BADGE_MAP = {
    "未付款": "badge-unpaid",
    "已付訂金": "badge-deposit",
    "部分付款": "badge-partial",
    "已付款": "badge-paid",
    "已取消": "badge-cancelled",
  };
  function paymentBadge(status) {
    var cls = PAYMENT_BADGE_MAP[status] || PAYMENT_BADGE_MAP["未付款"];
    return '<span class="badge ' + cls + '">' + escapeHtml(status || "未付款") + '</span>';
  }

  // 已讀追蹤：對應 Ragic「已讀時間」欄位，跟簽核狀態（signBadge）是不同的兩件事——
  // 這欄只代表客戶是否/何時開啟過報價單的公開連結，不代表是否已核准或簽署。
  function readBadge(readAt) {
    if (readAt) {
      return '<div class="track-cell"><span class="badge badge-read">已讀</span><span class="ts">' + escapeHtml(readAt) + '</span></div>';
    }
    return '<span class="badge badge-unread">未讀</span>';
  }

  // 線上簽署狀態：對應 Ragic「簽署人／簽署時間」欄位（我們自訂簽署頁完成的簽名），
  // 跟簽核狀態（Ragic 內建簽核流程）也是不同的兩件事，兩者可能不同步。
  function onlineSignBadge(signerName, signedAt) {
    if (signedAt) {
      var who = signerName ? escapeHtml(signerName) + " 已簽署" : "已簽署";
      return '<div class="track-cell"><span class="badge badge-signed">' + who + '</span><span class="ts">' + escapeHtml(signedAt) + '</span></div>';
    }
    return '<span class="badge badge-unsigned">尚未簽署</span>';
  }

  // Ragic「開始簽核」目前只能在後台表單資料頁面手動點擊觸發，API 無法直接觸發，
  // 這裡先引導使用者跳轉過去手動點——之後如果有時間再研究瀏覽器自動化之類的替代方案。
  function promptRagicSign(ragicUrl) {
    window.open(ragicUrl, "_blank");
    alert("已為您開啟這筆資料的 Ragic 後台頁面。\n\n請在該頁面手動點擊「開始簽核」按鈕，系統就會寄送簽署連結給客戶。");
  }

  // 接案商業四頁（客戶資料／報價單／合約／專案進度）＋首頁摘要卡片共用：查詢每個模組
  // 各自是否鎖定（BUSINESS_MODULE_LOCKS，四頁可以分開解鎖）。同一頁只打一次（快取
  // promise），失敗就當作全部沒鎖定，不要因為這支設定 API 打不通就把整頁鎖死。
  var businessLocksPromise = null;
  function getBusinessLocks() {
    if (!businessLocksPromise) {
      businessLocksPromise = fetch("/api/desktop-settings")
        .then(function (res) { return res.json(); })
        .then(function (data) { return (data && data.businessModuleLocks) || {}; })
        .catch(function () { return {}; });
    }
    return businessLocksPromise;
  }

  // 鎖定時隱藏 opts.hideIds 指定的元素（新增按鈕、資料列表容器等）、顯示頁面上的
  // #lock-notice 卡片；回傳是否鎖定，呼叫端用回傳值決定要不要跳過資料 API 呼叫。
  function applyBusinessLock(locked, opts) {
    if (!locked) return false;
    ((opts && opts.hideIds) || []).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    var notice = document.getElementById("lock-notice");
    if (notice) notice.style.display = "";
    return true;
  }

  // 最小可用的富文字編輯器（NDA／備註共用）：粗體/斜體/底線/清單，用瀏覽器內建
  // execCommand 實作，不引入外部套件。container 必須是一個空的 <div>，回傳的
  // getHtml/setHtml 讀寫的是 contenteditable 區塊的 innerHTML（存進 Ragic 的就是這段 HTML）。
  function mountRichEditor(container, initialHtml) {
    container.classList.add("rich-editor");
    container.innerHTML =
      '<div class="rich-toolbar">' +
        '<button type="button" data-cmd="bold"><b>B</b></button>' +
        '<button type="button" data-cmd="italic"><i>I</i></button>' +
        '<button type="button" data-cmd="underline"><u>U</u></button>' +
        '<button type="button" data-cmd="insertUnorderedList">• 清單</button>' +
        '<button type="button" data-cmd="insertOrderedList">1. 清單</button>' +
      '</div>' +
      '<div class="rich-editable" contenteditable="true"></div>';
    var editable = container.querySelector(".rich-editable");
    editable.innerHTML = initialHtml || "";
    container.querySelectorAll("[data-cmd]").forEach(function (btn) {
      // mousedown 先擋掉預設行為，不然點按鈕當下 contenteditable 會先失焦，
      // execCommand 就抓不到原本選取的文字範圍。
      btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
      btn.addEventListener("click", function () {
        editable.focus();
        document.execCommand(btn.dataset.cmd, false, null);
      });
    });
    return {
      getHtml: function () { return editable.innerHTML; },
      setHtml: function (html) { editable.innerHTML = html || ""; },
    };
  }

  // 簽名板：畫布簽名共用邏輯（合約的客戶簽署／負責人簽署、報價單客戶簽署頁都是同一套）。
  function mountSignaturePad(canvas) {
    var ctx = canvas.getContext("2d");
    var drawing = false;
    var hasDrawn = false;
    var ratio = window.devicePixelRatio || 1;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#1B2530";
    }
    resize();

    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener("pointerdown", function (e) {
      drawing = true;
      hasDrawn = true;
      var p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      var p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    function stop() { drawing = false; }
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointerleave", stop);
    canvas.addEventListener("pointercancel", stop);

    return {
      clear: function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasDrawn = false;
      },
      isEmpty: function () { return !hasDrawn; },
      toDataUrl: function () { return canvas.toDataURL("image/png"); },
    };
  }

  return {
    escapeHtml, apiFetch, todayISO, currentMonth, addMonths, showMessage, signBadge, paymentBadge,
    readBadge, onlineSignBadge, promptRagicSign,
    getBusinessLocks, applyBusinessLock, mountRichEditor, mountSignaturePad,
  };
})();

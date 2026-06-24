const STORAGE_KEY = "autoleger.entries.v1";
const BUDGET_KEY = "autoleger.budget.v1";

const categories = {
  expense: [
    ["dining", "餐饮", "🍜", "#ff715b"],
    ["groceries", "日用", "🧺", "#40b96f"],
    ["transport", "交通", "🚕", "#438ff1"],
    ["shopping", "购物", "🛍️", "#b45ddd"],
    ["housing", "住房", "🏠", "#ed963d"],
    ["utilities", "水电", "💡", "#e8bd32"],
    ["entertainment", "娱乐", "🎮", "#e9558b"],
    ["health", "医疗", "💊", "#eb4b52"],
    ["education", "学习", "📚", "#40a8b5"],
    ["otherExpense", "其他", "•••", "#7c8494"]
  ],
  income: [
    ["salary", "工资", "💼", "#28a76e"],
    ["bonus", "奖金", "🎁", "#ee8a2a"],
    ["investment", "理财", "📈", "#427ad5"],
    ["refund", "退款", "↩", "#3db59c"],
    ["otherIncome", "其他", "•••", "#7c8494"]
  ]
};

const state = {
  entries: loadJSON(STORAGE_KEY, []),
  budget: Number(localStorage.getItem(BUDGET_KEY)) || 5000,
  selectedMonth: startOfMonth(new Date()),
  page: "home",
  filter: "all",
  query: "",
  editingId: null,
  entryType: "expense",
  selectedCategory: "dining",
  ocrResult: null,
  ocrJob: 0
};

let ocrWorkerPromise = null;

const els = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map(element => [element.id, element])
);

function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function saveEntries() {
  state.entries.sort((a, b) => new Date(b.date) - new Date(a.date) || b.createdAt - a.createdAt);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateKey(date) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${value.getMonth()}`;
}

function money(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function monthTitle(date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(date);
}

function categoryInfo(id) {
  return [...categories.expense, ...categories.income].find(item => item[0] === id)
    || ["otherExpense", "其他", "•••", "#7c8494"];
}

function entriesForMonth(date) {
  const key = monthKey(date);
  return state.entries.filter(entry => monthKey(new Date(`${entry.date}T12:00:00`)) === key);
}

function totals(entries) {
  return entries.reduce((result, entry) => {
    result[entry.type] += Number(entry.amount);
    return result;
  }, { income: 0, expense: 0 });
}

function empty(message, icon = "🧾") {
  return `<div class="empty"><span>${icon}</span>${message}</div>`;
}

function entryHTML(entry) {
  const [, title, icon, color] = categoryInfo(entry.category);
  const detail = escapeHTML(entry.note || formatTime(entry.createdAt));
  return `
    <button class="entry-row" data-entry-id="${entry.id}">
      <span class="category-icon" style="color:${color};background:${color}22">${icon}</span>
      <span class="entry-main"><b>${title}</b><small>${detail}</small></span>
      <b class="entry-amount ${entry.type}">${entry.type === "expense" ? "−" : "+"}${money(entry.amount)}</b>
    </button>`;
}

function renderHome() {
  const entries = entriesForMonth(state.selectedMonth);
  const total = totals(entries);
  const balance = total.income - total.expense;
  const isCurrent = monthKey(state.selectedMonth) === monthKey(new Date());

  els.monthLabel.textContent = "只存在你的手机里";
  els.currentMonthButton.textContent = monthTitle(state.selectedMonth);
  els.nextMonth.disabled = isCurrent;
  els.balanceValue.textContent = money(balance);
  els.balanceValue.style.color = balance < 0 ? "var(--red)" : "";
  els.incomeValue.textContent = money(total.income);
  els.expenseValue.textContent = money(total.expense);

  els.budgetCard.hidden = !isCurrent;
  if (isCurrent) {
    const ratio = state.budget > 0 ? total.expense / state.budget : 0;
    els.budgetRemaining.textContent = `剩余 ${money(Math.max(state.budget - total.expense, 0))}`;
    els.budgetUsed.textContent = `已用 ${money(total.expense)}`;
    els.budgetPercent.textContent = `${Math.round(ratio * 100)}%`;
    els.budgetProgress.style.width = `${Math.min(ratio * 100, 100)}%`;
    els.budgetProgress.classList.toggle("over", ratio > 1);
  }

  const expenseEntries = entries.filter(entry => entry.type === "expense");
  const grouped = expenseEntries.reduce((result, entry) => {
    result[entry.category] = (result[entry.category] || 0) + Number(entry.amount);
    return result;
  }, {});
  const stats = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maximum = stats[0]?.[1] || 1;
  els.categoryStats.innerHTML = stats.length ? stats.map(([id, amount]) => {
    const [, title, icon, color] = categoryInfo(id);
    return `
      <div class="stat-row">
        <span class="category-icon" style="color:${color};background:${color}22">${icon}</span>
        <div>
          <div class="stat-top"><span>${title}</span><b>${money(amount)}</b></div>
          <div class="stat-bar"><i style="width:${amount / maximum * 100}%;background:${color}"></i></div>
        </div>
      </div>`;
  }).join("") : empty("记下支出后，这里会显示分类统计", "▥");

  els.recentEntries.innerHTML = entries.length
    ? entries.slice(0, 5).map(entryHTML).join("")
    : empty("这个月还没有记录，点右上角记一笔", "✎");
}

function renderRecords() {
  let entries = [...state.entries];
  if (state.filter !== "all") entries = entries.filter(entry => entry.type === state.filter);
  if (state.query) {
    const query = state.query.toLocaleLowerCase();
    entries = entries.filter(entry => {
      const [, title] = categoryInfo(entry.category);
      return `${entry.note} ${title}`.toLocaleLowerCase().includes(query);
    });
  }

  const groups = entries.reduce((result, entry) => {
    (result[entry.date] ||= []).push(entry);
    return result;
  }, {});

  els.recordList.innerHTML = Object.keys(groups).length
    ? Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)).map(([date, dayEntries]) => {
        const dayTotals = totals(dayEntries);
        return `
          <section class="date-group">
            <div class="date-heading">
              <span>${friendlyDate(date)}</span>
              <span>收 ${money(dayTotals.income)}　支 ${money(dayTotals.expense)}</span>
            </div>
            <div class="entry-list">${dayEntries.map(entryHTML).join("")}</div>
          </section>`;
      }).join("")
    : empty(state.query ? "没有找到相关记录" : "还没有记录", "⌕");
}

function renderSettings() {
  els.budgetInput.value = state.budget;
}

function render() {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page.dataset.page === state.page);
  });
  document.querySelectorAll("[data-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === state.page);
  });
  els.pageTitle.textContent = { home: "我的账本", records: "收支明细", settings: "设置" }[state.page];
  els.headerAddButton.hidden = state.page === "settings";
  els.monthLabel.textContent = state.page === "home" ? "只存在你的手机里" : "";
  if (state.page === "home") renderHome();
  if (state.page === "records") renderRecords();
  if (state.page === "settings") renderSettings();
}

function friendlyDate(value) {
  const target = new Date(`${value}T12:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dateKey(target) === dateKey(today)) return "今天";
  if (dateKey(target) === dateKey(yesterday)) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(target);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(timestamp || Date.now()));
}

function escapeHTML(value) {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function openAddMethod() {
  if (typeof els.addMethodDialog.showModal === "function") {
    els.addMethodDialog.showModal();
  } else {
    openEntry();
  }
}

function setOCRProgress(progress, label, hint) {
  const value = Math.max(0, Math.min(1, Number(progress) || 0));
  els.ocrProgress.style.width = `${Math.round(value * 100)}%`;
  els.ocrPercent.textContent = `${Math.round(value * 100)}%`;
  if (label) els.ocrStatusText.textContent = label;
  if (hint) els.ocrStatusHint.textContent = hint;
}

function translateOCRStatus(message) {
  const labels = {
    "loading tesseract core": "加载识别引擎…",
    "loaded tesseract core": "识别引擎已加载",
    "initializing tesseract": "初始化识别引擎…",
    "initialized tesseract": "识别引擎已就绪",
    "loading language traineddata": "下载中文识别模型…",
    "loaded language traineddata": "中文模型已加载",
    "initializing api": "准备文字识别…",
    "initialized api": "开始识别文字",
    "recognizing text": "正在识别截图…"
  };
  return labels[message.status] || "正在处理截图…";
}

function getOCRWorker() {
  if (!window.Tesseract?.createWorker) {
    throw new Error("识别组件加载失败，请检查网络后重试");
  }
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = window.Tesseract.createWorker(["chi_sim", "eng"], 1, {
      logger(message) {
        const progress = message.status === "recognizing text"
          ? 0.5 + (Number(message.progress) || 0) * 0.48
          : Math.min(0.48, (Number(message.progress) || 0) * 0.48);
        setOCRProgress(progress, translateOCRStatus(message));
      },
      errorHandler(error) {
        console.error("OCR worker error", error);
      }
    }).catch(error => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

async function startScreenshotOCR(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("请选择图片文件");
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showToast("图片过大，请选择小于 25MB 的截图");
    return;
  }

  const job = ++state.ocrJob;
  state.ocrResult = null;
  const previewURL = URL.createObjectURL(file);
  els.ocrPreview.src = previewURL;
  setOCRProgress(0.02, "准备图片…", "截图只在当前设备中处理，不会保存到云端。");
  els.ocrDialog.showModal();

  try {
    const canvas = await AutoLedgerOCR.preprocessImage(file);
    if (job !== state.ocrJob) return;
    setOCRProgress(0.08, "图片已优化…");
    const worker = await getOCRWorker();
    if (job !== state.ocrJob) return;
    const result = await worker.recognize(canvas);
    if (job !== state.ocrJob) return;

    setOCRProgress(1, "识别完成");
    const parsed = AutoLedgerOCR.parseReceipt(result.data.text);
    state.ocrResult = parsed;
    setTimeout(() => {
      if (els.ocrDialog.open) els.ocrDialog.close();
      openEntry(null, parsed);
    }, 250);
  } catch (error) {
    console.error(error);
    if (els.ocrDialog.open) els.ocrDialog.close();
    alert(`截图识别失败：${error.message || "请检查网络后重试"}\n\n你仍可以使用手动记账。`);
  } finally {
    URL.revokeObjectURL(previewURL);
    els.screenshotInput.value = "";
  }
}

function renderOCRReview() {
  const result = state.ocrResult;
  els.ocrReview.hidden = !result;
  if (!result) return;

  const summaryParts = [];
  if (result.merchant) summaryParts.push(result.merchant);
  summaryParts.push(result.type === "income" ? "识别为收入" : "识别为支出");
  els.ocrSummary.textContent = summaryParts.join(" · ");
  els.ocrRawText.textContent = result.rawText || "未识别到文字";

  els.ocrAmountSection.hidden = !result.amounts.length;
  els.ocrAmountCandidates.innerHTML = result.amounts.map(candidate => `
    <button type="button" class="amount-candidate ${Number(els.amountInput.value) === candidate.amount ? "selected" : ""}"
      data-ocr-amount="${candidate.amount}">
      ${money(candidate.amount)}
    </button>`).join("");

  const duplicate = result.amount
    ? findDuplicate(result.amount, result.date, result.merchant)
    : null;
  const warnings = [...result.warnings];
  if (duplicate) warnings.unshift("发现同一天、同金额的记录，可能是重复账目。");
  els.ocrWarning.hidden = warnings.length === 0;
  els.ocrWarning.textContent = warnings.join(" ");
}

function findDuplicate(amount, date, note, ignoreId = null) {
  const normalizedNote = String(note || "").trim().toLocaleLowerCase();
  return state.entries.find(entry => {
    if (entry.id === ignoreId || entry.date !== date) return false;
    if (Math.round(Number(entry.amount) * 100) !== Math.round(Number(amount) * 100)) return false;
    const existingNote = String(entry.note || "").trim().toLocaleLowerCase();
    return !normalizedNote || !existingNote
      || existingNote.includes(normalizedNote)
      || normalizedNote.includes(existingNote);
  });
}

function openEntry(id = null, suggestion = null) {
  const entry = id ? state.entries.find(item => item.id === id) : null;
  state.ocrResult = suggestion || null;
  state.editingId = entry?.id || null;
  state.entryType = entry?.type || suggestion?.type || "expense";
  state.selectedCategory = entry?.category || suggestion?.category || categories[state.entryType][0][0];
  els.entryDialogTitle.textContent = entry ? "编辑记录" : "记一笔";
  els.amountInput.value = entry?.amount || suggestion?.amount || "";
  els.dateInput.value = entry?.date || suggestion?.date || dateKey(new Date());
  els.noteInput.value = entry?.note || suggestion?.merchant || "";
  els.deleteEntryButton.classList.toggle("visible", Boolean(entry));
  renderEntryType();
  renderOCRReview();
  els.entryDialog.showModal();
  if (!suggestion) setTimeout(() => els.amountInput.focus(), 120);
}

function renderEntryType() {
  document.querySelectorAll("[data-entry-type]").forEach(button => {
    button.classList.toggle("active", button.dataset.entryType === state.entryType);
  });
  els.categoryPicker.innerHTML = categories[state.entryType].map(([id, title, icon, color]) => `
    <button type="button" class="category-option ${id === state.selectedCategory ? "selected" : ""}" data-category="${id}">
      <span class="category-icon" style="color:${color};background:${id === state.selectedCategory ? color : `${color}22`}">${icon}</span>
      <span>${title}</span>
    </button>`).join("");
}

function saveEntry(event) {
  event.preventDefault();
  const amount = Number(els.amountInput.value);
  if (!amount || amount <= 0) return showToast("请输入正确金额");

  const existing = state.entries.find(entry => entry.id === state.editingId);
  const duplicate = findDuplicate(
    amount,
    els.dateInput.value,
    els.noteInput.value,
    existing?.id || null
  );
  if (!existing && duplicate && !confirm("发现同一天、同金额的相似记录，可能重复。仍然保存吗？")) {
    return;
  }

  const entry = {
    id: existing?.id || crypto.randomUUID(),
    type: state.entryType,
    category: state.selectedCategory,
    amount,
    date: els.dateInput.value,
    note: els.noteInput.value.trim(),
    createdAt: existing?.createdAt || Date.now()
  };

  if (existing) Object.assign(existing, entry);
  else state.entries.push(entry);
  saveEntries();
  state.ocrResult = null;
  els.entryDialog.close();
  render();
  showToast(existing ? "记录已更新" : "已记一笔");
}

function deleteEditingEntry() {
  if (!state.editingId || !confirm("确定删除这条记录吗？")) return;
  state.entries = state.entries.filter(entry => entry.id !== state.editingId);
  saveEntries();
  state.ocrResult = null;
  els.entryDialog.close();
  render();
  showToast("记录已删除");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function exportBackup() {
  const data = JSON.stringify({
    app: "轻账",
    version: 1,
    exportedAt: new Date().toISOString(),
    budget: state.budget,
    entries: state.entries
  }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `轻账备份-${dateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  try {
    const content = JSON.parse(await file.text());
    const entries = Array.isArray(content) ? content : content.entries;
    if (!Array.isArray(entries)) throw new Error("格式不正确");
    state.entries = entries.filter(entry =>
      entry && ["income", "expense"].includes(entry.type) && Number(entry.amount) > 0 && entry.date
    );
    if (Number(content.budget) >= 0) {
      state.budget = Number(content.budget);
      localStorage.setItem(BUDGET_KEY, state.budget);
    }
    saveEntries();
    render();
    showToast(`已恢复 ${state.entries.length} 条记录`);
  } catch {
    alert("恢复失败，请选择轻账导出的 JSON 备份文件。");
  } finally {
    els.importInput.value = "";
  }
}

document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", () => {
    state.page = button.dataset.tab;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

els.headerAddButton.addEventListener("click", openAddMethod);
els.cancelMethodButton.addEventListener("click", () => els.addMethodDialog.close());
els.manualChoiceButton.addEventListener("click", () => {
  els.addMethodDialog.close();
  openEntry();
});
els.screenshotChoiceButton.addEventListener("click", () => els.screenshotInput.click());
els.screenshotInput.addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  els.addMethodDialog.close();
  startScreenshotOCR(file);
});
els.cancelOCRButton.addEventListener("click", () => {
  state.ocrJob += 1;
  if (els.ocrDialog.open) els.ocrDialog.close();
  els.screenshotInput.value = "";
});
els.previousMonth.addEventListener("click", () => {
  state.selectedMonth = new Date(state.selectedMonth.getFullYear(), state.selectedMonth.getMonth() - 1, 1);
  renderHome();
});
els.nextMonth.addEventListener("click", () => {
  if (monthKey(state.selectedMonth) === monthKey(new Date())) return;
  state.selectedMonth = new Date(state.selectedMonth.getFullYear(), state.selectedMonth.getMonth() + 1, 1);
  renderHome();
});
els.currentMonthButton.addEventListener("click", () => {
  state.selectedMonth = startOfMonth(new Date());
  renderHome();
});

els.recordFilters.addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  els.recordFilters.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  renderRecords();
});
els.searchInput.addEventListener("input", event => {
  state.query = event.target.value.trim();
  renderRecords();
});

document.addEventListener("click", event => {
  const row = event.target.closest("[data-entry-id]");
  if (row) openEntry(row.dataset.entryId);
  const category = event.target.closest("[data-category]");
  if (category) {
    state.selectedCategory = category.dataset.category;
    renderEntryType();
  }
  const amountCandidate = event.target.closest("[data-ocr-amount]");
  if (amountCandidate) {
    els.amountInput.value = amountCandidate.dataset.ocrAmount;
    document.querySelectorAll("[data-ocr-amount]").forEach(button => {
      button.classList.toggle("selected", button === amountCandidate);
    });
  }
});

document.querySelectorAll("[data-entry-type]").forEach(button => {
  button.addEventListener("click", () => {
    state.entryType = button.dataset.entryType;
    state.selectedCategory = categories[state.entryType][0][0];
    renderEntryType();
  });
});

els.entryForm.addEventListener("submit", saveEntry);
els.cancelEntryButton.addEventListener("click", () => {
  state.ocrResult = null;
  els.entryDialog.close();
});
els.deleteEntryButton.addEventListener("click", deleteEditingEntry);

els.saveBudgetButton.addEventListener("click", () => {
  const value = Number(els.budgetInput.value);
  if (value < 0 || Number.isNaN(value)) return showToast("请输入正确预算");
  state.budget = value;
  localStorage.setItem(BUDGET_KEY, value);
  showToast("预算已保存");
});
els.exportButton.addEventListener("click", exportBackup);
els.importInput.addEventListener("change", event => {
  if (event.target.files[0]) importBackup(event.target.files[0]);
});
els.clearButton.addEventListener("click", () => {
  if (!state.entries.length) return showToast("当前没有记录");
  if (!confirm("清空后无法撤销，建议先导出备份。确定继续吗？")) return;
  state.entries = [];
  saveEntries();
  render();
  showToast("全部记录已清空");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

render();

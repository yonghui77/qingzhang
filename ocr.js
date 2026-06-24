(function (root) {
  "use strict";

  const incomeWords = [
    "退款成功", "退款金额", "已退款", "收款成功", "收款金额", "收款到账",
    "已到账", "到账金额", "入账", "转入", "收入"
  ];

  const expenseWords = [
    "支付成功", "付款成功", "交易成功", "支付金额", "付款金额", "实付款",
    "实付", "扣款", "支出", "转账成功", "付款给"
  ];

  const amountLabels = [
    ["实付款", 120], ["实付", 115], ["支付金额", 112], ["付款金额", 110],
    ["交易金额", 105], ["收款金额", 105], ["退款金额", 105], ["到账金额", 100],
    ["合计", 82], ["总计", 80], ["金额", 65]
  ];

  const negativeAmountWords = [
    "余额", "优惠", "优惠券", "折扣", "原价", "应付", "积分", "订单号",
    "交易单号", "商户单号", "手续费", "服务费", "剩余"
  ];

  const categoryRules = [
    ["dining", ["美团外卖", "饿了么", "餐饮", "饭店", "餐厅", "咖啡", "奶茶", "火锅", "烧烤", "便利店", "麦当劳", "肯德基", "星巴克"]],
    ["transport", ["滴滴", "高德打车", "出租车", "地铁", "公交", "铁路", "火车", "机票", "航空", "停车", "加油", "充电站"]],
    ["shopping", ["淘宝", "天猫", "京东", "拼多多", "抖音商城", "唯品会", "购物", "服饰", "商场"]],
    ["groceries", ["超市", "生鲜", "盒马", "永辉", "沃尔玛", "山姆", "日用", "百货"]],
    ["housing", ["房租", "物业", "公寓", "住房", "租金"]],
    ["utilities", ["电费", "水费", "燃气", "话费", "宽带", "中国移动", "中国联通", "中国电信"]],
    ["entertainment", ["电影", "影院", "游戏", "会员", "视频", "音乐", "KTV", "门票"]],
    ["health", ["医院", "药房", "药店", "医疗", "挂号", "诊所", "体检"]],
    ["education", ["书店", "课程", "培训", "学费", "教育", "考试"]],
    ["salary", ["工资", "薪资", "薪酬"]],
    ["bonus", ["奖金", "年终奖", "红包"]],
    ["investment", ["理财", "基金", "证券", "利息", "收益"]],
    ["refund", ["退款", "退货"]]
  ];

  function normalizeText(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .replace(/[，]/g, ",")
      .replace(/[。]/g, ".")
      .replace(/[：]/g, ":")
      .replace(/[￥]/g, "¥")
      .replace(/[Oo](?=\d)/g, "0")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function detectType(text) {
    const normalized = normalizeText(text);
    const incomeScore = incomeWords.reduce((score, word) => score + (normalized.includes(word) ? (word.includes("退款") ? 4 : 2) : 0), 0);
    const expenseScore = expenseWords.reduce((score, word) => score + (normalized.includes(word) ? 2 : 0), 0);
    return incomeScore > expenseScore ? "income" : "expense";
  }

  function parseNumber(value) {
    const normalized = String(value)
      .replace(/\s/g, "")
      .replace(/,/g, "")
      .replace(/[^\d.]/g, "");
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0 && amount < 100000000 ? amount : null;
  }

  function addCandidate(map, rawValue, score, line, reason) {
    const amount = parseNumber(rawValue);
    if (amount === null) return;
    const key = amount.toFixed(2);
    const existing = map.get(key);
    const candidate = { amount, score, line: line.trim(), reason };
    if (!existing || candidate.score > existing.score) map.set(key, candidate);
  }

  function extractAmounts(text) {
    const lines = normalizeText(text).split("\n").map(line => line.trim()).filter(Boolean);
    const candidates = new Map();

    lines.forEach((line, index) => {
      const nearby = `${lines[index - 1] || ""} ${line} ${lines[index + 1] || ""}`;
      const hasNegativeContext = negativeAmountWords.some(word => line.includes(word));

      amountLabels.forEach(([label, baseScore]) => {
        if (!nearby.includes(label)) return;
        const expressions = [
          new RegExp(`${label}[^\\d¥]{0,12}¥?\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)`, "i"),
          /¥\s*([0-9][0-9,]*(?:\.\d{1,2})?)/
        ];
        expressions.forEach(expression => {
          const match = nearby.match(expression);
          if (match) addCandidate(candidates, match[1], baseScore - (hasNegativeContext ? 55 : 0), line, label);
        });
      });

      for (const match of line.matchAll(/¥\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g)) {
        addCandidate(candidates, match[1], 75 - (hasNegativeContext ? 55 : 0), line, "货币符号");
      }

      for (const match of line.matchAll(/(?:^|\s)([0-9]{1,6}\.\d{2})(?:\s|元|$)/g)) {
        addCandidate(candidates, match[1], 42 - (hasNegativeContext ? 35 : 0), line, "小数金额");
      }
    });

    return [...candidates.values()]
      .filter(candidate => candidate.score > 10)
      .sort((a, b) => b.score - a.score || b.amount - a.amount)
      .slice(0, 5);
  }

  function validDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      ? date
      : null;
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function extractDate(text, now = new Date()) {
    const normalized = normalizeText(text);
    const fullMatches = [
      ...normalized.matchAll(/(20\d{2})[年./-]\s*(\d{1,2})[月./-]\s*(\d{1,2})日?/g)
    ];
    for (const match of fullMatches) {
      const date = validDate(Number(match[1]), Number(match[2]), Number(match[3]));
      if (date) return { value: formatDate(date), confidence: "high", source: match[0] };
    }

    const shortMatch = normalized.match(/(?:交易时间|付款时间|支付时间|创建时间|时间|日期)?[^\d]{0,5}(\d{1,2})[月./-]\s*(\d{1,2})日?/);
    if (shortMatch) {
      let year = now.getFullYear();
      let date = validDate(year, Number(shortMatch[1]), Number(shortMatch[2]));
      if (date && date.getTime() > now.getTime() + 3 * 86400000) {
        date = validDate(year - 1, Number(shortMatch[1]), Number(shortMatch[2]));
      }
      if (date) return { value: formatDate(date), confidence: "medium", source: shortMatch[0] };
    }

    return { value: formatDate(now), confidence: "low", source: "" };
  }

  function cleanMerchant(value) {
    return String(value || "")
      .replace(/^[\s:：\-]+/, "")
      .replace(/(?:交易成功|支付成功|付款成功|收款成功).*$/, "")
      .replace(/[|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
  }

  function extractMerchant(text) {
    const lines = normalizeText(text).split("\n").map(line => line.trim()).filter(Boolean);
    const labels = ["商户名称", "商户", "收款方", "付款给", "交易对象", "对方", "收款人", "商品说明", "商品"];

    for (const label of labels) {
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.includes(label)) continue;
        const inlineValue = cleanMerchant(line.slice(line.indexOf(label) + label.length));
        if (inlineValue && !/^[\d¥.:：-]+$/.test(inlineValue)) {
          return { value: inlineValue, confidence: "high", source: line };
        }
        const nextValue = cleanMerchant(lines[index + 1]);
        if (nextValue && !/^[\d¥.:：-]+$/.test(nextValue)) {
          return { value: nextValue, confidence: "medium", source: lines[index + 1] };
        }
      }
    }

    const ignored = /支付成功|付款成功|交易成功|账单详情|交易详情|订单详情|微信支付|支付宝|中国|银行|¥|\d{2}:\d{2}/;
    const fallback = lines.find(line =>
      line.length >= 2 && line.length <= 24 && !ignored.test(line) && /[\u4e00-\u9fffA-Za-z]/.test(line)
    );
    return { value: cleanMerchant(fallback), confidence: fallback ? "low" : "none", source: fallback || "" };
  }

  function detectCategory(text, type, merchant) {
    const haystack = `${normalizeText(text)} ${merchant || ""}`.toLowerCase();
    for (const [category, words] of categoryRules) {
      if (words.some(word => haystack.includes(word.toLowerCase()))) {
        if (type === "income" && ["dining", "transport", "shopping", "groceries", "housing", "utilities", "entertainment", "health", "education"].includes(category)) {
          continue;
        }
        return category;
      }
    }
    return type === "income" ? "otherIncome" : "otherExpense";
  }

  function parseReceipt(text, now = new Date()) {
    const normalized = normalizeText(text);
    const type = detectType(normalized);
    const amounts = extractAmounts(normalized);
    const date = extractDate(normalized, now);
    const merchant = extractMerchant(normalized);
    const category = detectCategory(normalized, type, merchant.value);
    const warnings = [];

    if (!amounts.length) warnings.push("没有可靠识别到金额，请手动填写。");
    else if (amounts[0].score < 70) warnings.push("金额可信度较低，请重点核对。");
    if (date.confidence === "low") warnings.push("没有识别到交易日期，已使用今天。");
    if (!merchant.value) warnings.push("没有识别到商户，可手动填写备注。");

    return {
      type,
      amounts,
      amount: amounts[0]?.amount || null,
      date: date.value,
      merchant: merchant.value,
      merchantConfidence: merchant.confidence,
      category,
      warnings,
      rawText: normalized
    };
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("无法读取图片"));
      };
      image.src = url;
    });
  }

  async function preprocessImage(file) {
    const image = await loadImage(file);
    const pixelCount = image.naturalWidth * image.naturalHeight;
    let scale = image.naturalWidth < 900 ? 1.6 : 1;
    if (pixelCount * scale * scale > 6500000) {
      scale = Math.sqrt(6500000 / pixelCount);
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const enhanced = Math.max(0, Math.min(255, (gray - 128) * 1.22 + 128));
      data[index] = enhanced;
      data[index + 1] = enhanced;
      data[index + 2] = enhanced;
    }
    context.putImageData(imageData, 0, 0);
    return canvas;
  }

  root.AutoLedgerOCR = {
    normalizeText,
    detectType,
    extractAmounts,
    extractDate,
    extractMerchant,
    detectCategory,
    parseReceipt,
    preprocessImage
  };
})(typeof window !== "undefined" ? window : globalThis);

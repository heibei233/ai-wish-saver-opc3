const STORAGE_KEY = "ai-wish-saver-state-v3";

const defaultState = {
  version: 3,
  day: 1,
  streak: 1,
  progress: 24,
  coins: 56,
  discount: 2,
  pity: 1,
  aiVariant: 0,
  wheelRotation: 0,
  chestOpened: false,
  couponRedeemed: false,
  checkedOut: false,
  shippingUnlocked: false,
  tasks: [
    {
      id: "browse",
      title: "浏览 3 件同类新品",
      desc: "AI判断这是新用户最轻的第一步：30秒即可完成，不打断购物节奏。",
      signal: "行为信号：商品兴趣 +12",
      progress: 8,
      coins: 6,
      discount: 0,
      done: false,
    },
    {
      id: "favorite",
      title: "收藏 1 件备选商品",
      desc: "让愿望不只绑定单一SKU，后续可做降价提醒和替代推荐。",
      signal: "行为信号：购买意图 +18",
      progress: 10,
      coins: 8,
      discount: 1,
      done: false,
    },
    {
      id: "price",
      title: "查看愿望价格趋势",
      desc: "用价格解释降低犹豫感，避免用户只玩奖励不进入交易链路。",
      signal: "行为信号：决策确定性 +15",
      progress: 7,
      coins: 5,
      discount: 0,
      done: false,
    },
  ],
  feed: ["Day 1 新愿望已启动：耳机目标价 $49.99"],
};

const aiNotes = [
  {
    note: "你是 Day 1 新用户，系统先给 3 个 60 秒内任务，降低第一次进入的心理负担。",
    intent: 72,
    fatigue: 18,
    budget: "奖励预算安全",
  },
  {
    note: "AI发现你更容易响应“可见抵扣”，因此优先展示券碎片和购物车价格变化。",
    intent: 78,
    fatigue: 22,
    budget: "券成本可控",
  },
  {
    note: "今日任务不会强制社交分享，先用浏览、收藏、价格趋势建立低压力回访动机。",
    intent: 69,
    fatigue: 14,
    budget: "金币池健康",
  },
];

let state = loadState();
let deferredInstallPrompt = null;
let wheelBusy = false;
let autoDemoBusy = false;
let judgeModeBusy = false;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.version !== defaultState.version) return clone(defaultState);
    if (!Array.isArray(parsed.feed)) parsed.feed = clone(defaultState.feed);
    return parsed;
  } catch {
    return clone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value;
}

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function completedCount() {
  return state.tasks.filter((task) => task.done).length;
}

function coreUnlocked() {
  return completedCount() >= 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pushFeed(message) {
  state.feed = [message, ...state.feed].slice(0, 5);
}

function addRewards({ progress = 0, coins = 0, discount = 0, shipping = false }) {
  state.progress = clamp(state.progress + progress, 0, 100);
  state.coins = clamp(state.coins + coins, 0, 999);
  state.discount = clamp(state.discount + discount, 0, 8);
  if (shipping) state.shippingUnlocked = true;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("show"), 2100);
}

function burst(x = 210, y = 450) {
  const layer = $("#motionLayer");
  if (!layer) return;
  for (let index = 0; index < 18; index += 1) {
    const spark = document.createElement("span");
    const angle = (Math.PI * 2 * index) / 18;
    const distance = 42 + Math.random() * 54;
    spark.className = "spark";
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
    spark.style.background = index % 3 === 0 ? "#12b76a" : index % 3 === 1 ? "#ffb020" : "#ff4d3d";
    layer.appendChild(spark);
    window.setTimeout(() => spark.remove(), 900);
  }
  $("#appShell").classList.add("celebrate");
  window.setTimeout(() => $("#appShell").classList.remove("celebrate"), 620);
}

function renderTasks() {
  const html = state.tasks
    .map(
      (task, index) => `
        <article class="task ${task.done ? "done" : ""}">
          <div>
            <div class="task-title">
              <span class="task-index">${task.done ? "✓" : index + 1}</span>
              <b>${task.title}</b>
            </div>
            <small>${task.desc}</small>
            <em>${task.signal} · +${task.progress}% · +${task.coins}金币${task.discount ? ` · +$${task.discount}券碎片` : ""}</em>
          </div>
          <button type="button" data-complete="${index}" ${task.done ? "disabled" : ""}>
            ${task.done ? "已完成" : "去完成"}
          </button>
        </article>
      `,
    )
    .join("");

  $("#homeTasks").innerHTML = html;
  $("#taskList").innerHTML = html;
}

function renderFeed() {
  const feed = $("#decisionFeed");
  if (!feed) return;

  feed.replaceChildren();
  state.feed.forEach((message) => {
    const row = document.createElement("span");
    row.textContent = message;
    feed.appendChild(row);
  });
}

function renderJourney() {
  const count = completedCount();
  const steps = {
    task: count > 0,
    box: state.chestOpened,
    coupon: state.couponRedeemed || state.discount >= 8,
    cart: state.checkedOut,
  };

  $all(".journey-node").forEach((node) => {
    const step = node.dataset.step;
    node.classList.toggle("done", Boolean(steps[step]));
    node.classList.remove("active");
  });

  const activeStep = state.checkedOut
    ? "cart"
    : state.couponRedeemed || state.discount >= 8
      ? "coupon"
      : state.chestOpened
        ? "coupon"
        : coreUnlocked()
          ? "box"
          : "task";

  const activeNode = $(`.journey-node[data-step="${activeStep}"]`);
  if (activeNode) activeNode.classList.add("active");

  let width = 16;
  if (count > 0) width = 28;
  if (count >= 2) width = 45;
  if (state.chestOpened) width = 63;
  if (state.discount >= 8 || state.couponRedeemed) width = 82;
  if (state.checkedOut) width = 100;
  $("#journeyFlow").style.width = `${width}%`;
}

function renderState() {
  const count = completedCount();
  const appliedDiscount = state.couponRedeemed ? 8 : state.discount;
  const shippingDiscount = state.shippingUnlocked ? 3 : 0;
  const payable = Math.max(0, 59.99 - appliedDiscount - shippingDiscount);
  const note = aiNotes[state.aiVariant % aiNotes.length];

  setText("#dayText", `Day ${state.day}/7`);
  setText("#progressText", `${state.progress}%`);
  setText("#coinsText", state.coins);
  setText("#streakText", `第${state.streak}天`);
  setText("#discountText", `$${state.discount}/$8`);
  setText("#taskSummary", `${count}/3 完成`);
  setText("#aiNote", note.note);
  setText("#intentSignal", `购买意图 ${note.intent + count * 4}`);
  setText("#fatigueSignal", `疲劳风险 ${Math.max(8, note.fatigue - count * 2)}`);
  setText("#budgetSignal", note.budget);
  setText("#cartDiscount", `-${money(appliedDiscount)}`);
  setText("#shippingDiscount", `-${money(shippingDiscount)}`);
  setText("#payText", money(payable));
  setText("#couponHint", state.couponRedeemed ? "$8 OFF 已应用到购物车。" : `还差 $${Math.max(0, 8 - state.discount)} 券碎片可兑换。`);
  setText("#chestHint", state.chestOpened ? "宝箱已开启，奖励已存入心愿罐。" : coreUnlocked() ? "已解锁，点击后奖励进入心愿罐。" : "完成任意 2 个任务后开启，奖励自动进入心愿罐。");

  $("#progressBar").style.width = `${state.progress}%`;
  $("#rewardWheel").style.transform = `rotate(${state.wheelRotation}deg)`;
  $("#chestCard").classList.toggle("opened", state.chestOpened);

  $("#openChestBtn").disabled = !coreUnlocked() || state.chestOpened;
  $("#openChestBtn").textContent = state.chestOpened ? "已开启" : coreUnlocked() ? "开启宝箱" : "未解锁";
  $("#redeemBtn").disabled = state.discount < 8 || state.couponRedeemed;
  $("#redeemBtn").textContent = state.couponRedeemed ? "已兑换" : "兑换";
  $("#checkoutBtn").textContent = state.checkedOut ? "已完成下单演示" : "确认下单演示";

  $("#heroCopy").textContent = state.checkedOut
    ? "演示闭环已完成：AI任务、随机奖励、券包和购物车联动成一条完整留存链路。"
    : state.chestOpened
      ? "宝箱奖励已经进入愿望罐，继续攒满 $8 券碎片即可在购物车抵扣。"
      : coreUnlocked()
        ? "宝箱已解锁，点击奖励中心即可把惊喜收益写入愿望罐。"
        : "新用户从第 1 天启动愿望，AI 用轻任务、即时反馈和可见抵扣把留存拉回交易链路。";

  renderJourney();
  renderTasks();
  renderFeed();
  saveState();
}

function completeTask(index) {
  const task = state.tasks[index];
  if (!task || task.done) return;

  task.done = true;
  addRewards({ progress: task.progress, coins: task.coins, discount: task.discount });
  pushFeed(`完成「${task.title}」：愿望进度 +${task.progress}%`);
  burst(214, 500);
  toast(coreUnlocked() ? "核心任务已达成，惊喜宝箱已解锁。" : "任务完成：奖励已存入愿望罐。");
  renderState();
}

function simulateAction(kind) {
  const map = {
    browse: { taskId: "browse", fallback: "浏览数据已刷新：相似新品热度上升。", reward: { progress: 2, coins: 2 } },
    favorite: { taskId: "favorite", fallback: "收藏信号已记录：购买意图继续升高。", reward: { progress: 2, coins: 2 } },
    price: { taskId: "price", fallback: "价格趋势已分析：当前价低于7日均价。", reward: { progress: 2, coins: 2, shipping: true } },
  };
  const config = map[kind];
  const taskIndex = state.tasks.findIndex((task) => task.id === config.taskId);
  if (taskIndex >= 0 && !state.tasks[taskIndex].done) {
    completeTask(taskIndex);
    return;
  }
  addRewards(config.reward);
  pushFeed(config.fallback);
  burst(214, 470);
  toast(config.fallback);
  renderState();
}

function rerollPlan() {
  state.aiVariant = (state.aiVariant + 1) % aiNotes.length;
  const undone = state.tasks.filter((task) => !task.done);
  if (undone.length > 1) {
    const done = state.tasks.filter((task) => task.done);
    undone.push(undone.shift());
    state.tasks = [...done, ...undone];
  }
  pushFeed("AI已重排 Day 1 任务：优先保留低压力路径。");
  toast("AI已重排今日任务和解释。");
  renderState();
}

function openChest() {
  if (!coreUnlocked()) {
    toast("先完成任意 2 个任务，即可开启惊喜宝箱。");
    return;
  }
  if (state.chestOpened) {
    toast("宝箱已经开启，奖励已存入愿望罐。");
    return;
  }

  state.chestOpened = true;
  addRewards({ progress: 11, coins: 12, discount: 1, shipping: true });
  pushFeed("惊喜宝箱开启：+$1券碎片、+12金币、免邮权益解锁。");
  burst(214, 385);
  toast("开箱成功：券碎片、金币和免邮权益已到账。");
  renderState();
}

function drawGacha() {
  if (wheelBusy) return;
  if (state.coins < 12) {
    toast("金币不足，完成任务后再转愿望加速器。");
    return;
  }

  wheelBusy = true;
  state.coins -= 12;
  state.pity += 1;
  state.wheelRotation += 780 + Math.floor(Math.random() * 260);
  $("#rewardWheel").style.transform = `rotate(${state.wheelRotation}deg)`;

  window.setTimeout(() => {
    if (state.pity >= 3) {
      state.pity = 0;
      addRewards({ progress: 7, coins: 3, discount: 1 });
      pushFeed("愿望加速器触发小保底：+$1券碎片。");
      toast("触发小保底：获得 $1 券碎片。");
    } else {
      addRewards({ progress: 5, coins: 5 });
      pushFeed("愿望加速器返还金币并推进心愿进度。");
      toast("获得进度加速 +5%，金币返还 +5。");
    }
    burst(214, 390);
    wheelBusy = false;
    renderState();
  }, 820);
}

function redeemCoupon() {
  if (state.discount < 8) {
    toast(`还差 $${8 - state.discount} 券碎片可兑换。`);
    return;
  }
  if (state.couponRedeemed) {
    toast("$8 OFF 已应用到购物车。");
    return;
  }
  state.couponRedeemed = true;
  pushFeed("$8 OFF 已兑换并绑定 Wireless Earbuds。");
  burst(214, 470);
  toast("$8 OFF 已兑换，购物车价格已刷新。");
  renderState();
}

function checkout() {
  state.checkedOut = true;
  pushFeed("购物车闭环完成：留存行为转化为下单意图。");
  burst(214, 520);
  toast("下单演示完成：愿望储蓄已进入交易链路。");
  renderState();
}

function resetDemo() {
  state = clone(defaultState);
  localStorage.removeItem(STORAGE_KEY);
  toast("演示数据已重置：回到 Day 1 新用户状态。");
  renderState();
}

function showView(target) {
  $all(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === target));
  $all(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.target === target));
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function runAutoDemo() {
  if (autoDemoBusy) return;
  autoDemoBusy = true;
  $("#autoDemoBtn").disabled = true;
  $("#autoDemoBtn").textContent = "演示中";

  showView("home");
  await wait(550);
  const first = state.tasks.findIndex((task) => !task.done);
  if (first >= 0) completeTask(first);
  await wait(900);
  const second = state.tasks.findIndex((task) => !task.done);
  if (second >= 0) completeTask(second);
  await wait(900);
  showView("rewards");
  await wait(650);
  openChest();
  await wait(950);
  drawGacha();
  await wait(1200);
  showView("cart");
  await wait(500);
  checkout();
  await wait(550);

  $("#autoDemoBtn").disabled = false;
  $("#autoDemoBtn").textContent = "15秒演示";
  autoDemoBusy = false;
}

async function runJudgeMode() {
  if (judgeModeBusy || autoDemoBusy) return;

  judgeModeBusy = true;
  $("#judgeModeBtn").disabled = true;
  $("#judgeModeBtn").textContent = "跑中";
  state = clone(defaultState);
  localStorage.removeItem(STORAGE_KEY);
  renderState();
  toast("评审模式：自动跑任务、奖励、购物车和增长证明。");

  await wait(520);
  await runAutoDemo();
  await wait(650);
  showView("growth");
  toast("评审模式完成：请查看增长证明和提交清单。");

  $("#judgeModeBtn").disabled = false;
  $("#judgeModeBtn").textContent = "评审";
  judgeModeBusy = false;
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const complete = event.target.closest("[data-complete]");
    if (complete) completeTask(Number(complete.dataset.complete));

    const simulate = event.target.closest("[data-simulate]");
    if (simulate) simulateAction(simulate.dataset.simulate);
  });

  $all(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.target)));
  $("#rerollBtn").addEventListener("click", rerollPlan);
  $("#autoDemoBtn").addEventListener("click", runAutoDemo);
  $("#judgeModeBtn").addEventListener("click", runJudgeMode);
  $("#openChestBtn").addEventListener("click", openChest);
  $("#drawBtn").addEventListener("click", drawGacha);
  $("#redeemBtn").addEventListener("click", redeemCoupon);
  $("#checkoutBtn").addEventListener("click", checkout);
  $("#resetBtn").addEventListener("click", resetDemo);

  const dialog = $("#rulesDialog");
  $all("[data-open-rules]").forEach((button) => button.addEventListener("click", () => dialog.showModal()));
  $all("[data-close-rules]").forEach((button) => button.addEventListener("click", () => dialog.close()));
}

function setupInstallPrompt() {
  const installBtn = $("#installBtn");

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      toast("当前浏览器未开放安装提示，可使用菜单添加到主屏幕。");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.hidden = true;
  });
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.warn("Service worker registration failed", error);
    }
  }
}

bindEvents();
setupInstallPrompt();
registerServiceWorker();
renderState();

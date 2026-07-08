const STORAGE_KEY = "ai-wish-saver-state-v1";

const defaultState = {
  progress: 68,
  coins: 128,
  discount: 7,
  streak: 6,
  pity: 3,
  couponRedeemed: false,
  checkedOut: false,
  tasks: [
    {
      id: "browse",
      title: "浏览 3 件同类新品",
      desc: "进度 +8%，金币 +5。AI判断这是今晚最容易完成的任务。",
      progress: 8,
      coins: 5,
      done: false,
    },
    {
      id: "save",
      title: "收藏 1 件备选商品",
      desc: "进度 +10%，触发宝箱概率 +3%。强化购买意图。",
      progress: 10,
      coins: 8,
      done: false,
    },
    {
      id: "share",
      title: "查看愿望价格趋势",
      desc: "进度 +6%，金币 +4。帮助用户理解现在是否值得买。",
      progress: 6,
      coins: 4,
      done: false,
    },
  ],
};

let state = loadState();
let deferredInstallPrompt = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : clone(defaultState);
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

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("show"), 1800);
}

function cappedAdd(key, amount, max = Infinity) {
  state[key] = Math.min(max, state[key] + amount);
}

function completedCoreTasks() {
  return state.tasks[0].done && state.tasks[1].done;
}

function renderTasks() {
  const html = state.tasks
    .map(
      (task, index) => `
        <article class="task ${task.done ? "done" : ""}">
          <div>
            <b>${task.done ? "已完成 · " : ""}${task.title}</b>
            <small>${task.desc}</small>
          </div>
          <button type="button" data-complete="${index}" ${task.done ? "disabled" : ""}>
            ${task.done ? "完成" : "去完成"}
          </button>
        </article>
      `,
    )
    .join("");

  $("#homeTasks").innerHTML = html;
  $("#taskList").innerHTML = html;
}

function renderState() {
  $("#progressBar").style.width = `${state.progress}%`;
  $("#progressText").textContent = `${state.progress}%`;
  $("#coinsText").textContent = state.coins;
  $("#streakText").textContent = `${state.streak}天`;
  $("#discountText").textContent = `$${state.discount}`;
  $("#discountInline").textContent = `$${state.discount}`;
  $("#cartDiscount").textContent = `-${money(state.discount)}`;
  $("#payText").textContent = money(Math.max(0, 59.99 - state.discount - 3));

  $("#openChestBtn").disabled = !completedCoreTasks();
  $("#redeemBtn").disabled = state.discount < 8 || state.couponRedeemed;
  $("#redeemBtn").textContent = state.couponRedeemed ? "已兑换" : "兑换";
  $("#checkoutBtn").textContent = state.checkedOut ? "已完成下单" : "确认下单";

  $("#heroCopy").textContent = completedCoreTasks()
    ? "宝箱已解锁，奖励会继续存入心愿罐，并回流到购物车抵扣。"
    : "完成两个轻任务即可开启惊喜宝箱，奖励会自动存入心愿罐。";

  renderTasks();
  saveState();
}

function completeTask(index) {
  const task = state.tasks[index];
  if (!task || task.done) return;

  task.done = true;
  cappedAdd("progress", task.progress, 100);
  cappedAdd("coins", task.coins);
  if (index <= 1) state.pity += 1;

  toast(completedCoreTasks() ? "任务链完成，惊喜宝箱已解锁。" : "任务完成，进度和金币已存入愿望罐。");
  renderState();
}

function openChest() {
  if (!completedCoreTasks()) {
    toast("先完成前两个核心任务，即可开启惊喜宝箱。");
    return;
  }
  cappedAdd("progress", 7, 100);
  cappedAdd("coins", 6);
  state.discount = Math.min(8, state.discount + 1);
  toast("开箱成功：获得 $1 券碎片 + 6金币。");
  renderState();
}

function drawGacha() {
  if (state.coins < 10) {
    toast("金币不足，先完成任务赚金币。");
    return;
  }
  state.coins -= 10;
  state.pity += 1;
  cappedAdd("progress", 4, 100);
  if (state.pity >= 4) {
    state.discount = Math.min(8, state.discount + 1);
    state.pity = 0;
    toast("愿望扭蛋触发小保底：获得 $1 心愿券碎片。");
  } else {
    cappedAdd("coins", 3);
    toast("愿望扭蛋：金币返还 +3，高价值奖励概率继续累计。");
  }
  renderState();
}

function redeemCoupon() {
  if (state.discount < 8) {
    toast("抵扣满 $8 后可兑换耳机专属券。");
    return;
  }
  if (state.couponRedeemed) {
    toast("专属券已兑换，并已应用到购物车。");
    return;
  }
  state.couponRedeemed = true;
  toast("$8 OFF 已兑换，并自动应用到购物车。");
  renderState();
}

function checkout() {
  state.checkedOut = true;
  toast("下单链路完成：留存行为已转化为购物行为。");
  renderState();
}

function resetDemo() {
  state = clone(defaultState);
  toast("演示数据已重置。");
  renderState();
}

function showView(target) {
  $all(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === target));
  $all(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.target === target));
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const complete = event.target.closest("[data-complete]");
    if (complete) completeTask(Number(complete.dataset.complete));
  });

  $all(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.target)));
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

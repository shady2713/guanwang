"use strict";

const header = document.querySelector("#site-header");
const progress = document.querySelector(".scroll-progress");
const heroImage = document.querySelector(".hero-image");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#main-nav");

function setMenu(open) {
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.querySelector(".sr-only").textContent = open
    ? "关闭导航菜单"
    : "打开导航菜单";
  nav.classList.toggle("open", open);
}
menuToggle.addEventListener("click", () =>
  setMenu(menuToggle.getAttribute("aria-expanded") !== "true"),
);
nav.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuToggle.getAttribute("aria-expanded") === "true"
  ) {
    setMenu(false);
    menuToggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!header.contains(event.target)) setMenu(false);
});
window.matchMedia("(min-width: 801px)").addEventListener("change", (event) => {
  if (event.matches) setMenu(false);
});

let scrollQueued = false;
function updateScroll() {
  header.classList.toggle("scrolled", window.scrollY > 32);
  const available = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.transform = `scaleX(${available > 0 ? Math.min(1, Math.max(0, window.scrollY / available)) : 0})`;
  heroImage.style.transform = reducedMotion.matches
    ? ""
    : `translateY(${Math.min(window.scrollY * 0.06, 35)}px)`;
  scrollQueued = false;
}
window.addEventListener(
  "scroll",
  () => {
    if (!scrollQueued) {
      scrollQueued = true;
      requestAnimationFrame(updateScroll);
    }
  },
  { passive: true },
);
window.addEventListener("resize", updateScroll);
updateScroll();

function wireTabs(selector, activate) {
  const buttons = [...document.querySelectorAll(selector)];
  const choose = (button) => {
    buttons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
    });
    activate(button);
  };
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => choose(button));
    button.addEventListener("keydown", (event) => {
      const keys = [
        "ArrowRight",
        "ArrowLeft",
        "ArrowDown",
        "ArrowUp",
        "Home",
        "End",
      ];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index +
                (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) +
                buttons.length) %
              buttons.length;
      choose(buttons[next]);
      buttons[next].focus();
    });
  });
}

const capabilities = {
  target: {
    title: "定位关注的目标。",
    description:
      "识别人、车与物，标记目标在画面中的位置，为检索与后续分析提供依据。",
    condition: "识别效果与目标大小、清晰度、遮挡和光照有关。",
    caption: "目标定位示意",
  },
  temporal: {
    title: "分析状态的持续与变化。",
    description:
      "在连续视频中关联目标，结合时间条件，分析停留、状态持续或变化等线索。",
    condition: "需要有效的连续观察与目标关联；单帧图片无法确认持续时长。",
    caption: "时序能力示意 · 需连续视频",
  },
  spatial: {
    title: "理解目标与区域的关系。",
    description:
      "结合目标位置与关注区域，分析区域占用、人员临水等空间关系，为业务复核提供提示。",
    condition: "画面中的位置关系不等同于经过标定的实际物理距离。",
    caption: "区域关系示意",
  },
};
wireTabs("[data-capability]", (button) => {
  const mode = button.dataset.capability;
  const item = capabilities[mode];
  document.querySelector("#capability-heading").textContent = item.title;
  document.querySelector("#capability-description").textContent =
    item.description;
  document.querySelector("#capability-condition").textContent = item.condition;
  document.querySelector("#visual-caption").textContent = item.caption;
  document.querySelector("#capability-visual").dataset.mode = mode;
  document
    .querySelector("#capability-panel")
    .setAttribute("aria-labelledby", button.id);
});

const scenes = {
  city: {
    index: "01",
    name: "城市管理",
    kicker: "城市管理 / 巡查线索",
    title: ["让城市的细节，", "进入管理的视野。"],
    description:
      "面向道路与公共区域，结合目标、位置和持续状态，辅助发现需要复核的占用与停放线索。",
    focus: "区域占用 · 车辆停放",
    result: "定位画面，辅助人工复核",
    basis:
      "根据业务任务组合目标检测、关注区域与持续性规则，筛查值得进一步查看的线索。",
    conditions:
      "目标与区域应清晰可见。涉及持续状态时，需具备连续观察条件，并处理视角变化与目标关联。",
  },
  traffic: {
    index: "02",
    name: "交通巡检",
    kicker: "交通巡检 / 停放线索",
    title: ["发现道路中的目标，", "关注持续的状态。"],
    description:
      "结合车辆位置、关注区域与停留条件，辅助筛查需要复核的车辆停放线索。",
    focus: "车辆目标 · 停留状态",
    result: "关联事件与画面依据",
    basis: "识别车辆并关联连续观察记录，根据实际配置的区域与时间规则筛选目标。",
    conditions:
      "需验证移动视角中的区域对应和目标关联。观察不足、遮挡或单帧图片不能用于确认停留时长；提示不直接构成违停结论。",
  },
  water: {
    index: "03",
    name: "水域巡查",
    kicker: "水域巡查 / 人员临水",
    title: ["关注水岸之间，", "值得留意的接近。"],
    description:
      "分析人员与水域边界的位置关系，为临水区域巡查提供可查看、可复核的画面线索。",
    focus: "人员目标 · 水域边界",
    result: "提供临水关系提示",
    basis:
      "在人员与水域边界可辨认的画面中，结合关注区域或空间规则判断位置关系。",
    conditions:
      "水面反光、遮挡和过小的目标会影响效果。临水提示不等同于落水识别，也不代表未经标定的精确距离测量。",
  },
  construction: {
    index: "04",
    name: "区域安全",
    kicker: "区域安全 / 关注区域",
    title: ["明确区域边界，", "关注范围内的活动。"],
    description:
      "针对工地与园区中的指定区域，分析人员、车辆与区域边界的关系，提示需要关注的活动。",
    focus: "关注区域 · 人员车辆",
    result: "保留相关目标与画面",
    basis:
      "将识别到的目标与所配置的关注区域进行关系判断，是否进入区域还需结合实际时序规则。",
    conditions:
      "需确认目标类型、区域配置与移动视角的对应关系。单帧中的“位于区域内”与过程中的“进入区域”应区分。",
  },
};
let activeScene = "city";
wireTabs("[data-scene]", (button) => {
  activeScene = button.dataset.scene;
  const scene = scenes[activeScene];
  document
    .querySelectorAll(".scenario-image")
    .forEach((image) =>
      image.classList.toggle("active", image.id === `scene-${activeScene}`),
    );
  document.querySelector("#scene-index").textContent = scene.index;
  document.querySelector("#scene-kicker").textContent = scene.kicker;
  const title = document.querySelector("#scenario-title");
  title.replaceChildren(
    document.createTextNode(scene.title[0]),
    document.createElement("br"),
    document.createTextNode(scene.title[1]),
  );
  document.querySelector("#scene-description").textContent = scene.description;
  document.querySelector("#scene-focus").textContent = scene.focus;
  document.querySelector("#scene-result").textContent = scene.result;
  document
    .querySelector("#scene-panel")
    .setAttribute("aria-labelledby", button.id);
});

function openDialog(id) {
  if (id === "contact-dialog") {
    window.location.href = "/demo/";
    return;
  }
  const dialog = document.getElementById(id);
  if (!dialog || !(dialog instanceof HTMLDialogElement)) return;
  setMenu(false);
  document.querySelectorAll("dialog[open]").forEach((item) => item.close());
  document.body.classList.add("dialog-open");
  dialog.showModal();
}
document
  .querySelectorAll("[data-dialog]")
  .forEach((button) =>
    button.addEventListener("click", () => openDialog(button.dataset.dialog)),
  );
document.querySelectorAll("[data-switch-dialog]").forEach((button) =>
  button.addEventListener("click", () => {
    openDialog(button.dataset.switchDialog);
  }),
);
document.querySelectorAll(".site-dialog").forEach((dialog) => {
  dialog
    .querySelector(".dialog-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (!document.querySelector("dialog[open]"))
      document.body.classList.remove("dialog-open");
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      dialog.close();
  });
});
document
  .querySelectorAll(".dialog-anchor")
  .forEach((link) =>
    link.addEventListener("click", () => link.closest("dialog").close()),
  );
document.querySelector("#scene-details").addEventListener("click", () => {
  const scene = scenes[activeScene];
  document.querySelector("#scene-dialog-title").textContent = scene.name;
  document.querySelector("#scene-dialog-description").textContent =
    scene.description;
  document.querySelector("#scene-dialog-basis").textContent = scene.basis;
  document.querySelector("#scene-dialog-conditions").textContent =
    scene.conditions;
  openDialog("scene-dialog");
});

const contactForm = document.querySelector("#contact-form");
contactForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = new FormData(contactForm);
  const values = Object.fromEntries(
    [...fields].map(([key, value]) => [key, String(value).trim()]),
  );
  if (!values.company || !values.contact) {
    document.querySelector("#form-status").textContent =
      "请填写公司名称与联系方式。";
    document
      .querySelector(!values.company ? "#contact-company" : "#contact-channel")
      .focus();
    return;
  }
  const draft = [
    "视界 AIMaster · 产品演示需求草稿",
    "",
    "此文件由浏览器本地生成，未向任何服务提交。",
    "",
    `公司名称：${values.company}`,
    `联系方式：${values.contact}`,
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", draft], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "视界AIMaster_演示需求草稿.txt";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.querySelector("#form-status").textContent =
    "需求草稿已生成并开始下载；信息未提交，预约尚未发送。";
});

if ("IntersectionObserver" in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-in");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 },
  );
  document
    .querySelectorAll("[data-reveal]")
    .forEach((element) => observer.observe(element));
}

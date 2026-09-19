/**
 * Seomtorch — Authentic JAMB CBT Basic Calculator
 * Strictly simulates the official JAMB on-screen 8-key/basic calculator
 * with standard arithmetic, memory operations, square root, percentage,
 * reciprocal, sign toggle, keyboard support, and a non-intrusive draggable UI.
 */

function cleanFloat(n) {
  if (isNaN(n) || !isFinite(n)) return "Error";
  const rounded = parseFloat(Number(n).toPrecision(12));
  return String(rounded);
}

function formatDisplayNumber(rawStr) {
  if (!rawStr || rawStr === "Error" || rawStr.startsWith("Error")) return rawStr;
  if (rawStr.includes("e") || rawStr.includes("E")) return rawStr;

  const parts = rawStr.split(".");
  const intPart = parts[0];
  const isNegative = intPart.startsWith("-");
  const absInt = isNegative ? intPart.slice(1) : intPart;

  const formattedInt = absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fullInt = isNegative ? "-" + formattedInt : formattedInt;

  return parts.length > 1 ? fullInt + "." + parts[1] : fullInt;
}

const OP_SYMBOLS = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷"
};

class JambCalculator {
  constructor() {
    this.display = "0";
    this.previousValue = null;
    this.operator = null;
    this.historyText = "";
    this.memory = 0;
    this.isNewNumber = true;
    this.isOpen = false;
    this.isMinimized = false;

    this.rootEl = null;
    this.historyEl = null;
    this.displayEl = null;
    this.memTagEl = null;
    this.opButtons = {};

    this.pos = { x: null, y: null };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.widgetStart = { x: 0, y: 0 };

    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
  }

  init() {
    if (this.rootEl) return;
    this.createDom();
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("resize", () => this.clampPosition());
  }

  createDom() {
    const root = document.createElement("aside");
    root.id = "jamb-calculator-root";
    root.className = "jamb-calc-widget hidden";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "JAMB CBT Calculator");
    root.setAttribute("aria-modal", "false");

    root.innerHTML = `
      <div class="jamb-calc-container">
        <div class="jamb-calc-header" id="jamb-calc-drag-handle">
          <div class="jamb-calc-title">
            <span class="jamb-calc-badge">JAMB CBT</span>
            <strong>Calculator</strong>
            <span class="jamb-calc-mem-tag hidden" id="jamb-calc-mem-tag" title="Memory active">M</span>
          </div>
          <div class="jamb-calc-controls">
            <button class="jamb-calc-icon-btn" id="jamb-calc-minimize" aria-label="Minimize calculator" title="Minimize">_</button>
            <button class="jamb-calc-icon-btn close" id="jamb-calc-close" aria-label="Close calculator" title="Close">×</button>
          </div>
        </div>

        <div class="jamb-calc-body">
          <div class="jamb-calc-screen">
            <div class="jamb-calc-history" id="jamb-calc-history"></div>
            <div class="jamb-calc-display" id="jamb-calc-display">0</div>
          </div>

          <div class="jamb-calc-keypad">
            <!-- Row 1: Memory -->
            <button class="jamb-btn mem" data-action="mc" title="Memory Clear">MC</button>
            <button class="jamb-btn mem" data-action="mr" title="Memory Recall">MR</button>
            <button class="jamb-btn mem" data-action="m-plus" title="Memory Add">M+</button>
            <button class="jamb-btn mem" data-action="m-minus" title="Memory Subtract">M−</button>

            <!-- Row 2: Helper Functions -->
            <button class="jamb-btn fn" data-action="sqrt" title="Square Root">√</button>
            <button class="jamb-btn fn" data-action="percent" title="Percentage">%</button>
            <button class="jamb-btn fn" data-action="reciprocal" title="Reciprocal (1/x)">1/x</button>
            <button class="jamb-btn fn" data-action="backspace" title="Backspace">⌫</button>

            <!-- Row 3: Clear & Divide -->
            <button class="jamb-btn danger" data-action="c" title="Clear All (Escape)">C</button>
            <button class="jamb-btn fn" data-action="ce" title="Clear Entry">CE</button>
            <button class="jamb-btn fn" data-action="pm" title="Positive / Negative">±</button>
            <button class="jamb-btn op" data-action="op" data-op="/" title="Divide (/)">÷</button>

            <!-- Row 4: 7 8 9 × -->
            <button class="jamb-btn num" data-num="7">7</button>
            <button class="jamb-btn num" data-num="8">8</button>
            <button class="jamb-btn num" data-num="9">9</button>
            <button class="jamb-btn op" data-action="op" data-op="*" title="Multiply (*)">×</button>

            <!-- Row 5: 4 5 6 − -->
            <button class="jamb-btn num" data-num="4">4</button>
            <button class="jamb-btn num" data-num="5">5</button>
            <button class="jamb-btn num" data-num="6">6</button>
            <button class="jamb-btn op" data-action="op" data-op="-" title="Subtract (-)">−</button>

            <!-- Row 6: 1 2 3 + -->
            <button class="jamb-btn num" data-num="1">1</button>
            <button class="jamb-btn num" data-num="2">2</button>
            <button class="jamb-btn num" data-num="3">3</button>
            <button class="jamb-btn op" data-action="op" data-op="+" title="Add (+)">+</button>

            <!-- Row 7: 0 . = -->
            <button class="jamb-btn num zero" data-num="0">0</button>
            <button class="jamb-btn num" data-action="dot">.</button>
            <button class="jamb-btn equals" data-action="equals" title="Calculate (=)">=</button>
          </div>
        </div>

        <div class="jamb-calc-minimized-bar hidden" id="jamb-calc-min-bar">
          <span class="jamb-calc-min-title">🖩 JAMB Calc:</span>
          <strong class="jamb-calc-min-val" id="jamb-calc-min-val">0</strong>
          <button class="jamb-calc-icon-btn" id="jamb-calc-expand" title="Expand">▢</button>
          <button class="jamb-calc-icon-btn close" id="jamb-calc-min-close" title="Close">×</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    this.rootEl = root;
    this.historyEl = root.querySelector("#jamb-calc-history");
    this.displayEl = root.querySelector("#jamb-calc-display");
    this.memTagEl = root.querySelector("#jamb-calc-mem-tag");

    root.querySelectorAll("[data-op]").forEach(btn => {
      this.opButtons[btn.dataset.op] = btn;
    });

    root.querySelector("#jamb-calc-close").addEventListener("click", () => this.close());
    root.querySelector("#jamb-calc-minimize").addEventListener("click", () => this.toggleMinimize());
    root.querySelector("#jamb-calc-expand").addEventListener("click", () => this.toggleMinimize());
    root.querySelector("#jamb-calc-min-close").addEventListener("click", () => this.close());

    root.querySelectorAll("[data-num]").forEach(btn => {
      btn.addEventListener("click", () => this.inputDigit(btn.dataset.num));
    });

    root.querySelectorAll("[data-action]").forEach(btn => {
      const action = btn.dataset.action;
      if (action === "op") {
        btn.addEventListener("click", () => this.handleOperator(btn.dataset.op));
      } else if (action === "equals") {
        btn.addEventListener("click", () => this.calculate());
      } else if (action === "dot") {
        btn.addEventListener("click", () => this.inputDecimal());
      } else if (action === "c") {
        btn.addEventListener("click", () => this.clearAll());
      } else if (action === "ce") {
        btn.addEventListener("click", () => this.clearEntry());
      } else if (action === "backspace") {
        btn.addEventListener("click", () => this.backspace());
      } else if (action === "sqrt") {
        btn.addEventListener("click", () => this.squareRoot());
      } else if (action === "percent") {
        btn.addEventListener("click", () => this.percentage());
      } else if (action === "reciprocal") {
        btn.addEventListener("click", () => this.reciprocal());
      } else if (action === "pm") {
        btn.addEventListener("click", () => this.toggleSign());
      } else if (action === "mc") {
        btn.addEventListener("click", () => this.memoryClear());
      } else if (action === "mr") {
        btn.addEventListener("click", () => this.memoryRecall());
      } else if (action === "m-plus") {
        btn.addEventListener("click", () => this.memoryAdd());
      } else if (action === "m-minus") {
        btn.addEventListener("click", () => this.memorySubtract());
      }
    });

    const dragHandle = root.querySelector("#jamb-calc-drag-handle");
    const minBar = root.querySelector("#jamb-calc-min-bar");

    const onPointerDown = (e) => {
      if (e.target.closest("button")) return;
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };

      const rect = root.getBoundingClientRect();
      this.widgetStart = { x: rect.left, y: rect.top };

      window.addEventListener("pointermove", this.boundPointerMove);
      window.addEventListener("pointerup", this.boundPointerUp);
    };

    dragHandle.addEventListener("pointerdown", onPointerDown);
    minBar.addEventListener("pointerdown", onPointerDown);
  }

  onPointerMove(e) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;

    let nextX = this.widgetStart.x + dx;
    let nextY = this.widgetStart.y + dy;

    const pad = 12;
    const rect = this.rootEl.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - pad;
    const maxY = window.innerHeight - rect.height - pad;

    nextX = Math.max(pad, Math.min(maxX, nextX));
    nextY = Math.max(pad, Math.min(maxY, nextY));

    this.pos.x = nextX;
    this.pos.y = nextY;

    this.rootEl.style.left = `${nextX}px`;
    this.rootEl.style.top = `${nextY}px`;
    this.rootEl.style.right = "auto";
    this.rootEl.style.bottom = "auto";
  }

  onPointerUp() {
    this.isDragging = false;
    window.removeEventListener("pointermove", this.boundPointerMove);
    window.removeEventListener("pointerup", this.boundPointerUp);
  }

  clampPosition() {
    if (!this.rootEl || this.pos.x === null) return;
    const pad = 12;
    const rect = this.rootEl.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - pad;
    const maxY = window.innerHeight - rect.height - pad;

    let x = Math.max(pad, Math.min(maxX, this.pos.x));
    let y = Math.max(pad, Math.min(maxY, this.pos.y));

    this.pos.x = x;
    this.pos.y = y;
    this.rootEl.style.left = `${x}px`;
    this.rootEl.style.top = `${y}px`;
  }

  setDefaultPosition() {
    if (this.pos.x !== null) {
      this.clampPosition();
      return;
    }
    if (window.innerWidth <= 600) {
      this.rootEl.style.left = "";
      this.rootEl.style.top = "";
      this.rootEl.style.right = "";
      this.rootEl.style.bottom = "";
    } else {
      const pad = 24;
      const w = 310;
      const x = Math.max(pad, window.innerWidth - w - pad);
      const y = 84;
      this.pos.x = x;
      this.pos.y = y;
      this.rootEl.style.left = `${x}px`;
      this.rootEl.style.top = `${y}px`;
      this.rootEl.style.right = "auto";
      this.rootEl.style.bottom = "auto";
    }
  }

  updateDisplay() {
    if (!this.rootEl) return;
    this.displayEl.textContent = formatDisplayNumber(this.display);
    this.historyEl.textContent = this.historyText;

    const minVal = this.rootEl.querySelector("#jamb-calc-min-val");
    if (minVal) minVal.textContent = formatDisplayNumber(this.display);

    if (this.memory !== 0) {
      this.memTagEl.classList.remove("hidden");
    } else {
      this.memTagEl.classList.add("hidden");
    }

    Object.keys(this.opButtons).forEach(op => {
      if (this.operator === op && this.isNewNumber) {
        this.opButtons[op].classList.add("active");
      } else {
        this.opButtons[op].classList.remove("active");
      }
    });
  }

  inputDigit(digit) {
    if (this.display === "Error" || this.display.startsWith("Error")) {
      this.display = digit;
      this.isNewNumber = false;
      this.updateDisplay();
      return;
    }

    if (this.isNewNumber) {
      this.display = digit;
      this.isNewNumber = false;
    } else {
      if (this.display.replace(/[^0-9]/g, "").length >= 14) return;
      this.display = this.display === "0" ? digit : this.display + digit;
    }
    this.updateDisplay();
  }

  inputDecimal() {
    if (this.display === "Error") {
      this.display = "0.";
      this.isNewNumber = false;
      this.updateDisplay();
      return;
    }
    if (this.isNewNumber) {
      this.display = "0.";
      this.isNewNumber = false;
    } else if (!this.display.includes(".")) {
      this.display += ".";
    }
    this.updateDisplay();
  }

  handleOperator(op) {
    if (this.display === "Error") return;

    const currentNum = parseFloat(this.display);

    if (this.previousValue !== null && this.operator && !this.isNewNumber) {
      const result = this.executeMath(this.previousValue, this.operator, currentNum);
      if (result === "Error") {
        this.display = "Error";
        this.previousValue = null;
        this.operator = null;
        this.historyText = "";
        this.isNewNumber = true;
        this.updateDisplay();
        return;
      }
      this.display = result;
      this.previousValue = parseFloat(result);
    } else {
      this.previousValue = currentNum;
    }

    this.operator = op;
    this.historyText = `${formatDisplayNumber(cleanFloat(this.previousValue))} ${OP_SYMBOLS[op] || op}`;
    this.isNewNumber = true;
    this.updateDisplay();
  }

  executeMath(a, op, b) {
    let res;
    if (op === "+") res = a + b;
    else if (op === "-") res = a - b;
    else if (op === "*") res = a * b;
    else if (op === "/") {
      if (b === 0) return "Error";
      res = a / b;
    } else {
      return cleanFloat(b);
    }
    return cleanFloat(res);
  }

  calculate() {
    if (this.operator === null || this.previousValue === null || this.display === "Error") return;

    const currentNum = parseFloat(this.display);
    const result = this.executeMath(this.previousValue, this.operator, currentNum);

    if (result === "Error") {
      this.display = "Error";
      this.historyText = `${formatDisplayNumber(cleanFloat(this.previousValue))} ${OP_SYMBOLS[this.operator] || this.operator} ${formatDisplayNumber(cleanFloat(currentNum))} =`;
      this.previousValue = null;
      this.operator = null;
      this.isNewNumber = true;
      this.updateDisplay();
      return;
    }

    this.historyText = `${formatDisplayNumber(cleanFloat(this.previousValue))} ${OP_SYMBOLS[this.operator] || this.operator} ${formatDisplayNumber(cleanFloat(currentNum))} =`;
    this.display = result;
    this.previousValue = null;
    this.operator = null;
    this.isNewNumber = true;
    this.updateDisplay();
  }

  clearAll() {
    this.display = "0";
    this.previousValue = null;
    this.operator = null;
    this.historyText = "";
    this.isNewNumber = true;
    this.updateDisplay();
  }

  clearEntry() {
    this.display = "0";
    this.isNewNumber = true;
    this.updateDisplay();
  }

  backspace() {
    if (this.isNewNumber || this.display === "Error") return;
    if (this.display.length <= 1 || (this.display.length === 2 && this.display.startsWith("-"))) {
      this.display = "0";
      this.isNewNumber = true;
    } else {
      this.display = this.display.slice(0, -1);
    }
    this.updateDisplay();
  }

  squareRoot() {
    if (this.display === "Error") return;
    const val = parseFloat(this.display);
    if (val < 0) {
      this.display = "Error";
      this.historyText = `√(${formatDisplayNumber(cleanFloat(val))}) =`;
      this.isNewNumber = true;
      this.updateDisplay();
      return;
    }
    const res = cleanFloat(Math.sqrt(val));
    this.historyText = `√(${formatDisplayNumber(cleanFloat(val))}) =`;
    this.display = res;
    this.isNewNumber = true;
    this.updateDisplay();
  }

  percentage() {
    if (this.display === "Error") return;
    const currentNum = parseFloat(this.display);
    let res;

    if (this.previousValue !== null && (this.operator === "+" || this.operator === "-")) {
      res = this.previousValue * (currentNum / 100);
    } else {
      res = currentNum / 100;
    }

    this.display = cleanFloat(res);
    this.isNewNumber = true;
    this.updateDisplay();
  }

  reciprocal() {
    if (this.display === "Error") return;
    const val = parseFloat(this.display);
    if (val === 0) {
      this.display = "Error";
      this.historyText = `1/(0) =`;
      this.isNewNumber = true;
      this.updateDisplay();
      return;
    }
    const res = cleanFloat(1 / val);
    this.historyText = `1/(${formatDisplayNumber(cleanFloat(val))}) =`;
    this.display = res;
    this.isNewNumber = true;
    this.updateDisplay();
  }

  toggleSign() {
    if (this.display === "0" || this.display === "Error") return;
    if (this.display.startsWith("-")) {
      this.display = this.display.slice(1);
    } else {
      this.display = "-" + this.display;
    }
    this.updateDisplay();
  }

  memoryClear() {
    this.memory = 0;
    this.updateDisplay();
  }

  memoryRecall() {
    this.display = cleanFloat(this.memory);
    this.isNewNumber = true;
    this.updateDisplay();
  }

  memoryAdd() {
    if (this.display === "Error") return;
    this.memory += parseFloat(this.display);
    this.isNewNumber = true;
    this.updateDisplay();
  }

  memorySubtract() {
    if (this.display === "Error") return;
    this.memory -= parseFloat(this.display);
    this.isNewNumber = true;
    this.updateDisplay();
  }

  open() {
    this.init();
    this.isOpen = true;
    this.rootEl.classList.remove("hidden");
    if (this.isMinimized) {
      this.toggleMinimize(false);
    }
    this.setDefaultPosition();
    this.updateDisplay();
  }

  close() {
    if (!this.rootEl) return;
    this.isOpen = false;
    this.rootEl.classList.add("hidden");
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  toggleMinimize(force) {
    if (!this.rootEl) return;
    const nextMin = typeof force === "boolean" ? force : !this.isMinimized;
    this.isMinimized = nextMin;

    const body = this.rootEl.querySelector(".jamb-calc-body");
    const header = this.rootEl.querySelector(".jamb-calc-header");
    const minBar = this.rootEl.querySelector("#jamb-calc-min-bar");

    if (this.isMinimized) {
      this.rootEl.classList.add("minimized");
      body.classList.add("hidden");
      header.classList.add("hidden");
      minBar.classList.remove("hidden");
    } else {
      this.rootEl.classList.remove("minimized");
      body.classList.remove("hidden");
      header.classList.remove("hidden");
      minBar.classList.add("hidden");
    }
    this.clampPosition();
  }

  handleKeyDown(e) {
    if (!this.isOpen) {
      if (e.altKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        this.toggle();
      }
      return;
    }

    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag === "input" || activeTag === "textarea" || document.activeElement?.isContentEditable) {
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      this.inputDigit(e.key);
      return;
    }

    if (e.key === ".") {
      e.preventDefault();
      this.inputDecimal();
      return;
    }

    if (e.key === "+" || e.key === "-" || e.key === "*" || e.key === "/") {
      e.preventDefault();
      this.handleOperator(e.key);
      return;
    }

    if (e.key === "Enter" || e.key === "=") {
      e.preventDefault();
      this.calculate();
      return;
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      this.backspace();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (this.display !== "0" || this.historyText !== "") {
        this.clearAll();
      } else {
        this.close();
      }
      return;
    }

    if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      this.clearAll();
      return;
    }
  }
}

export const jambCalculator = new JambCalculator();

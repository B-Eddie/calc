// Initialize MathJS
const math = window.math;

// --- TRIGONOMETRY & FUNCTION SETUP ---
let isDegrees = true; // Default to degrees

// Capture originals before overriding
const _sin = math.sin;
const _cos = math.cos;
const _tan = math.tan;
const _asin = math.asin;
const _acos = math.acos;
const _atan = math.atan;
const _log = math.log;

function toRad(x) {
  if (isDegrees && typeof x === "number") return x * (Math.PI / 180);
  return x;
}

function toDeg(x) {
  if (isDegrees && typeof x === "number") return x * (180 / Math.PI);
  return x;
}

// Override functions
try {
  math.import(
    {
      // Standard Trig (input is angle)
      sin: function (x) {
        return _sin(toRad(x));
      },
      cos: function (x) {
        return _cos(toRad(x));
      },
      tan: function (x) {
        return _tan(toRad(x));
      },

      // Inverse Trig (output is angle)
      asin: function (x) {
        return toDeg(_asin(x));
      },
      acos: function (x) {
        return toDeg(_acos(x));
      },
      atan: function (x) {
        return toDeg(_atan(x));
      },

      // Aliases
      sine: function (x) {
        return _sin(toRad(x));
      },
      cosine: function (x) {
        return _cos(toRad(x));
      },
      tangent: function (x) {
        return _tan(toRad(x));
      },
      arcsin: function (x) {
        return toDeg(_asin(x));
      },
      arccos: function (x) {
        return toDeg(_acos(x));
      },
      arctan: function (x) {
        return toDeg(_atan(x));
      },

      // Logarithms
      ln: function (x) {
        return _log(x);
      },
      log: function (x, base) {
        // If base provided, use original log
        if (base !== undefined) return _log(x, base);
        // Default to base 10 for "log(x)"
        return math.log10(x);
      },
      // log2, log3, etc. for explicit base via function name
      ...(() => {
        const customLogs = {};
        for (let b = 2; b <= 36; b++) {
          customLogs[`log${b}`] = function (x) {
            return _log(x, b);
          };
        }
        return customLogs;
      })(),
    },
    { override: true },
  );
} catch (e) {
  console.error("Error setting up math functions:", e);
}

function normalizeFunctionSyntax(expression) {
  // Convert cases like sin25 or sin 25 into sin(25), plus support cos/tan/etc.
  const fnList = [
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "sine",
    "cosine",
    "tangent",
    "arcsin",
    "arccos",
    "arctan",
    "ln",
    "log",
    "sqrt",
    "abs",
  ];

  const fnPattern = fnList.join("|");

  // Add explicit multiplication before a function name when coming after a number or closing parenthesis.
  expression = expression.replace(
    new RegExp(`(\\d|\\))\\s*(?=(?:${fnPattern}))`, "gi"),
    "$1*",
  );

  // Auto-wrap function arguments in parentheses when missing.
  // Supports forms like sin25, sin 25, 18sin25 without requiring standard word boundary after function name.
  const fnArgRegex = new RegExp(
    `(^|[^a-zA-Z0-9_])(${fnPattern})(?!\\s*\\()\\s*([-+]?\\d*\\.?\\d+|[a-zA-Z]\\w*|\\([^()]*\\))`,
    "gi",
  );

  let prev;
  do {
    prev = expression;
    expression = expression.replace(fnArgRegex, (match, prefix, fn, arg) => {
      return `${prefix}${fn}(${arg})`;
    });
  } while (expression !== prev);

  return expression;
}

function setAngleMode(mode) {
  const indicator = document.getElementById("mode-indicator");
  if (mode === "deg") {
    isDegrees = true;
    document.getElementById("btn-deg").classList.add("active");
    document.getElementById("btn-rad").classList.remove("active");
    if (indicator) indicator.textContent = "(DEG)";
  } else {
    isDegrees = false;
    document.getElementById("btn-rad").classList.add("active");
    document.getElementById("btn-deg").classList.remove("active");
    if (indicator) indicator.textContent = "(RAD)";
  }
  // Re-evaluate current expression
  updateCalculator();
}

function insertFunction(fnStr) {
  const input = document.getElementById("calc-input");
  const startPos = input.selectionStart || input.value.length;
  const endPos = input.selectionEnd || input.value.length;

  const textBefore = input.value.substring(0, startPos);
  const textAfter = input.value.substring(endPos, input.value.length);

  input.value = textBefore + fnStr + textAfter;

  // Move cursor inside parenthesis
  // If string ends with (, move cursor there. If ends with ^, move after it.
  let newPos = startPos + fnStr.length;
  // Special adjustment for empty parens? Nah just put cursor at end of inserted text

  input.focus();
  input.setSelectionRange(newPos, newPos);

  updateCalculator();
}

function switchTab(tabId, btnElement) {
  document
    .querySelectorAll(".content-section")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((el) => el.classList.remove("active"));

  document.getElementById(tabId).classList.add("active");
  if (btnElement) btnElement.classList.add("active");

  // Widen the window while the two-pane render section is active
  const appContainer = document.querySelector(".app-container");
  if (appContainer) {
    appContainer.classList.toggle("render-mode", tabId === "render");
  }

  // Auto focus appropriate input
  if (tabId === "calculator") {
    setTimeout(() => document.getElementById("calc-input").focus(), 50);
  } else if (tabId === "molar-mass") {
    setTimeout(() => document.getElementById("molar-input").focus(), 50);
  } else if (tabId === "render") {
    setTimeout(() => {
      const renderInputEl = document.getElementById("render-input");
      if (renderInputEl) {
        renderInputEl.focus();
        // Load a sample on first visit so the section demos itself
        if (!renderVisited) {
          renderVisited = true;
          renderInputEl.value = RENDER_SAMPLES.markdown;
          doRender();
        }
        // Warm up the Typst engine in the background so the first Typst render is snappy
        ensureTypst();
        // Re-apply the saved pane split now that the section is visible
        reclampPaneWidth();
      }
    }, 50);
  } else {
    setTimeout(() => document.getElementById("quad-a").focus(), 50);
  }
}

// ==========================================
// Main Calculator Logic
// ==========================================
const calcInput = document.getElementById("calc-input");
const calcResult = document.getElementById("calc-result");
const calcLatex = document.getElementById("calc-latex");

function updateCalculator() {
  const expression = calcInput.value;

  if (!expression.trim()) {
    calcResult.textContent = "";
    calcLatex.innerHTML = "";
    return;
  }

  try {
    // Preprocess logN without parentheses: "log2 8" => "log2(8)"
    // Preprocess log followed immediately by digits (e.g. log23) into log(23)
    let normalizedExpression = expression
      .replace(/,/g, "")
      .replace(/\b(log\d+)\s+(\([^)]*\)|[^\s()+\-*/^,]+)/g, "$1($2)")
      .replace(/\blog(\d+)\b(?!\s|\()/g, "log($1)");

    // Auto-normalize trig/function shorthand like sin25, cos 30, etc.
    normalizedExpression = normalizeFunctionSyntax(normalizedExpression);

    // Parse and compile for LaTeX
    const node = math.parse(normalizedExpression);

    // Normalize bare log(x) to log10(x) for LaTeX rendering (mathjs default log is ln)
    // also normalize logN(x) to log(x, N) for nicer LaTeX via indexed log where possible
    const texNode = node.transform(function (n) {
      if (
        n.type === "FunctionNode" &&
        n.name === "log" &&
        n.args.length === 1
      ) {
        return new math.FunctionNode("log10", [n.args[0]]);
      }

      if (
        n.type === "FunctionNode" &&
        /^log\d+$/.test(n.name) &&
        n.args.length === 1
      ) {
        const base = Number(n.name.slice(3));
        return new math.FunctionNode("log", [
          n.args[0],
          new math.ConstantNode(base),
        ]);
      }

      return n;
    });

    const latex = texNode.toTex({ parenthesis: "keep", implicit: "hide" });

    // Render LaTeX
    katex.render(latex, calcLatex, {
      throwOnError: false,
      displayMode: true,
    });

    // Evaluate Result
    let result = node.evaluate();

    // Format result nicely
    let displayResult = math.format(result, { precision: 14 });

    // If the result is a number, try to show it in LaTeX as well if it's special (like very large)
    // But for the main result text, just showing the number is usually cleaner
    calcResult.textContent = displayResult;
  } catch (err) {
    // Don't show errors immediately to avoid flashing while typing
    // console.error(err);
  }
}

calcInput.addEventListener("input", updateCalculator);
calcInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
    const currentResult = calcResult.textContent;
    if (currentResult) {
      calcInput.value = currentResult;
      updateCalculator();
    }
  } else if (e.key === "Enter") {
    const currentResult = calcResult.textContent;
    if (currentResult) {
      navigator.clipboard.writeText(currentResult);
    }
  }
});

// ==========================================
// Quadratic Solver Logic
// ==========================================
const quadA = document.getElementById("quad-a");
const quadB = document.getElementById("quad-b");
const quadC = document.getElementById("quad-c");
const quadPreview = document.getElementById("quad-equation-preview");
const resX1 = document.getElementById("quad-result-x1");
const resX2 = document.getElementById("quad-result-x2");

let lastQuadResult = "";

function solveQuadratic() {
  const rawA = quadA.value || "1";
  const rawB = quadB.value || "0";
  const rawC = quadC.value || "0";

  try {
    // Evaluate inputs (allow math expressions like 2*10^3)
    const a = math.evaluate(rawA);
    const b = math.evaluate(rawB);
    const c = math.evaluate(rawC);

    // Manual construction of LaTeX to ensure "ax^2+bx+c" format without "cdot" or reordering
    // We explicitly check a, b, c to build the string in order.
    const formatTerm = (coeff, variable, isLeading) => {
      if (coeff === 0) return "";

      let str = "";
      let absCoeff = Math.abs(coeff);

      // Handle Sign
      if (coeff < 0)
        str += "-"; // negative is always minus
      else if (!isLeading) str += "+"; // positive gets + unless it's the very first term

      // Handle Value
      // If coefficient is 1 and we have a variable (x^2 or x), we usually hide the 1.
      // But if it's the constant (variable is empty), we must show it.
      let valStr = math.format(absCoeff, { precision: 14 });

      if (variable === "") {
        // Constant term: always show value
        str += valStr;
      } else {
        // Variable term: show value only if it's not 1
        if (valStr !== "1") {
          str += valStr;
        }
      }

      str += variable;
      return str;
    };

    let eqTex = "";
    eqTex += formatTerm(a, "x^2", true);
    // For b, it's leading only if a was 0 (eqTex is still empty)
    eqTex += formatTerm(b, "x", eqTex === "");
    // For c, it's leading only if a and b were 0
    eqTex += formatTerm(c, "", eqTex === "");

    if (eqTex === "") eqTex = "0";

    katex.render(eqTex + " = 0", quadPreview, { throwOnError: false });

    // Quadratic Formula
    if (a === 0) {
      // If a=0, it's linear: bx + c = 0 -> x = -c/b
      if (b === 0) {
        const msg = c === 0 ? "Infinite solutions" : "No solution";
        resX1.innerHTML = msg;
        resX2.innerHTML = "";
        lastQuadResult = msg;
      } else {
        const x = -c / b;
        const xFrac = math.fraction(x);
        let xValTex = math.format(x, { precision: 5 });

        // Append fraction if denominator is not 1 and it's exact enough
        if (xFrac.d !== 1 && xFrac.d < 10000) {
          xValTex += ` \\quad \\left( \\frac{${xFrac.s * xFrac.n}}{${xFrac.d}} \\right)`;
        }

        katex.render(`x = ${xValTex}`, resX1, { throwOnError: false });
        resX2.innerHTML = "";
        lastQuadResult = `x = ${math.format(x, { precision: 5 })}`;
      }
      return;
    }

    const discriminant = b * b - 4 * a * c;

    // Handle results
    let x1Tex, x2Tex;

    if (discriminant >= 0) {
      // Real roots
      const root = Math.sqrt(discriminant);
      const x1 = (-b + root) / (2 * a);
      const x2 = (-b - root) / (2 * a);

      // Helper to format a single real root
      const formatRoot = (val) => {
        let valTex = math.format(val, { precision: 5 });
        try {
          const frac = math.fraction(val);
          if (frac.d !== 1 && frac.d < 10000) {
            // Check if fraction is actually close to val (math.fraction approximates irrational numbers)
            // But for quadratic text, it's usually desired.
            // Only show if it matches simpler logic or requested strictly
            valTex += ` \\quad \\left( \\frac{${frac.s * frac.n}}{${frac.d}} \\right)`;
          }
        } catch (e) {
          /* ignore fraction errors for weird numbers */
        }
        return valTex;
      };

      x1Tex = `x_1 = ${formatRoot(x1)}`;
      x2Tex = `x_2 = ${formatRoot(x2)}`;
      lastQuadResult = `x1 = ${math.format(x1, { precision: 5 })}\nx2 = ${math.format(x2, { precision: 5 })}`;
    } else {
      // Complex roots
      const realPart = -b / (2 * a);
      const imagPart = Math.sqrt(-discriminant) / (2 * a);

      const realStr = math.format(realPart, { precision: 5 });
      // Ensure positive imaginary part for display since we use +/-
      const imagStr = math.format(Math.abs(imagPart), { precision: 5 });

      x1Tex = `x_1 = ${realStr} + ${imagStr}i`;
      x2Tex = `x_2 = ${realStr} - ${imagStr}i`;
      lastQuadResult = `x1 = ${realStr} + ${imagStr}i\nx2 = ${realStr} - ${imagStr}i`;
    }

    katex.render(x1Tex, resX1, { throwOnError: false });
    katex.render(x2Tex, resX2, { throwOnError: false });
  } catch (err) {
    // console.error(err);
    quadPreview.textContent = "Invalid Input";
    resX1.innerHTML = "";
    resX2.innerHTML = "";
    lastQuadResult = "";
  }
}

// Attach listeners
quadA.addEventListener("input", solveQuadratic);
quadB.addEventListener("input", solveQuadratic);
quadC.addEventListener("input", solveQuadratic);

function copyQuadResult() {
  if (lastQuadResult) navigator.clipboard.writeText(lastQuadResult);
}
quadA.addEventListener("keydown", (e) => { if (e.key === "Enter") copyQuadResult(); });
quadB.addEventListener("keydown", (e) => { if (e.key === "Enter") copyQuadResult(); });
quadC.addEventListener("keydown", (e) => { if (e.key === "Enter") copyQuadResult(); });

// Initial run
solveQuadratic();
updateCalculator();

// ==========================================
// Molar Mass Logic
// ==========================================

const ATOMIC_MASSES = {
  H: 1.008, He: 4.003, Li: 6.941, Be: 9.012, B: 10.811, C: 12.011,
  N: 14.007, O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305,
  Al: 26.982, Si: 28.086, P: 30.974, S: 32.065, Cl: 35.453, Ar: 39.948,
  K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996,
  Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
  Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798,
  Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95,
  Tc: 98, Ru: 101.07, Rh: 102.906, Pd: 106.42, Ag: 107.868, Cd: 112.414,
  In: 114.818, Sn: 118.71, Sb: 121.76, Te: 127.6, I: 126.904, Xe: 131.293,
  Cs: 132.905, Ba: 137.327, La: 138.905, Ce: 140.116, Pr: 140.908, Nd: 144.242,
  Pm: 145, Sm: 150.36, Eu: 151.964, Gd: 157.25, Tb: 158.925, Dy: 162.5,
  Ho: 164.930, Er: 167.259, Tm: 168.934, Yb: 173.045, Lu: 174.967,
  Hf: 178.49, Ta: 180.948, W: 183.84, Re: 186.207, Os: 190.23, Ir: 192.217,
  Pt: 195.084, Au: 196.967, Hg: 200.592, Tl: 204.38, Pb: 207.2, Bi: 208.980,
  Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226, Ac: 227, Th: 232.038,
  Pa: 231.036, U: 238.029, Np: 237, Pu: 244, Am: 243, Cm: 247, Bk: 247,
  Cf: 251, Es: 252, Fm: 257, Md: 258, No: 259, Lr: 262,
};

// Parse a chemical formula string into { element: count } map.
// Handles nested parentheses and numeric multipliers.
function parseChemFormula(formula) {
  let i = 0;

  function parseGroup() {
    const counts = {};
    while (i < formula.length) {
      if (formula[i] === "(") {
        i++; // skip '('
        const inner = parseGroup();
        i++; // skip ')'
        const numStart = i;
        while (i < formula.length && /\d/.test(formula[i])) i++;
        const mult = i > numStart ? parseInt(formula.slice(numStart, i), 10) : 1;
        for (const [el, cnt] of Object.entries(inner)) {
          counts[el] = (counts[el] || 0) + cnt * mult;
        }
      } else if (formula[i] === ")") {
        break;
      } else if (/[A-Z]/.test(formula[i])) {
        let el = formula[i++];
        while (i < formula.length && /[a-z]/.test(formula[i])) el += formula[i++];
        const numStart = i;
        while (i < formula.length && /\d/.test(formula[i])) i++;
        const cnt = i > numStart ? parseInt(formula.slice(numStart, i), 10) : 1;
        counts[el] = (counts[el] || 0) + cnt;
      } else {
        i++; // skip unexpected char
      }
    }
    return counts;
  }

  return parseGroup();
}

// Convert a chemical formula string to a LaTeX string with subscripts.
function formulaToLatex(formula) {
  let result = "";
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (/[A-Z]/.test(ch)) {
      let el = ch;
      i++;
      while (i < formula.length && /[a-z]/.test(formula[i])) el += formula[i++];
      result += `\\mathrm{${el}}`;
    } else if (/\d/.test(ch)) {
      let num = ch;
      i++;
      while (i < formula.length && /\d/.test(formula[i])) num += formula[i++];
      result += `_{${num}}`;
    } else {
      result += ch;
      i++;
    }
  }
  return result;
}

function updateMolarMass() {
  const molarInput = document.getElementById("molar-input");
  const molarLatex = document.getElementById("molar-latex");
  const molarResult = document.getElementById("molar-result");
  const molarBreakdown = document.getElementById("molar-breakdown");

  const formula = molarInput.value.trim();

  if (!formula) {
    molarLatex.innerHTML = "";
    molarResult.textContent = "";
    molarBreakdown.innerHTML = "";
    return;
  }

  try {
    // Validate: formula must start with an uppercase letter or '('
    if (!/^[A-Z(]/.test(formula)) throw new Error("Invalid formula");

    const counts = parseChemFormula(formula);
    const elements = Object.keys(counts);
    if (elements.length === 0) throw new Error("No elements found");

    // Check all elements are in the periodic table
    for (const el of elements) {
      if (!(el in ATOMIC_MASSES)) throw new Error(`Unknown element: ${el}`);
    }

    // Render LaTeX formula
    const latex = formulaToLatex(formula);
    katex.render(latex, molarLatex, { throwOnError: false, displayMode: true });

    // Compute molar mass
    let total = 0;
    for (const [el, cnt] of Object.entries(counts)) {
      total += ATOMIC_MASSES[el] * cnt;
    }

    molarResult.textContent = total.toFixed(2) + " g/mol";

    // Render element breakdown rows
    molarBreakdown.innerHTML = "";
    for (const [el, cnt] of Object.entries(counts)) {
      const contrib = ATOMIC_MASSES[el] * cnt;
      const row = document.createElement("div");
      row.className = "result-row molar-breakdown-row";

      const label = document.createElement("span");
      label.className = "result-label";
      katex.render(
        cnt > 1 ? `${cnt}\\times\\mathrm{${el}}` : `\\mathrm{${el}}`,
        label,
        { throwOnError: false },
      );

      const value = document.createElement("span");
      value.className = "result-value molar-breakdown-value";
      value.textContent = contrib.toFixed(2) + " g/mol";

      row.appendChild(label);
      row.appendChild(value);
      molarBreakdown.appendChild(row);
    }
  } catch (err) {
    molarLatex.innerHTML = "";
    molarResult.textContent = err.message || "Invalid formula";
    molarResult.style.color = "var(--accent-color)";
    molarResult.style.fontSize = "16px";
    molarBreakdown.innerHTML = "";
    return;
  }

  molarResult.style.color = "";
  molarResult.style.fontSize = "";
}

document.getElementById("molar-input").addEventListener("input", updateMolarMass);
document.getElementById("molar-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const result = document.getElementById("molar-result").textContent;
    if (result) navigator.clipboard.writeText(result);
  }
});

// ==========================================
// Render Section (LaTeX / Typst / Markdown)
// ==========================================

// WASM modules for the Typst compiler + renderer (pinned to match typst.ts@0.7.0)
const TYPST_COMPILER_WASM =
  "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm";
const TYPST_RENDERER_WASM =
  "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-renderer@0.7.0/pkg/typst_ts_renderer_bg.wasm";

// Prepended to Typst source so pages are transparent, auto-sized and readable on the dark theme.
// User #set statements (which come later) still take precedence.
const TYPST_PREAMBLE =
  '#set page(width: auto, height: auto, margin: 1em, fill: none)\n' +
  '#set text(fill: rgb("#e6e6e6"))\n';

// Example snippets, one per format
const RENDER_SAMPLES = {
  latex:
    "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
  typst:
    "= Pythagorean Theorem\n\n" +
    "For a right triangle, $a^2 + b^2 = c^2$, where $c$ is the hypotenuse.\n\n" +
    "$ c = sqrt(a^2 + b^2) $\n\n" +
    "#block(\n" +
    '  fill: rgb("#2c2c2c"),\n' +
    "  inset: 10pt,\n" +
    "  radius: 6pt,\n" +
    ")[\n" +
    "  The quadratic formula:\n" +
    "  $ x = (-b ± sqrt(b^2 - 4 a c)) / (2a) $\n" +
    "]",
  markdown:
    "# Quadratic Formula\n\n" +
    "The roots of the quadratic $ax^2 + bx + c = 0$ are given by\n\n" +
    "$$\nx = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n$$\n\n" +
    "- $a$, $b$, $c$ are real numbers\n" +
    "- Works when $a \\neq 0$",
};

let currentRenderMode = "auto";
let renderVisited = false;
let renderDebounceTimer = null;
let typstBusy = false;
let typstQueued = false;
let typstReady = false;
let typstInitPromise = null;
let typstInitAttempts = 0;

const renderInput = document.getElementById("render-input");
const renderOutput = document.getElementById("render-output");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Remove dangerous tags/attributes from rendered Markdown HTML
function sanitizeHtml(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container
    .querySelectorAll("script, style, iframe, object, embed, link, meta, form")
    .forEach((n) => n.remove());
  container.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      if (name.startsWith("on") || /^\s*javascript:/.test(value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return container.innerHTML;
}

// Best-effort detection of LaTeX / Typst / Markdown from raw text.
// Returns "latex" | "typst" | "markdown" | null (for empty input).
function detectFormat(text) {
  const t = text.trim();
  if (!t) return null;

  // Unambiguous structural signals first.
  if (/\\begin\{[a-zA-Z*]+\}|\\(documentclass|usepackage)\b/.test(t)) return "latex";
  if (/^#{1,6}[ \t]/m.test(t)) return "markdown"; // "# Heading" is Markdown (Typst headings use "=")
  if (/^=+[ \t]/m.test(t)) return "typst"; // "= Heading" is Typst

  let score = { latex: 0, typst: 0, markdown: 0 };

  // --- LaTeX signals ---
  if (/\\\[|\\\]|\$\$/.test(t)) score.latex += 4;
  score.latex += Math.min(
    (t.match(/\\[a-zA-Z]{2,}(?=\s*[\{\[\s\\\d])/g) || []).length,
    5,
  );
  if (/\\[a-zA-Z]+\{[^}]*\}/.test(t)) score.latex += 1;
  if (/\\[()\[\]]/.test(t)) score.latex += 1;
  // Bare [ ... ] display-math block (brackets alone on their own lines)
  if (/^[ \t]*\[[ \t]*\r?\n/m.test(t) && /^[ \t]*\][ \t]*\r?$/m.test(t)) {
    score.latex += 3;
  }

  // --- Typst signals ---
  const typstKeyword =
    /#(set|show|let|import|align|text|block|figure|table|grid|image|outline|bibliography|cite|link|enum|list|page|parbreak|quote|box|pad|place|rect|circle|line|arrow|curve|polygon|path|math|columns|stack|heading)\b/;
  if (typstKeyword.test(t)) score.typst += 4;
  if (/[_^]\s*\(/.test(t)) score.typst += 2; // x_(n) / x^(n) style groups
  if (/\$[^$\n]+(->|=>|\^\(|_\(|\s+\/)/.test(t)) score.typst += 2; // typst-ish math constructs
  // Bare function calls inside $...$ (Typst style), e.g. $sqrt(x)$ or $sin(x)$
  if (
    /\$[^$\n]*\b(sqrt|sin|cos|tan|arctan|arcsin|arccos|log|exp|floor|ceil|abs|min|max|sum|prod|integral|diff|delta|gamma|alpha|beta|pi|infinity|arrow)\s*\(/.test(
      t,
    )
  ) {
    score.typst += 3;
  }

  // --- Markdown signals ---
  if (/^[-*][ \t]/m.test(t)) score.markdown += 2;
  if (/^\d+[.)][ \t]/m.test(t)) score.markdown += 2;
  if (/^>[ \t]/m.test(t)) score.markdown += 2;
  if (/\*\*[^*]+\*\*/.test(t)) score.markdown += 2;
  if (/\[[^\]]+\]\([^)\s]+\)/.test(t)) score.markdown += 2;
  if (/`[^`\n]+`/.test(t)) score.markdown += 1;
  if (/^---+$/m.test(t)) score.markdown += 1;

  // --- Inline math $...$: Typst if mixed with Typst keywords, else LaTeX ---
  // (Guarded so prices/currency like "$5 and $3" aren't treated as math.)
  const inlineMathRe = /(^|[^$\d])\$([^$\n]+?)\$(?!\d)/;
  const inlineMathReGlobal = new RegExp(inlineMathRe.source, "g");
  if (inlineMathRe.test(t)) {
    if (typstKeyword.test(t)) score.typst += 3;
    else score.latex += 2;
  }

  // A prose sentence with a bit of embedded math → render as Markdown.
  // (Requires a real 4+ letter word so bare equations like "x^2 + 3x - 4 = 0"
  // don't get misread as prose.)
  const outsideMath = t.replace(inlineMathReGlobal, " ").trim();
  if (
    score.markdown === 0 &&
    !/\\\[|\$\$|\\[a-zA-Z]{2,}/.test(t) &&
    outsideMath.split(/\s+/).length >= 4 &&
    /[a-zA-Z]{4,}/.test(outsideMath)
  ) {
    score.markdown += 4;
  }

  // Bare single-line math expression without delimiters, e.g. "x^2 + 3x - 4 = 0"
  if (
    !t.includes("\n") &&
    score.latex === 0 &&
    score.typst === 0 &&
    score.markdown === 0 &&
    /[a-zA-Z0-9)](\^|_)/.test(t) &&
    /[=\+\-\*/\^]/.test(t)
  ) {
    score.latex += 2;
  }

  if (score.typst > score.latex && score.typst >= score.markdown) return "typst";
  if (score.markdown >= score.latex && score.markdown > 0) return "markdown";
  if (score.latex > 0) return "latex";
  if (score.typst > 0) return "typst";
  return "markdown";
}

function updateDetectedBadge(fmt) {
  const badge = document.getElementById("render-detected");
  if (!badge) return;
  if (currentRenderMode !== "auto") {
    const label =
      currentRenderMode.charAt(0).toUpperCase() + currentRenderMode.slice(1);
    badge.textContent = `mode: ${label}`;
    return;
  }
  if (!fmt) {
    badge.textContent = "auto-detect";
    return;
  }
  const label = fmt.charAt(0).toUpperCase() + fmt.slice(1);
  badge.textContent = `detected: ${label}`;
}

function setOutputPlaceholder() {
  renderOutput.innerHTML =
    '<div class="render-empty">Rendered output appears here — start typing or paste something.</div>';
}

// --------------------------- LaTeX (KaTeX) ---------------------------
// Map a LaTeX environment to a KaTeX-supported one.
function wrapLatexEnv(envName, inner) {
  let env = envName.replace(/\*$/, "");
  const supported = [
    "aligned",
    "alignedat",
    "gathered",
    "split",
    "cases",
    "matrix",
    "pmatrix",
    "bmatrix",
    "Bmatrix",
    "vmatrix",
    "Vmatrix",
    "array",
    "smallmatrix",
  ];
  const wrap =
    env === "align" || env === "equation" || env === "eqnarray"
      ? "aligned"
      : env === "gather" || env === "multline"
        ? "gathered"
        : supported.includes(env)
          ? env
          : "aligned";
  return `\\begin{${wrap}}${inner}\\end{${wrap}}`;
}

// Render a single math segment to HTML (shared by the LaTeX and Markdown
// renderers). A bad segment degrades to an inline error instead of failing
// the whole render.
function katexHtmlForSegment(seg) {
  try {
    const options = {
      throwOnError: false,
      displayMode: seg.display,
      strict: false,
    };
    if (seg.kind === "env") {
      return katex.renderToString(wrapLatexEnv(seg.env, seg.tex), options);
    }
    return katex.renderToString(seg.tex, options);
  } catch (e) {
    return `<span class="render-error">${escapeHtml(seg.tex)}</span>`;
  }
}

// Split source into alternating plain-text / math segments.
function tokenizeLatex(src) {
  const segments = [];
  const re =
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\3\}|\$([^$\n]+?)\$(?!\d)|\\\(([\s\S]+?)\\\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      segments.push({ math: false, text: src.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      segments.push({ math: true, display: true, kind: "display", tex: m[1] });
    } else if (m[2] !== undefined) {
      segments.push({ math: true, display: true, kind: "display", tex: m[2] });
    } else if (m[3] !== undefined) {
      segments.push({
        math: true,
        display: true,
        kind: "env",
        env: m[3],
        tex: m[4],
      });
    } else if (m[5] !== undefined) {
      segments.push({ math: true, display: false, kind: "inline", tex: m[5] });
    } else if (m[6] !== undefined) {
      segments.push({ math: true, display: false, kind: "inline", tex: m[6] });
    }
    last = re.lastIndex;
  }
  if (last < src.length) {
    segments.push({ math: false, text: src.slice(last) });
  }
  return segments;
}

// Split text into alternating word/whitespace tokens (keeping everything).
function tokenizeProse(text) {
  const tokens = [];
  let last = 0;
  const re = /\s+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      tokens.push({ text: text.slice(last, m.index), isWs: false });
    }
    tokens.push({ text: m[0], isWs: true });
    last = re.lastIndex;
  }
  if (last < text.length) {
    tokens.push({ text: text.slice(last), isWs: false });
  }
  return tokens;
}

// True when a whitespace-delimited token belongs to a math expression rather
// than prose ("a", "(p", "x_i", "2a" → true; "and", "if", "e.g." → false).
function isMathishToken(tok) {
  if (!tok) return false;
  if (/\\/.test(tok)) return true; // contains a LaTeX command → part of the math
  if (/[a-zA-Z]{3,}/.test(tok)) return false; // real words stay prose
  if (/^[a-zA-Z]\.[a-zA-Z]\.?[.,;:!?'"]*$/.test(tok)) return false; // "e.g."-style abbreviations
  if (/[a-zA-Z]{2,}/.test(tok) && !/[\d^_()[\]{}]/.test(tok)) return false; // short words ("if", "to")
  return true;
}

// In plain-text segments, find runs that contain LaTeX commands (e.g.
// "(p\nmid a)") and render them as inline math, leaving the surrounding prose
// untouched. Any run that fails to compile stays as plain text.
function inlineCommandsToHtml(prose) {
  const tokens = tokenizeProse(prose);
  const out = [];
  const cmdRe = /\\[a-zA-Z]+/;
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.isWs || !cmdRe.test(tok.text)) {
      // Prose tokens must stay escaped (only whitespace is safe raw).
      out.push(tok.isWs ? tok.text : escapeHtml(tok.text));
      i++;
      continue;
    }
    // Anchor token contains a command — expand to a math span.
    let start = i;
    while (
      start >= 2 &&
      tokens[start - 1].isWs &&
      !/\n/.test(tokens[start - 1].text) &&
      isMathishToken(tokens[start - 2].text)
    ) {
      start -= 2;
    }
    let end = i + 1;
    while (
      end + 1 < tokens.length &&
      tokens[end].isWs &&
      !/\n/.test(tokens[end].text) &&
      isMathishToken(tokens[end + 1].text)
    ) {
      end += 2;
    }
    const raw = tokens
      .slice(start, end)
      .map((t) => t.text)
      .join("");
    // Sentence punctuation right after the math stays as prose.
    const pm = raw.match(/[.,;:!?'"]+$/);
    const span = pm ? raw.slice(0, -pm[0].length) : raw;
    let html;
    if (span.length <= 120) {
      try {
        html = katex.renderToString(span, {
          throwOnError: true,
          displayMode: false,
          strict: false,
        });
      } catch (e) {
        html = escapeHtml(span); // not valid math → keep as plain text
      }
    } else {
      html = escapeHtml(span);
    }
    out.push(html, pm ? pm[0] : "");
    i = end;
  }
  return out.join("");
}

// Turn mixed segments (plain text + math) into HTML. Plain text stays as
// untouched paragraphs; inline math flows inside them; display math becomes
// its own centered block.
function mixedLatexHtml(segments) {
  const html = [];
  let para = [];
  const flush = () => {
    const trimmed = para.join("").trim();
    if (trimmed) html.push(`<p>${trimmed}</p>`);
    para = [];
  };

  for (const seg of segments) {
    if (!seg.math) {
      // Plain text may contain blank-line paragraph breaks
      const parts = seg.text.split(/\n\s*\n+/);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].replace(/^\s+/, ""); // strip leading whitespace only
        if (!part) continue; // skip whitespace runs (e.g. stray newline after a display block)
        para.push(inlineCommandsToHtml(part).replace(/\n/g, "<br>"));
        if (i < parts.length - 1) flush();
      }
    } else if (seg.display) {
      flush();
      html.push(katexHtmlForSegment(seg));
    } else {
      para.push(katexHtmlForSegment(seg));
    }
  }
  flush();
  return html.join("");
}

// True when a delimiter-free chunk is really a math expression, not prose.
function isLikelyMathExpression(tex) {
  const t = tex.trim();
  if (!t) return false;
  // Bare function-call math like "log(x)" or "sin(x)" (no backslash needed)
  if (/\b(?:log|ln|sin|cos|tan|sqrt|exp|abs|min|max|floor|ceil|gcd|mod)\s*\(/i.test(t)) {
    return true;
  }
  const stripped = t
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[\d\s()[\]{}+*/^_=,.\\:;'"|]/g, "");
  if (/[a-zA-Z]{4,}/.test(stripped)) return false; // real words → prose
  return /\\[a-zA-Z]/.test(t) || /[a-z0-9)](\^|_)/.test(t) || /[=+\-*/^]/.test(t);
}

function renderLatexToDom(source) {
  const out = renderOutput;
  const text = source.trim();

  try {
    // Full documents need a TeX engine — give a friendly hint instead.
    if (/\\documentclass|\\begin\{document\}/.test(text)) {
      out.innerHTML =
        "<div class=\"render-error\">Full LaTeX documents aren\u2019t supported here. Paste a math expression, snippet, or environment instead.</div>";
      return;
    }

    let tex = text
      .replace(/\\begin\{document\}[\s\S]*?\\end\{document\}/, "")
      .trim();
    if (!tex) {
      out.innerHTML = "<div class=\"render-error\">No math found.</div>";
      return;
    }

    // Normalize bare [ ... ] display-math blocks (brackets alone on their own
    // lines). All of them, not just the first. Blocks that don't look like
    // math (e.g. a bracketed note) stay literal.
    tex = tex.replace(
      /^[ \t]*\[[ \t]*\r?\n([\s\S]*?)^[ \t]*\][ \t]*\r?$/gm,
      (match, inner) => {
        const body = inner.trim();
        const looksMath =
          /\\[a-zA-Z]|[\^_]/.test(body) ||
          (body.length <= 40 &&
            !/[a-zA-Z]{3,}/.test(body) &&
            !/^[a-zA-Z\s]*$/.test(body));
        return looksMath ? `\\[${body}\\]` : match;
      },
    );

    const segments = tokenizeLatex(tex);
    const hasMath = segments.some((s) => s.math);

    if (hasMath) {
      // A lone inline $...$ with nothing around it → show it as display math
      if (segments.length === 1 && segments[0].kind === "inline") {
        segments[0].display = true;
      }
      out.innerHTML = mixedLatexHtml(segments);
    } else if (isLikelyMathExpression(tex)) {
      // Pure math expression without delimiters → render it as display math
      katex.render(tex, out, {
        throwOnError: false,
        displayMode: true,
        strict: false,
      });
    } else {
      // Just prose → render it as text paragraphs
      out.innerHTML = mixedLatexHtml(segments);
    }
  } catch (err) {
    out.innerHTML = `<div class="render-error">LaTeX error: ${escapeHtml(
      err && err.message ? err.message : String(err),
    )}</div>`;
  }
}

// --------------------------- Markdown (marked + KaTeX math) ---------------------------
function renderMarkdownToDom(source) {
  const out = renderOutput;
  try {
    // Protect inline code spans first so any $ or \[ inside them is never
    // treated as TeX.
    const codeSpans = [];
    let processed = source.replace(/`([^`\n]+)`/g, (m, inner) => {
      codeSpans.push(inner);
      return `@@CODE${codeSpans.length - 1}@@`;
    });

    // Extract $...$, $$...$$, \[...\] and \begin{env} math first so Marked
    // never touches the TeX. (\[ is skipped when it's an escaped-bracket
    // link like \[text\](url).)
    const placeholders = [];
    processed = processed
      .replace(/\$\$([\s\S]+?)\$\$/g, (m, inner) => {
        placeholders.push({ tex: inner, display: true, kind: "display" });
        return `@@MATH${placeholders.length - 1}@@`;
      })
      .replace(/\\\[([\s\S]+?)\\\](?![\t ]*\()/g, (m, inner) => {
        placeholders.push({ tex: inner, display: true, kind: "display" });
        return `@@MATH${placeholders.length - 1}@@`;
      })
      .replace(/\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/g, (m, env, inner) => {
        placeholders.push({ tex: inner, display: true, kind: "env", env });
        return `@@MATH${placeholders.length - 1}@@`;
      })
      .replace(/(^|[^$\d])\$([^$\n]+?)\$(?!\d)/g, (m, pre, inner) => {
        placeholders.push({ tex: inner, display: false, kind: "inline" });
        return `${pre}@@MATH${placeholders.length - 1}@@`;
      });

    const html = window.marked
      ? marked.parse(processed, { breaks: true, gfm: true })
      : escapeHtml(processed).replace(/\n/g, "<br>");
    const safe = sanitizeHtml(html);
    let finalHtml = safe.replace(/@@MATH(\d+)@@/g, (m, idx) => {
      const p = placeholders[+idx];
      if (!p) return m;
      return katexHtmlForSegment(p);
    });
    // Restore protected code spans as proper <code> elements.
    finalHtml = finalHtml.replace(/@@CODE(\d+)@@/g, (m, idx) => {
      const c = codeSpans[+idx];
      return c !== undefined ? `<code>${escapeHtml(c)}</code>` : m;
    });
    out.innerHTML = finalHtml;
  } catch (err) {
    out.innerHTML = `<div class="render-error">Markdown error: ${escapeHtml(
      err && err.message ? err.message : String(err),
    )}</div>`;
  }
}

// --------------------------- Typst (typst.ts WASM) ---------------------------
function waitForTypst(timeoutMs = 12000) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function poll() {
      if (window.$typst) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(poll, 200);
    })();
  });
}

function ensureTypst() {
  if (typstReady) return Promise.resolve(true);
  if (!typstInitPromise) {
    typstInitPromise = (async () => {
      typstInitAttempts++;
      // First init can be slow (module + WASM + font downloads); retries are quicker.
      const loaded = await waitForTypst(typstInitAttempts > 1 ? 4000 : 12000);
      if (!loaded) return false;
      try {
        $typst.setCompilerInitOptions({ getModule: () => TYPST_COMPILER_WASM });
        $typst.setRendererInitOptions({ getModule: () => TYPST_RENDERER_WASM });
        // Warm up the compiler + renderer (also fetches embedded fonts).
        await $typst.svg({ mainContent: " " });
        typstReady = true;
        return true;
      } catch (err) {
        console.error("Typst init failed:", err);
        return false;
      }
    })();
    // If initialization failed, allow the next render to retry.
    typstInitPromise.finally(() => {
      if (!typstReady) typstInitPromise = null;
    });
  }
  return typstInitPromise;
}

async function renderTypstToDom(source) {
  const out = renderOutput;
  const ok = await ensureTypst();
  if (!ok) {
    out.innerHTML =
      '<div class="render-error">The Typst engine could not be loaded (are you offline?).</div>';
    return;
  }
  try {
    // Compile directly so we can surface real Typst diagnostics (with line
    // numbers) instead of a silently-blank output when the source is invalid.
    const compiler = await $typst.getCompiler();
    await compiler.reset();
    const mainFilePath = "/main.typ";
    compiler.addSource(mainFilePath, TYPST_PREAMBLE + source);
    const res = await compiler.compile({ mainFilePath, diagnostics: "unix" });
    const errorLines = (res.diagnostics || []).filter(
      (d) => typeof d === "string" && d.includes(": error:"),
    );
    if (res.hasError || errorLines.length > 0) {
      out.innerHTML = `<div class="render-error">${escapeHtml(
        errorLines.length > 0 ? errorLines.join("\n") : "Typst compilation error",
      )}</div>`;
      return;
    }

    const renderer = await $typst.getRenderer();
    const svg = await renderer.runWithSession(async (session) => {
      renderer.manipulateData({
        renderSession: session,
        action: "reset",
        data: res.result,
      });
      return renderer.renderSvg({ renderSession: session });
    });
    if (typeof svg !== "string" || !svg.includes("<svg")) {
      out.innerHTML =
        '<div class="render-error">Typst failed to produce output.</div>';
      return;
    }
    out.innerHTML = svg;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const notes = err && err.trace ? err.trace : null;
    out.innerHTML =
      `<div class="render-error">Typst error: ${escapeHtml(msg)}</div>` +
      (notes ? `<pre class="render-notes">${escapeHtml(notes)}</pre>` : "");
  }
}

// --------------------------- Orchestration ---------------------------
async function doRender() {
  const text = renderInput.value;
  const fmt =
    currentRenderMode === "auto" ? detectFormat(text) : currentRenderMode;
  updateDetectedBadge(fmt);

  if (!text.trim()) {
    setOutputPlaceholder();
    return;
  }

  if (fmt === "typst") {
    // Typst compiles in WASM — serialize renders and show a subtle busy state.
    if (typstBusy) {
      typstQueued = true;
      return;
    }
    typstBusy = true;
    renderOutput.classList.add("is-rendering");
    try {
      await renderTypstToDom(text);
    } finally {
      renderOutput.classList.remove("is-rendering");
      typstBusy = false;
      if (typstQueued) {
        typstQueued = false;
        doRender();
      }
    }
  } else if (fmt === "latex") {
    renderLatexToDom(text);
  } else {
    renderMarkdownToDom(text);
  }
}

// Realtime: debounce slow (Typst) renders, run fast ones on the next tick.
function updateRenderPreview() {
  clearTimeout(renderDebounceTimer);
  const text = renderInput.value;
  const fmt = currentRenderMode === "auto" ? detectFormat(text) : currentRenderMode;
  const slow = fmt === "typst";
  renderDebounceTimer = setTimeout(doRender, slow ? 350 : 0);
}

function setRenderMode(mode, btnElement) {
  currentRenderMode = mode;
  document
    .querySelectorAll("#render .toggle-btn")
    .forEach((b) => b.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");
  updateRenderPreview();
}

function loadRenderSample() {
  const mode =
    currentRenderMode === "auto" ? "markdown" : currentRenderMode;
  renderInput.value = RENDER_SAMPLES[mode] || RENDER_SAMPLES.markdown;
  renderVisited = true;
  doRender();
  renderInput.focus();
}

renderInput.addEventListener("input", updateRenderPreview);
renderInput.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === "Enter") {
    e.preventDefault();
    if (e.shiftKey) {
      // Copy source
      navigator.clipboard.writeText(renderInput.value).catch(() => {});
    } else {
      // Copy rendered output (plain text)
      const outText = renderOutput.textContent.trim();
      if (outText) navigator.clipboard.writeText(outText).catch(() => {});
    }
  }
});

setOutputPlaceholder();

// ==========================================
// Window + Render split resizing
// ==========================================
const MIN_WINDOW_W = 420;
const MIN_WINDOW_H = 340;
const MIN_PANE_W = 160;
const MIN_OUTPUT_W = 200;

const appContainerEl = document.querySelector(".app-container");
const resizeHandleEl = document.getElementById("resize-handle");
const renderSplitEl = document.querySelector(".render-split");
const renderDividerEl = document.getElementById("render-divider");
const renderInputPaneEl = document.querySelector(".render-input-pane");

function clampNum(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

function windowMaxWidth() {
  return Math.max(MIN_WINDOW_W, window.innerWidth - 16);
}

function windowMaxHeight() {
  return Math.min(window.innerHeight - 16, window.innerHeight * 0.8);
}

// ------------------- Window resize -------------------
let windowSizeSet = false;

function saveWindowSize() {
  try {
    // Use the rendered box (not offsetWidth) so restoring style.width doesn't
    // accumulate the 1px borders on each save/restore cycle.
    const r = appContainerEl.getBoundingClientRect();
    localStorage.setItem(
      "raycalc-window-size",
      JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) }),
    );
  } catch (e) {
    /* ignore */
  }
}

function restoreWindowSize() {
  try {
    const saved = JSON.parse(localStorage.getItem("raycalc-window-size"));
    if (saved && saved.w) {
      windowSizeSet = true;
      appContainerEl.style.width =
        clampNum(saved.w, MIN_WINDOW_W, windowMaxWidth()) + "px";
      if (saved.h) {
        appContainerEl.style.height =
          clampNum(saved.h, MIN_WINDOW_H, windowMaxHeight()) + "px";
      }
    }
  } catch (e) {
    /* ignore */
  }
}

resizeHandleEl.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  windowSizeSet = true;
  appContainerEl.classList.add("resizing");
  document.body.classList.add("no-select");
  resizeHandleEl.classList.add("dragging");
  resizeHandleEl.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startY = e.clientY;
  const startRect = appContainerEl.getBoundingClientRect();
  const startW = startRect.width || appContainerEl.offsetWidth;
  const startH = startRect.height || appContainerEl.offsetHeight;
  const onMove = (ev) => {
    appContainerEl.style.width =
      clampNum(startW + ev.clientX - startX, MIN_WINDOW_W, windowMaxWidth()) + "px";
    appContainerEl.style.height =
      clampNum(startH + ev.clientY - startY, MIN_WINDOW_H, windowMaxHeight()) + "px";
  };
  const onUp = () => {
    appContainerEl.classList.remove("resizing");
    document.body.classList.remove("no-select");
    resizeHandleEl.classList.remove("dragging");
    resizeHandleEl.removeEventListener("pointermove", onMove);
    resizeHandleEl.removeEventListener("pointerup", onUp);
    resizeHandleEl.removeEventListener("pointercancel", onUp);
    saveWindowSize();
  };
  resizeHandleEl.addEventListener("pointermove", onMove);
  resizeHandleEl.addEventListener("pointerup", onUp);
  resizeHandleEl.addEventListener("pointercancel", onUp);
});

// ------------------- Render split divider -------------------
function clampPaneWidth(px, splitW) {
  if (!splitW) return px;
  return clampNum(px, MIN_PANE_W, Math.max(MIN_PANE_W, splitW - MIN_OUTPUT_W));
}

function setInputPaneWidth(px) {
  renderInputPaneEl.style.width = px + "px";
}

// Persist only on discrete actions (drag end / reset), not on every move.
function saveDividerPosition() {
  try {
    const cur = parseInt(renderInputPaneEl.style.width, 10);
    if (isFinite(cur)) {
      localStorage.setItem("raycalc-render-divider", String(cur));
    }
  } catch (e) {
    /* ignore */
  }
}

function reclampPaneWidth() {
  const splitW = renderSplitEl.clientWidth;
  if (!splitW) return; // section not visible yet
  const cur =
    renderInputPaneEl.getBoundingClientRect().width ||
    renderInputPaneEl.offsetWidth ||
    splitW / 2;
  setInputPaneWidth(clampPaneWidth(cur, splitW));
}

// Restore a previously dragged split position (width is clamped when visible).
(function restoreDivider() {
  try {
    const saved = parseFloat(localStorage.getItem("raycalc-render-divider"));
    if (isFinite(saved) && saved > 0) setInputPaneWidth(saved);
  } catch (e) {
    /* ignore */
  }
})();

renderDividerEl.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  document.body.classList.add("no-select");
  renderDividerEl.classList.add("dragging");
  renderDividerEl.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startW =
    renderInputPaneEl.getBoundingClientRect().width ||
    renderInputPaneEl.offsetWidth;
  const onMove = (ev) => {
    const splitW = renderSplitEl.clientWidth;
    setInputPaneWidth(clampPaneWidth(startW + ev.clientX - startX, splitW));
  };
  const onUp = () => {
    document.body.classList.remove("no-select");
    renderDividerEl.classList.remove("dragging");
    renderDividerEl.removeEventListener("pointermove", onMove);
    renderDividerEl.removeEventListener("pointerup", onUp);
    renderDividerEl.removeEventListener("pointercancel", onUp);
    saveDividerPosition();
  };
  renderDividerEl.addEventListener("pointermove", onMove);
  renderDividerEl.addEventListener("pointerup", onUp);
  renderDividerEl.addEventListener("pointercancel", onUp);
});

// Double-click the divider to reset to a 50/50 split.
renderDividerEl.addEventListener("dblclick", () => {
  const splitW = renderSplitEl.clientWidth;
  if (!splitW) return;
  setInputPaneWidth(clampPaneWidth(Math.floor(splitW / 2), splitW));
  saveDividerPosition();
});

// Keep the resized window inside the viewport and panes usable when the
// browser window itself changes size.
window.addEventListener("resize", () => {
  if (windowSizeSet) {
    appContainerEl.style.width =
      clampNum(appContainerEl.offsetWidth, MIN_WINDOW_W, windowMaxWidth()) + "px";
    appContainerEl.style.height =
      clampNum(appContainerEl.offsetHeight, MIN_WINDOW_H, windowMaxHeight()) + "px";
  }
  reclampPaneWidth();
});

restoreWindowSize();
reclampPaneWidth();

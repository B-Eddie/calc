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

  // Auto focus appropriate input
  if (tabId === "calculator") {
    setTimeout(() => document.getElementById("calc-input").focus(), 50);
  } else if (tabId === "molar-mass") {
    setTimeout(() => document.getElementById("molar-input").focus(), 50);
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

    molarResult.textContent = total.toFixed(3) + " g/mol";

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
      value.textContent = contrib.toFixed(3) + " g/mol";

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

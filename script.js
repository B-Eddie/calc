// Initialize MathJS
const math = window.math;

function switchTab(tabId, btnElement) {
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    if(btnElement) btnElement.classList.add('active');
    
    // Auto focus appropriate input
    if (tabId === 'calculator') {
        setTimeout(() => document.getElementById('calc-input').focus(), 50);
    } else {
        setTimeout(() => document.getElementById('quad-a').focus(), 50);
    }
}

// ==========================================
// Main Calculator Logic
// ==========================================
const calcInput = document.getElementById('calc-input');
const calcResult = document.getElementById('calc-result');
const calcLatex = document.getElementById('calc-latex');

function updateCalculator() {
    const expression = calcInput.value;
    
    if (!expression.trim()) {
        calcResult.textContent = '';
        calcLatex.innerHTML = '';
        return;
    }

    try {
        // Parse and compile for LaTeX
        const node = math.parse(expression);
        const latex = node.toTex({parenthesis: 'keep', implicit: 'hide'});
        
        // Render LaTeX
        katex.render(latex, calcLatex, {
            throwOnError: false,
            displayMode: true
        });

        // Evaluate Result
        let result = node.evaluate();
        
        // Format result nicely
        let displayResult = math.format(result, {precision: 14});
        
        // If the result is a number, try to show it in LaTeX as well if it's special (like very large)
        // But for the main result text, just showing the number is usually cleaner
        calcResult.textContent = displayResult;

    } catch (err) {
        // Don't show errors immediately to avoid flashing while typing
        // console.error(err);
    }
}

calcInput.addEventListener('input', updateCalculator);
calcInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const currentResult = calcResult.textContent;
        if (currentResult) {
            calcInput.value = currentResult;
            updateCalculator();
        }
    }
});

// ==========================================
// Quadratic Solver Logic
// ==========================================
const quadA = document.getElementById('quad-a');
const quadB = document.getElementById('quad-b');
const quadC = document.getElementById('quad-c');
const quadPreview = document.getElementById('quad-equation-preview');
const resX1 = document.getElementById('quad-result-x1');
const resX2 = document.getElementById('quad-result-x2');

function solveQuadratic() {
    const rawA = quadA.value || '1';
    const rawB = quadB.value || '0';
    const rawC = quadC.value || '0';

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
            if (coeff < 0) str += "-"; // negative is always minus
            else if (!isLeading) str += "+"; // positive gets + unless it's the very first term
            
            // Handle Value
            // If coefficient is 1 and we have a variable (x^2 or x), we usually hide the 1.
            // But if it's the constant (variable is empty), we must show it.
            let valStr = math.format(absCoeff, {precision: 14});
            
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
                 resX1.innerHTML = c === 0 ? "Infinite solutions" : "No solution";
                 resX2.innerHTML = "";
            } else {
                 const x = -c / b;
                 const xFrac = math.fraction(x);
                 let xValTex = math.format(x, {precision: 5});
                 
                 // Append fraction if denominator is not 1 and it's exact enough
                 if (xFrac.d !== 1 && xFrac.d < 10000) {
                    xValTex += ` \\quad \\left( \\frac{${xFrac.s * xFrac.n}}{${xFrac.d}} \\right)`;
                 }
                 
                 katex.render(`x = ${xValTex}`, resX1, { throwOnError: false });
                 resX2.innerHTML = "";
            }
            return;
        }

        const discriminant = (b * b) - (4 * a * c);
        
        // Handle results
        let x1Tex, x2Tex;

        if (discriminant >= 0) {
            // Real roots
            const root = Math.sqrt(discriminant);
            const x1 = (-b + root) / (2 * a);
            const x2 = (-b - root) / (2 * a);

            // Helper to format a single real root
            const formatRoot = (val) => {
                 let valTex = math.format(val, {precision: 5});
                 try {
                     const frac = math.fraction(val);
                     if (frac.d !== 1 && frac.d < 10000) {
                         // Check if fraction is actually close to val (math.fraction approximates irrational numbers)
                         // But for quadratic text, it's usually desired.
                         // Only show if it matches simpler logic or requested strictly
                         valTex += ` \\quad \\left( \\frac{${frac.s * frac.n}}{${frac.d}} \\right)`;
                     }
                 } catch (e) { /* ignore fraction errors for weird numbers */ }
                 return valTex;
            };

            x1Tex = `x_1 = ${formatRoot(x1)}`;
            x2Tex = `x_2 = ${formatRoot(x2)}`;
            
        } else {
            // Complex roots
            const realPart = -b / (2 * a);
            const imagPart = Math.sqrt(-discriminant) / (2 * a);
            
            const realStr = math.format(realPart, {precision: 5});
            // Ensure positive imaginary part for display since we use +/-
            const imagStr = math.format(Math.abs(imagPart), {precision: 5});
            
            x1Tex = `x_1 = ${realStr} + ${imagStr}i`;
            x2Tex = `x_2 = ${realStr} - ${imagStr}i`;
        }

        katex.render(x1Tex, resX1, { throwOnError: false });
        katex.render(x2Tex, resX2, { throwOnError: false });

    } catch (err) {
        // console.error(err);
        quadPreview.textContent = "Invalid Input";
        resX1.innerHTML = "";
        resX2.innerHTML = "";
    }
}

// Attach listeners
quadA.addEventListener('input', solveQuadratic);
quadB.addEventListener('input', solveQuadratic);
quadC.addEventListener('input', solveQuadratic);

// Initial run
solveQuadratic();
updateCalculator();
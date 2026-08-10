// render/app.js
(function(){
  const input = document.getElementById('input');
  const preview = document.getElementById('preview');
  const detectedEl = document.getElementById('detected');
  const override = document.getElementById('format-override');
  const copyHtml = document.getElementById('copy-html');

  // markdown-it with katex plugin (requires katex to be loaded first)
  const md = window.markdownit({html:true, linkify:true}).use(window.markdownitKatex);

  function detectFormat(text){
    if(!text || !text.trim()) return 'empty';
    // simple typst heuristic: a document starting with '# ' or '::' is ambiguous; look for 'typst' token
    if(/(^|\n)\s*%?typst/i.test(text) || /\\typst/i.test(text)) return 'typst';
    // LaTeX cues
    if(/\\begin\{|\\\[|\\\]|\$\$/.test(text)) return 'latex';
    // Markdown cues
    if(/(^|\n)\s{0,3}(#{1,6})\s+|(^|\n)\s{0,3}([-*+]\s+)|(\n```)/.test(text)) return 'markdown';
    // If many dollar signs, treat as LaTeX
    const dollarCount = (text.match(/\$/g)||[]).length;
    if(dollarCount >= 2) return 'latex';
    // fallback
    return 'markdown';
  }

  function renderLatex(text){
    // Try to render whole text as a LaTeX block. If there are multiple blocks, render each paragraph.
    try{
      // If the text already contains display math $$...$$ or \[ \], render raw HTML using KaTeX on each math region.
      // For simplicity, render the entire input inside a display block.
      const html = katex.renderToString(text, {throwOnError:false, displayMode:true});
      preview.innerHTML = '<div class="katex-block">'+html+'</div>';
    }catch(e){
      preview.textContent = 'Failed to render LaTeX: '+e.message;
    }
  }

  function renderMarkdown(text){
    try{
      const html = md.render(text);
      preview.innerHTML = html;
    }catch(e){
      preview.textContent = 'Failed to render Markdown: '+e.message;
    }
  }

  function renderTypst(text){
    preview.innerHTML = '<div class="placeholder">Typst rendering is not included in this build. Paste will be shown as plain text. If you want Typst support now, I can add the Typst WASM and renderer in a follow-up.</div><pre>'+escapeHtml(text)+'</pre>';
  }

  function escapeHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function update(){
    const text = input.value;
    const auto = detectFormat(text);
    const use = override.value === 'auto' ? auto : override.value;
    detectedEl.textContent = auto;

    if(use === 'latex') renderLatex(text);
    else if(use === 'markdown') renderMarkdown(text);
    else if(use === 'typst') renderTypst(text);
    else preview.innerHTML = '';
  }

  // debounce
  let timer = null;
  function scheduleUpdate(){
    if(timer) clearTimeout(timer);
    timer = setTimeout(update, 250);
  }

  input.addEventListener('input', scheduleUpdate);
  override.addEventListener('change', update);
  copyHtml.addEventListener('click', function(){
    navigator.clipboard.writeText(preview.innerHTML).then(()=>{
      copyHtml.textContent = 'Copied!';
      setTimeout(()=>copyHtml.textContent='Copy HTML',900);
    }).catch(()=>{
      copyHtml.textContent = 'Copy failed';
      setTimeout(()=>copyHtml.textContent='Copy HTML',900);
    });
  });

  // initial sample
  input.value = `# Example\nThis is a markdown paragraph with inline math $e^{i\pi} + 1 = 0$ and a displayed equation:\n\n$$\n\int_0^1 x^2 dx = \frac{1}{3}\n$$`;
  update();
})();

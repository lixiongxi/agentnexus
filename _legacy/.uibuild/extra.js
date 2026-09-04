
/* ================================================================
   界面增强 v2 · 抽屉导航 / 主题 / 搜索防抖 / 未读角标
   追加于主脚本末尾，不改动既有业务逻辑
   ================================================================ */
(function(){
  'use strict';

  /* ---------- 移动端抽屉导航 ---------- */
  window.toggleNav = function(){
    var open = document.body.classList.toggle('nav-open');
    var btn = document.getElementById('menu-btn');
    if(btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var ov = document.getElementById('nav-overlay');
    if(ov) ov.style.pointerEvents = open ? 'auto' : 'none';
  };
  window.closeNav = function(){
    if(!document.body.classList.contains('nav-open')) return;
    document.body.classList.remove('nav-open');
    var btn = document.getElementById('menu-btn');
    if(btn) btn.setAttribute('aria-expanded','false');
    var ov = document.getElementById('nav-overlay');
    if(ov) ov.style.pointerEvents = 'none';
  };
  // 点击侧栏导航项后自动收起抽屉（捕获阶段，先于业务 handler）
  document.addEventListener('click', function(e){
    var item = e.target && e.target.closest ? e.target.closest('.nav-item') : null;
    if(item && item.closest('.sidebar')) closeNav();
  }, true);
  // Esc 关闭抽屉
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeNav(); });

  /* ---------- 主题切换 ---------- */
  window.toggleTheme = function(){
    var now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', now);
    try{ localStorage.setItem('agenthub_theme', now); }catch(e){}
    if(typeof toast === 'function') toast(now === 'dark' ? '已切换深色模式' : '已切换浅色模式');
  };

  /* ---------- 全局搜索防抖（避免逐字全量重渲染） ---------- */
  var searchTimer = null;
  window.onGlobalSearchDebounced = function(v){
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function(){ onGlobalSearch(v); }, 220);
  };

  /* ---------- 未读角标同步（侧栏 + 底部标签栏） ----------
     原 #chat-dot 为死代码（从未被切换），此处补齐为真实未读指示 */
  function syncUnreadDots(){
    try{
      var n = (S.connections || []).filter(function(c){ return c.unread; }).length;
      ['chat-dot','chat-dot-tab'].forEach(function(id){
        var el = document.getElementById(id);
        if(el) el.style.display = n > 0 ? '' : 'none';
      });
    }catch(e){}
  }
  var origRenderNav = window.renderNav;
  if(typeof origRenderNav === 'function'){
    window.renderNav = function(){
      origRenderNav.apply(this, arguments);
      syncUnreadDots();
    };
  }
})();

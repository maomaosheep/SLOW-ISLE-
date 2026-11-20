(() => {
  document.querySelectorAll('[data-dismiss]').forEach(button => button.addEventListener('click', () => button.closest('.flash').remove()));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('selected', item === button));
    document.getElementById('product-collection').classList.toggle('list-view', button.dataset.view === 'list');
  }));
  const dialog = document.getElementById('confirm-dialog');
  let pendingForm;
  document.addEventListener('submit', event => {
    const form = event.target.closest('form[data-confirm]');
    if (!form) return;
    if (form.dataset.confirmed) return;
    event.preventDefault(); pendingForm = form;
    document.getElementById('confirm-copy').textContent = form.dataset.confirm;
    dialog.showModal();
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'confirm' && pendingForm) {
      pendingForm.dataset.confirmed = 'true'; pendingForm.requestSubmit();
    }
    pendingForm = null;
  });
  const orders = document.querySelector('.orders-layout');
  if (orders) {
    let selectionRequest;
    orders.addEventListener('click', async event => {
      const ticket = event.target.closest('a.order-ticket');
      if (!ticket || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectionRequest?.abort();
      const controller = new AbortController();
      selectionRequest = controller;
      const panel = orders.querySelector('.order-detail-panel');
      panel.querySelector('.order-selection-error')?.remove();
      panel.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch(ticket.href, { signal: controller.signal });
        if (!response.ok) throw new Error('Order request failed');
        const nextPage = new DOMParser().parseFromString(await response.text(), 'text/html');
        if (controller.signal.aborted) return;
        const nextPanel = nextPage.querySelector('.order-detail-panel');
        const selected = nextPage.querySelector('.order-ticket.selected');
        if (!nextPanel || !selected || selected.getAttribute('href') !== ticket.getAttribute('href')) throw new Error('Order unavailable');
        // A shorter order must not shrink the page and move the current viewport.
        orders.style.minHeight = `${orders.getBoundingClientRect().height}px`;
        const list = orders.querySelector('.order-list');
        const scroll = { x: window.scrollX, y: window.scrollY, list: list.scrollTop };
        panel.replaceChildren(...nextPanel.childNodes);
        orders.querySelectorAll('.order-ticket').forEach(item => {
          const active = item === ticket;
          item.classList.toggle('selected', active);
          if (active) item.setAttribute('aria-current', 'true');
          else item.removeAttribute('aria-current');
        });
        history.replaceState(history.state, '', ticket.href);
        document.querySelector('[data-refresh-orders]').href = ticket.href;
        list.scrollTop = scroll.list;
        window.scrollTo(scroll.x, scroll.y);
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = document.createElement('p');
          message.className = 'flash error order-selection-error';
          message.setAttribute('role', 'alert');
          message.textContent = '暂时无法加载这笔订单，请再次点击重试。若登录已过期，请刷新并重新登录。';
          panel.prepend(message);
        }
      } finally {
        if (selectionRequest === controller) panel.removeAttribute('aria-busy');
      }
    });
  }
  const drawer = document.querySelector('.drawer');
  if (drawer) {
    document.body.classList.add('drawer-open');
    const first = drawer.querySelector('input:not([type="hidden"]),select');
    if (first) first.focus();
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !dialog.open) location.href = drawer.querySelector('.close-button').href;
      if (event.key === 'Tab') {
        const elements = [...drawer.querySelectorAll('a,button,input,select,textarea')].filter(el => !el.disabled && el.getClientRects().length);
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); }
        else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
      }
    });
  }
})();

(() => {
  document.querySelectorAll('[data-dismiss]').forEach(button => button.addEventListener('click', () => button.closest('.flash').remove()));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('selected', item === button));
    document.getElementById('product-collection').classList.toggle('list-view', button.dataset.view === 'list');
  }));
  const dialog = document.getElementById('confirm-dialog');
  let pendingForm;
  document.querySelectorAll('[data-confirm]').forEach(form => form.addEventListener('submit', event => {
    if (form.dataset.confirmed) return;
    event.preventDefault(); pendingForm = form;
    document.getElementById('confirm-copy').textContent = form.dataset.confirm;
    dialog.showModal();
  }));
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'confirm' && pendingForm) {
      pendingForm.dataset.confirmed = 'true'; pendingForm.requestSubmit();
    }
    pendingForm = null;
  });
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

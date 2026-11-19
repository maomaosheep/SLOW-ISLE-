(() => {
  function update(group) {
    const enabled = group.querySelector('[data-enable]').checked;
    group.querySelector('.spec-content').hidden = !enabled;
    group.querySelectorAll('.spec-row input').forEach(input => { input.disabled = !enabled; input.required = enabled; });
    const rows = group.querySelectorAll('.spec-row');
    rows.forEach(row => { row.querySelector('[data-remove]').disabled = rows.length === 1; });
    group.querySelector('[data-add]').disabled = rows.length >= 10;
  }
  function initialize() {
    document.querySelectorAll('[data-spec-editor]').forEach(editor => {
      if (editor.dataset.ready) return;
      editor.dataset.ready = 'true';
      editor.querySelectorAll('.spec-group').forEach(update);
      editor.addEventListener('change', event => { if (event.target.matches('[data-enable]')) update(event.target.closest('.spec-group')); });
      editor.addEventListener('click', event => {
        const button = event.target.closest('[data-add], [data-remove]');
        if (!button) return;
        const group = button.closest('.spec-group');
        if (button.matches('[data-add]') && group.querySelectorAll('.spec-row').length < 10) {
          const row = group.querySelector('.spec-row').cloneNode(true);
          row.querySelectorAll('input').forEach(input => { input.value = input.type === 'number' ? '0.00' : ''; });
          group.querySelector('[data-rows]').append(row);
          update(group); row.querySelector('input').focus();
        } else if (button.matches('[data-remove]') && group.querySelectorAll('.spec-row').length > 1) {
          button.closest('.spec-row').remove(); update(group);
        }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize); else initialize();
})();

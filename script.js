document.getElementById('year').textContent = new Date().getFullYear();

const devils = document.querySelectorAll('.devil');
const counterEl = document.getElementById('foundCount');
let found = 0;

function catchDevil(el) {
  if (el.classList.contains('caught')) return;
  el.classList.add('caught');
  found += 1;
  counterEl.textContent = found;
}

devils.forEach((el) => {
  el.addEventListener('click', () => catchDevil(el));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      catchDevil(el);
    }
  });
});

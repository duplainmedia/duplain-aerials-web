(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;

  /* ---------------- cursor reticle ---------------- */
  const reticle = document.querySelector('.reticle');

  if (reticle && !isCoarse) {
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;
    let active = false;
    let idleTimer;

    const setActive = (on) => {
      active = on;
      reticle.classList.toggle('active', on);
    };

    const render = () => {
      x += (targetX - x) * 0.22;
      y += (targetY - y) * 0.22;
      reticle.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      requestAnimationFrame(render);
    };

    window.addEventListener('mousemove', (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!active) setActive(true);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setActive(false), 2000);
    }, { passive: true });

    window.addEventListener('mouseleave', () => setActive(false));
    window.addEventListener('mouseenter', () => setActive(true));

    requestAnimationFrame(render);
  }

  /* ---------------- altitude ribbon ---------------- */
  const altValue = document.querySelector('[data-altitude]');
  const altFill = document.querySelector('[data-altitude-fill]');
  const MAX_ALT = 400;

  const onScroll = () => {
    const doc = document.documentElement;
    const max = (doc.scrollHeight - window.innerHeight) || 1;
    const pct = Math.min(1, Math.max(0, window.scrollY / max));
    const remaining = 1 - pct;
    const alt = Math.round(remaining * MAX_ALT);
    if (altValue) altValue.textContent = String(alt).padStart(3, '0');
    if (altFill) altFill.style.height = `${remaining * 100}%`;
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------------- scroll reveals ---------------- */
  if (!prefersReduced && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll(
      '.section-head, .service, .work-card, .about-copy p, .about-credentials, .faq-item, .contact-form, .contact-strip, .hero-inner > *'
    );
    targets.forEach((el) => el.classList.add('reveal'));

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    targets.forEach((el) => io.observe(el));
  }

  /* ---------------- conditional form fields ---------------- */
  const projectSelect = document.querySelector('[data-project-type]');
  const conditionals = document.querySelectorAll('.field-conditional');

  if (projectSelect && conditionals.length) {
    const syncConditionals = () => {
      const val = projectSelect.value;
      conditionals.forEach((el) => {
        const match = el.getAttribute('data-show-if') === val;
        el.hidden = !match;
      });
    };
    syncConditionals();
    projectSelect.addEventListener('change', syncConditionals);
  }

  /* ---------------- smooth anchor scroll ---------------- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ---------------- submitted state ---------------- */
  if (new URLSearchParams(location.search).get('submitted') === '1') {
    const form = document.querySelector('.contact-form');
    if (form) {
      form.innerHTML = `
        <div class="form-success">
          <span class="section-kicker">Received</span>
          <h3 class="section-title" style="font-size: clamp(1.6rem, 3vw, 2.4rem); margin-bottom: 14px;">Thanks. We have it.</h3>
          <p style="color: var(--ink-soft); max-width: 520px;">A reply is on its way within one business day. If it is time-sensitive, email <a href="mailto:info@duplainmedia.com" style="color: var(--gulf-deep); text-decoration: underline;">info@duplainmedia.com</a> direct or call (941) 702-4287.</p>
        </div>
      `;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ---------------- case study gallery ---------------- */
  const galleries = document.querySelectorAll('[data-gallery]');
  galleries.forEach((gallery) => {
    const track = gallery.querySelector('[data-gallery-track]');
    const prev = gallery.querySelector('[data-gallery-prev]');
    const next = gallery.querySelector('[data-gallery-next]');
    const currentEl = gallery.querySelector('[data-gallery-current]');
    const totalEl = gallery.querySelector('[data-gallery-total]');
    if (!track || !prev || !next) return;
    const slides = track.children;
    const total = slides.length;
    let idx = 0;

    const update = () => {
      track.style.transform = `translateX(-${idx * 100}%)`;
      if (currentEl) currentEl.textContent = idx + 1;
      if (totalEl) totalEl.textContent = total;
      prev.disabled = idx === 0;
      next.disabled = idx === total - 1;
    };

    prev.addEventListener('click', () => {
      if (idx > 0) { idx--; update(); }
    });
    next.addEventListener('click', () => {
      if (idx < total - 1) { idx++; update(); }
    });

    gallery.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' && idx > 0) { idx--; update(); }
      if (e.key === 'ArrowRight' && idx < total - 1) { idx++; update(); }
    });
    gallery.tabIndex = 0;

    update();
  });

  /* ---------------- pond pricing calculator ---------------- */
  const pondCalc = document.querySelector('[data-pond-calc]');
  if (pondCalc) {
    const slider = pondCalc.querySelector('[data-pond-slider]');
    const countEl = pondCalc.querySelector('[data-pond-count]');
    const priceEl = pondCalc.querySelector('[data-pond-price]');
    const priceBlock = pondCalc.querySelector('[data-pond-price-block]');
    const customBlock = pondCalc.querySelector('[data-pond-custom]');

    const updateCalc = () => {
      const n = parseInt(slider.value, 10);
      if (n > 30) {
        countEl.textContent = '30+';
        priceBlock.setAttribute('data-hidden', '');
        customBlock.setAttribute('data-active', '');
      } else {
        countEl.textContent = n;
        priceBlock.removeAttribute('data-hidden');
        customBlock.removeAttribute('data-active');
        const price = 500 + Math.max(0, n - 3) * 50;
        priceEl.textContent = '$' + price.toLocaleString();
      }
    };

    slider.addEventListener('input', updateCalc);
    updateCalc();
  }
})();

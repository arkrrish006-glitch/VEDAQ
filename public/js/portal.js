document.addEventListener('DOMContentLoaded', async () => {
  // 1. Fetch system phone / whatsapp configuration dynamically
  try {
    const configRes = await fetch('/api/config');
    const config = await configRes.json();

    const phoneContainer = document.getElementById('phone-container');
    const phoneDisplay = document.getElementById('phone-display');
    const whatsappContainer = document.getElementById('whatsapp-container');
    const whatsappDisplay = document.getElementById('whatsapp-display');

    if (config.hasPhone) {
      phoneDisplay.innerHTML = `<a href="tel:${config.phone}">Call: ${config.phone}</a>`;
    } else {
      phoneDisplay.innerText = 'Call Desk: [Setup Pending]';
    }

    if (config.hasWhatsapp) {
      whatsappContainer.style.display = 'inline-flex';
      whatsappDisplay.innerHTML = `<a href="https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}" target="_blank">WhatsApp Desk</a>`;
    }
  } catch (e) {
    console.warn('Configuration endpoint unreachable.');
  }

  // 2. Request Form Submission
  const requestForm = document.getElementById('requestForm');
  const feedback = document.getElementById('form-feedback');

  requestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedback.className = 'status-msg';
    feedback.innerText = 'Transmitting request to operations desk...';

    const payload = {
      customer_name: document.getElementById('customer_name').value,
      customer_phone: document.getElementById('customer_phone').value,
      service_pillar: document.getElementById('service_pillar').value,
      scheduled_datetime: document.getElementById('scheduled_datetime').value,
      target_provider_or_entity: document.getElementById('target_provider_or_entity').value,
      description: document.getElementById('description').value,
      channel_origin: 'web'
    };

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        feedback.className = 'status-msg success';
        feedback.innerHTML = `Request registered! Your tracking code is: <strong>${data.tracking_id}</strong>. Keep this for your records.`;
        requestForm.reset();
      } else {
        feedback.className = 'status-msg error';
        feedback.innerText = data.error || 'Submission failed. Check details.';
      }
    } catch (err) {
      feedback.className = 'status-msg error';
      feedback.innerText = 'Network error. Please try again.';
    }
  });

  // 3. Track Request Status
  const btnTrack = document.getElementById('btn-track');
  const trackInput = document.getElementById('tracking_id_input');
  const trackResult = document.getElementById('tracking-result');

  btnTrack.addEventListener('click', async () => {
    const code = trackInput.value.trim();
    if (!code) return;

    try {
      const res = await fetch(`/api/requests/track/${encodeURIComponent(code)}`);
      const data = await res.json();

      if (res.ok) {
        trackResult.style.display = 'block';
        document.getElementById('res-tracking-id').innerText = data.tracking_id;
        document.getElementById('res-status').innerText = data.status.toUpperCase();
        document.getElementById('res-customer').innerText = data.customer;
        document.getElementById('res-pillar').innerText = data.service_pillar.replace('_', ' ').toUpperCase();
        document.getElementById('res-approval').innerText = data.customer_approval_state;
        document.getElementById('res-notes').innerText = data.update_notes;
      } else {
        alert(data.error || 'Invalid tracking ID.');
        trackResult.style.display = 'none';
      }
    } catch (err) {
      alert('Failed to contact tracking service.');
    }
  });
});
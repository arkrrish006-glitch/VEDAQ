document.addEventListener('DOMContentLoaded', () => {
  const queueBody = document.getElementById('queueBody');
  const filterSearch = document.getElementById('filterSearch');
  const filterPillar = document.getElementById('filterPillar');
  const filterStatus = document.getElementById('filterStatus');
  const intakeForm = document.getElementById('intakeForm');
  const btnLogout = document.getElementById('btnLogout');

  async function loadRequests() {
    const p = new URLSearchParams();
    if (filterSearch.value) p.append('search', filterSearch.value);
    if (filterPillar.value) p.append('pillar', filterPillar.value);
    if (filterStatus.value) p.append('status', filterStatus.value);

    try {
      const res = await fetch(`/api/employee/requests?${p.toString()}`);
      if (res.status === 401) {
        window.location.href = '/login.html';
        return;
      }
      const data = await res.json();
      renderQueue(data);
    } catch (err) {
      console.error('Failed to load queue:', err);
    }
  }

  function renderQueue(requests) {
    queueBody.innerHTML = '';
    if (requests.length === 0) {
      queueBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem;">No matching service requests found.</td></tr>`;
      return;
    }

    requests.forEach((req) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${req.tracking_id}</strong></td>
        <td><span class="source-badge ${req.channel_origin}">${req.channel_origin}</span></td>
        <td>${req.customer_name}<br><small>${req.customer_phone}</small></td>
        <td><span class="pillar-indicator">${req.service_pillar}</span></td>
        <td>
          <div class="desc-cell">${req.description}</div>
          ${req.target_provider_or_entity ? `<small><strong>Target:</strong> ${req.target_provider_or_entity}</small><br>` : ''}
          ${req.scheduled_datetime ? `<small><strong>Sched:</strong> ${req.scheduled_datetime}</small>` : ''}
        </td>
        <td>
          <select class="action-select select-approval" data-id="${req.id}">
            <option value="pending_assessment" ${req.customer_approval_state === 'pending_assessment' ? 'selected' : ''}>Pending</option>
            <option value="authorized" ${req.customer_approval_state === 'authorized' ? 'selected' : ''}>Authorized</option>
            <option value="declined" ${req.customer_approval_state === 'declined' ? 'selected' : ''}>Declined</option>
          </select>
        </td>
        <td>
          <select class="action-select select-status" data-id="${req.id}">
            <option value="pending" ${req.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="in_progress" ${req.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="scheduled" ${req.status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
            <option value="completed" ${req.status === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </td>
        <td>
          <button class="btn btn-sm btn-update" data-id="${req.id}">Save Notes</button>
        </td>
      `;
      queueBody.appendChild(tr);
    });

    attachListeners();
  }

  function attachListeners() {
    document.querySelectorAll('.btn-update').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        const row = e.target.closest('tr');
        const status = row.querySelector('.select-status').value;
        const approval = row.querySelector('.select-approval').value;

        const customerNotes = prompt('Enter customer-visible update note (leave blank to keep current):');
        const internalNotes = prompt('Enter internal coordinator notes:');

        const payload = {
          status,
          customer_approval_state: approval
        };
        if (customerNotes !== null && customerNotes.trim() !== '') payload.customer_notes = customerNotes;
        if (internalNotes !== null && internalNotes.trim() !== '') payload.internal_notes = internalNotes;

        await fetch(`/api/employee/requests/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        loadRequests();
      });
    });
  }

  // Handle phone call intake
  intakeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      customer_name: document.getElementById('in_name').value,
      customer_phone: document.getElementById('in_phone').value,
      service_pillar: document.getElementById('in_pillar').value,
      target_provider_or_entity: document.getElementById('in_target').value,
      scheduled_datetime: document.getElementById('in_schedule').value,
      description: document.getElementById('in_desc').value,
      channel_origin: 'phone_intake'
    };

    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      intakeForm.reset();
      loadRequests();
    }
  });

  [filterSearch, filterPillar, filterStatus].forEach((el) => el.addEventListener('input', loadRequests));

  btnLogout.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  loadRequests();
});
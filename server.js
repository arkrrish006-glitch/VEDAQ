const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'vedaq_sys_prod_secret_849204910';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: '__Host_vedaq_sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

function requireEmployeeAuth(req, res, next) {
  if (!req.session || !req.session.employee) {
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    return res.redirect('/login.html');
  }
  next();
}

app.get('/employee.html', (req, res, next) => {
  if (!req.session || !req.session.employee) {
    return res.redirect('/login.html');
  }
  next();
});
express.static.mime.define({ 'image/svg+xml': ['svg'] });
app.use(express.static(path.join(__dirname, 'public')));

// Public Configuration Endpoint
app.get('/api/public/config', (req, res) => {
  res.json({
    businessName: config.BUSINESS_NAME,
    tagline: config.TAGLINE,
    supportPhone: config.SUPPORT_PHONE,
    supportPhoneDisplay: config.SUPPORT_PHONE_DISPLAY,
    whatsappNumber: config.WHATSAPP_NUMBER,
    categories: config.CATEGORIES
  });
});

/* ================= CLIENT / CUSTOMER APIS ================= */

// Submit Customer Request
app.post('/api/user/tasks', (req, res) => {
  const { name, mobile, task, category, service_details } = req.body;
  if (!name || !mobile || !task) {
    return res.status(400).json({ error: 'Name, contact number, and request description are required.' });
  }

  const cleanName = name.trim();
  const cleanMobile = mobile.trim();
  const cleanTask = task.trim();
  const selectedCategory = category || config.CATEGORIES.DIGITAL;
  const details = service_details ? JSON.stringify(service_details) : null;

  db.run(
    `INSERT INTO tasks (user_name, mobile_number, task_description, category, service_details, status) 
     VALUES (?, ?, ?, ?, ?, 'Submitted')`,
    [cleanName, cleanMobile, cleanTask, selectedCategory, details],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to register service request.' });
      const taskId = this.lastID;

      db.run(
        `INSERT INTO activity_logs (task_id, actor_name, actor_role, action, details) 
         VALUES (?, ?, 'Client', 'CREATED', ?)`,
        [taskId, cleanName, `Service request logged under ${selectedCategory}`],
        () => res.status(201).json({ message: 'Request registered successfully.', taskId })
      );
    }
  );
});

// View Customer Requests & Timeline
app.get('/api/user/tasks', (req, res) => {
  const { mobile } = req.query;
  if (!mobile || !mobile.trim()) {
    return res.status(400).json({ error: 'Contact mobile number is required.' });
  }

  const cleanMobile = mobile.trim();

  db.all(
    `SELECT id, user_name, mobile_number, task_description, category, status, 
            assigned_to_name, due_date, estimated_cost, customer_approval, created_at 
     FROM tasks 
     WHERE mobile_number = ? 
     ORDER BY created_at DESC`,
    [cleanMobile],
    (err, tasks) => {
      if (err) return res.status(500).json({ error: 'Failed to retrieve records.' });

      db.all(
        `SELECT r.task_id, r.employee_name, r.message, r.action_required, r.created_at 
         FROM reminders r 
         JOIN tasks t ON r.task_id = t.id 
         WHERE t.mobile_number = ? 
         ORDER BY r.created_at DESC`,
        [cleanMobile],
        (rErr, reminders) => {
          const result = (tasks || []).map(t => ({
            ...t,
            reminders: (reminders || []).filter(r => r.task_id === t.id)
          }));
          res.json({ tasks: result });
        }
      );
    }
  );
});

// Client Approval Response (for OneCall orders, appointments, or bookings)
app.post('/api/user/tasks/:id/approval', (req, res) => {
  const taskId = req.params.id;
  const { approval, mobile } = req.body;

  if (!['Approved', 'Declined'].includes(approval) || !mobile) {
    return res.status(400).json({ error: 'Invalid approval payload.' });
  }

  db.get('SELECT * FROM tasks WHERE id = ? AND mobile_number = ?', [taskId, mobile.trim()], (err, task) => {
    if (err || !task) return res.status(404).json({ error: 'Matching task not found for this contact.' });

    db.run(
      `UPDATE tasks SET customer_approval = ? WHERE id = ?`,
      [approval, taskId],
      function (uErr) {
        if (uErr) return res.status(500).json({ error: 'Failed to record decision.' });

        db.run(
          `INSERT INTO activity_logs (task_id, actor_name, actor_role, action, details) 
           VALUES (?, ?, 'Client', 'APPROVAL', ?)`,
          [taskId, task.user_name, `Client marked request as: ${approval}`]
        );

        res.json({ message: `Your decision has been logged as ${approval}.` });
      }
    );
  });
});

/* ================= AUTHENTICATION APIS ================= */

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  db.get(
    'SELECT id, email, password_hash, name, role FROM employees WHERE email = ?',
    [email.trim().toLowerCase()],
    (err, emp) => {
      if (err || !emp || !bcrypt.compareSync(password, emp.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      req.session.regenerate(regErr => {
        if (regErr) return res.status(500).json({ error: 'Session initialization error.' });

        req.session.employee = { id: emp.id, name: emp.name, email: emp.email, role: emp.role };
        res.json({ message: 'Authenticated successfully.' });
      });
    }
  );
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('__Host_vedaq_sid');
    res.json({ message: 'Signed out.' });
  });
});

app.get('/api/auth/session', (req, res) => {
  if (req.session && req.session.employee) {
    res.json({ authenticated: true, employee: req.session.employee });
  } else {
    res.json({ authenticated: false });
  }
});

/* ================= OPERATIONS DESK APIS ================= */

// Dashboard & Task Feed
app.get('/api/employee/dashboard', requireEmployeeAuth, (req, res) => {
  const { status, category, search } = req.query;
  let filterSql = ' WHERE 1=1 ';
  const params = [];

  if (status && status !== 'All' && status.trim() !== '') {
    filterSql += ' AND status = ? ';
    params.push(status.trim());
  }

  if (category && category !== 'All' && category.trim() !== '') {
    filterSql += ' AND category = ? ';
    params.push(category.trim());
  }

  if (search && search.trim() !== '') {
    const term = `%${search.trim()}%`;
    filterSql += ' AND (user_name LIKE ? OR mobile_number LIKE ? OR task_description LIKE ? OR CAST(id AS TEXT) LIKE ?) ';
    params.push(term, term, term, term);
  }

  db.all(`SELECT * FROM tasks ${filterSql} ORDER BY created_at DESC`, params, (err, tasks) => {
    if (err) return res.status(500).json({ error: 'Failed to retrieve tasks.' });

    db.get(
      `SELECT 
        SUM(CASE WHEN status = 'Submitted' THEN 1 ELSE 0 END) as count_new,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as count_progress,
        SUM(CASE WHEN status = 'Waiting for User' THEN 1 ELSE 0 END) as count_waiting,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as count_completed,
        SUM(CASE WHEN due_date <= date('now') AND status NOT IN ('Completed', 'Cancelled') THEN 1 ELSE 0 END) as count_overdue
       FROM tasks`,
      [],
      (sErr, stats) => {
        res.json({
          stats: {
            count_new: stats?.count_new || 0,
            count_progress: stats?.count_progress || 0,
            count_waiting: stats?.count_waiting || 0,
            count_completed: stats?.count_completed || 0,
            count_overdue: stats?.count_overdue || 0
          },
          tasks: tasks || []
        });
      }
    );
  });
});

// Employee Creates Request on Customer's Behalf (Call Handling Workflow)
app.post('/api/employee/tasks/create-on-behalf', requireEmployeeAuth, (req, res) => {
  const { name, mobile, task, category, due_date, estimated_cost, internal_notes } = req.body;
  const employee = req.session.employee;

  if (!name || !mobile || !task) {
    return res.status(400).json({ error: 'Customer name, mobile number, and requirement details required.' });
  }

  db.run(
    `INSERT INTO tasks (user_name, mobile_number, task_description, category, due_date, estimated_cost, internal_notes, assigned_to_id, assigned_to_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Progress')`,
    [name.trim(), mobile.trim(), task.trim(), category || config.CATEGORIES.ONECALL, due_date || null, estimated_cost || null, internal_notes || null, employee.id, employee.name],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to log phone coordination request.' });
      const taskId = this.lastID;

      db.run(
        `INSERT INTO activity_logs (task_id, actor_name, actor_role, action, details)
         VALUES (?, ?, 'Employee', 'PHONE_INTAKE', ?)`,
        [taskId, employee.name, `Request taken via phone call intake and assigned to ${employee.name}`]
      );

      res.status(201).json({ message: 'Phone intake request logged and assigned.', taskId });
    }
  );
});

// Full Details
app.get('/api/employee/tasks/:id', requireEmployeeAuth, (req, res) => {
  const taskId = req.params.id;
  db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
    if (err || !task) return res.status(404).json({ error: 'Task not found.' });

    db.all('SELECT * FROM activity_logs WHERE task_id = ? ORDER BY created_at ASC', [taskId], (aErr, logs) => {
      db.all('SELECT * FROM reminders WHERE task_id = ? ORDER BY created_at DESC', [taskId], (rErr, reminders) => {
        res.json({ task, logs: logs || [], reminders: reminders || [] });
      });
    });
  });
});

// Update Workflow, Cost, Category, Approvals
app.patch('/api/employee/tasks/:id/workflow', requireEmployeeAuth, (req, res) => {
  const taskId = req.params.id;
  const { status, assigned_to_id, due_date, estimated_cost, customer_approval, internal_notes, category } = req.body;
  const actor = req.session.employee.name;

  db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, current) => {
    if (err || !current) return res.status(404).json({ error: 'Task not found.' });

    const proceed = (newAssignedId, newAssignedName) => {
      const newStatus = status || current.status;
      const newDue = due_date !== undefined ? (due_date || null) : current.due_date;
      const newCost = estimated_cost !== undefined ? estimated_cost : current.estimated_cost;
      const newApproval = customer_approval || current.customer_approval;
      const newNotes = internal_notes !== undefined ? internal_notes : current.internal_notes;
      const newCategory = category || current.category;

      db.run(
        `UPDATE tasks 
         SET status = ?, assigned_to_id = ?, assigned_to_name = ?, due_date = ?, 
             estimated_cost = ?, customer_approval = ?, internal_notes = ?, category = ? 
         WHERE id = ?`,
        [newStatus, newAssignedId, newAssignedName, newDue, newCost, newApproval, newNotes, newCategory, taskId],
        function (uErr) {
          if (uErr) return res.status(500).json({ error: 'Workflow update failed.' });

          if (status && status !== current.status) {
            db.run(
              `INSERT INTO activity_logs (task_id, actor_name, actor_role, action, details) 
               VALUES (?, ?, 'Employee', 'STATUS_CHANGE', ?)`,
              [taskId, actor, `Status updated to "${newStatus}"`]
            );
          }
          if (newAssignedName !== current.assigned_to_name) {
            db.run(
              `INSERT INTO activity_logs (task_id, actor_name, actor_role, action, details) 
               VALUES (?, ?, 'Employee', 'ASSIGNMENT', ?)`,
              [taskId, actor, `Assigned coordinator updated to ${newAssignedName || 'Unassigned'}`]
            );
          }
          if (customer_approval && customer_approval !== current.customer_approval) {
            db.run(
              `INSERT INTO activity_logs (task_id, actor_name, actor_role, action, details) 
               VALUES (?, ?, 'Employee', 'APPROVAL_REQUEST', ?)`,
              [taskId, actor, `Approval state set to: ${customer_approval}`]
            );
          }

          res.json({ message: 'Record successfully updated.' });
        }
      );
    };

    if (assigned_to_id) {
      db.get('SELECT name FROM employees WHERE id = ?', [assigned_to_id], (eErr, emp) => {
        proceed(assigned_to_id, emp ? emp.name : null);
      });
    } else if (assigned_to_id === null || assigned_to_id === '') {
      proceed(null, null);
    } else {
      proceed(current.assigned_to_id, current.assigned_to_name);
    }
  });
});

// Post Customer Update / Reminder
app.post('/api/employee/tasks/:id/reminders', requireEmployeeAuth, (req, res) => {
  const taskId = req.params.id;
  const { message, action_required, change_status_waiting } = req.body;
  const employeeName = req.session.employee.name;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Update message required.' });
  }

  db.run(
    `INSERT INTO reminders (task_id, employee_name, message, action_required) VALUES (?, ?, ?, ?)`,
    [taskId, employeeName, message.trim(), action_required ? action_required.trim() : null],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to record update.' });

      db.run(
        `INSERT INTO activity_logs (task_id, actor_name, actor_role, action, details) VALUES (?, ?, 'Employee', 'UPDATE_POSTED', ?)`,
        [taskId, employeeName, `Customer update posted: "${message.trim()}"`]
      );

      if (change_status_waiting) {
        db.run(`UPDATE tasks SET status = 'Waiting for User' WHERE id = ?`, [taskId], () => {
          db.run(
            `INSERT INTO activity_logs (task_id, actor_name, actor_role, action, details) VALUES (?, ?, 'Employee', 'STATUS_CHANGE', 'Status changed to Waiting for User')`,
            [taskId, employeeName]
          );
        });
      }

      res.json({ message: 'Update logged and sent to customer timeline.' });
    }
  );
});

app.get('/api/employee/team', requireEmployeeAuth, (req, res) => {
  db.all('SELECT id, name, role FROM employees ORDER BY name ASC', [], (err, rows) => {
    res.json({ team: rows || [] });
  });
});

app.listen(PORT, () => {
  console.log(`VEDAQ Platform running at http://localhost:${PORT}`);
});